export interface RenderedListingLink {
  readonly url: string;
  readonly rel: string | null;
}

export interface RenderedListingSnapshot {
  readonly links: readonly RenderedListingLink[];
  readonly documentHeight: number;
}

export interface RenderedListingPageSession {
  snapshot(signal?: AbortSignal): Promise<RenderedListingSnapshot>;
  scrollNearBottom(signal?: AbortSignal): Promise<void>;
  waitForSettle(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface RenderedListingRuntime {
  open(url: string, signal?: AbortSignal): Promise<RenderedListingPageSession>;
}

export interface ListingDiscoveryResult {
  readonly urls: readonly string[];
  readonly passes: number;
}

export interface PlaywrightRenderedListingRuntimeOptions {
  readonly headless?: boolean;
  readonly navigationTimeoutMs?: number;
  readonly settleMs?: number;
}

const MAX_PASSES = 8;
const STABLE_PASSES_REQUIRED = 2;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const DEFAULT_SETTLE_MS = 1_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Rendered listing discovery aborted.");
  }
}

function siteKey(url: URL): string {
  return url.hostname
    .replace(/^www\./iu, "")
    .toLowerCase();
}

function normalizeUrl(
  href: string,
  baseUrl: string
): string | null {
  try {
    const parsed = new URL(href, baseUrl);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return null;
    }

    parsed.hash = "";
    return parsed.toString();
  }
  catch {
    return null;
  }
}

function hasNextRel(rel: string | null): boolean {
  return (
    rel
      ?.split(/\s+/u)
      .some(token => token.toLowerCase() === "next") ??
    false
  );
}

function snapshotSignature(
  snapshot: RenderedListingSnapshot,
  pageUrl: string
): string {
  const urls = Array.from(
    new Set(
      snapshot.links
        .map(item => normalizeUrl(item.url, pageUrl))
        .filter((url): url is string => url !== null)
    )
  ).sort();

  return JSON.stringify({
    documentHeight: snapshot.documentHeight,
    urls
  });
}

type BrowserLike = {
  newContext(options: {
    serviceWorkers: "block";
  }): Promise<BrowserContextLike>;
  isConnected(): boolean;
  close(): Promise<void>;
};

type BrowserContextLike = {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};

type PageLike = {
  goto(
    url: string,
    options: {
      readonly waitUntil: "domcontentloaded";
      readonly timeout: number;
    }
  ): Promise<unknown>;
  waitForTimeout(milliseconds: number): Promise<void>;
  addInitScript(script: {
    readonly content: string;
  }): Promise<unknown>;
  evaluate<T>(callback: () => T): Promise<T>;
  evaluate(script: string): Promise<unknown>;
};

const TSX_PAGE_EVALUATE_NAME_SHIM =
  [
    "(() => {",
    "  if (typeof globalThis.__name !== 'function') {",
    "    var __name = globalThis.__name = function(target, value) {",
    "      try {",
    "        Object.defineProperty(target, 'name', {",
    "          value: value,",
    "          configurable: true",
    "        });",
    "      } catch {",
    "        // Naming metadata is non-critical.",
    "      }",
    "      return target;",
    "    };",
    "  }",
    "})()"
  ].join("\n");

async function ensureTsxPageEvaluateShim(
  page: PageLike
): Promise<void> {
  await page.addInitScript({
    content: TSX_PAGE_EVALUATE_NAME_SHIM
  });

  await page.evaluate(
    TSX_PAGE_EVALUATE_NAME_SHIM
  );
}

class PlaywrightRenderedListingPageSession
implements RenderedListingPageSession {
  constructor(
    private readonly browser: BrowserLike,
    private readonly context: BrowserContextLike,
    private readonly page: PageLike,
    private readonly settleMs: number
  ) {}

  async snapshot(
    signal?: AbortSignal
  ): Promise<RenderedListingSnapshot> {
    throwIfAborted(signal);

    const result = await this.page.evaluate(
      () => ({
        documentHeight: Math.max(
          document.body?.scrollHeight ?? 0,
          document.documentElement?.scrollHeight ?? 0
        ),
        links: Array.from(
          document.querySelectorAll("a[href]")
        ).map(anchor => ({
          url: (anchor as HTMLAnchorElement).href,
          rel: anchor.getAttribute("rel")
        }))
      })
    );

    throwIfAborted(signal);
    return result;
  }

  async scrollNearBottom(
    signal?: AbortSignal
  ): Promise<void> {
    throwIfAborted(signal);

    await this.page.evaluate(
      () => {
        const height = Math.max(
          document.body?.scrollHeight ?? 0,
          document.documentElement?.scrollHeight ?? 0
        );

        const target = Math.max(
          0,
          height - Math.max(1, window.innerHeight) * 0.1
        );

        window.scrollTo(0, target);
      }
    );

    throwIfAborted(signal);
  }

  async waitForSettle(
    signal?: AbortSignal
  ): Promise<void> {
    throwIfAborted(signal);
    await this.page.waitForTimeout(this.settleMs);
    throwIfAborted(signal);
  }

  async close(): Promise<void> {
    try {
      await this.context.close();
    }
    finally {
      if (this.browser.isConnected()) {
        await this.browser.close();
      }
    }
  }
}

