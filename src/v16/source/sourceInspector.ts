import type {
  BreadcrumbEvidence,
  IdentityMetadataEvidence,
  NavigationNodeEvidence,
  PageEvidenceBundle,
  PageEvidenceSourceKind,
  RepeatingCardCandidateEvidence,
  SafeAttributeMap,
  StructuredJsonEvidence
} from "../evidence/pageEvidence.js";

export interface BrowserScriptBlock {
  readonly type: string | null;
  readonly id: string | null;
  readonly text: string;
  readonly truncated: boolean;
}

export interface BrowserStructuralSnapshot {
  readonly scripts: readonly BrowserScriptBlock[];
  readonly navigationNodes: readonly NavigationNodeEvidence[];
  readonly repeatingCardCandidates: readonly RepeatingCardCandidateEvidence[];
  readonly breadcrumbs: readonly BreadcrumbEvidence[];
  readonly identityMetadata: IdentityMetadataEvidence;
}

export interface SourceInspectorResponse {
  status(): number;
  text(): Promise<string>;
}

export interface SourceInspectorPage {
  goto(url: string, options?: unknown): Promise<SourceInspectorResponse | null>;
  url(): string;
  waitForLoadState(state: string, options?: unknown): Promise<void>;
  content(): Promise<string>;
  evaluate<T>(pageFunction: unknown, arg?: unknown): Promise<T>;
}

export interface SourceInspectorInput {
  readonly page: SourceInspectorPage;
  readonly requestedUrl: string;
}

export interface SourceInspectorOptions {
  readonly navigationTimeoutMs?: number;
  readonly settleTimeoutMs?: number;
  readonly maxDocumentChars?: number;
  readonly maxScriptBlocks?: number;
  readonly maxScriptCharsPerBlock?: number;
  readonly maxNavigationNodes?: number;
  readonly maxRepeatingCardCandidates?: number;
  readonly maxBreadcrumbs?: number;
  readonly documentRetention?: "return" | "drop-after-extraction";
}

interface ResolvedOptions {
  readonly navigationTimeoutMs: number;
  readonly settleTimeoutMs: number;
  readonly maxDocumentChars: number;
  readonly maxScriptBlocks: number;
  readonly maxScriptCharsPerBlock: number;
  readonly maxNavigationNodes: number;
  readonly maxRepeatingCardCandidates: number;
  readonly maxBreadcrumbs: number;
  readonly documentRetention: "return" | "drop-after-extraction";
}

interface JsonCollectionResult {
  readonly jsonLd: readonly StructuredJsonEvidence[];
  readonly embeddedJson: readonly StructuredJsonEvidence[];
  readonly malformedJsonLdCount: number;
  readonly malformedEmbeddedJsonCount: number;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  navigationTimeoutMs: 15_000,
  settleTimeoutMs: 1_500,
  maxDocumentChars: 2_000_000,
  maxScriptBlocks: 48,
  maxScriptCharsPerBlock: 1_000_000,
  maxNavigationNodes: 160,
  maxRepeatingCardCandidates: 240,
  maxBreadcrumbs: 32,
  documentRetention: "return"
};

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|bearer|token|secret|api[_-]?key|csrf|cookie|session|password|credential)/iu;

function resolveOptions(options: SourceInspectorOptions): ResolvedOptions {
  return {
    navigationTimeoutMs: options.navigationTimeoutMs ?? DEFAULT_OPTIONS.navigationTimeoutMs,
    settleTimeoutMs: options.settleTimeoutMs ?? DEFAULT_OPTIONS.settleTimeoutMs,
    maxDocumentChars: options.maxDocumentChars ?? DEFAULT_OPTIONS.maxDocumentChars,
    maxScriptBlocks: options.maxScriptBlocks ?? DEFAULT_OPTIONS.maxScriptBlocks,
    maxScriptCharsPerBlock:
      options.maxScriptCharsPerBlock ?? DEFAULT_OPTIONS.maxScriptCharsPerBlock,
    maxNavigationNodes: options.maxNavigationNodes ?? DEFAULT_OPTIONS.maxNavigationNodes,
    maxRepeatingCardCandidates:
      options.maxRepeatingCardCandidates ?? DEFAULT_OPTIONS.maxRepeatingCardCandidates,
    maxBreadcrumbs: options.maxBreadcrumbs ?? DEFAULT_OPTIONS.maxBreadcrumbs,
    documentRetention: options.documentRetention ?? DEFAULT_OPTIONS.documentRetention
  };
}

