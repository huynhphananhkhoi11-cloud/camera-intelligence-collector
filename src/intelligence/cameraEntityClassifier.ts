export type CameraEntityLabel =
  | "CAMERA"
  | "NOT_CAMERA"
  | "UNCERTAIN";

export interface CameraEntityResult {
  label: CameraEntityLabel;
  score: number;
  positives: string[];
  negatives: string[];
}

function norm(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyCameraEntity(
  productName: string,
  bodyText: string
): CameraEntityResult {

  const title =
    norm(productName);

  const body =
    norm(bodyText);

  const positives: string[] = [];
  const negatives: string[] = [];

  let score = 0;

  /*
    ===========================================
    STRONG NEGATIVE TITLE SIGNALS
    ===========================================
  */

  const strongNegativeTitle =
    /^(ong kinh|lens\b|pin\b|sac\b|charger\b|ngam\b|adapter\b|filter\b|tripod\b|chan may\b|balo\b|tui\b|the nho\b|flash\b|den\b|softbox\b|gimbal\b|micro\b|may in\b|printer\b|photobooth\b)/;

  if (
    strongNegativeTitle.test(title)
  ) {
    return {
      label: "NOT_CAMERA",
      score: -100,
      positives,
      negatives: [
        "strong non-camera title"
      ]
    };
  }

  /*
    ===========================================
    POSITIVE CAMERA SIGNALS
    ===========================================
  */

  if (
    /\b(mirrorless|dslr|may anh compact|camera hanh trinh|action camera)\b/
      .test(body)
  ) {
    score += 4;
    positives.push(
      "explicit camera type"
    );
  }

  if (
    /\bcam bien\b/.test(body)
  ) {
    score += 2;
    positives.push("sensor");
  }

  if (
    /\biso\b/.test(body)
  ) {
    score += 1;
    positives.push("ISO");
  }

  if (
    /ngam ong kinh|e-mount|rf-mount|rf-s|ef-m|x-mount|z-mount|m4\/3/
      .test(body)
  ) {
    score += 2;
    positives.push(
      "camera mount"
    );
  }

  if (
    /kinh ngam|evf|viewfinder/
      .test(body)
  ) {
    score += 1;
    positives.push(
      "viewfinder"
    );
  }

  if (
    /toc do chup lien tiep|khung hinh\/giay|fps/
      .test(body)
  ) {
    score += 1;
    positives.push(
      "camera shooting specs"
    );
  }

  if (
    /quay video.*(4k|full hd|1080p)|4k.*fps/
      .test(body)
  ) {
    score += 1;
    positives.push(
      "video recording specs"
    );
  }

  /*
    Camera-oriented names.
  */
  if (
    /\b(eos|alpha|powershot|coolpix|instax|lumix|zv-|gopro|insta360|osmo pocket)\b/
      .test(title)
  ) {
    score += 3;
    positives.push(
      "camera model family"
    );
  }

  if (
    /\bbody\b/.test(title)
  ) {
    score += 2;
    positives.push(
      "camera body"
    );
  }

  /*
    ===========================================
    NEGATIVE DETAIL SIGNALS
    ===========================================
  */

  if (
    /thue phu kien/
      .test(body)
  ) {
    score -= 6;
    negatives.push(
      "accessory category"
    );
  }

  if (
    /loai pin:|dung luong.*mah|dien ap.*v/
      .test(body)
  ) {
    score -= 7;
    negatives.push(
      "battery specifications"
    );
  }

  if (
    /cong nghe in|in nhiet|giay in|toc do in anh|do phan giai in/
      .test(body)
  ) {
    score -= 10;
    negatives.push(
      "printer specifications"
    );
  }

  if (
    /gimbal chong rung|tai trong toi da.*kg|chong rung 3 truc/
      .test(body)
  ) {
    score -= 8;
    negatives.push(
      "gimbal specifications"
    );
  }

  if (
    /cong suat.*w|nhiet do mau|cri|tlci|softbox/
      .test(body)
  ) {
    score -= 7;
    negatives.push(
      "lighting equipment"
    );
  }

  if (
    /photobooth/
      .test(title + " " + body)
  ) {
    score -= 12;
    negatives.push(
      "photobooth"
    );
  }

  /*
    ===========================================
    DECISION
    ===========================================
  */

  if (
    score >= 5
  ) {
    return {
      label: "CAMERA",
      score,
      positives,
      negatives
    };
  }

  if (
    score <= -3
  ) {
    return {
      label: "NOT_CAMERA",
      score,
      positives,
      negatives
    };
  }

  return {
    label: "UNCERTAIN",
    score,
    positives,
    negatives
  };
}