export class PlaywrightRenderedListingRuntime
implements RenderedListingRuntime {
  private readonly headless: boolean;
  private readonly navigationTimeoutMs: number;
  private readonly settleMs: number;

  constructor(
    options: PlaywrightRenderedListingRuntimeOptions = {}
  ) {
    this.headless = options.headless ?? true;
    this.navigationTimeoutMs =
      options.navigationTimeoutMs ??
      DEFAULT_NAVIGATION_TIMEOUT_MS;
    this.settleMs =
      options.settleMs ??
      DEFAULT_SETTLE_MS;
  }

  async open(
    url: string,
    signal?: AbortSignal
  ): Promise<RenderedListingPageSession> {
    throwIfAborted(signal);

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: this.headless
    }) as BrowserLike;

    let context: BrowserContextLike | null = null;

    try {
      context = await browser.newContext({
        serviceWorkers: "block"
      });

      const page = await context.newPage();

      await page.goto(
        url,
        {
          waitUntil: "domcontentloaded",
          timeout: this.navigationTimeoutMs
        }
      );

      await ensureTsxPageEvaluateShim(page);
      await page.waitForTimeout(this.settleMs);
      throwIfAborted(signal);

      return new PlaywrightRenderedListingPageSession(
        browser,
        context,
        page,
        this.settleMs
      );
    }
    catch (error) {
      if (context !== null) {
        await context.close().catch(() => undefined);
      }

      if (browser.isConnected()) {
        await browser.close().catch(() => undefined);
      }

      throw error;
    }
  }
}

export class RenderedListingDiscovery {
  private readonly runtime: RenderedListingRuntime;

  constructor(
    runtime: RenderedListingRuntime =
      new PlaywrightRenderedListingRuntime()
  ) {
    this.runtime = runtime;
  }

  async discover(
    rootUrl: string,
    signal?: AbortSignal
  ): Promise<ListingDiscoveryResult> {
    throwIfAborted(signal);

    const normalizedRoot = normalizeUrl(rootUrl, rootUrl);

    if (normalizedRoot === null) {
      throw new Error("Rendered listing discovery requires an HTTP(S) root URL.");
    }

    const root = new URL(normalizedRoot);
    const rootSiteKey = siteKey(root);

    const urls: string[] = [];
    const seenUrls = new Set<string>();

    const queue: string[] = [normalizedRoot];
    const queuedPages = new Set<string>([normalizedRoot]);

    let passes = 0;

    while (
      queue.length > 0 &&
      passes < MAX_PASSES
    ) {
      throwIfAborted(signal);

      const pageUrl = queue.shift()!;
      const session = await this.runtime.open(pageUrl, signal);
      const nextPages: string[] = [];
      const nextPageSet = new Set<string>();

      let previousSignature: string | null = null;
      let stablePasses = 0;

      try {
        while (passes < MAX_PASSES) {
          throwIfAborted(signal);

          const state = await session.snapshot(signal);
          passes += 1;

          for (const candidate of state.links) {
            const normalized = normalizeUrl(
              candidate.url,
              pageUrl
            );

            if (normalized === null) {
              continue;
            }

            const parsed = new URL(normalized);

            if (siteKey(parsed) !== rootSiteKey) {
              continue;
            }

            if (hasNextRel(candidate.rel)) {
              if (
                normalized !== pageUrl &&
                !queuedPages.has(normalized) &&
                !nextPageSet.has(normalized)
              ) {
                nextPageSet.add(normalized);
                nextPages.push(normalized);
              }

              continue;
            }

            if (
              normalized === pageUrl ||
              seenUrls.has(normalized)
            ) {
              continue;
            }

            seenUrls.add(normalized);
            urls.push(normalized);
          }

          const signature = snapshotSignature(
            state,
            pageUrl
          );

          if (signature === previousSignature) {
            stablePasses += 1;
          }
          else {
            stablePasses = 0;
          }

          previousSignature = signature;

          if (
            stablePasses >= STABLE_PASSES_REQUIRED ||
            passes >= MAX_PASSES
          ) {
            break;
          }

          await session.scrollNearBottom(signal);
          await session.waitForSettle(signal);
        }
      }
      finally {
        await session.close();
      }

      for (const nextPage of nextPages) {
        if (queuedPages.has(nextPage)) {
          continue;
        }

        queuedPages.add(nextPage);
        queue.push(nextPage);
      }
    }

    return {
      urls,
      passes
    };
  }
}