function normalizedNullable(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseScriptAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;

  for (const match of rawAttributes.matchAll(pattern)) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) {
      continue;
    }
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function extractScriptBlocksFromHtml(
  html: string | null,
  maxBlocks: number,
  maxCharsPerBlock: number
): BrowserScriptBlock[] {
  if (!html) {
    return [];
  }

  const blocks: BrowserScriptBlock[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;

  for (const match of html.matchAll(pattern)) {
    if (blocks.length >= maxBlocks) {
      break;
    }

    const attributes = parseScriptAttributes(match[1] ?? "");
    const fullText = match[2] ?? "";

    blocks.push({
      type: normalizedNullable(attributes.type),
      id: normalizedNullable(attributes.id),
      text: fullText.slice(0, maxCharsPerBlock),
      truncated: fullText.length > maxCharsPerBlock
    });
  }

  return blocks;
}

function redactSensitiveJson(value: unknown, depth = 0): unknown {
  if (depth > 32) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveJson(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(source)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitiveJson(child, depth + 1);
    }

    return output;
  }

  return value;
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function findBalancedJsonEnd(text: string, startIndex: number): number | null {
  const opening = text[startIndex];
  if (opening !== "{" && opening !== "[") {
    return null;
  }

  const stack: string[] = [opening];
  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return index;
      }
    }
  }

  return null;
}

function extractEmbeddedJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    return values;
  }

  const direct = tryParseJson(trimmed);
  if (direct !== undefined) {
    return [direct];
  }

  let inspectedStarts = 0;
  for (let index = 0; index < text.length && inspectedStarts < 12; index += 1) {
    const char = text[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    inspectedStarts += 1;
    const end = findBalancedJsonEnd(text, index);
    if (end === null) {
      continue;
    }

    const parsed = tryParseJson(text.slice(index, end + 1));
    if (parsed !== undefined) {
      values.push(parsed);
      index = end;
      if (values.length >= 4) {
        break;
      }
    }
  }

  return values;
}

function isJsonLdType(type: string | null): boolean {
  return (type ?? "").trim().toLowerCase() === "application/ld+json";
}

function isJsonScriptType(type: string | null): boolean {
  const normalized = (type ?? "").trim().toLowerCase();
  return normalized === "application/json" || normalized.endsWith("+json");
}

function collectJsonEvidence(
  sourceKind: PageEvidenceSourceKind,
  blocks: readonly BrowserScriptBlock[]
): JsonCollectionResult {
  const jsonLd: StructuredJsonEvidence[] = [];
  const embeddedJson: StructuredJsonEvidence[] = [];
  let malformedJsonLdCount = 0;
  let malformedEmbeddedJsonCount = 0;

  blocks.forEach((block, scriptIndex) => {
    if (block.truncated) {
      return;
    }

    if (isJsonLdType(block.type)) {
      const parsed = tryParseJson(block.text);
      if (parsed === undefined) {
        malformedJsonLdCount += 1;
        return;
      }

      jsonLd.push({
        sourceKind,
        scriptIndex,
        scriptType: block.type,
        scriptId: block.id,
        value: redactSensitiveJson(parsed)
      });
      return;
    }

    const values = extractEmbeddedJsonValues(block.text);
    if (values.length === 0) {
      if (isJsonScriptType(block.type) && block.text.trim().length > 0) {
        malformedEmbeddedJsonCount += 1;
      }
      return;
    }

    for (const value of values) {
      embeddedJson.push({
        sourceKind,
        scriptIndex,
        scriptType: block.type,
        scriptId: block.id,
        value: redactSensitiveJson(value)
      });
    }
  });

  return {
    jsonLd,
    embeddedJson,
    malformedJsonLdCount,
    malformedEmbeddedJsonCount
  };
}

