import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const EXPECTED_CAMERA13_FIELDS = Object.freeze([
  'website','productName','condition','specs','rentalPricePerDay','rentalTerms',
  'accessoriesIncluded','bundleIncluded','rating','reviewCount','stock','salePrice','url'
]);

export const EXPECTED_CAMERA13_HEADERS = Object.freeze([
  'Website','Tên sản phẩm','Hàng cũ/Hàng mới','Thông số mô tả','Giá thuê/ngày',
  'Điều kiện thuê riêng','Phụ kiện đi kèm','Combo/gói đi kèm','Điểm đánh giá',
  'Số lượt đánh giá/review','Tồn kho','Giá bán','URL'
]);

const BENCHMARK_SITE_LITERALS = ['vjshop.vn','bndigital.vn','kyma.vn'];
const TEXT_EXTENSIONS = new Set(['.txt','.log','.json','.jsonl','.md','.csv','.ts','.tsx','.js','.mjs','.cjs','.html','.xml','.yaml','.yml']);

function violation(code, file, message) { return { code, file, message }; }

export function scanArchitectureSource(file, source) {
  const out = [];
  const text = String(source);

  if (/querySelectorAll\s*\(\s*(["'`])a\[href\]\1\s*\)/iu.test(text)) {
    out.push(violation('WHOLE_DOCUMENT_LINK_CRAWL', file, 'Whole-document a[href] crawling is forbidden in the V16 main path.'));
  }

  if (
    /\b(?:host|hostname)\s*(?:===|==|!==|!=)\s*(["'`])[^"'`\s]+\.[a-z]{2,}[^"'`]*\1/iu.test(text) ||
    /(["'`])[^"'`\s]+\.[a-z]{2,}[^"'`]*\1\s*(?:===|==|!==|!=)\s*\b(?:host|hostname)\b/iu.test(text) ||
    /case\s+(["'`])[^"'`\s]+\.[a-z]{2,}[^"'`]*\1\s*:/iu.test(text)
  ) {
    out.push(violation('RETAILER_HOST_BRANCH', file, 'Retailer hostname branch detected.'));
  }

  if (/(?:blocklist|denylist|blacklist|excludedPaths?|ignoredPaths?|forbiddenPaths?)\s*=\s*\[[\s\S]{0,800}?(["'`])\/[^"'`]+\1/iu.test(text)) {
    out.push(violation('RETAILER_PATH_BLOCKLIST', file, 'Retailer/path blocklist detected as discovery logic.'));
  }

  if (/(?:setInterval|watchFile|fs\.watch|chokidar|poll)[\s\S]{0,300}run-state\.json|run-state\.json[\s\S]{0,300}(?:setInterval|watchFile|fs\.watch|chokidar|poll)/iu.test(text)) {
    out.push(violation('RUN_STATE_POLLING', file, 'run-state polling/observer detected.'));
  }

  if (/(?:writeFile|appendFile|persist|save|serialize|JSON\.stringify)[\s\S]{0,500}\b(?:apiKey|authorization|cookie|csrf|bearerToken|sessionToken)\b/iu.test(text)) {
    out.push(violation('SECRET_PERSISTENCE_SOURCE', file, 'Likely persistence of auth/API secret material.'));
  }

  const lower = text.toLowerCase();
  for (const literal of BENCHMARK_SITE_LITERALS) {
    if (lower.includes(literal)) {
      out.push(violation('BENCHMARK_SITE_LITERAL_IN_PRODUCTION', file, `Benchmark site literal ${literal} appears in V16 production source.`));
    }
  }

  return out;
}

async function walk(root) {
  const out = [];
  async function visit(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await visit(root);
  return out;
}

export async function scanArchitectureTree(repoRoot) {
  const src = path.join(repoRoot, 'src', 'v16');
  let stat;
  try { stat = await fs.stat(src); } catch { return { integrationAvailable: false, violations: [] }; }
  if (!stat.isDirectory()) return { integrationAvailable: false, violations: [] };
  const files = await walk(src);
  const violations = [];
  for (const file of files.filter(f => /\.(?:ts|tsx|js|mjs|cjs)$/iu.test(f))) {
    const source = await fs.readFile(file, 'utf8');
    violations.push(...scanArchitectureSource(path.relative(repoRoot, file), source));
  }
  return { integrationAvailable: true, violations };
}

export function assertFrozenManifestShape(manifest) {
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('INVALID_FROZEN_V15_MANIFEST');
  for (const item of manifest.files) {
    if (!item.path || !/^[0-9a-f]{40}$/u.test(item.blobSha ?? '')) throw new Error(`INVALID_FROZEN_V15_ENTRY:${item?.path ?? 'unknown'}`);
  }
}

export function checkFrozenV15(repoRoot, manifest) {
  assertFrozenManifestShape(manifest);
  const violations = [];
  for (const item of manifest.files) {
    const full = path.join(repoRoot, item.path);
    try {
      const actual = execFileSync('git', ['hash-object', '--', full], { cwd: repoRoot, encoding: 'utf8' }).trim();
      if (actual !== item.blobSha) violations.push(violation('FROZEN_V15_DRIFT', item.path, `Expected ${item.blobSha}, got ${actual}.`));
    } catch (error) {
      violations.push(violation('FROZEN_V15_MISSING', item.path, `Cannot hash frozen V15 file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return violations;
}

export async function checkCamera13HeaderSource(repoRoot) {
  const file = path.join(repoRoot, 'src', 'v03', 'contracts', 'camera13.ts');
  const source = await fs.readFile(file, 'utf8');
  const match = source.match(/CAMERA13_HEADERS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/u);
  if (!match) throw new Error('CAMERA13_HEADERS_NOT_FOUND');
  const headers = [...match[1].matchAll(/(["'])(.*?)\1/gu)].map(m => m[2]);
  if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_CAMERA13_HEADERS)) throw new Error(`CAMERA13_HEADER_ORDER_CHANGED:${JSON.stringify(headers)}`);
  return headers;
}

async function scanXlsxFile(file, needles) {
  let ExcelJS;
  try {
    const mod = await import('exceljs');
    ExcelJS = mod.default ?? mod;
  } catch {
    throw new Error('EXCELJS_REQUIRED_FOR_XLSX_SECRET_SCAN');
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const hits = [];
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        const text = typeof cell.value === 'string' ? cell.value : JSON.stringify(cell.value ?? '');
        for (const needle of needles) if (text.includes(needle)) hits.push({ file, needle, location: `${sheet.name}!R${rowNumber}C${colNumber}` });
      });
    });
  }
  return hits;
}

export async function findSecretOccurrences(root, needles, { scanXlsx = true } = {}) {
  if (!Array.isArray(needles) || needles.length === 0) throw new Error('SECRET_NEEDLES_REQUIRED');
  const files = await walk(root);
  const hits = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.xlsx') {
      if (scanXlsx) hits.push(...await scanXlsxFile(file, needles));
      continue;
    }
    if (!TEXT_EXTENSIONS.has(ext) && path.basename(file).includes('.')) continue;
    let text;
    try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
    for (const needle of needles) {
      let from = 0;
      while (true) {
        const index = text.indexOf(needle, from);
        if (index < 0) break;
        hits.push({ file, needle, offset: index });
        from = index + Math.max(1, needle.length);
      }
    }
  }
  return hits;
}

function requireNonnegativeMetric(metrics, key, { integer = true } = {}) {
  const value = metrics[key];
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new Error(`INVALID_BENCHMARK_METRIC:${key}`);
}

export function validateBenchmarkMetrics(metrics) {
  if (!metrics || !['v15','v16'].includes(metrics.version)) throw new Error('INVALID_BENCHMARK_VERSION');
  if (!metrics.site || !metrics.rootUrl) throw new Error('BENCHMARK_SITE_AND_ROOT_REQUIRED');
  requireNonnegativeMetric(metrics, 'wallClockMs', { integer: false });
  for (const key of ['pagesOpened','screenshotCount','geminiCalls','totalUrlCandidates','irrelevantUrlCandidates','finalUniqueCameraProducts','directCompletedProducts','geminiCallsForDirectProducts']) requireNonnegativeMetric(metrics, key);
  if (metrics.finalUniqueCameraProducts > metrics.totalUrlCandidates && metrics.totalUrlCandidates !== 0) throw new Error('FINAL_PRODUCTS_EXCEED_CANDIDATES');
  const keys = Object.keys(metrics.fieldCompleteness ?? {});
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_CAMERA13_FIELDS)) throw new Error('FIELD_COMPLETENESS_KEYS_MUST_MATCH_13_COLUMNS');
  for (const field of EXPECTED_CAMERA13_FIELDS) {
    const value = metrics.fieldCompleteness[field];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INVALID_FIELD_COMPLETENESS:${field}`);
  }
  if (metrics.version === 'v16' && metrics.directCompletedProducts > 0 && metrics.geminiCallsForDirectProducts !== 0) throw new Error('DIRECT_COMPLETED_PRODUCT_CALLED_GEMINI');
  return metrics;
}

export function compareBenchmarkPair(v15, v16) {
  validateBenchmarkMetrics(v15);
  validateBenchmarkMetrics(v16);
  if (v15.version !== 'v15' || v16.version !== 'v16') throw new Error('BENCHMARK_PAIR_VERSION_ORDER');
  if (v15.site !== v16.site || v15.rootUrl !== v16.rootUrl) throw new Error('BENCHMARK_PAIR_SITE_MISMATCH');
  return {
    site: v16.site,
    rootUrl: v16.rootUrl,
    wallClockDeltaMs: v16.wallClockMs - v15.wallClockMs,
    pagesOpenedDelta: v16.pagesOpened - v15.pagesOpened,
    screenshotDelta: v16.screenshotCount - v15.screenshotCount,
    geminiCallDelta: v16.geminiCalls - v15.geminiCalls,
    totalUrlCandidateDelta: v16.totalUrlCandidates - v15.totalUrlCandidates,
    irrelevantUrlCandidateDelta: v16.irrelevantUrlCandidates - v15.irrelevantUrlCandidates,
    uniqueCameraProductDelta: v16.finalUniqueCameraProducts - v15.finalUniqueCameraProducts,
    faster: v16.wallClockMs < v15.wallClockMs,
    candidateNarrower: v16.totalUrlCandidates < v15.totalUrlCandidates,
    v16IrrelevantUrlCandidates: v16.irrelevantUrlCandidates,
    v16DirectGeminiCalls: v16.geminiCallsForDirectProducts,
    fieldCompletenessDelta: Object.fromEntries(EXPECTED_CAMERA13_FIELDS.map(field => [field, v16.fieldCompleteness[field] - v15.fieldCompleteness[field]]))
  };
}

export function renderBenchmarkTable(comparisons) {
  const lines = [
    '| Site | V16 runtime Δ ms | Pages Δ | Screenshots Δ | Gemini Δ | Candidates Δ | Irrelevant Δ | Unique camera Δ | Faster? | Candidate narrower? |',
    '|---|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|'
  ];
  for (const c of comparisons) lines.push(`| ${c.site} | ${c.wallClockDeltaMs} | ${c.pagesOpenedDelta} | ${c.screenshotDelta} | ${c.geminiCallDelta} | ${c.totalUrlCandidateDelta} | ${c.irrelevantUrlCandidateDelta} | ${c.uniqueCameraProductDelta} | ${c.faster ? 'YES' : 'NO'} | ${c.candidateNarrower ? 'YES' : 'NO'} |`);
  return lines.join('\n') + '\n';
}
