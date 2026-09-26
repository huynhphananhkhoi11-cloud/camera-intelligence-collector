import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SourceInspector,
  type BrowserStructuralSnapshot,
  type SourceInspectorPage
} from "../../../src/v16/source/sourceInspector.ts";

import type {
  IdentityMetadataEvidence,
  NavigationNodeEvidence,
  RepeatingCardCandidateEvidence
} from "../../../src/v16/evidence/pageEvidence.js";

class FakeResponse {
  private readonly code: number;
  private readonly body: string;

  constructor(code: number, body: string) {
    this.code = code;
    this.body = body;
  }

  status(): number {
    return this.code;
  }

  async text(): Promise<string> {
    return this.body;
  }
}

interface FakePageInput {
  readonly requestedUrl: string;
  readonly finalUrl?: string;
  readonly rawHtml: string;
  readonly renderedHtml: string;
  readonly status?: number;
  readonly snapshot?: BrowserStructuralSnapshot;
  readonly networkIdleFails?: boolean;
}

const EMPTY_IDENTITY: IdentityMetadataEvidence = {
  documentTitle: null,
  h1Texts: [],
  canonicalUrl: null,
  metaTitles: []
};

const EMPTY_SNAPSHOT: BrowserStructuralSnapshot = {
  scripts: [],
  navigationNodes: [],
  repeatingCardCandidates: [],
  breadcrumbs: [],
  identityMetadata: EMPTY_IDENTITY
};

class FakePage implements SourceInspectorPage {
  readonly gotoCalls: string[] = [];
  readonly loadStateCalls: string[] = [];
  readonly evaluateCalls: number[] = [];
  private readonly input: FakePageInput;

  constructor(input: FakePageInput) {
    this.input = input;
  }

  async goto(url: string): Promise<FakeResponse> {
    this.gotoCalls.push(url);
    return new FakeResponse(this.input.status ?? 200, this.input.rawHtml);
  }

  url(): string {
    return this.input.finalUrl ?? this.input.requestedUrl;
  }

  async waitForLoadState(state: string): Promise<void> {
    this.loadStateCalls.push(state);
    if (state === "networkidle" && this.input.networkIdleFails) {
      throw new Error("bounded network idle timeout");
    }
  }

  async content(): Promise<string> {
    return this.input.renderedHtml;
  }

  async evaluate<T>(): Promise<T> {
    this.evaluateCalls.push(Date.now());
    return (this.input.snapshot ?? EMPTY_SNAPSHOT) as T;
  }
}

function navNode(text: string, href: string, contextTag = "nav"): NavigationNodeEvidence {
  return {
    href,
    text,
    attributes: {},
    context: {
      tagName: "a",
      parentTagName: contextTag,
      parentRole: contextTag === "footer" ? null : "navigation",
      parentClassTokens: []
    }
  };
}

function card(text: string, href: string, groupSize = 3): RepeatingCardCandidateEvidence {
  return {
    href,
    text,
    attributes: {},
    context: {
      tagName: "article",
      parentTagName: "section",
      parentRole: null,
      parentClassTokens: ["grid"],
      structuralSignature: "article|card|section|grid",
      repeatedSiblingCount: groupSize
    }
  };
}

test("A: parses JSON-LD Product present in raw document source", async () => {
  const rawHtml = `<!doctype html><html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Camera A"}</script>
  </head><body></body></html>`;

  const page = new FakePage({
    requestedUrl: "https://shop.test/item-a",
    rawHtml,
    renderedHtml: rawHtml
  });

  const bundle = await new SourceInspector().inspect({
    page,
    requestedUrl: "https://shop.test/item-a"
  });

  assert.equal(bundle.jsonLd.length, 1);
  assert.equal((bundle.jsonLd[0]?.value as Record<string, unknown>)["@type"], "Product");
  assert.equal((bundle.jsonLd[0]?.value as Record<string, unknown>).name, "Camera A");
  assert.equal(bundle.jsonLd[0]?.sourceKind, "RAW_DOCUMENT");
});

test("B: exposes repeating card evidence that exists only after JavaScript render", async () => {
  const rawHtml = '<!doctype html><html><body><div id="app"></div></body></html>';
  const renderedHtml = '<!doctype html><html><body><div id="app"><article class="card"><a href="/p/1">Rendered item 1</a></article><article class="card"><a href="/p/2">Rendered item 2</a></article></div></body></html>';

  const page = new FakePage({
    requestedUrl: "https://shop.test/collection",
    rawHtml,
    renderedHtml,
    snapshot: {
      ...EMPTY_SNAPSHOT,
      repeatingCardCandidates: [
        card("Rendered item 1", "https://shop.test/p/1", 2),
        card("Rendered item 2", "https://shop.test/p/2", 2)
      ]
    }
  });

  const bundle = await new SourceInspector().inspect({
    page,
    requestedUrl: "https://shop.test/collection"
  });

  assert.equal(bundle.rawDocumentHtml?.includes("Rendered item 1"), false);
  assert.equal(bundle.renderedDocumentHtml?.includes("Rendered item 1"), true);
  assert.deepEqual(
    bundle.repeatingCardCandidates.map(candidate => candidate.href),
    ["https://shop.test/p/1", "https://shop.test/p/2"]
  );
});