function evidenceKey(evidence: StructuredJsonEvidence): string {
  let serialized = "";
  try {
    serialized = JSON.stringify(evidence.value);
  } catch {
    serialized = String(evidence.value);
  }
  return `${evidence.scriptType ?? ""}\u0000${serialized}`;
}

function dedupeStructuredJson(
  groups: readonly (readonly StructuredJsonEvidence[])[]
): StructuredJsonEvidence[] {
  const seen = new Set<string>();
  const output: StructuredJsonEvidence[] = [];

  for (const group of groups) {
    for (const evidence of group) {
      const key = evidenceKey(evidence);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(evidence);
    }
  }

  return output;
}

function capDocument(
  text: string | null,
  maxChars: number
): { readonly text: string | null; readonly truncated: boolean } {
  if (text === null) {
    return { text: null, truncated: false };
  }

  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true
  };
}

async function readResponseText(response: SourceInspectorResponse | null): Promise<string | null> {
  if (!response) {
    return null;
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function captureBrowserStructuralSnapshot(
  page: SourceInspectorPage,
  options: ResolvedOptions
): Promise<BrowserStructuralSnapshot> {
  return page.evaluate<BrowserStructuralSnapshot>(
    (limits: {
      maxScriptBlocks: number;
      maxScriptCharsPerBlock: number;
      maxNavigationNodes: number;
      maxRepeatingCardCandidates: number;
      maxBreadcrumbs: number;
    }) => {
      const sensitiveAttributePattern =
        /(?:authorization|bearer|token|secret|api[_-]?key|csrf|cookie|session|password|credential)/iu;

      const normalizeText = (value: string | null | undefined): string =>
        (value ?? "").replace(/\s+/gu, " ").trim();

      const classTokens = (element: Element | null, max = 4): string[] => {
        if (!element) {
          return [];
        }
        return Array.from(element.classList)
          .filter(Boolean)
          .slice(0, max)
          .sort();
      };

      const safeAttributes = (element: Element): SafeAttributeMap => {
        const output: Record<string, string> = {};

        for (const attribute of Array.from(element.attributes)) {
          const name = attribute.name.toLowerCase();
          const allowed =
            name === "id" ||
            name === "class" ||
            name === "role" ||
            name === "rel" ||
            name === "title" ||
            name === "itemprop" ||
            name === "itemtype" ||
            name.startsWith("aria-") ||
            name.startsWith("data-");

          if (!allowed || sensitiveAttributePattern.test(name)) {
            continue;
          }

          const value = attribute.value.slice(0, 512);
          if (sensitiveAttributePattern.test(value) && name.startsWith("data-")) {
            continue;
          }
          output[name] = value;
        }

        return output;
      };

      const structuralContext = (element: Element): {
        tagName: string;
        parentTagName: string | null;
        parentRole: string | null;
        parentClassTokens: string[];
      } => {
        const parent =
          element.closest("nav, header, footer, [role='navigation'], [role='menu'], [role='menubar'], ul, ol") ??
          element.parentElement;

        return {
          tagName: element.tagName.toLowerCase(),
          parentTagName: parent ? parent.tagName.toLowerCase() : null,
          parentRole: parent?.getAttribute("role") ?? null,
          parentClassTokens: classTokens(parent)
        };
      };

      const scripts = Array.from(document.querySelectorAll("script"))
        .slice(0, limits.maxScriptBlocks)
        .map(script => {
          const fullText = script.textContent ?? "";
          return {
            type: script.getAttribute("type"),
            id: script.getAttribute("id"),
            text: fullText.slice(0, limits.maxScriptCharsPerBlock),
            truncated: fullText.length > limits.maxScriptCharsPerBlock
          };
        });

      const navigationElements = Array.from(
        document.querySelectorAll(
          "nav a[href], [role='navigation'] a[href], [role='menu'] a[href], [role='menubar'] a[href], header a[href], footer a[href]"
        )
      ).slice(0, limits.maxNavigationNodes * 3);

      const navigationNodes: NavigationNodeEvidence[] = [];
      const navigationSeen = new Set<string>();

      for (const element of navigationElements) {
        if (navigationNodes.length >= limits.maxNavigationNodes) {
          break;
        }

        const anchor = element as HTMLAnchorElement;
        const text = normalizeText(anchor.innerText || anchor.textContent);
        const href = anchor.href || anchor.getAttribute("href");
        const context = structuralContext(anchor);
        const key = `${href ?? ""}\u0000${text}\u0000${context.parentTagName ?? ""}`;

        if (navigationSeen.has(key)) {
          continue;
        }
        navigationSeen.add(key);

        navigationNodes.push({
          href: href || null,
          text,
          attributes: safeAttributes(anchor),
          context
        });
      }

      const rawCardElements = Array.from(
        document.querySelectorAll("article, li, [role='listitem'], [class]")
      ).slice(0, 2_500);

      const groups = new Map<string, Element[]>();

      for (const element of rawCardElements) {
        const anchor = element.querySelector("a[href]");
        if (!anchor) {
          continue;
        }

        const hasStructuralPayload =
          Boolean(element.querySelector("img, picture, [itemprop], [itemscope]")) ||
          element.children.length >= 2;
        if (!hasStructuralPayload) {
          continue;
        }

        const parent = element.parentElement;
        const signature = [
          element.tagName.toLowerCase(),
          classTokens(element).join("."),
          parent?.tagName.toLowerCase() ?? "",
          classTokens(parent).join(".")
        ].join("|");

        const group = groups.get(signature) ?? [];
        group.push(element);
        groups.set(signature, group);
      }

      const repeatingCardCandidates: RepeatingCardCandidateEvidence[] = [];
      const cardSeen = new Set<string>();

      for (const [signature, elements] of groups.entries()) {
        if (elements.length < 2) {
          continue;
        }

        for (const element of elements) {
          if (repeatingCardCandidates.length >= limits.maxRepeatingCardCandidates) {
            break;
          }

          const anchor = element.querySelector("a[href]") as HTMLAnchorElement | null;
          if (!anchor) {
            continue;
          }

          const href = anchor.href || anchor.getAttribute("href");
          const text = normalizeText(element instanceof HTMLElement ? element.innerText : element.textContent);
          const key = `${signature}\u0000${href ?? ""}\u0000${text}`;
          if (cardSeen.has(key)) {
            continue;
          }
          cardSeen.add(key);

          const parent = element.parentElement;
          repeatingCardCandidates.push({
            href: href || null,
            text: text.slice(0, 1_000),
            attributes: safeAttributes(element),
            context: {
              tagName: element.tagName.toLowerCase(),
              parentTagName: parent ? parent.tagName.toLowerCase() : null,
              parentRole: parent?.getAttribute("role") ?? null,
              parentClassTokens: classTokens(parent),
              structuralSignature: signature,
              repeatedSiblingCount: elements.length
            }
          });
        }

        if (repeatingCardCandidates.length >= limits.maxRepeatingCardCandidates) {
          break;
        }
      }

      const breadcrumbElements = Array.from(
        document.querySelectorAll(
          "[aria-label*='breadcrumb' i] a[href], [itemtype*='BreadcrumbList'] [itemprop='item'], [itemprop='breadcrumb'] a[href]"
        )
      ).slice(0, limits.maxBreadcrumbs);

      const breadcrumbs: BreadcrumbEvidence[] = breadcrumbElements.map((element, index) => {
        const anchor = element as HTMLAnchorElement;
        const positionNode = element.closest("[itemprop='itemListElement']")?.querySelector("[itemprop='position']");
        const parsedPosition = Number(positionNode?.getAttribute("content") ?? "");

        return {
          href: anchor.href || anchor.getAttribute("href") || null,
          text: normalizeText(anchor.innerText || anchor.textContent),
          position: Number.isFinite(parsedPosition) && parsedPosition > 0 ? parsedPosition : index + 1,
          attributes: safeAttributes(anchor)
        };
      });

      const canonicalElement = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
      const metaTitleElements = Array.from(
        document.querySelectorAll("meta[property='og:title'], meta[name='twitter:title'], meta[itemprop='name']")
      ).slice(0, 12);

      const identityMetadata: IdentityMetadataEvidence = {
        documentTitle: normalizeText(document.title) || null,
        h1Texts: Array.from(document.querySelectorAll<HTMLElement>("h1"))
          .slice(0, 12)
          .map(element => normalizeText(element.innerText || element.textContent))
          .filter(Boolean),
        canonicalUrl: canonicalElement?.href || canonicalElement?.getAttribute("href") || null,
        metaTitles: metaTitleElements
          .map(element => normalizeText(element.getAttribute("content")))
          .filter(Boolean)
      };

      return {
        scripts,
        navigationNodes,
        repeatingCardCandidates,
        breadcrumbs,
        identityMetadata
      };
    },
    {
      maxScriptBlocks: options.maxScriptBlocks,
      maxScriptCharsPerBlock: options.maxScriptCharsPerBlock,
      maxNavigationNodes: options.maxNavigationNodes,
      maxRepeatingCardCandidates: options.maxRepeatingCardCandidates,
      maxBreadcrumbs: options.maxBreadcrumbs
    }
  );
}

export class SourceInspector {
  private readonly options: ResolvedOptions;

  constructor(options: SourceInspectorOptions = {}) {
    this.options = resolveOptions(options);
  }

  async inspect(input: SourceInspectorInput): Promise<PageEvidenceBundle> {
    const response = await input.page.goto(input.requestedUrl, {
      waitUntil: "domcontentloaded",
      timeout: this.options.navigationTimeoutMs
    });

    const rawDocument = await readResponseText(response);

    let settleOutcome: "NETWORK_IDLE" | "BOUNDED_TIMEOUT" = "NETWORK_IDLE";
    try {
      await input.page.waitForLoadState("networkidle", {
        timeout: this.options.settleTimeoutMs
      });
    } catch {
      settleOutcome = "BOUNDED_TIMEOUT";
    }

    const renderedDocument = await input.page.content();
    const browserSnapshot = await captureBrowserStructuralSnapshot(input.page, this.options);

    const rawScripts = extractScriptBlocksFromHtml(
      rawDocument,
      this.options.maxScriptBlocks,
      this.options.maxScriptCharsPerBlock
    );

    const rawJson = collectJsonEvidence("RAW_DOCUMENT", rawScripts);
    const renderedJson = collectJsonEvidence("RENDERED_DOM", browserSnapshot.scripts);

    const rawCapped = capDocument(rawDocument, this.options.maxDocumentChars);
    const renderedCapped = capDocument(renderedDocument, this.options.maxDocumentChars);
    const keepDocuments = this.options.documentRetention === "return";

    return {
      requestedUrl: input.requestedUrl,
      finalUrl: input.page.url(),
      httpStatus: response?.status() ?? null,
      rawDocumentHtml: keepDocuments ? rawCapped.text : null,
      renderedDocumentHtml: keepDocuments ? renderedCapped.text : null,
      jsonLd: dedupeStructuredJson([rawJson.jsonLd, renderedJson.jsonLd]),
      embeddedJson: dedupeStructuredJson([rawJson.embeddedJson, renderedJson.embeddedJson]),
      navigationNodes: browserSnapshot.navigationNodes,
      repeatingCardCandidates: browserSnapshot.repeatingCardCandidates,
      breadcrumbs: browserSnapshot.breadcrumbs,
      identityMetadata: browserSnapshot.identityMetadata,
      diagnostics: {
        settleOutcome,
        malformedJsonLdCount:
          rawJson.malformedJsonLdCount + renderedJson.malformedJsonLdCount,
        malformedEmbeddedJsonCount:
          rawJson.malformedEmbeddedJsonCount + renderedJson.malformedEmbeddedJsonCount,
        rawDocumentAvailable: rawDocument !== null,
        renderedDocumentAvailable: true,
        rawDocumentTruncated: rawCapped.truncated,
        renderedDocumentTruncated: renderedCapped.truncated
      }
    };
  }
}

