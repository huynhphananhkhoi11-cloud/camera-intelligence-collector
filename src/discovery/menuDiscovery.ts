import type { BrowserNode } from "../types/index.js";

export interface MenuCandidate {
  node: BrowserNode;
  score: number;
  inferredIntent:
    | "RENTAL"
    | "SECOND_HAND"
    | "NEW"
    | "CAMERA_GENERIC";
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

export function rankCameraMenuCandidates(
  nodes: BrowserNode[]
): MenuCandidate[] {

  const candidates: MenuCandidate[] = [];

  for (const node of nodes) {
    const text = normalize(
      `${node.text} ${node.ariaLabel} ${node.title}`
    );

    if (!text) continue;

    let score = 0;
    let inferredIntent:
      MenuCandidate["inferredIntent"] =
      "CAMERA_GENERIC";

    if (/may anh cu|second hand|second-hand|used camera/.test(text)) {
      score += 100;
      inferredIntent = "SECOND_HAND";
    }

    if (/may anh chinh hang|may anh moi|new camera/.test(text)) {
      score += 100;
      inferredIntent = "NEW";
    }

    if (/thue may anh|camera rental|rental camera/.test(text)) {
      score += 100;
      inferredIntent = "RENTAL";
    }

    if (/may anh|camera/.test(text)) {
      score += 30;
    }

    if (/ong kinh|lens/.test(text)) {
      score -= 100;
    }

    if (/phu kien|accessor/.test(text)) {
      score -= 100;
    }

    if (/tin tuc|blog|article/.test(text)) {
      score -= 100;
    }

    if (/gio hang|cart|checkout|login|dang nhap/.test(text)) {
      score -= 100;
    }

    if (score > 0) {
      candidates.push({
        node,
        score,
        inferredIntent
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}