test("C: exposes generic embedded application JSON and redacts secret-named keys", async () => {
  const rawHtml = `<!doctype html><html><body>
    <script id="state">window.APP_STATE = {"catalog":{"items":[{"id":"p1"}]},"csrfToken":"do-not-keep"};</script>
  </body></html>`;

  const page = new FakePage({
    requestedUrl: "https://shop.test/",
    rawHtml,
    renderedHtml: rawHtml
  });

  const bundle = await new SourceInspector().inspect({
    page,
    requestedUrl: "https://shop.test/"
  });

  assert.equal(bundle.embeddedJson.length, 1);
  const value = bundle.embeddedJson[0]?.value as Record<string, unknown>;
  assert.deepEqual(value.catalog, { items: [{ id: "p1" }] });
  assert.equal(value.csrfToken, "[REDACTED]");
});

test("D: exposes mixed structural homepage evidence without creating product queue work", async () => {
  const page = new FakePage({
    requestedUrl: "https://shop.test/",
    rawHtml: "<html><body>home</body></html>",
    renderedHtml: "<html><body>home rendered</body></html>",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      navigationNodes: [
        navNode("Photography", "https://shop.test/photography"),
        navNode("News", "https://shop.test/news"),
        navNode("Promo", "https://shop.test/promo"),
        navNode("Terms", "https://shop.test/terms", "footer")
      ],
      repeatingCardCandidates: [
        card("Item A", "https://shop.test/item-a"),
        card("Story A", "https://shop.test/story-a"),
        card("Promo A", "https://shop.test/promo-a")
      ]
    }
  });

  const bundle = await new SourceInspector().inspect({
    page,
    requestedUrl: "https://shop.test/"
  });

  assert.deepEqual(
    bundle.navigationNodes.map(node => node.text),
    ["Photography", "News", "Promo", "Terms"]
  );
  assert.deepEqual(
    bundle.repeatingCardCandidates.map(candidate => candidate.text),
    ["Item A", "Story A", "Promo A"]
  );
  assert.equal("productQueue" in (bundle as unknown as Record<string, unknown>), false);
  assert.deepEqual(page.gotoCalls, ["https://shop.test/"]);
});

test("E: ignores malformed JSON-LD safely without crashing the page inspection", async () => {
  const rawHtml = `<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"Product", broken }</script>
  </head><body></body></html>`;

  const page = new FakePage({
    requestedUrl: "https://shop.test/bad-jsonld",
    rawHtml,
    renderedHtml: rawHtml
  });

  const bundle = await new SourceInspector().inspect({
    page,
    requestedUrl: "https://shop.test/bad-jsonld"
  });

  assert.deepEqual(bundle.jsonLd, []);
  assert.equal(bundle.diagnostics.malformedJsonLdCount, 1);
});

test("F: LEAN drop-after-extraction does not retain raw documents or secret JSON values and emits no logs", async () => {
  const rawHtml = `<!doctype html><html><body>
    <script type="application/json">{"items":[1,2],"apiKey":"secret-api-key","authorization":"Bearer secret-token","sessionToken":"secret-session"}</script>
  </body></html>`;

  const page = new FakePage({
    requestedUrl: "https://shop.test/secure",
    rawHtml,
    renderedHtml: rawHtml
  });

  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => logs.push(args.join(" "));

  try {
    const bundle = await new SourceInspector({
      documentRetention: "drop-after-extraction"
    }).inspect({
      page,
      requestedUrl: "https://shop.test/secure"
    });

    assert.equal(bundle.rawDocumentHtml, null);
    assert.equal(bundle.renderedDocumentHtml, null);
    const serialized = JSON.stringify(bundle);
    assert.equal(serialized.includes("secret-api-key"), false);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("secret-session"), false);
    assert.equal(serialized.includes("[REDACTED]"), true);
    assert.deepEqual(logs, []);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test("architecture guard: DEV1 source has no screenshot, human interaction, Gemini, site hardcode, or queue logic", async () => {
  const source = await readFile(
    new URL("../../../src/v16/source/sourceInspector.ts", import.meta.url),
    "utf8"
  );

  const forbidden = [
    ".screenshot(",
    ".hover(",
    ".click(",
    "Gemini",
    "vjshop",
    "/tin-tuc/",
    "/blog/",
    "/news/",
    "productQueue"
  ];

  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `forbidden DEV1 token: ${token}`);
  }
});

