import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import {
  dirname,
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  scanLegacySemanticUsage
} from "../../../src/v04/diagnostics/legacySemanticScanner.js";


async function writeFixture(
  root:
    string,
  path:
    string,
  content:
    string
): Promise<void> {

  const target =
    join(
      root,
      path
    );

  await mkdir(
    dirname(
      target
    ),
    {
      recursive:
        true
    }
  );

  await writeFile(
    target,
    content,
    "utf8"
  );
}


async function withFixture(
  files:
    Readonly<Record<string, string>>,
  run:
    (
      root:
        string
    ) =>
      Promise<void>
): Promise<void> {

  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "camintel-v04-retirement-"
      )
    );


  try {
    for (
      const [
        path,
        content
      ]
      of Object.entries(
        files
      )
    ) {
      await writeFixture(
        root,
        path,
        content
      );
    }


    await run(
      root
    );
  }
  finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true
      }
    );
  }
}


describe(
  "legacy semantic retirement scanner",
  () => {

    test(
      "separates legacy semantic references from neutral capture metadata",
      async () => {

        await withFixture(
          {
            "src/v03/ai/evidencePacket.ts":
              [
                "import type { EvidencePacket } from './evidenceTypes.js';",
                "export function buildEvidencePacket(): EvidencePacket { throw new Error('fixture'); }"
              ].join(
                "\n"
              ),

            "src/v03/ai/runtime.ts":
              [
                "import { buildEvidencePacket } from './evidencePacket.js';",
                "import type { EvidencePacket, VisualEvidence } from './evidenceTypes.js';",
                "const rawText = 'legacy';",
                "const selectedOffer = true;",
                "const reason = 'CURRENT_PRICE_UNRESOLVED';",
                "const hostname = 'shop.example.com';",
                "if (hostname.includes('shop.example.com')) return { salePrice: 100 };",
                "void buildEvidencePacket; void rawText; void selectedOffer; void reason;"
              ].join(
                "\n"
              ),

            "src/v03/vision/capture.ts":
              "import type { VisualEvidence, ControlSnapshot } from '../ai/evidenceTypes.js';\n",

            "tests/v03/legacy.test.ts":
              "import { validateSemanticDecision } from '../../src/v03/ai/groundingValidator.js';\n"
          },
          async root => {

            const report =
              await scanLegacySemanticUsage({
                rootDir:
                  root
              });


            expect(
              report.candidateModulesPresent
            ).toContain(
              "src/v03/ai/evidencePacket.ts"
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.path ===
                    "src/v03/ai/runtime.ts" &&
                  finding.signal ===
                    "evidencePacket" &&
                  finding.scope ===
                    "runtime"
              )
            ).toBe(
              true
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.signal ===
                    "rawText"
              )
            ).toBe(
              true
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.signal ===
                    "selected-offer"
              )
            ).toBe(
              true
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.signal ===
                    "field-by-field-completeness"
              )
            ).toBe(
              true
            );


            expect(
              report.manualReviewFindings.some(
                finding =>
                  finding.signal ===
                    "retailer-specific-semantic-logic"
              )
            ).toBe(
              true
            );


            expect(
              report.neutralCaptureFindings.some(
                finding =>
                  finding.path ===
                    "src/v03/vision/capture.ts" &&
                  finding.symbols.includes(
                    "VisualEvidence"
                  )
              )
            ).toBe(
              true
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.path ===
                    "src/v03/vision/capture.ts" &&
                  finding.signal ===
                    "evidenceTypes"
              )
            ).toBe(
              false
            );


            expect(
              report.semanticFindings.some(
                finding =>
                  finding.path ===
                    "tests/v03/legacy.test.ts" &&
                  finding.scope ===
                    "test" &&
                  finding.signal ===
                    "groundingValidator"
              )
            ).toBe(
              true
            );


            expect(
              report.retirementBlocked
            ).toBe(
              true
            );
          }
        );
      }
    );


    test(
      "neutral evidenceTypes imports are preserved as migration blockers, not semantic deletion findings",
      async () => {

        await withFixture(
          {
            "src/v03/vision/capture.ts":
              "import type { VisualEvidence, EvidenceBox } from '../ai/evidenceTypes.js';\n"
          },
          async root => {

            const report =
              await scanLegacySemanticUsage({
                rootDir:
                  root
              });


            expect(
              report.semanticFindings
            ).toHaveLength(
              0
            );


            expect(
              report.neutralCaptureFindings
            ).toHaveLength(
              1
            );


            expect(
              report.neutralCaptureFindings[0]?.symbols
            ).toEqual([
              "VisualEvidence",
              "EvidenceBox"
            ]);


            expect(
              report.retirementBlocked
            ).toBe(
              true
            );
          }
        );
      }
    );


    test(
      "allows retirement only when retained V3 source and tests contain no blocking references",
      async () => {

        await withFixture(
          {
            "src/v03/provider/backoff.ts":
              "export const backoff = 1;\n",
            "tests/v03/provider/backoff.test.ts":
              "export const fixture = true;\n"
          },
          async root => {

            const report =
              await scanLegacySemanticUsage({
                rootDir:
                  root
              });


            expect(
              report.blockingFindings
            ).toHaveLength(
              0
            );


            expect(
              report.retirementBlocked
            ).toBe(
              false
            );
          }
        );
      }
    );
  }
);
