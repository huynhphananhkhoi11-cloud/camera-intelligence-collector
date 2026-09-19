export type EntityType =
  | "CAMERA"
  | "LENS"
  | "BATTERY"
  | "CHARGER"
  | "PRINTER"
  | "PHOTOBOOTH"
  | "GIMBAL"
  | "LIGHTING"
  | "ACCESSORY"
  | "UNCERTAIN";

export interface EntityInput {
  title: string;
  category?: string;
  specs?: string;
  description?: string;
}

export type EntityEvidenceSource =
  | "TITLE"
  | "CATEGORY"
  | "SCOPED_DETAIL";

export interface EntityEvidence {
  entity: EntityType;

  source:
    EntityEvidenceSource;

  raw: string;

  weight: number;

  ruleId: string;

  scope?: string;
}

export interface EntityResult {
  type: EntityType;
  isCamera: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: EntityEvidence[];
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function has(
  text: string,
  pattern: RegExp
): boolean {
  return pattern.test(text);
}

interface EntityEvidenceMeta {
  source:
    EntityEvidenceSource;

  weight: number;

  ruleId: string;

  scope?: string;
}

const ENTITY_EVIDENCE_META:
  Record<
    string,
    EntityEvidenceMeta
  > = {
    "explicit photobooth evidence": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.photobooth.explicit"
    },

    "printer title/model evidence": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.printer.title"
    },

    "multiple printer specification signals": {
      source:
        "SCOPED_DETAIL",
      weight: 90,
      ruleId:
        "entity.printer.spec_bundle",
      scope:
        "specs+description"
    },

    "charger product title": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.charger.title"
    },

    "battery product title": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.battery.title"
    },

    "battery specification bundle": {
      source:
        "SCOPED_DETAIL",
      weight: 90,
      ruleId:
        "entity.battery.spec_bundle",
      scope:
        "specs+description"
    },

    "explicit camera type": {
      source:
        "SCOPED_DETAIL",
      weight: 90,
      ruleId:
        "entity.camera.explicit_type",
      scope:
        "specs+description"
    },

    "image sensor": {
      source:
        "SCOPED_DETAIL",
      weight: 35,
      ruleId:
        "entity.camera.sensor",
      scope:
        "specs+description"
    },

    "ISO range": {
      source:
        "SCOPED_DETAIL",
      weight: 30,
      ruleId:
        "entity.camera.iso",
      scope:
        "specs+description"
    },

    "autofocus system": {
      source:
        "SCOPED_DETAIL",
      weight: 35,
      ruleId:
        "entity.camera.autofocus",
      scope:
        "specs+description"
    },

    "viewfinder": {
      source:
        "SCOPED_DETAIL",
      weight: 30,
      ruleId:
        "entity.camera.viewfinder",
      scope:
        "specs+description"
    },

    "continuous shooting": {
      source:
        "SCOPED_DETAIL",
      weight: 30,
      ruleId:
        "entity.camera.continuous_shooting",
      scope:
        "specs+description"
    },

    "video recording": {
      source:
        "SCOPED_DETAIL",
      weight: 25,
      ruleId:
        "entity.camera.video",
      scope:
        "specs+description"
    },

    "camera lens mount": {
      source:
        "SCOPED_DETAIL",
      weight: 30,
      ruleId:
        "entity.camera.mount",
      scope:
        "specs+description"
    },

    "explicit camera device class": {
      source:
        "SCOPED_DETAIL",
      weight: 90,
      ruleId:
        "entity.camera.device_class",
      scope:
        "specs+description"
    },

    "explicit bundled camera body": {
      source:
        "SCOPED_DETAIL",
      weight: 75,
      ruleId:
        "entity.camera.bundled_body",
      scope:
        "specs+description"
    },

    "explicit camera product title": {
      source: "TITLE",
      weight: 90,
      ruleId:
        "entity.camera.explicit_title"
    },

    "camera model family": {
      source: "TITLE",
      weight: 45,
      ruleId:
        "entity.camera.model_family"
    },

    "camera category": {
      source: "CATEGORY",
      weight: 30,
      ruleId:
        "entity.camera.category"
    },

    "lens category": {
      source: "CATEGORY",
      weight: 90,
      ruleId:
        "entity.lens.category"
    },

    "lens specification bundle": {
      source:
        "SCOPED_DETAIL",
      weight: 75,
      ruleId:
        "entity.lens.spec_bundle",
      scope:
        "specs+description"
    },

    "gimbal product title": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.gimbal.title"
    },

    "camera support accessory title": {
      source: "TITLE",
      weight: 100,
      ruleId:
        "entity.accessory.support_title"
    },

    "lighting specification bundle": {
      source:
        "SCOPED_DETAIL",
      weight: 85,
      ruleId:
        "entity.lighting.spec_bundle",
      scope:
        "specs+description"
    },

    "accessory category": {
      source: "CATEGORY",
      weight: 60,
      ruleId:
        "entity.accessory.category"
    }
  };

