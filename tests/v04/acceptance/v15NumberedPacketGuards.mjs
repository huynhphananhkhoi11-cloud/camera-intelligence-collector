import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const EXPECTED_CAMERA_DATA_HEADERS = Object.freeze([
  "Website",
  "Tên sản phẩm",
  "Hàng cũ/Hàng mới",
  "Thông số mô tả",
  "Giá thuê/ngày",
  "Điều kiện thuê riêng",
  "Phụ kiện đi kèm",
  "Combo/gói đi kèm",
  "Điểm đánh giá",
  "Số lượt đánh giá/review",
  "Tồn kho",
  "Giá bán",
  "URL"
]);

const requiredShotFields = Object.freeze([
  "sequence",
  "shotId",
  "pageZone",
  "scrollY",
  "documentHeight",
  "path",
  "contentHash",
  "isAuthoritativeHero"
]);

const requiredPageZones = Object.freeze([
  "HERO",
  "UPPER",
  "MIDDLE",
  "LOWER",
  "TAIL",
  "FOOTER"
]);

export const REQUIRED_LANE_COVERAGE = Object.freeze([
  {
    path: "tests/v04/recon/siteReconnaissance.test.ts",
    markers: [/nav-01/i, /nav-02|sequence|ordered/i, /semantic|camera.*filter/i]
  },
  {
    path: "tests/v04/ai/cameraRouteSelector.test.ts",
    markers: [/gemini-3\.5-flash-lite/i, /ordered|sequence/i, /candidateId/i, /audit.*html|collage/i]
  },
  {
    path: "tests/v04/discovery/approvedRouteDiscovery.test.ts",
    markers: [/approved/i, /first.?seen|FIFO|order/i, /semantic/i]
  },
  {
    path: "tests/v04/vision/productCapturePacket.test.ts",
    markers: [
      /01-hero-final/i,
      /02-upper|03-middle|pageZone/i,
      /isAuthoritativeHero/i,
      /sequence/i,
      /immutable|frozen/i,
      /stale.*hero|initial.*hero/i
    ]
  },
  {
    path: "tests/v04/runtime/pipelinedProductRuntime.test.ts",
    markers: [
      /AUDIT_KEEP_ALL/,
      /LEAN_DELETE_SUCCESS/,
      /AI_IN_FLIGHT/,
      /REVIEW/,
      /ERROR/,
      /capture.*(?:B|N\+1)|overlap/i,
      /semantic.*concurrency|concurrency.*1/i,
      /decision.*persist|persist.*decision/i,
      /validation.*persist|persist.*validation/i,
      /result.*persist|persist.*result|row.*persist/i,
      /workspace|isolation|another.*product/i,
      /contaminat|mix|packet.*(?:A|B)|(?:A|B).*packet/i,
      /resume|checkpoint/i
    ]
  },
  {
    path: "tests/v04/ai/productCameraSemanticPrompt.test.ts",
    markers: [
      /gemini-3\.5-flash-lite/i,
      /01-hero-final/i,
      /ordered|numerical order|sequence/i,
      /separate.*image|image.*parts|inlineData/i,
      /one.*call|single.*call|call.*once/i,
      /capture-audit\.html|audit.*html/i,
      /collage|contact sheet/i,
      /related|recommended/i,
      /footer|company information/i,
      /resolution.*(?:high|ultra_high)|(?:high|ultra_high).*resolution/i,
      /V14_COLUMN_SEMANTIC_CONTRACT/
    ]
  },
  {
    path: "tests/v04/export/camera13Workbook.test.ts",
    markers: [/Website/, /Tên sản phẩm/, /Giá bán/, /URL/]
  },
  {
    path: "tests/v04/vision/screenshotReliability.real.test.ts",
    markers: [/playwright|chromium|browser|page\.screenshot/i, /stalled|font/i, /fallback|timeout|deadline/i]
  }
]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(root) {
  if (!(await exists(root))) return [];
  const files = [];
  for (const name of await readdir(root)) {
    const path = join(root, name);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...(await collectSourceFiles(path)));
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/i.test(name)) files.push(path);
  }
  return files;
}

async function readRequired(path, label, findings) {
  if (!(await exists(path))) {
    findings.push(`missing ${label}: ${path}`);
    return null;
  }
  return readFile(path, "utf8");
}

export function expectedSemanticOrder(shots) {
  return [...shots]
    .sort((a, b) => a.sequence - b.sequence)
    .map((shot) => shot.shotId);
}

