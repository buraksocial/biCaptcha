import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, symlink, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { composeApply } from '../scripts/compose-apply';

const repository = 'registry.example.com/team/app';
const previous = '1.2.2';
const next = '1.2.3';
const image = (ref: string) => {
  const version = ref.split(':').at(-1);
  return JSON.stringify({
    RepoTags: [ref],
    Config: { Labels: { 'org.opencontainers.image.version': version } },
    Os: 'linux',
    Architecture: 'amd64',
  });
};

async function fixture(prefix: string) {
  const directory = await mkdtemp(`/tmp/opencode/${prefix}-`);
  const archive = join(directory, 'image.oci');
  const receipt = join(directory, 'backup.json');
  const backup = join(directory, 'backup.tar');
  const composeFile = join(directory, 'compose.yaml');
  const data = Buffer.from('fixture');
  const digest = createHash('sha256').update(data).digest('hex');
  await writeFile(archive, data, { mode: 0o600 });
  await writeFile(backup, 'verified backup', { mode: 0o600 });
  await writeFile(receipt, JSON.stringify({
    tested: true,
    testedAt: new Date().toISOString(),
    path: backup,
    size: 15,
    sha256: createHash('sha256').update('verified backup').digest('hex'),
  }), { mode: 0o600 });
  await writeFile(composeFile, 'services: {}\n', { mode: 0o600 });
  const options = {
    composeFile,
    projectDir: directory,
    staged: archive,
    repository,
    version: next,
    previous,
    digest,
    size: data.length,
    expectedPlatform: 'linux/amd64' as const,
    backupReceipt: receipt,
    approve: true,
  };
  return { directory, archive, options };
}

