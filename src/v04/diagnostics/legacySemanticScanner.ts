import {
  readFile,
  readdir
} from "node:fs/promises";

import {
  extname,
  relative,
  resolve
} from "node:path";

import {
  fileURLToPath
} from "node:url";


export type LegacySemanticSignal =
  | "evidenceCompactor"
  | "evidencePacket"
  | "evidenceSpool"
  | "evidenceTypes"
  | "groundingValidator"
  | "entityConsistency"
  | "field-by-field-completeness"
  | "selected-offer"
  | "rawText"
  | "retailer-specific-semantic-logic";


export type LegacyFindingCategory =
  | "legacy-semantic"
  | "neutral-capture"
  | "manual-review";


export type LegacyFindingScope =
  | "runtime"
  | "test"
  | "candidate-internal";


export interface LegacySemanticFinding {
  readonly path:
    string;

  readonly line:
    number;

  readonly signal:
    LegacySemanticSignal;

  readonly category:
    LegacyFindingCategory;

  readonly scope:
    LegacyFindingScope;

  readonly symbols:
    readonly string[];

  readonly excerpt:
    string;

  readonly reason:
    string;
}


export interface LegacySemanticScanReport {
  readonly scannedFiles:
    number;

  readonly candidateModulesPresent:
    readonly string[];

  readonly semanticFindings:
    readonly LegacySemanticFinding[];

  readonly neutralCaptureFindings:
    readonly LegacySemanticFinding[];

  readonly manualReviewFindings:
    readonly LegacySemanticFinding[];

  readonly blockingFindings:
    readonly LegacySemanticFinding[];

  readonly retirementBlocked:
    boolean;
}


export interface LegacySemanticScanOptions {
  readonly rootDir:
    string;
}


const LEGACY_MODULES = [
  "evidenceCompactor",
  "evidencePacket",
  "evidenceSpool",
  "evidenceTypes",
  "groundingValidator",
  "entityConsistency"
] as const;


const LEGACY_MODULE_SET =
  new Set<string>(
    LEGACY_MODULES
  );


const NEUTRAL_CAPTURE_SYMBOLS =
  new Set([
    "VisualEvidence",
    "ControlSnapshot",
    "EvidenceBox"
  ]);


const SEMANTIC_EVIDENCE_SYMBOLS =
  new Set([
    "EvidenceItem",
    "EvidencePacket"
  ]);


const DIRECT_SEMANTIC_SYMBOLS:
  ReadonlyMap<string, LegacySemanticSignal> =
    new Map([
      [
        "compactEvidencePacketForPrompt",
        "evidenceCompactor"
      ],
      [
        "buildEvidencePacket",
        "evidencePacket"
      ],
      [
        "serializeEvidencePacketForPrompt",
        "evidencePacket"
      ],
      [
        "EvidencePacketInput",
        "evidencePacket"
      ],
      [
        "EvidenceSpool",
        "evidenceSpool"
      ],
      [
        "EvidenceSpoolOptions",
        "evidenceSpool"
      ],
      [
        "SpoolUsage",
        "evidenceSpool"
      ],
      [
        "SpooledPacketRef",
        "evidenceSpool"
      ],
      [
        "SpoolQuotaExceededError",
        "evidenceSpool"
      ],
      [
        "EvidenceItem",
        "evidenceTypes"
      ],
      [
        "EvidencePacket",
        "evidenceTypes"
      ],
      [
        "validateSemanticDecision",
        "groundingValidator"
      ],
      [
        "extractNumericValues",
        "groundingValidator"
      ],
      [
        "normalizeEntityConsistency",
        "entityConsistency"
      ]
    ]);


const CODE_EXTENSIONS =
  new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs"
  ]);


const IMPORT_FROM_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gu;


const DYNAMIC_IMPORT_PATTERN =
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/gu;


const FIELD_COMPLETENESS_PATTERNS = [
  /\bfield[-_\s]*by[-_\s]*field\b[^\n]{0,80}\bcomplet(?:e|eness)\b/iu,
  /\bcomplet(?:e|eness)\b[^\n]{0,80}\b(?:field|price|stock|condition|specs?|rating|review)\b/iu,
  /\b(?:CURRENT_PRICE_UNRESOLVED|STOCK_UNRESOLVED|SELECTED_VARIANT_UNRESOLVED|CONDITION_UNRESOLVED|SPECS_UNRESOLVED)\b/u,
  /\b(?:missing|required|unresolved)\b[^\n]{0,60}\b(?:currentPrice|salePrice|stock|condition|specs|rating|reviewCount)\b/u
] as const;


