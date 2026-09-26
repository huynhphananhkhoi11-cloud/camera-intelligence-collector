import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const SCAN_ROOTS = Object.freeze([
  "src/v04",
  "scripts/v04",
  "tests/v04",
  "docs/superpowers/plans"
]);

const TEXT_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs|md|json|ps1)$/iu;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const SECRET_PATTERNS = Object.freeze([
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/gu],
  ["GitHub classic token", /gh[pousr]_[A-Za-z0-9]{20,255}/gu],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{20,255}/gu],
  ["OpenAI-style key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/gu],
  ["AWS access key", /AKIA[0-9A-Z]{16}/gu],
  ["Private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu]
]);

function isV15Plan(path) {
  return !path.includes("docs/superpowers/plans/") || /v15/i.test(path);
}

function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

async function collectFiles(root, scanRoot) {
  let entries;
  try {
    entries = await readdir(scanRoot, { withFileTypes: true });
  }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(scanRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, path));
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.test(entry.name)) continue;

    const rel = relative(root, path).replaceAll("\\", "/");
    if (!isV15Plan(rel)) continue;

    const info = await stat(path);
    if (info.size > MAX_TEXT_BYTES) continue;
    files.push({ path, rel });
  }
  return files;
}

export async function findV15SecretFindings(
  repoRoot,
  env = process.env
) {
  const root = resolve(repoRoot);
  const files = [];
  for (const scanRoot of SCAN_ROOTS) {
    files.push(...await collectFiles(root, join(root, scanRoot)));
  }

  const findings = [];
  for (const file of files) {
    const text = await readFile(file.path, "utf8");

    for (const [label, regex] of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        findings.push(
          `${file.rel}:${lineNumber(text, match.index ?? 0)}: ${label}`
        );
      }
    }

    for (const envName of [
      "GEMINI_AUTH_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENAI_API_KEY"
    ]) {
      const value = env[envName];
      if (value && value.length >= 8 && text.includes(value)) {
        findings.push(`${file.rel}: contains exact value from ${envName}`);
      }
    }
  }

  return {
    checkedFiles: files.length,
    findings
  };
}

function repoRootFromScript() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const result = await findV15SecretFindings(repoRootFromScript());
  if (result.findings.length > 0) {
    console.error("V15 security scan FAILED.");
    for (const finding of result.findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  }
  else {
    console.log(`V15 security scan PASS (${result.checkedFiles} source/test/script files checked, including untracked V15 files).`);
  }
}