test('first-run env bootstrap precedes the first Compose command and commit precedes ingress', async () => {
  const f = await fixture('apply-first-run');
  const envFile = join(f.directory, '.env.updater');
  const calls: string[] = [];
  let committed = false;
  const run = async (args: string[]) => {
    if (args[0] === 'image' && args[1] === 'inspect') return image(args.at(-1)!);
    if (args[0] === 'compose' && args.includes('stop')) {
      calls.push('stop');
      assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`);
    }
    if (args[0] === 'compose' && args.includes('ps')) return 'container-id\n';
    if (args[0] === 'inspect') return JSON.stringify({ Status: 'running', Health: { Status: 'healthy' } });
    if (args[0] === 'compose' && args.includes('start')) {
      calls.push('ingress-start');
      assert.equal(committed, true);
    }
    if (args[0] === 'compose' && args.includes('up')) calls.push('app-up');
    if (args[0] === 'image' && args[1] === 'load') calls.push('image-load');
    return '';
  };

  try {
    await composeApply({
      ...f.options,
      run,
      commit: async () => {
        assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${next}\n`);
        assert.equal(calls.at(-1), 'app-up');
        calls.push('commit');
        committed = true;
      },
    });
    assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${next}\n`);
    assert.deepEqual(calls, ['image-load', 'stop', 'app-up', 'commit', 'ingress-start']);
    assert.equal((await lstat(envFile)).mode & 0o777, 0o600);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('unavailable or mismatched prior image fails before any mutation or ingress transition', async () => {
  const invalidImages = [
    undefined,
    JSON.stringify({ ...JSON.parse(image(`${repository}:${previous}`)), RepoTags: [`${repository}:9.9.9`] }),
    JSON.stringify({ ...JSON.parse(image(`${repository}:${previous}`)), Config: { Labels: { 'org.opencontainers.image.version': '9.9.9' } } }),
    JSON.stringify({ ...JSON.parse(image(`${repository}:${previous}`)), Architecture: 'arm64' }),
  ];

  for (const invalid of invalidImages) {
    const f = await fixture('apply-no-prior');
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'image' && args[1] === 'inspect') {
        if (args.at(-1) === `${repository}:${previous}`) {
          if (!invalid) throw Error('No such image');
          return invalid;
        }
        return image(args.at(-1)!);
      }
      return '';
    };
    try {
      await assert.rejects(composeApply({ ...f.options, run, commit: async () => {} }), /Prior image identity\/platform mismatch|No such image/);
      assert.equal(calls.some((args) => args[0] === 'image' && args[1] === 'load'), false);
      assert.equal(calls.some((args) => args[0] === 'compose' && (args.includes('stop') || args.includes('up'))), false);
      await assert.rejects(lstat(join(f.directory, '.env.updater')), { code: 'ENOENT' });
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }
});

test('rolls back a failed readiness check and only restores ingress after old app is healthy', async () => {
  const f = await fixture('apply-rollback-readiness');
  const calls: string[][] = [];
  let appUps = 0;
  const run = async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'image' && args[1] === 'inspect') return image(args.at(-1)!);
    if (args[0] === 'compose' && args.includes('ps')) return 'id';
    if (args[0] === 'compose' && args.includes('up') && args.includes('app')) appUps++;
    if (args[0] === 'inspect') return JSON.stringify({
      Status: appUps === 1 ? 'exited' : 'running',
      Health: { Status: appUps === 1 ? 'unhealthy' : 'healthy' },
    });
    return '';
  };

  try {
    await assert.rejects(composeApply({ ...f.options, run, commit: async () => assert.fail('must not commit an unhealthy app') }), /readiness deadline exceeded/);
    assert.equal(await readFile(join(f.directory, '.env.updater'), 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`);
    assert.equal(appUps, 2);
    assert.equal(calls.filter((args) => args[0] === 'compose' && args.includes('start') && args.includes('ingress')).length, 1);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('commit callback failure rolls back while ingress stays stopped, then opens only on healthy old app', async () => {
  const f = await fixture('apply-rollback-commit');
  const envFile = join(f.directory, '.env.updater');
  const calls: string[] = [];
  let appUps = 0;
  let commitCalls = 0;
  const run = async (args: string[]) => {
    if (args[0] === 'image' && args[1] === 'inspect') return image(args.at(-1)!);
    if (args[0] === 'compose' && args.includes('stop')) calls.push('stop');
    if (args[0] === 'compose' && args.includes('ps')) return 'id';
    if (args[0] === 'compose' && args.includes('up') && args.includes('app')) {
      appUps++;
      calls.push(appUps === 1 ? 'new-up' : 'old-up');
    }
    if (args[0] === 'inspect') {
      calls.push(appUps === 1 ? 'new-healthy' : 'old-healthy');
      return JSON.stringify({ Status: 'running', Health: { Status: 'healthy' } });
    }
    if (args[0] === 'compose' && args.includes('start')) {
      calls.push('ingress-start');
      assert.equal(appUps, 2);
      assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`);
    }
    return '';
  };

  try {
    await assert.rejects(composeApply({
      ...f.options,
      run,
      commit: async () => {
        commitCalls++;
        assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${next}\n`);
        calls.push('commit-failed');
        throw Error('injected state commit failure');
      },
    }), /injected state commit failure/);
    assert.equal(commitCalls, 1);
    assert.equal(await readFile(envFile, 'utf8'), `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`);
    assert.deepEqual(calls, ['stop', 'new-up', 'new-healthy', 'commit-failed', 'old-up', 'old-healthy', 'ingress-start']);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test('rejects unsafe, inconsistent or operator-permissive updater env files before Compose', async () => {
  for (const kind of ['wrong-value', 'extra-key', 'permissive', 'symlink']) {
    const f = await fixture(`apply-env-${kind}`);
    const envFile = join(f.directory, '.env.updater');
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'image' && args[1] === 'inspect') return image(args.at(-1)!);
      return '';
    };
    try {
      if (kind === 'wrong-value') await writeFile(envFile, `BICAPTCHA_APP_IMAGE=${repository}:9.9.9\n`, { mode: 0o600 });
      if (kind === 'extra-key') await writeFile(envFile, `BICAPTCHA_APP_IMAGE=${repository}:${previous}\nOTHER=value\n`, { mode: 0o600 });
      if (kind === 'permissive') {
        await writeFile(envFile, `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`, { mode: 0o644 });
        await chmod(envFile, 0o644);
      }
      if (kind === 'symlink') {
        const target = join(f.directory, 'elsewhere');
        await writeFile(target, `BICAPTCHA_APP_IMAGE=${repository}:${previous}\n`, { mode: 0o600 });
        await symlink(target, envFile);
      }
      await assert.rejects(composeApply({ ...f.options, run, commit: async () => {} }), /Unsafe or inconsistent updater env file/);
      assert.equal(calls.some((args) => args[0] === 'compose'), false);
      assert.equal(calls.some((args) => args[0] === 'image' && args[1] === 'load'), false);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }
});
