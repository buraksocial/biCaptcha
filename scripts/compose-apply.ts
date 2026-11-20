import { createHash } from 'node:crypto';
import { lstat, readFile, open, rename, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

type Run = (args: string[]) => Promise<string>;
const deadlineMs = 120_000;
const realRun: Run = (args) => new Promise((yes, no) => {
  const p = spawn('docker', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', settled = false;
  const finish = (e?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (e) no(e); else yes(out);
  };
  const timer = setTimeout(() => { p.kill('SIGKILL'); finish(Error(`Docker command timed out (${args[0]})`)); }, 30_000);
  p.stdout.on('data', (d) => { out += d.toString(); if (out.length > 1024 * 1024) { p.kill('SIGKILL'); finish(Error('Docker output limit exceeded')); } });
  p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 64 * 1024) { p.kill('SIGKILL'); finish(Error('Docker error output limit exceeded')); } });
  p.on('error', (e) => finish(e));
  p.on('close', (c) => c === 0 ? finish() : finish(Error(`Docker command failed (${args[0]}): ${err.slice(0, 500)}`)));
});

function safeStat(s: Awaited<ReturnType<typeof lstat>>, directory = false) {
  return !s.isSymbolicLink() && (directory ? s.isDirectory() : s.isFile()) && s.uid === process.getuid?.() && (Number(s.mode) & 0o022) === 0;
}

async function pollHealthy(run: Run, base: string[], deadline: number) {
  const ids = (await run([...base, 'ps', '-q', 'app'])).trim().split(/\s+/).filter(Boolean);
  if (ids.length !== 1) throw Error('App container identity unavailable');
  let delay = 500;
  while (Date.now() < deadline) {
    const state = JSON.parse(await run(['inspect', '--format', '{{json .State}}', ids[0]]));
    if (state.Status === 'running' && state.Health?.Status === 'healthy') return;
    if (state.Status === 'exited' || state.Status === 'dead') break;
    await new Promise((r) => setTimeout(r, Math.min(delay, Math.max(0, deadline - Date.now()))));
    delay = Math.min(delay * 2, 5000);
  }
  throw Error('App readiness deadline exceeded');
}

interface ImageInspection {
  RepoTags?: string[];
  Config?: { Labels?: Record<string, string> };
  Os?: string;
  Architecture?: string;
}

function inspectImage(raw: string, ref: string, version: string, platform: string, failure: string) {
  let image: ImageInspection;
  try { image = JSON.parse(raw) as ImageInspection; } catch { throw Error(failure); }
  if (image.RepoTags?.includes(ref) !== true || image.Config?.Labels?.['org.opencontainers.image.version'] !== version || `${image.Os}/${image.Architecture}` !== platform) throw Error(failure);
}