function rawEntityEvidence(
  source:
    EntityEvidenceSource,
  input:
    EntityInput
): string {
  if (source === "TITLE") {
    return String(
      input.title ?? ""
    );
  }

  if (source === "CATEGORY") {
    return String(
      input.category ?? ""
    );
  }

  return [
    input.specs,
    input.description
  ]
    .filter(Boolean)
    .map(value =>
      String(value)
    )
    .join(" | ");
}

function result(
  type: EntityType,
  confidence:
    EntityResult["confidence"],
  reasons: string[],
  input: EntityInput
): EntityResult {
  const evidence:
    EntityEvidence[] =
      reasons.map(
        reason => {
          const meta =
            ENTITY_EVIDENCE_META[
              reason
            ] ?? {
              source:
                "SCOPED_DETAIL" as const,

              weight:
                1,

              ruleId:
                "entity.rule.unmapped",

              scope:
                "specs+description"
            };

          return {
            entity:
              type,

            source:
              meta.source,

            raw:
              rawEntityEvidence(
                meta.source,
                input
              ),

            weight:
              meta.weight,

            ruleId:
              meta.ruleId,

            ...(meta.scope
              ? {
                  scope:
                    meta.scope
                }
              : {})
          };
        }
      );

  return {
    type,
    isCamera:
      type === "CAMERA",
    confidence,
    evidence
  };
}

