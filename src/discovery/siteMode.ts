import type {
  BrowserNode,
  SiteMode
} from "../types/index.js";

export interface SiteDetection {
  target: "CAMERA";
  siteMode: SiteMode;
  rental: boolean;
  secondHand: boolean;
  newCamera: boolean;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSiteMode(
  nodes: BrowserNode[],
  pageText: string
): SiteDetection {

  const navText = nodes
    .map((node) => `${node.text} ${node.ariaLabel} ${node.title}`)
    .join("\n");

  const text = normalize(`${navText}\n${pageText}`);

  const rental =
    /\bthue may anh\b/.test(text) ||
    /\bcho thue\b/.test(text) ||
    /\bcamera rental\b/.test(text) ||
    /\brental camera\b/.test(text) ||
    /\bgia thue\b/.test(text);

  const secondHand =
    /\bmay anh cu\b/.test(text) ||
    /\bcamera cu\b/.test(text) ||
    /\bsecond hand\b/.test(text) ||
    /\bsecond-hand\b/.test(text) ||
    /\bused camera\b/.test(text);

  const newCamera =
    /\bmay anh chinh hang\b/.test(text) ||
    /\bmay anh moi\b/.test(text) ||
    /\bcamera moi\b/.test(text) ||
    /\bnew camera\b/.test(text);

  let siteMode: SiteMode = "UNKNOWN";

  if (rental && (secondHand || newCamera)) {
    siteMode = "MIXED";
  } else if (secondHand && newCamera) {
    siteMode = "SALE_MIXED";
  } else if (rental) {
    siteMode = "RENTAL";
  } else if (secondHand) {
    siteMode = "SALE_SECOND_HAND";
  } else if (newCamera) {
    siteMode = "SALE_NEW";
  }

  return {
    target: "CAMERA",
    siteMode,
    rental,
    secondHand,
    newCamera
  };
}
