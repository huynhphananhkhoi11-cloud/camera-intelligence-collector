import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  EvidenceSpool
} from "../../../src/v03/ai/evidenceSpool.js";

import type {
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";


function packet():
  EvidencePacket {

  return {
    packetId:
      "packet_test",

    pageUrl:
      "https://example.com/canon-r50",

    finalUrl:
      "https://example.com/canon-r50",

    productIdentity:
      "URL:https://example.com/canon-r50",

    primaryRegionText:
      "Canon EOS R50 15.990.000đ",

    allEvidence:
      [],

    titleCandidates:
      [],

    breadcrumbs:
      [],

    moneyCandidates:
      [],

    conditionCandidates:
      [],

    stockCandidates:
      [],

    ratingCandidates:
      [],

    reviewCandidates:
      [],

    specCandidates:
      [],

    variantCandidates:
      [],

    selectedControls:
      [],

    structuredFacts:
      [],

    evidenceBoard: {
      imageId:
        "board_primary_001",

      kind:
        "PRIMARY_PRODUCT_VIEWPORT",

      mimeType:
        "image/webp",

      base64:
        Buffer.from(
          "fake-webp"
        ).toString(
          "base64"
        ),

      width:
        768,

      height:
        576
    }
  };
}


describe(
  "EvidenceSpool",
  () => {

    test(
      "writes packet/image separately and deletes validated temp evidence",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-spool-"
            )
          );


        try {

          const spool =
            new EvidenceSpool({
              rootDir:
                root
            });


          const reference =
            await spool.writePacket(
              packet()
            );


          expect(
            await readFile(
              reference.packetPath,
              "utf8"
            )
          ).not.toContain(
            "ZmFrZS13ZWJw"
          );


          const restored =
            await spool.readPacket(
              reference
            );


          expect(
            restored.evidenceBoard
              ?.base64
          ).toBe(
            packet().evidenceBoard
              ?.base64
          );


          await spool.delete(
            reference
          );


          await expect(
            readFile(
              reference.packetPath,
              "utf8"
            )
          ).rejects.toThrow();
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
    );


    test(
      "cleanupAll removes the run spool after finalization",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-spool-cleanup-"
            )
          );


        const spool =
          new EvidenceSpool({
            rootDir:
              root
          });


        await spool.init();


        await writeFile(
          join(
            root,
            "dummy.txt"
          ),
          "temporary"
        );


        await spool.cleanupAll();


        await expect(
          readFile(
            join(
              root,
              "dummy.txt"
            ),
            "utf8"
          )
        ).rejects.toThrow();
      }
    );
  }
);