export function classifyEntity(
  input: EntityInput
): EntityResult {

  const title = norm(input.title);
  const category = norm(input.category);
  const specs = norm(input.specs);
  const description = norm(input.description);

  const detail =
    `${specs} ${description}`.trim();

  const full =
    `${title} ${category} ${detail}`.trim();

  const makeResult = (
    type:
      EntityType,
    confidence:
      EntityResult["confidence"],
    reasons:
      string[]
  ): EntityResult =>
    result(
      type,
      confidence,
      reasons,
      input
    );

  /*
   * =====================================================
   * 1. STRONG NON-CAMERA IDENTITIES
   * =====================================================
   *
   * These are checked before weak camera/category clues.
   * This prevents a battery/printer/photobooth from being
   * accepted just because the website puts it under
   * "Thuê máy ảnh".
   */

  if (
    has(title, /\bphotobooth\b/) ||
    has(detail, /\bphotobooth\b/)
  ) {
    return makeResult(
      "PHOTOBOOTH",
      "HIGH",
      ["explicit photobooth evidence"]
    );
  }

  const printerSignals = [
    has(title, /\b(may in|printer|selphy)\b/),
    has(detail, /\b(do phan giai in|cong nghe in|toc do in|giay in|kho giay)\b/),
    has(detail, /\b(in nhiet|thermal printing)\b/)
  ].filter(Boolean).length;

  if (printerSignals >= 1 &&
      has(title, /\b(may in|printer|selphy)\b/)) {
    return makeResult(
      "PRINTER",
      "HIGH",
      ["printer title/model evidence"]
    );
  }

  if (printerSignals >= 2) {
    return makeResult(
      "PRINTER",
      "HIGH",
      ["multiple printer specification signals"]
    );
  }

  /*
   * Charger MUST be checked before battery.
   *
   * Example:
   * "BỘ SẠC PIN ĐÔI NP-FW50"
   *
   * It contains the word "pin", but the primary
   * entity is a charger.
   */
  if (
    has(
      title,
      /^(?:bo\s+)?sac\b|^charger\b|^sac\s+pin\b/
    )
  ) {
    return makeResult(
      "CHARGER",
      "HIGH",
      ["charger product title"]
    );
  }

  /*
   * Battery:
   *
   * Require the PRODUCT TITLE itself to start
   * with Pin/Battery.
   *
   * Do not classify an object as BATTERY merely
   * because the word "pin" appears somewhere in
   * the title or compatibility text.
   */
  if (
    has(
      title,
      /^(?:pin|battery)(?:\s|[-:])/
    )
  ) {
    return makeResult(
      "BATTERY",
      "HIGH",
      ["battery product title"]
    );
  }

  const batterySpecSignals = [
    has(detail, /\bloai pin\b/),
    has(detail, /\b\d+\s*mah\b/),
    has(
      detail,
      /\bdien ap\b.*\b\d+(?:[.,]\d+)?\s*v\b/
    ),
    has(
      detail,
      /\b\d+(?:[.,]\d+)?\s*wh\b/
    )
  ].filter(Boolean).length;

  /*
   * Specs-only battery classification requires
   * a strong bundle of battery-specific fields.
   */
  if (
    batterySpecSignals >= 3
  ) {
    return makeResult(
      "BATTERY",
      "HIGH",
      ["battery specification bundle"]
    );
  }

  /*
   * =====================================================
   * 2. CAMERA TITLE EVIDENCE
   * =====================================================
   *
   * Sparse product pages may expose no specs/category at all.
   * A product title that itself names the object as a camera,
   * or begins with a manufacturer + established camera model
   * token, is direct product-identity evidence.
   *
   * Strong non-camera identities above always win first.
   * Compatibility/accessory wording such as
   * "Túi đựng máy ảnh Sony A6400" does not match these
   * start-anchored rules.
   */
  const explicitCameraProductTitle =
    /^(?:(?:cho thue|thue)\s+)?(?:may anh|camera)\b/
      .test(
        title
      ) ||
    /^body\s+(?:sony|canon|nikon|fujifilm|fuji|panasonic|lumix|olympus|leica|pentax)\b/
      .test(
        title
      ) ||
    /^sony\s+(?:alpha\s+)?a\d{3,4}[a-z]*\b/
      .test(
        title
      );


  if (
    explicitCameraProductTitle
  ) {
    return makeResult(
      "CAMERA",
      "HIGH",
      [
        "explicit camera product title"
      ]
    );
  }


  /*
   * =====================================================
   * 3. CAMERA SPECIFICATION EVIDENCE
   * =====================================================
   */

  const cameraEvidence: string[] = [];

  if (
    has(
      detail,
      /\b(loai may)\b.*\b(mirrorless|dslr|may anh|compact)\b/
    )
  ) {
    cameraEvidence.push("explicit camera type");
  }

  if (
    has(detail, /\bcam bien\b|\bsensor\b/)
  ) {
    cameraEvidence.push("image sensor");
  }

  if (
    has(detail, /\biso\b/)
  ) {
    cameraEvidence.push("ISO range");
  }

  if (
    has(
      detail,
      /\blay net\b|\bautofocus\b|\baf\b.*\b(diem|point)/
    )
  ) {
    cameraEvidence.push("autofocus system");
  }

  if (
    has(
      detail,
      /\bkinh ngam\b|\bevf\b|\bviewfinder\b/
    )
  ) {
    cameraEvidence.push("viewfinder");
  }

  if (
    has(
      detail,
      /\btoc do chup\b|\bchup lien tiep\b|\bfps\b/
    )
  ) {
    cameraEvidence.push("continuous shooting");
  }

  if (
    has(
      detail,
      /\bquay video\b|\bquay phim\b|\b4k\b|\b8k\b/
    )
  ) {
    cameraEvidence.push("video recording");
  }

  if (
    has(
      detail,
      /\bngam ong kinh\b|\b(e-mount|x-mount|z-mount|rf-s|rf mount|ef-m|m4\/3)\b/
    )
  ) {
    cameraEvidence.push("camera lens mount");
  }

  if (
    has(
      full,
      /\bcamera hanh dong\b|\baction camera\b|\bcamera 360\b/
    )
  ) {
    cameraEvidence.push("explicit camera device class");
  }


  if (
    has(
      detail,
      /\b(?:1|mot)\s+body\s+(?:camera|canon|sony|nikon|fujifilm|fuji|panasonic|lumix|olympus|leica|pentax)\b/
    )
  ) {
    cameraEvidence.push(
      "explicit bundled camera body"
    );
  }

  /*
   * Weak title/family evidence.
   * It helps when specs are sparse, but cannot by itself
   * override a strong non-camera classification.
   */
  const cameraFamily =
    has(
      title,
      /\b(eos|powershot|coolpix|lumix|alpha|insta360|gopro|osmo)\b/
    );

  const cameraCategory =
    has(
      category,
      /\bthue may anh\b|\bmay anh\b|\bcamera\b/
    );

  /*
   * =====================================================
   * 3. LENS / OTHER ACCESSORY EVIDENCE
   * =====================================================
   */

  const lensCategory =
    has(
      category,
      /\b(lens|ong kinh)\b/
    );

  const lensTitle =
    has(
      title,
      /^(ong kinh|lens)\b/
    );

  const lensEvidence = [
    has(detail, /\btieu cu\b|\bfocal length\b/),
    has(detail, /\bkhau do\b|\baperture\b/),
    has(detail, /\bduong kinh filter\b|\bfilter size\b/),
    has(detail, /\bcau truc quang hoc\b/)
  ].filter(Boolean).length;

  /*
   * A camera kit can contain very strong lens evidence.
   * Example: Canon 70D + 50mm.
   *
   * Therefore lens evidence only wins if the product
   * lacks a strong camera specification bundle.
   */
  if (
    lensCategory ||
    lensTitle ||
    (
      lensEvidence >= 3 &&
      cameraEvidence.length < 3
    )
  ) {
    return makeResult(
      "LENS",
      lensCategory || lensTitle
        ? "HIGH"
        : "MEDIUM",
      [
        lensCategory
          ? "lens category"
          : "lens specification bundle"
      ]
    );
  }

  /*
   * Camera-support products are proven non-camera identities when
   * the product title itself names the support object. This keeps
   * rental catalogs from routing tripods/monopods to REVIEW merely
   * because category evidence is sparse.
   */
  if (
    has(
      title,
      /^(?:(?:cho thue|thue)\s+)?(?:chan may(?: quay| anh)?|tripod|monopod)\b/
    ) &&
    cameraEvidence.length <
      3
  ) {
    return makeResult(
      "ACCESSORY",
      "HIGH",
      [
        "camera support accessory title"
      ]
    );
  }


  /*
   * Gimbal is negative only if we do not also have
   * strong camera evidence.
   *
   * DJI Osmo Pocket has a gimbal but is still CAMERA.
   */
  if (
    has(title, /\bgimbal\b/) &&
    cameraEvidence.length < 3
  ) {
    return makeResult(
      "GIMBAL",
      "HIGH",
      ["gimbal product title"]
    );
  }

  const lightingSignals = [
    has(title, /\b(den|light|softbox)\b/),
    has(detail, /\bcri\b|\btlci\b/),
    has(detail, /\bcong suat\b.*\bw\b/)
  ].filter(Boolean).length;

  if (
    lightingSignals >= 2 &&
    cameraEvidence.length < 3
  ) {
    return makeResult(
      "LIGHTING",
      "HIGH",
      ["lighting specification bundle"]
    );
  }

  /*
   * =====================================================
   * 4. CAMERA DECISION
   * =====================================================
   */

  /*
   * A bounded bundle description that explicitly contains a camera
   * body, together with a camera category, is direct camera proof.
   * Strong non-camera identities were already resolved above.
   */
  if (
    cameraCategory &&
    cameraEvidence.includes(
      "explicit bundled camera body"
    )
  ) {
    return makeResult(
      "CAMERA",
      "HIGH",
      [
        "camera category",
        "explicit bundled camera body"
      ]
    );
  }


  /*
   * Strong semantic camera bundle.
   */
  if (cameraEvidence.length >= 3) {
    return makeResult(
      "CAMERA",
      "HIGH",
      cameraEvidence
    );
  }

  /*
   * Camera category + multiple camera properties.
   */
  if (
    cameraCategory &&
    cameraEvidence.length >= 2
  ) {
    return makeResult(
      "CAMERA",
      "HIGH",
      [
        "camera category",
        ...cameraEvidence
      ]
    );
  }

  /*
   * Camera-family title plus real camera evidence.
   */
  if (
    cameraFamily &&
    cameraEvidence.length >= 1
  ) {
    return makeResult(
      "CAMERA",
      "MEDIUM",
      [
        "camera model family",
        ...cameraEvidence
      ]
    );
  }

  /*
   * Category + known camera family can cover sparse pages.
   */
  if (
    cameraCategory &&
    cameraFamily
  ) {
    return makeResult(
      "CAMERA",
      "MEDIUM",
      [
        "camera category",
        "camera model family"
      ]
    );
  }

  /*
   * Strong accessory category with no positive camera proof.
   */
  if (
    has(
      category,
      /\bphu kien\b|\baccessor/
    ) &&
    cameraEvidence.length === 0
  ) {
    return makeResult(
      "ACCESSORY",
      "MEDIUM",
      ["accessory category"]
    );
  }

  return makeResult(
    "UNCERTAIN",
    "LOW",
    []
  );
}

