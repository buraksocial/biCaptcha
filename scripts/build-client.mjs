import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/bicaptcha-client.ts', import.meta.url), 'utf8');
const digest = createHash('sha256').update(source).digest('hex');
// Deterministic generation: obfuscation is not an authentication/security boundary.
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, removeComments: true } }).outputText;
const expected = `// Generated from src/lib/bicaptcha-client.ts; sha256=${digest}\n${javascript}`;
const output = new URL('../public/bicaptcha.js', import.meta.url);
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== expected) throw Error('Widget artifact out of sync; run npm run build:client');
  console.log('Widget artifact matches source.');
} else {
  fs.writeFileSync(output, expected);
  console.log('Widget SDK generated deterministically.');
}