const SELECTED_OFFER_PATTERNS = [
  /\bselected[_\s-]?offer\b/iu,
  /\bselectedControls?\b/u,
  /\bselected(?:Variant|Condition)\b/u,
  /\bselected\s*=\s*true\b/iu
] as const;


const RAW_TEXT_PATTERN =
  /\brawText\b/u;


const RETAILER_SELECTOR_PATTERN =
  /(?:\b(?:hostname|host|domain|retailer|merchant)\b\s*(?:(?:===|!==|==|!=)|\.\s*(?:includes|endsWith|startsWith|match)\s*\()|\bswitch\s*\(\s*(?:hostname|host|domain|retailer|merchant)\b|https?:\/\/|["'`][a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[a-z0-9._~:/?#[\]@!$&()*+,;=%-]*)?["'`])/iu;


const SEMANTIC_FIELD_PATTERN =
  /\b(?:currentPrice|salePrice|price|stock|condition|rating|reviewCount|review|specs?|bundle|accessor(?:y|ies)|rental|productName|camera)\b/iu;


function normalizePath(
  value:
    string
): string {

  return value.replaceAll(
    "\\",
    "/"
  );
}


function candidateModuleNameForPath(
  path:
    string
): LegacySemanticSignal |
    null {

  const normalized =
    normalizePath(
      path
    );


  for (
    const moduleName
    of LEGACY_MODULES
  ) {
    if (
      normalized ===
        "src/v03/ai/" +
        moduleName +
        ".ts" ||
      normalized ===
        "src/v03/ai/" +
        moduleName +
        ".js"
    ) {
      return moduleName;
    }
  }


  return null;
}


function scopeForPath(
  path:
    string
): LegacyFindingScope {

  if (
    candidateModuleNameForPath(
      path
    ) !==
      null
  ) {
    return "candidate-internal";
  }


  if (
    normalizePath(
      path
    ).startsWith(
      "tests/v03/"
    )
  ) {
    return "test";
  }


  return "runtime";
}


function sourceModuleName(
  specifier:
    string
): (typeof LEGACY_MODULES)[number] |
    null {

  const normalized =
    specifier
      .replace(
        /[?#].*$/u,
        ""
      )
      .replace(
        /\.(?:mjs|cjs|js|ts|tsx|jsx)$/u,
        ""
      );


  const parts =
    normalized.split(
      "/"
    );

  const last =
    parts.at(
      -1
    ) ??
    "";


  return LEGACY_MODULES.find(
    candidate =>
      candidate ===
        last
  ) ??
    null;
}


function lineNumberAt(
  text:
    string,
  index:
    number
): number {

  let line =
    1;


  for (
    let cursor =
      0;
    cursor <
      index;
    cursor +=
      1
  ) {
    if (
      text.charCodeAt(
        cursor
      ) ===
        10
    ) {
      line +=
        1;
    }
  }


  return line;
}


function clipExcerpt(
  value:
    string
): string {

  const compact =
    value
      .replace(
        /\s+/gu,
        " "
      )
      .trim();


  return compact.length <=
    180
    ? compact
    : compact.slice(
        0,
        177
      ) +
      "...";
}


function importedSymbols(
  clause:
    string
): string[] {

  const named =
    clause.match(
      /\{([\s\S]*?)\}/u
    );


  if (
    !named?.[1]
  ) {
    return [];
  }


  return named[1]
    .split(
      ","
    )
    .map(
      value =>
        value
          .trim()
          .replace(
            /^type\s+/u,
            ""
          )
          .split(
            /\s+as\s+/u
          )[0]
          ?.trim() ??
        ""
    )
    .filter(
      Boolean
    );
}


function stripCommentsPreserveLines(
  source:
    string
): string {

  return source
    .replace(
      /\/\*[\s\S]*?\*\//gu,
      match =>
        match.replace(
          /[^\n]/gu,
          " "
        )
    )
    .replace(
      /(^|[^:])\/\/[^\n]*/gu,
      match =>
        match.replace(
          /[^\n]/gu,
          " "
        )
    );
}


async function collectCodeFiles(
  directory:
    string
): Promise<string[]> {

  let entries;


  try {
    entries =
      await readdir(
        directory,
        {
          withFileTypes:
            true
        }
      );
  }
  catch {
    return [];
  }


  const output:
    string[] =
      [];


  for (
    const entry
    of entries
  ) {
    const path =
      resolve(
        directory,
        entry.name
      );


    if (
      entry.isDirectory()
    ) {
      output.push(
        ...await collectCodeFiles(
          path
        )
      );

      continue;
    }


    if (
      entry.isFile() &&
      CODE_EXTENSIONS.has(
        extname(
          entry.name
        )
      )
    ) {
      output.push(
        path
      );
    }
  }


  return output;
}


function findingKey(
  finding:
    LegacySemanticFinding
): string {

  return [
    finding.path,
    finding.line,
    finding.signal,
    finding.category,
    finding.scope,
    finding.symbols.join(
      ","
    )
  ].join(
    "\0"
  );
}


function uniqueFindings(
  findings:
    readonly LegacySemanticFinding[]
): LegacySemanticFinding[] {

  const seen =
    new Set<string>();

  const output:
    LegacySemanticFinding[] =
      [];


  for (
    const finding
    of findings
  ) {
    const key =
      findingKey(
        finding
      );


    if (
      seen.has(
        key
      )
    ) {
      continue;
    }


    seen.add(
      key
    );

    output.push(
      finding
    );
  }


  return output.sort(
    (
      left,
      right
    ) =>
      left.path.localeCompare(
        right.path
      ) ||
      left.line -
      right.line ||
      left.signal.localeCompare(
        right.signal
      )
  );
}


function pushImportFinding(
  findings:
    LegacySemanticFinding[],
  input:
    {
      readonly path:
        string;

      readonly line:
        number;

      readonly moduleName:
        LegacySemanticSignal;

      readonly symbols:
        readonly string[];

      readonly excerpt:
        string;
    }
): void {

  const scope =
    scopeForPath(
      input.path
    );


  if (
    input.moduleName !==
      "evidenceTypes"
  ) {
    findings.push({
      path:
        input.path,
      line:
        input.line,
      signal:
        input.moduleName,
      category:
        "legacy-semantic",
      scope,
      symbols:
        input.symbols,
      excerpt:
        input.excerpt,
      reason:
        "Imports or re-exports a legacy V3 semantic module."
    });

    return;
  }


  if (
    input.symbols.length ===
      0
  ) {
    findings.push({
      path:
        input.path,
      line:
        input.line,
      signal:
        "evidenceTypes",
      category:
        "manual-review",
      scope,
      symbols:
        [],
      excerpt:
        input.excerpt,
      reason:
        "Namespace/default/dynamic evidenceTypes usage cannot be classified safely by symbol."
    });

    return;
  }


  const neutral =
    input.symbols.filter(
      symbol =>
        NEUTRAL_CAPTURE_SYMBOLS.has(
          symbol
        )
    );

  const semantic =
    input.symbols.filter(
      symbol =>
        SEMANTIC_EVIDENCE_SYMBOLS.has(
          symbol
        )
    );

  const unknown =
    input.symbols.filter(
      symbol =>
        !NEUTRAL_CAPTURE_SYMBOLS.has(
          symbol
        ) &&
        !SEMANTIC_EVIDENCE_SYMBOLS.has(
          symbol
        )
    );


  if (
    semantic.length >
      0
  ) {
    findings.push({
      path:
        input.path,
      line:
        input.line,
      signal:
        "evidenceTypes",
      category:
        "legacy-semantic",
      scope,
      symbols:
        semantic,
      excerpt:
        input.excerpt,
      reason:
        "Uses semantic evidence types that belong to the V3 evidence pipeline."
    });
  }


  if (
    neutral.length >
      0
  ) {
    findings.push({
      path:
        input.path,
      line:
        input.line,
      signal:
        "evidenceTypes",
      category:
        "neutral-capture",
      scope,
      symbols:
        neutral,
      excerpt:
        input.excerpt,
      reason:
        "Uses neutral capture metadata. Preserve or migrate these types before deleting evidenceTypes.ts."
    });
  }


  if (
    unknown.length >
      0
  ) {
    findings.push({
      path:
        input.path,
      line:
        input.line,
      signal:
        "evidenceTypes",
      category:
        "manual-review",
      scope,
      symbols:
        unknown,
      excerpt:
        input.excerpt,
      reason:
        "Unknown evidenceTypes symbols require manual classification before retirement."
    });
  }
}


function scanFile(
  path:
    string,
  source:
    string
): LegacySemanticFinding[] {

  const findings:
    LegacySemanticFinding[] =
      [];

  const scope =
    scopeForPath(
      path
    );

  const candidateModule =
    candidateModuleNameForPath(
      path
    );

  const coveredImportLines =
    new Set<number>();


  IMPORT_FROM_PATTERN.lastIndex =
    0;


  for (
    const match
    of source.matchAll(
      IMPORT_FROM_PATTERN
    )
  ) {
    const clause =
      match[1] ??
      "";

    const specifier =
      match[2] ??
      "";

    const moduleName =
      sourceModuleName(
        specifier
      );


    if (
      moduleName ===
        null
    ) {
      continue;
    }


    const index =
      match.index ??
      0;

    const line =
      lineNumberAt(
        source,
        index
      );

    const lineCount =
      match[0].split(
        "\n"
      ).length;


    for (
      let offset =
        0;
      offset <
        lineCount;
      offset +=
        1
    ) {
      coveredImportLines.add(
        line +
        offset
      );
    }


    pushImportFinding(
      findings,
      {
        path,
        line,
        moduleName,
        symbols:
          importedSymbols(
            clause
          ),
        excerpt:
          clipExcerpt(
            match[0]
          )
      }
    );
  }


  DYNAMIC_IMPORT_PATTERN.lastIndex =
    0;


  for (
    const match
    of source.matchAll(
      DYNAMIC_IMPORT_PATTERN
    )
  ) {
    const moduleName =
      sourceModuleName(
        match[1] ??
        ""
      );


    if (
      moduleName ===
        null
    ) {
      continue;
    }


    pushImportFinding(
      findings,
      {
        path,
        line:
          lineNumberAt(
            source,
            match.index ??
              0
          ),
        moduleName,
        symbols:
          [],
        excerpt:
          clipExcerpt(
            match[0]
          )
      }
    );
  }


  const withoutComments =
    stripCommentsPreserveLines(
      source
    );

  const lines =
    withoutComments.split(
      /\r?\n/u
    );


  for (
    let index =
      0;
    index <
      lines.length;
    index +=
      1
  ) {
    const lineNumber =
      index +
      1;

    const line =
      lines[index] ??
      "";


    if (
      !coveredImportLines.has(
        lineNumber
      )
    ) {
      for (
        const [
          symbol,
          signal
        ]
        of DIRECT_SEMANTIC_SYMBOLS
      ) {
        if (
          candidateModule ===
            signal
        ) {
          continue;
        }


        const pattern =
          new RegExp(
            "\\b" +
            symbol +
            "\\b",
            "u"
          );


        if (
          pattern.test(
            line
          )
        ) {
          findings.push({
            path,
            line:
              lineNumber,
            signal,
            category:
              "legacy-semantic",
            scope,
            symbols: [
              symbol
            ],
            excerpt:
              clipExcerpt(
                line
              ),
            reason:
              "Uses a known symbol exported by a legacy V3 semantic module."
          });
        }
      }
    }


    if (
      RAW_TEXT_PATTERN.test(
        line
      )
    ) {
      findings.push({
        path,
        line:
          lineNumber,
        signal:
          "rawText",
        category:
          "legacy-semantic",
        scope,
        symbols: [
          "rawText"
        ],
        excerpt:
          clipExcerpt(
            line
          ),
        reason:
          "rawText is forbidden in the V04 minimal semantic architecture."
      });
    }


    if (
      SELECTED_OFFER_PATTERNS.some(
        pattern =>
          pattern.test(
            line
          )
      )
    ) {
      findings.push({
        path,
        line:
          lineNumber,
        signal:
          "selected-offer",
        category:
          "legacy-semantic",
        scope,
        symbols:
          [],
        excerpt:
          clipExcerpt(
            line
          ),
        reason:
          "Selected-offer/control semantic inference belongs to the retired V3 approach."
      });
    }


    if (
      FIELD_COMPLETENESS_PATTERNS.some(
        pattern =>
          pattern.test(
            line
          )
      )
    ) {
      findings.push({
        path,
        line:
          lineNumber,
        signal:
          "field-by-field-completeness",
        category:
          "legacy-semantic",
        scope,
        symbols:
          [],
        excerpt:
          clipExcerpt(
            line
          ),
        reason:
          "Field-by-field semantic completeness/repair conflicts with the V04 structural-only validator."
      });
    }


    const window =
      lines
        .slice(
          Math.max(
            0,
            index -
            2
          ),
          Math.min(
            lines.length,
            index +
            3
          )
        )
        .join(
          " "
        );


    if (
      RETAILER_SELECTOR_PATTERN.test(
        line
      ) &&
      SEMANTIC_FIELD_PATTERN.test(
        window
      )
    ) {
      findings.push({
        path,
        line:
          lineNumber,
        signal:
          "retailer-specific-semantic-logic",
        category:
          "manual-review",
        scope,
        symbols:
          [],
        excerpt:
          clipExcerpt(
            line
          ),
        reason:
          "Retailer/domain branching appears near semantic-field logic and requires manual review."
      });
    }
  }


  return uniqueFindings(
    findings
  );
}


export async function scanLegacySemanticUsage(
  options:
    LegacySemanticScanOptions
): Promise<LegacySemanticScanReport> {

  const rootDir =
    resolve(
      options.rootDir
    );

  const roots = [
    resolve(
      rootDir,
      "src/v03"
    ),
    resolve(
      rootDir,
      "tests/v03"
    )
  ];

  const absoluteFiles =
    (
      await Promise.all(
        roots.map(
          collectCodeFiles
        )
      )
    )
      .flat()
      .sort();

  const candidateModulesPresent:
    string[] =
      [];

  const findings:
    LegacySemanticFinding[] =
      [];


  for (
    const absolutePath
    of absoluteFiles
  ) {
    const path =
      normalizePath(
        relative(
          rootDir,
          absolutePath
        )
      );


    if (
      candidateModuleNameForPath(
        path
      ) !==
        null
    ) {
      candidateModulesPresent.push(
        path
      );
    }


    const source =
      await readFile(
        absolutePath,
        "utf8"
      );


    findings.push(
      ...scanFile(
        path,
        source
      )
    );
  }


  const unique =
    uniqueFindings(
      findings
    );

  const semanticFindings =
    unique.filter(
      finding =>
        finding.category ===
          "legacy-semantic"
    );

  const neutralCaptureFindings =
    unique.filter(
      finding =>
        finding.category ===
          "neutral-capture"
    );

  const manualReviewFindings =
    unique.filter(
      finding =>
        finding.category ===
          "manual-review"
    );

  const blockingFindings =
    unique.filter(
      finding =>
        finding.scope !==
          "candidate-internal"
    );


  return {
    scannedFiles:
      absoluteFiles.length,

    candidateModulesPresent:
      [...candidateModulesPresent]
        .sort(),

    semanticFindings,

    neutralCaptureFindings,

    manualReviewFindings,

    blockingFindings,

    retirementBlocked:
      blockingFindings.length >
      0
  };
}


function isDirectExecution():
  boolean {

  const invoked =
    process.argv[1];


  if (
    !invoked
  ) {
    return false;
  }


  return resolve(
    invoked
  ) ===
    resolve(
      fileURLToPath(
        import.meta.url
      )
    );
}


if (
  isDirectExecution()
) {
  const rootDir =
    process.argv[2] ??
    process.cwd();

  const report =
    await scanLegacySemanticUsage({
      rootDir
    });


  process.stdout.write(
    JSON.stringify(
      report,
      null,
      2
    ) +
    "\n"
  );


  if (
    report.retirementBlocked
  ) {
    process.exitCode =
      1;
  }
}