export async function composeApply(o: {
  composeFile: string;
  projectDir: string;
  staged: string;
  repository: string;
  version: string;
  previous: string;
  digest: string;
  size: number;
  expectedPlatform: string;
  backupReceipt: string;
  approve: boolean;
  commit: () => Promise<void>;
  run?: Run;
}) {
  const run = o.run ?? realRun;
  if (!o.approve) throw Error('Explicit operator approval required');
  if (!isAbsolute(o.composeFile) || !isAbsolute(o.projectDir) || !isAbsolute(o.staged) || !isAbsolute(o.backupReceipt) || resolve(o.composeFile) !== o.composeFile || resolve(o.projectDir) !== o.projectDir) throw Error('Unsafe fixed paths');
  const [composeStat, projectStat, receiptStat] = await Promise.all([lstat(o.composeFile), lstat(o.projectDir), lstat(o.backupReceipt)]);
  if (!safeStat(composeStat) || !safeStat(projectStat, true) || !safeStat(receiptStat) || (receiptStat.mode & 0o077) !== 0) throw Error('Compose project and backup receipt must be operator-owned and protected');

  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(o.repository) || !semver.test(o.version) || !semver.test(o.previous) || o.previous === o.version || !/^[a-f0-9]{64}$/.test(o.digest) || !Number.isSafeInteger(o.size) || o.size < 1 || o.size > 512 * 1024 * 1024) throw Error('Invalid signed release identity');
  const file = await lstat(o.staged);
  if (!safeStat(file) || (file.mode & 0o077) !== 0 || file.size !== o.size) throw Error('Unsafe staged archive');
  if (createHash('sha256').update(await readFile(o.staged)).digest('hex') !== o.digest) throw Error('Staged archive digest mismatch');

  let receipt: Record<string, unknown>;
  try { receipt = JSON.parse(await readFile(o.backupReceipt, 'utf8')) as Record<string, unknown>; } catch { throw Error('Recent backup receipt required'); }
  const keys = ['path', 'sha256', 'size', 'tested', 'testedAt'].sort();
  const receiptPath = receipt?.path, receiptSize = receipt?.size, receiptHash = receipt?.sha256, receiptTime = receipt?.testedAt;
  if (!receipt || Object.keys(receipt).sort().join() !== keys.join() || receipt.tested !== true || typeof receiptPath !== 'string' || !isAbsolute(receiptPath) || typeof receiptSize !== 'number' || !Number.isSafeInteger(receiptSize) || receiptSize < 1 || typeof receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(receiptHash) || typeof receiptTime !== 'string') throw Error('Invalid backup receipt');
  const tested = Date.parse(receiptTime), age = Date.now() - tested;
  if (!Number.isFinite(tested) || age < 0 || age > 7 * 86400000) throw Error('Invalid backup receipt age');
  try {
    const bs = await lstat(receiptPath);
    if (!safeStat(bs) || (Number(bs.mode) & 0o077) !== 0 || bs.size !== receiptSize || createHash('sha256').update(await readFile(receiptPath)).digest('hex') !== receiptHash) throw Error();
  } catch { throw Error('Invalid backup receipt file'); }

  const envFile = resolve(o.projectDir, '.env.updater');
  const base = ['compose', '--env-file', envFile, '--project-directory', o.projectDir, '-f', o.composeFile];
  const ref = `${o.repository}:${o.version}`;
  const previousRef = `${o.repository}:${o.previous}`;

  // Fail closed before loading or deploying anything if rollback cannot be proven.
  inspectImage(await run(['image', 'inspect', '--format', '{{json .}}', previousRef]), previousRef, o.previous, o.expectedPlatform, 'Prior image identity/platform mismatch');

  let envExists = false;
  try {
    const st = await lstat(envFile);
    if (!safeStat(st) || (st.mode & 0o077) !== 0 || await readFile(envFile, 'utf8') !== `BICAPTCHA_APP_IMAGE=${previousRef}\n`) throw Error();
    envExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('Unsafe or inconsistent updater env file');
  }

  const writeEnv = async (value: string) => {
    const tmp = resolve(o.projectDir, `.env.updater.${process.pid}.${Date.now()}.tmp`);
    let handle;
    try {
      handle = await open(tmp, 'wx', 0o600);
      await handle.writeFile(`BICAPTCHA_APP_IMAGE=${value}\n`);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tmp, envFile);
      const dir = await open(o.projectDir, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await unlink(tmp).catch(() => {});
      throw error;
    }
  };

  // Compose must see its fixed image variable even on the very first update.
  if (!envExists) await writeEnv(previousRef);

  await run(['image', 'load', '--input', o.staged]);
  inspectImage(await run(['image', 'inspect', '--format', '{{json .}}', ref]), ref, o.version, o.expectedPlatform, 'Loaded image identity/platform mismatch');

  let ingressConfirmedStopped = false;
  let committed = false;
  try {
    await run([...base, 'stop', 'ingress']);
    ingressConfirmedStopped = true;
    await writeEnv(ref);
    await run([...base, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app']);
    await pollHealthy(run, base, Date.now() + deadlineMs);
    await o.commit();
    committed = true;
    await run([...base, 'start', 'ingress']);
  } catch (error) {
    // Once state is committed it agrees with the healthy app and durable env.
    // Keep ingress stopped for operator recovery if only its start failed.
    if (ingressConfirmedStopped && !committed) {
      try {
        await writeEnv(previousRef);
        inspectImage(await run(['image', 'inspect', '--format', '{{json .}}', previousRef]), previousRef, o.previous, o.expectedPlatform, 'Prior image identity/platform mismatch');
        await run([...base, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app']);
        await pollHealthy(run, base, Date.now() + deadlineMs);
        await run([...base, 'start', 'ingress']);
      } catch { /* Never expose ingress unless the prior app has proven healthy. */ }
    }
    throw error;
  }
}
