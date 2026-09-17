import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import type {
  DiscoveryAuditReport
} from "./discoveryAuditEngine.js";

import type {
  DiscoveryBaseline
} from "./discoveryRegression.js";


export type BaselineLoadStatus =
  | "FOUND"
  | "MISSING"
  | "INVALID";


export interface BaselineLoadResult {
  status:
    BaselineLoadStatus;

  path:
    string;

  baseline:
    DiscoveryBaseline | null;

  error:
    string | null;
}


export interface BaselinePromotionDecision {
  promote:
    boolean;

  reason:
    string;
}


const REGRESSION_BLOCKERS =
  new Set([
    "RECALL_SITEMAP_ALIGNMENT",
    "ROOT_BUDGET_TRUNCATION",
    "DISCOVERY_ERRORS",
    "COVERAGE_REGRESSION",
    "SITEMAP_SCALE_SHIFT",
    "ERROR_REGRESSION",
    "PERFORMANCE_REGRESSION",
    "ROOT_COLLAPSE"
  ]);


function defaultRootDir():
  string {

  return join(
    process.cwd(),
    "output",
    "diagnostics",
    "baselines"
  );
}


function safeHost(
  canonicalOrigin:
    string
): string {

  const host =
    new URL(
      canonicalOrigin
    )
      .host
      .toLowerCase();


  return host.replace(
    /[^a-z0-9._-]+/g,
    "_"
  );
}


export function discoveryBaselinePath(
  canonicalOrigin:
    string,
  rootDir:
    string = defaultRootDir()
): string {

  return join(
    rootDir,
    `${safeHost(
      canonicalOrigin
    )}.json`
  );
}


function isRecord(
  value:
    unknown
): value is
  Record<string, unknown> {

  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  );
}


function isFiniteNonNegative(
  value:
    unknown
): value is number {

  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    ) &&
    value >=
      0
  );
}


function parseBaseline(
  raw:
    unknown,
  canonicalOrigin:
    string
): DiscoveryBaseline | null {

  if (
    !isRecord(
      raw
    )
  ) {
    return null;
  }


  if (
    raw.schemaVersion !==
      "discovery-baseline-v1" ||
    raw.canonicalOrigin !==
      canonicalOrigin ||
    typeof raw.capturedAt !==
      "string" ||
    !isFiniteNonNegative(
      raw.sitemapPageCount
    ) ||
    !isFiniteNonNegative(
      raw.graphNodeCount
    ) ||
    !isFiniteNonNegative(
      raw.rootCount
    ) ||
    !isFiniteNonNegative(
      raw.graphErrorCount
    ) ||
    !isRecord(
      raw.sourceNodeCounts
    ) ||
    (
      raw.productGraphMs !==
        null &&
      !isFiniteNonNegative(
        raw.productGraphMs
      )
    )
  ) {

    return null;
  }


  const sourceNodeCounts:
    Record<string, number> = {};


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      raw.sourceNodeCounts
    )
  ) {

    if (
      !isFiniteNonNegative(
        value
      )
    ) {

      return null;
    }


    sourceNodeCounts[
      key
    ] =
      value;
  }


  return {
    schemaVersion:
      "discovery-baseline-v1",

    canonicalOrigin,

    capturedAt:
      raw.capturedAt,

    sitemapPageCount:
      raw.sitemapPageCount,

    graphNodeCount:
      raw.graphNodeCount,

    rootCount:
      raw.rootCount,

    graphErrorCount:
      raw.graphErrorCount,

    sourceNodeCounts,

    productGraphMs:
      raw.productGraphMs as
        number | null
  };
}


export async function loadDiscoveryBaseline(
  canonicalOrigin:
    string,
  rootDir?:
    string
): Promise<BaselineLoadResult> {

  const path =
    discoveryBaselinePath(
      canonicalOrigin,
      rootDir
    );


  try {

    const text =
      await readFile(
        path,
        "utf8"
      );


    const parsed =
      parseBaseline(
        JSON.parse(
          text
        ) as unknown,
        canonicalOrigin
      );


    if (!parsed) {

      return {
        status:
          "INVALID",

        path,

        baseline:
          null,

        error:
          "Baseline file failed schema validation."
      };
    }


    return {
      status:
        "FOUND",

      path,

      baseline:
        parsed,

      error:
        null
    };
  }
  catch (
    error
  ) {

    const code =
      isRecord(
        error
      ) &&
      typeof error.code ===
        "string"
        ? error.code
        : null;


    if (
      code ===
      "ENOENT"
    ) {

      return {
        status:
          "MISSING",

        path,

        baseline:
          null,

        error:
          null
      };
    }


    return {
      status:
        "INVALID",

      path,

      baseline:
        null,

      error:
        error instanceof Error
          ? error.message
          : String(
              error
            )
    };
  }
}


export async function persistDiscoveryBaseline(
  baseline:
    DiscoveryBaseline,
  rootDir?:
    string
): Promise<string> {

  const root =
    rootDir ??
    defaultRootDir();


  await mkdir(
    root,
    {
      recursive:
        true
    }
  );


  const path =
    discoveryBaselinePath(
      baseline.canonicalOrigin,
      root
    );


  const temporary =
    `${path}.${process.pid}.${Date.now()}.tmp`;


  const content =
    `${JSON.stringify(
      baseline,
      null,
      2
    )}\n`;


  try {

    await writeFile(
      temporary,
      content,
      "utf8"
    );


    await rename(
      temporary,
      path
    );
  }
  catch (
    error
  ) {

    await unlink(
      temporary
    )
      .catch(
        () =>
          undefined
      );


    throw error;
  }


  return path;
}


export function shouldPromoteDiscoveryBaseline(
  report:
    DiscoveryAuditReport,
  hadBaseline:
    boolean
): BaselinePromotionDecision {

  if (
    report.summary
      .status ===
    "FAIL"
  ) {

    return {
      promote:
        false,

      reason:
        "deterministic audit failure"
    };
  }


  /*
   * First non-failing run becomes the initial baseline.
   *
   * Contextual warnings are allowed here because a
   * previously unseen site's stable normal may include
   * source concentration or a bounded root budget.
   */
  if (
    !hadBaseline
  ) {

    return {
      promote:
        true,

      reason:
        "initial non-failing baseline"
    };
  }


  const blocker =
    report.findings
      .find(
        finding =>
          finding.status ===
            "WARN" &&
          REGRESSION_BLOCKERS.has(
            finding.ruleId
          )
      );


  if (blocker) {

    return {
      promote:
        false,

      reason:
        `warning ${blocker.ruleId}`
    };
  }


  return {
    promote:
      true,

    reason:
      "successful comparable run"
  };
}