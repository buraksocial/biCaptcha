const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcPath = path.join(__dirname, '../src/lib/bicaptcha-client.ts');
const outDir = path.join(__dirname, '../public');
const outPath = path.join(outDir, 'bicaptcha.js');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Read TypeScript file
const tsCode = fs.readFileSync(srcPath, 'utf8');

// Compile TS to JS
const jsCode = ts.transpileModule(tsCode, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    removeComments: true,
  }
}).outputText;

// Obfuscate JS
const obfuscationResult = JavaScriptObfuscator.obfuscate(jsCode, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false
});

fs.writeFileSync(outPath, obfuscationResult.getObfuscatedCode(), 'utf8');
console.log('biCaptcha client script compiled and obfuscated successfully! Saved to public/bicaptcha.js');
