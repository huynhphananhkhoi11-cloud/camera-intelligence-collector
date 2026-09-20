import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const scanTracked = args.has('--tracked') || args.size === 0;

const secretPatterns = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['GitHub classic token', /gh[pousr]_[A-Za-z0-9]{20,255}/g],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{20,255}/g],
  ['OpenAI-style key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['Private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const forbiddenTracked = [
  { name: 'runtime state directory', test: (p) => p === '.camintel' || p.startsWith('.camintel/') },
  { name: 'run-state file', test: (p) => p.endsWith('.run-state.json') },
  { name: 'local provider profile store', test: (p) => p === 'data/profiles' || p.startsWith('data/profiles/') },
  { name: 'live environment file', test: (p) => /^\.env(?:\..+)?$/i.test(p) && p !== '.env.example' },
  {
    name: 'live workbook outside fixtures',
    test: (p) => p.toLowerCase().endsWith('.xlsx') && !/(^|\/)(tests?|benchmarks?)\/.*fixtures?\//i.test(p),
  },
  { name: 'partial workbook', test: (p) => p.toLowerCase().endsWith('.partial.xlsx') },
];

function gitTrackedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return raw.split('\0').filter(Boolean).map((p) => p.replaceAll('\\', '/'));
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return !sample.includes(0);
}

function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function scanText(file, text, findings) {
  for (const [label, regex] of secretPatterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      findings.push(`${file}:${lineNumber(text, match.index ?? 0)}: ${label}`);
    }
  }

  for (const envName of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY']) {
    const value = process.env[envName];
    if (value && value.length >= 8 && text.includes(value)) {
      findings.push(`${file}: contains exact value from ${envName}`);
    }
  }
}

const findings = [];
const tracked = scanTracked ? gitTrackedFiles() : [];

for (const file of tracked) {
  const normalized = file.replaceAll('\\', '/');
  for (const rule of forbiddenTracked) {
    if (rule.test(normalized)) findings.push(`${normalized}: forbidden tracked ${rule.name}`);
  }

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;

  const buffer = fs.readFileSync(file);
  if (!isProbablyText(buffer)) continue;
  scanText(normalized, buffer.toString('utf8'), findings);
}

if (findings.length > 0) {
  console.error('Release security scan FAILED.');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Release security scan PASS (${tracked.length} tracked paths checked).`);