export function validateNumberedPacketSnapshot(shots) {
  const findings = [];
  if (!Array.isArray(shots) || shots.length === 0) return ["numbered semantic packet is empty"];

  const first = shots[0];
  if (first.sequence !== 1 || first.shotId !== "01-hero-final" || first.isAuthoritativeHero !== true) {
    findings.push("Screenshot 1 must be final authoritative 01-hero-final");
  }

  let previousScroll = -Infinity;
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    const expectedSequence = index + 1;
    if (shot.sequence !== expectedSequence) {
      findings.push(`semantic screenshot sequence must be contiguous at ${expectedSequence}`);
    }
    const expectedPrefix = String(expectedSequence).padStart(2, "0");
    if (!String(shot.shotId ?? "").startsWith(`${expectedPrefix}-`)) {
      findings.push(`shotId ${shot.shotId ?? "<missing>"} must carry ${expectedPrefix}- prefix`);
    }
    if (typeof shot.scrollY === "number" && shot.scrollY < previousScroll) {
      findings.push("semantic screenshots after hero must remain top-to-bottom by scrollY");
    }
    if (typeof shot.scrollY === "number") previousScroll = shot.scrollY;
    if (index > 0 && shot.isAuthoritativeHero === true) {
      findings.push("only Screenshot 1 may be authoritative hero");
    }
  }
  return findings;
}

export function validateRetentionSnapshot(snapshot) {
  const findings = [];
  const protectedStatuses = new Set(["REVIEW", "ERROR", "INCOMPLETE", "AI_IN_FLIGHT"]);
  const cleanupSuccessStatuses = new Set(["VALIDATED", "SKIPPED_NON_CAMERA"]);

  if (snapshot.policy === "AUDIT_KEEP_ALL" && snapshot.workspaceDeleted) {
    findings.push("AUDIT_KEEP_ALL must retain evidence");
  }

  if (protectedStatuses.has(snapshot.status) && snapshot.workspaceDeleted) {
    findings.push(`${snapshot.status} must retain evidence`);
  }

  if (snapshot.policy === "LEAN_DELETE_SUCCESS" && snapshot.workspaceDeleted) {
    if (!snapshot.semanticDecisionPersisted) findings.push("semantic decision must be persisted before deletion");
    if (!snapshot.structuralValidationPersisted) findings.push("structural validation must be persisted before deletion");
    if (!snapshot.durableResultPersisted) findings.push("durable row/result must be persisted before deletion");
    if (!cleanupSuccessStatuses.has(snapshot.status)) {
      findings.push("only successful completed products may be deleted in lean mode");
    }
  }
  return findings;
}

export async function inspectFrozenNumberedContracts(root) {
  const findings = [];
  const path = join(root, "src/v04/contracts/v15PipelineContracts.ts");
  const source = await readRequired(path, "V15 shared contract", findings);
  if (source === null) return findings;

  if (!/interface\s+FrozenProductVisualPacket/.test(source)) findings.push("FrozenProductVisualPacket contract missing");
  for (const field of requiredShotFields) {
    if (!new RegExp(`\\b${field}\\b`).test(source)) findings.push(`numbered shot contract missing ${field}`);
  }
  for (const zone of requiredPageZones) {
    if (!new RegExp(`(?:[\"']${zone}[\"'])`).test(source)) findings.push(`pageZone contract missing ${zone}`);
  }
  if (!/AUDIT_KEEP_ALL/.test(source) || !/LEAN_DELETE_SUCCESS/.test(source)) {
    findings.push("retention policy contract must expose AUDIT_KEEP_ALL and LEAN_DELETE_SUCCESS");
  }
  return findings;
}

export async function inspectCanonicalSemanticContract(root) {
  const findings = [];
  const productPath = join(root, "src/v04/ai/productCameraSemanticPrompt.ts");
  const canonicalPath = join(root, "src/v04/ai/simpleSemantic13Prompt.ts");
  const product = await readRequired(productPath, "product semantic prompt", findings);
  const canonical = await readRequired(canonicalPath, "canonical V14 semantic prompt", findings);
  if (product === null || canonical === null) return findings;

  if (!/V14_COLUMN_SEMANTIC_CONTRACT/.test(canonical)) {
    findings.push("canonical simpleSemantic13Prompt.ts does not expose V14_COLUMN_SEMANTIC_CONTRACT");
  }
  if (!/V14_COLUMN_SEMANTIC_CONTRACT/.test(product) || !/simpleSemantic13Prompt/.test(product)) {
    findings.push("product interpreter must reuse V14_COLUMN_SEMANTIC_CONTRACT from simpleSemantic13Prompt.ts");
  }
  if (/(?:const|let|var|export\s+const)\s+V14_COLUMN_SEMANTIC_CONTRACT\s*=/.test(product)) {
    findings.push("product interpreter duplicates V14_COLUMN_SEMANTIC_CONTRACT locally");
  }
  return findings;
}

