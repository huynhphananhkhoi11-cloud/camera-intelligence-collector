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

export interface EntityResult {
  type: EntityType;
  isCamera: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
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

function result(
  type: EntityType,
  confidence: EntityResult["confidence"],
  evidence: string[]
): EntityResult {
  return {
    type,
    isCamera: type === "CAMERA",
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
    return result(
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
    return result(
      "PRINTER",
      "HIGH",
      ["printer title/model evidence"]
    );
  }

  if (printerSignals >= 2) {
    return result(
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
    return result(
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
    return result(
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
    return result(
      "BATTERY",
      "HIGH",
      ["battery specification bundle"]
    );
  }

  /*
   * =====================================================
   * 2. CAMERA SPECIFICATION EVIDENCE
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
    return result(
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
   * Gimbal is negative only if we do not also have
   * strong camera evidence.
   *
   * DJI Osmo Pocket has a gimbal but is still CAMERA.
   */
  if (
    has(title, /\bgimbal\b/) &&
    cameraEvidence.length < 3
  ) {
    return result(
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
    return result(
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
   * Strong semantic camera bundle.
   */
  if (cameraEvidence.length >= 3) {
    return result(
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
    return result(
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
    return result(
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
    return result(
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
    return result(
      "ACCESSORY",
      "MEDIUM",
      ["accessory category"]
    );
  }

  return result(
    "UNCERTAIN",
    "LOW",
    []
  );
}

