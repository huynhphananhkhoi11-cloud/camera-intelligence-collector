import {
  describe,
  expect,
  it
} from "vitest";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import {
  applyVisualObstructionFailSafe,
  assessVisualObstructionFailSafe,
  filterVisualObstructionNoise
} from "../../../src/v03/agent/visualObstructionPolicy.js";

import type {
  VisionEvidenceItem,
  VisionEvidencePacket
} from "../../../src/v03/vision/visionEvidenceTypes.js";


function evidence(
  id:
    string,
  rawValue:
    string,
  options:
    {
      readonly fieldHint?:
        string;

      readonly ownershipHint?:
        EvidenceItem["ownershipHint"];

      readonly locator?:
        string |
        null;
    } = {}
): EvidenceItem {

  return {
    id,
    fieldHint:
      options.fieldHint ??
      "PRODUCT",
    rawValue,
    sourceKind:
      "VISIBLE_TEXT",
    sourceUrl:
      "https://example.test/product",
    locator:
      options.locator ??
      null,
    context:
      null,
    ownershipHint:
      options.ownershipHint ??
      "PRIMARY_PRODUCT"
  };
}


function packet(
  items:
    readonly EvidenceItem[]
): EvidencePacket {

  return {
    allEvidence:
      items
  } as EvidencePacket;
}


function vision(
  fallback:
    boolean,
  compactDomEvidence:
    readonly VisionEvidenceItem[] = []
): VisionEvidencePacket {

  return {
    productRegionScreenshot: {
      fallback
    },
    compactDomEvidence,
    selectedControls:
      [],
    structuredFacts:
      []
  } as VisionEvidencePacket;
}


function decision(
  type:
    "CAMERA" |
    "NON_CAMERA" |
    "UNCERTAIN",
  evidenceIds:
    readonly string[]
): AISemanticDecision {

  return {
    entity: {
      type,
      evidenceIds
    }
  } as AISemanticDecision;
}


const VALIDATED:
  SemanticValidationResult = {
    status:
      "VALIDATED",
    issues:
      []
  };


describe(
  "visual obstruction fail-safe",
  () => {

    it(
      "blocks NON_CAMERA when strong Canon camera evidence conflicts with an obstructed screenshot",
      () => {

        const camera =
          evidence(
            "ev_camera",
            "Canon EOS R50"
          );

        const promo:
          VisionEvidenceItem = {
            id:
              "promo_popup",
            fieldHint:
              "TEXT",
            rawValue:
              "Nhận ưu đãi",
            sourceKind:
              "DOM",
            locator:
              ".promo-popup",
            context:
              null,
            ownershipHint:
              "PAGE_CHROME"
          };

        const assessment =
          assessVisualObstructionFailSafe(
            packet([
              camera
            ]),
            vision(
              true,
              [
                promo
              ]
            ),
            decision(
              "NON_CAMERA",
              [
                "promo_popup"
              ]
            )
          );


        expect(
          assessment
        ).toMatchObject({
          visualObstruction:
            true,
          strongCameraEvidence:
            true,
          clearNonCameraEvidence:
            false,
          blockNonCamera:
            true
        });


        const guarded =
          applyVisualObstructionFailSafe({
            sourcePacket:
              packet([
                camera
              ]),
            visionPacket:
              vision(
                true,
                [
                  promo
                ]
              ),
            decision:
              decision(
                "NON_CAMERA",
                [
                  "promo_popup"
                ]
              ),
            validation:
              VALIDATED
          });


        expect(
          guarded.status
        ).toBe(
          "NEEDS_REVIEW"
        );

        expect(
          guarded.issues[0]
            ?.code
        ).toBe(
          "VISUAL_OBSTRUCTION_NON_CAMERA_GUARD"
        );

        expect(
          filterVisualObstructionNoise([
            promo
          ])
        ).toEqual(
          []
        );
      }
    );


    it(
      "keeps a clearly grounded Sony FE 50mm lens eligible for NON_CAMERA",
      () => {

        const lens =
          evidence(
            "ev_lens",
            "Sony FE 50mm f/1.8"
          );

        const assessment =
          assessVisualObstructionFailSafe(
            packet([
              lens
            ]),
            vision(
              true
            ),
            decision(
              "NON_CAMERA",
              [
                "ev_lens"
              ]
            )
          );


        expect(
          assessment
            .clearNonCameraEvidence
        ).toBe(
          true
        );

        expect(
          assessment
            .blockNonCamera
        ).toBe(
          false
        );
      }
    );


    it(
      "keeps a clearly grounded workshop/blog page eligible for NON_CAMERA",
      () => {

        const workshop =
          evidence(
            "ev_blog",
            "Workshop: Kỹ thuật chụp ảnh đường phố",
            {
              ownershipHint:
                "UNKNOWN"
            }
          );

        const assessment =
          assessVisualObstructionFailSafe(
            packet([
              workshop
            ]),
            vision(
              true
            ),
            decision(
              "NON_CAMERA",
              [
                "ev_blog"
              ]
            )
          );


        expect(
          assessment
            .clearNonCameraEvidence
        ).toBe(
          true
        );

        expect(
          assessment
            .blockNonCamera
        ).toBe(
          false
        );
      }
    );


    it(
      "treats popup-only NON_CAMERA grounding as insufficient under visual obstruction",
      () => {

        const popup =
          evidence(
            "ev_popup",
            "Nhận ưu đãi",
            {
              fieldHint:
                "TEXT",
              ownershipHint:
                "PAGE_CHROME",
              locator:
                "#promotion-popup"
            }
          );

        const assessment =
          assessVisualObstructionFailSafe(
            packet([
              popup
            ]),
            vision(
              true
            ),
            decision(
              "NON_CAMERA",
              [
                "ev_popup"
              ]
            )
          );


        expect(
          assessment
            .entityGroundingInsufficient
        ).toBe(
          true
        );

        expect(
          assessment
            .blockNonCamera
        ).toBe(
          true
        );
      }
    );

  }
);