export async function inspectWorkbookContract(root) {
  const findings = [];
  const path = join(root, "src/v04/export/camera13Workbook.ts");
  const source = await readRequired(path, "camera13 workbook exporter", findings);
  if (source === null) return findings;

  let cursor = -1;
  for (const header of EXPECTED_CAMERA_DATA_HEADERS) {
    const index = source.indexOf(header);
    if (index < 0) findings.push(`workbook exporter missing frozen header: ${header}`);
    else if (index <= cursor) findings.push(`workbook header order drift at: ${header}`);
    cursor = Math.max(cursor, index);
  }
  return findings;
}

export async function inspectRequiredLaneCoverage(root) {
  const findings = [];
  for (const requirement of REQUIRED_LANE_COVERAGE) {
    const path = join(root, requirement.path);
    const source = await readRequired(path, "required lane regression test", findings);
    if (source === null) continue;
    for (const marker of requirement.markers) {
      if (!marker.test(source)) findings.push(`${requirement.path}: missing coverage marker /${marker.source}/`);
    }
  }
  return findings;
}

function collectLargeBenchmarkNumbers(value, out = new Set()) {
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 100000) out.add(String(value));
  else if (Array.isArray(value)) for (const item of value) collectLargeBenchmarkNumbers(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectLargeBenchmarkNumbers(item, out);
  return out;
}

export async function scanNumberedPacketArchitecture(root) {
  const findings = [];
  const scanRoots = [
    "src/v04/recon",
    "src/v04/discovery",
    "src/v04/vision",
    "src/v04/runtime",
    "src/v04/pipeline",
    "src/v04/validation"
  ];
  const semanticPath = join(root, "src/v04/ai/productCameraSemanticPrompt.ts");

  const productionFiles = [];
  for (const relativeRoot of scanRoots) {
    const absoluteRoot = join(root, relativeRoot);
    if (!(await exists(absoluteRoot))) {
      findings.push(`missing architecture root: ${relativeRoot}`);
      continue;
    }
    productionFiles.push(...(await collectSourceFiles(absoluteRoot)));
  }

  const benchmarkPath = join(root, "benchmarks/v3/ground_truth.json");
  let benchmarkNumbers = new Set();
  const retailerHosts = new Set();
  if (await exists(benchmarkPath)) {
    const groundTruth = JSON.parse(await readFile(benchmarkPath, "utf8"));
    benchmarkNumbers = collectLargeBenchmarkNumbers(groundTruth.cases ?? []);
    for (const item of groundTruth.cases ?? []) {
      try {
        retailerHosts.add(new URL(item.url).hostname.toLowerCase());
      } catch {
        // Invalid/missing benchmark URL is handled by benchmark tooling elsewhere.
      }
    }
  } else {
    findings.push("missing benchmarks/v3/ground_truth.json for retailer/benchmark architecture scan");
  }

  const fieldRegexRepair = /(?:\/[^/\n]*(?:price|stock|rating|review|bundle|accessor|condition|rental)[^/\n]*\/[dgimsuvy]*|new\s+RegExp\([^)]*(?:price|stock|rating|review|bundle|accessor|condition|rental)[^)]*\))/i;

  for (const path of productionFiles) {
    const source = await readFile(path, "utf8");
    const rel = relative(root, path).replaceAll("\\", "/");
    const lowerSource = source.toLowerCase();
    for (const host of retailerHosts) {
      if (lowerSource.includes(host)) {
        findings.push(`${rel}: retailer literal found (${host})`);
        break;
      }
    }
    if (fieldRegexRepair.test(source)) findings.push(`${rel}: local ecommerce field regex/repair pattern found`);
    for (const number of benchmarkNumbers) {
      if (source.includes(number)) {
        findings.push(`${rel}: benchmark numeric literal found (${number})`);
        break;
      }
    }
  }

  const semantic = await readRequired(semanticPath, "product semantic prompt", findings);
  if (semantic !== null) {
    if (/inlineData[\s\S]{0,240}(?:text\/html|capture-audit\.html|\.html[\"'`])/i.test(semantic) ||
        /fileData[\s\S]{0,240}(?:text\/html|capture-audit\.html|\.html[\"'`])/i.test(semantic)) {
      findings.push("Gemini media transport contains audit HTML");
    }
    if (!/gemini-3\.5-flash-lite/.test(semantic)) findings.push("product semantic model drifted from gemini-3.5-flash-lite");
    if (!/high/i.test(semantic)) findings.push("context Gemini image resolution high is not represented");
    if (!/ultra_high/i.test(semantic)) findings.push("authoritative final hero ultra_high resolution is not represented");
    if (!/isAuthoritativeHero[\s\S]{0,220}ultra_high|ultra_high[\s\S]{0,220}isAuthoritativeHero/i.test(semantic)) {
      findings.push("ultra_high must be scoped to the authoritative final hero");
    }
  }

  return findings;
}
