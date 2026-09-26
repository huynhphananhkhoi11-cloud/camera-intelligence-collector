import {
  mkdtemp,
  readFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Page } from "playwright";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import type {
  AdaptiveCaptureResult,
  AdaptiveScreenshot
} from "../../../src/v04/vision/adaptiveCapture.js";

const {
  captureAdaptiveVisualEvidence,
  captureVisualSnapshot
} =
  vi.hoisted(() => ({
    captureAdaptiveVisualEvidence: vi.fn(),
    captureVisualSnapshot: vi.fn()
  }));

vi.mock(
  "../../../src/v04/vision/adaptiveCapture.js",
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import("../../../src/v04/vision/adaptiveCapture.js")
      >();

    return {
      ...actual,
      captureAdaptiveVisualEvidence
    };
  }
);

vi.mock(
  "../../../src/v04/vision/visualStateFingerprint.js",
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import("../../../src/v04/vision/visualStateFingerprint.js")
      >();

    return {
      ...actual,
      captureVisualSnapshot
    };
  }
);

import {
  createVisualStateFingerprint
} from "../../../src/v04/vision/visualStateFingerprint.js";
import {
  DEFAULT_FINAL_HERO_SETTLE_MS,
  captureProductVisualPacket,
  isRecoverableProductCaptureNavigationError
} from "../../../src/v04/vision/productCapturePacket.js";

function fakePng(
  width: number,
  height: number,
  label: string
): Buffer {
  const bytes = Buffer.alloc(32 + Buffer.byteLength(label));
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a
  ]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.write(label, 32, "utf8");
  return bytes;
}

function shot(
  shotId: string,
  role: AdaptiveScreenshot["role"],
  label: string,
  scrollY: number,
  documentHeight = 4_000,
  width = 1_200,
  height = 900
): AdaptiveScreenshot {
  const bytes = fakePng(width, height, label);

  return {
    shotId,
    role,
    bytes,
    fingerprint:
      createVisualStateFingerprint(
        bytes,
        scrollY,
        documentHeight
      )
  };
}

function baseResult(
  screenshots: readonly AdaptiveScreenshot[]
): AdaptiveCaptureResult {
  return {
    screenshots,
    manifest: {
      schemaVersion: 1,
      url: "https://shop.test/item",
      finalUrl: "https://shop.test/item?loaded=1",
      captureTimestamp: "2026-09-22T00:00:00.000Z",
      shots:
        screenshots.map(screenshot => ({
          shotId: screenshot.shotId,
          role: screenshot.role,
          imageHash: screenshot.fingerprint.imageHash,
          scrollY: screenshot.fingerprint.scrollY,
          documentHeight: screenshot.fingerprint.documentHeight,
          path: null
        }))
    },
    manifestPath: null,
    imagePaths: []
  };
}

class FakePage {
  scrollY = 1_600;
  readonly waits: number[] = [];
  sharedHeroBytes = fakePng(1_200, 900, "late-hero");
  playwrightScreenshotCalls = 0;
  cdpSessionCalls = 0;
  currentUrl = "https://shop.test/item?loaded=1";
  readonly gotoCalls: Array<{
    readonly url: string;
    readonly options: unknown;
  }> = [];

  async goto(
    url: string,
    options?: unknown
  ): Promise<void> {
    this.currentUrl = url;
    this.gotoCalls.push({
      url,
      options
    });
  }

  async evaluate(
    callback: unknown,
    arg?: unknown
  ): Promise<unknown> {
    const source = String(callback);

    if (source.includes("scrollTo")) {
      this.scrollY =
        typeof arg === "number"
          ? arg
          : 0;
      return;
    }

    return {
      scrollY: this.scrollY,
      documentHeight: 4_000,
      viewportHeight: 900
    };
  }

  async waitForTimeout(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds);
  }

  async screenshot(): Promise<Buffer> {
    this.playwrightScreenshotCalls += 1;
    throw new Error(
      "known-broken Playwright screenshot path must not be retried by DEV4"
    );
  }

  url(): string {
    return this.currentUrl;
  }

  context() {
    return {
      newCDPSession: async () => {
        this.cdpSessionCalls += 1;
        throw new Error(
          "DEV4 must not own an independent CDP fallback"
        );
      }
    };
  }
}

function numberedShots(packet: Awaited<ReturnType<typeof captureProductVisualPacket>>) {
  return packet.screenshots as readonly (AdaptiveScreenshot & {
    readonly sequence: number;
    readonly pageZone: "HERO" | "UPPER" | "MIDDLE" | "LOWER" | "TAIL" | "FOOTER";
    readonly scrollY: number;
    readonly documentHeight: number;
    readonly dimensions: {
      readonly width: number;
      readonly height: number;
    };
    readonly contentHash: string;
    readonly path: string | null;
    readonly isAuthoritativeHero: boolean;
  })[];
}

describe(
  "V15 numbered product camera capture packet",
  () => {
    beforeEach(() => {
      captureAdaptiveVisualEvidence.mockReset();
      captureVisualSnapshot.mockReset();
      captureVisualSnapshot.mockImplementation(
        async (page: Page) => {
          const fake =
            page as unknown as FakePage;
          const bytes =
            Buffer.from(fake.sharedHeroBytes);

          return {
            bytes,
            fingerprint:
              createVisualStateFingerprint(
                bytes,
                fake.scrollY,
                4_000
              )
          };
        }
      );
    });

    it(
      "makes the refreshed final hero semantic screenshot 1 and freezes a detached packet",
      async () => {
        const initialHero =
          shot("hero-01", "hero", "initial-hero", 0);
        const viewport =
          shot("viewport-01", "viewport", "middle", 800);
        const interaction =
          shot("interaction-01", "interaction", "expanded", 1_600);

        captureAdaptiveVisualEvidence.mockResolvedValue(
          baseResult([
            initialHero,
            viewport,
            interaction
          ])
        );

        const page = new FakePage();

        const packet =
          await captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl: "https://shop.test/item",
              sequence: 7,
              itemId: "item-007"
            }
          );
        const screenshots = numberedShots(packet);

        expect(captureAdaptiveVisualEvidence).toHaveBeenCalledTimes(1);
        expect(captureVisualSnapshot).toHaveBeenCalledTimes(1);
        expect(captureVisualSnapshot).toHaveBeenCalledWith(page);
        expect(page.scrollY).toBe(0);
        expect(page.waits).toContain(DEFAULT_FINAL_HERO_SETTLE_MS);
        expect(packet.itemId).toBe("item-007");
        expect(packet.sequence).toBe(7);
        expect(packet.website).toBe("shop.test");
        expect(packet.pageUrl).toBe("https://shop.test/item");
        expect(packet.finalUrl).toBe("https://shop.test/item?loaded=1");
        expect(screenshots[0]).toMatchObject({
          sequence: 1,
          shotId: "01-hero-final",
          pageZone: "HERO",
          scrollY: 0,
          documentHeight: 4_000,
          dimensions: {
            width: 1_200,
            height: 900
          },
          isAuthoritativeHero: true
        });
        expect(screenshots[0]?.contentHash)
          .toBe(screenshots[0]?.fingerprint.imageHash);
        expect(screenshots[0]?.bytes)
          .toEqual(fakePng(1_200, 900, "late-hero"));
        expect(screenshots.some(item => item.shotId === "hero-01"))
          .toBe(false);
        expect(packet).not.toHaveProperty("page");
        expect(Object.isFrozen(packet)).toBe(true);
        expect(Object.isFrozen(packet.screenshots)).toBe(true);
        expect(Object.isFrozen(packet.manifest)).toBe(true);
        expect(Object.isFrozen(packet.manifest.shots)).toBe(true);
        expect(Object.isFrozen(screenshots[0]?.dimensions)).toBe(true);

        initialHero.bytes.fill(0);
        page.currentUrl = "https://shop.test/next";
        page.sharedHeroBytes.fill(0);
        expect(packet.finalUrl).toBe("https://shop.test/item?loaded=1");
        expect(screenshots[0]?.bytes)
          .toEqual(fakePng(1_200, 900, "late-hero"));
      }
    );

    it(
      "orders semantic screenshots top-to-bottom with contiguous structural numbering",
      async () => {
        captureAdaptiveVisualEvidence.mockResolvedValue(
          baseResult([
            shot("hero-stale", "hero", "stale", 0),
            shot("price-stock-bundle", "viewport", "lower", 2_000),
            shot("related-products", "viewport", "upper", 500),
            shot("rating-reviews", "interaction", "middle", 1_200),
            shot("tail-original", "viewport", "tail", 2_800),
            shot("footer-original", "viewport", "footer", 3_200)
          ])
        );

        const packet =
          await captureProductVisualPacket(
            new FakePage() as unknown as Page,
            {
              pageUrl: "https://shop.test/item",
              sequence: 8,
              itemId: "item-008"
            }
          );
        const screenshots = numberedShots(packet);

        expect(screenshots.map(item => item.sequence))
          .toEqual([1, 2, 3, 4, 5, 6]);
        expect(screenshots.map(item => item.shotId))
          .toEqual([
            "01-hero-final",
            "02-upper",
            "03-middle",
            "04-lower",
            "05-tail",
            "06-footer"
          ]);
        expect(screenshots.map(item => item.pageZone))
          .toEqual([
            "HERO",
            "UPPER",
            "MIDDLE",
            "LOWER",
            "TAIL",
            "FOOTER"
          ]);
        expect(screenshots.slice(1).map(item => item.scrollY))
          .toEqual([500, 1_200, 2_000, 2_800, 3_200]);
        expect(screenshots.some(item => item.shotId.includes("price")))
          .toBe(false);
        expect(screenshots.some(item => item.shotId.includes("stock")))
          .toBe(false);
        expect(screenshots.some(item => item.shotId.includes("bundle")))
          .toBe(false);
        expect(screenshots.some(item => item.shotId.includes("rating")))
          .toBe(false);
        expect(screenshots.some(item => item.shotId.includes("related")))
          .toBe(false);
      }
    );

    it(
      "dedupes stale/duplicate frames and keeps the accepted packet bound",
      async () => {
        const page = new FakePage();
        page.sharedHeroBytes = fakePng(1_200, 900, "same-hero");

        const base = [
          shot("hero-01", "hero", "same-hero", 0),
          shot("duplicate-hero-pixels", "viewport", "same-hero", 300),
          ...Array.from(
            { length: 12 },
            (_, index) =>
              shot(
                `viewport-${String(index + 1).padStart(2, "0")}`,
                "viewport",
                `state-${index + 1}`,
                (index + 1) * 250
              )
          )
        ];

        captureAdaptiveVisualEvidence.mockResolvedValue(
          baseResult(base)
        );

        const packet =
          await captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl: "https://shop.test/item",
              sequence: 1,
              itemId: "item-001"
            }
          );
        const screenshots = numberedShots(packet);

        expect(screenshots).toHaveLength(10);
        expect(screenshots[0]?.shotId).toBe("01-hero-final");
        expect(
          screenshots.filter(
            item =>
              item.contentHash ===
              screenshots[0]?.contentHash
          )
        ).toHaveLength(1);
        expect(screenshots.map(item => item.sequence))
          .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
    );

    it(
      "uses only the accepted shared reliability primitive for the final hero",
      async () => {
        captureAdaptiveVisualEvidence.mockResolvedValue(
          baseResult([
            shot("hero-01", "hero", "initial", 0)
          ])
        );

        const page = new FakePage();
        page.sharedHeroBytes = fakePng(1_200, 900, "shared-reliable-hero");

        const packet =
          await captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl: "https://shop.test/item",
              sequence: 2,
              itemId: "item-002"
            }
          );

        expect(captureVisualSnapshot).toHaveBeenCalledTimes(1);
        expect(captureVisualSnapshot).toHaveBeenCalledWith(page);
        expect(page.playwrightScreenshotCalls).toBe(0);
        expect(page.cdpSessionCalls).toBe(0);
        expect(numberedShots(packet)[0]?.bytes)
          .toEqual(fakePng(1_200, 900, "shared-reliable-hero"));
      }
    );

    it(
      "persists numbered structural metadata and original screenshot bytes",
      async () => {
        const upper =
          shot("viewport-01", "viewport", "upper", 700, 4_000, 1_000, 700);

        captureAdaptiveVisualEvidence.mockResolvedValue(
          baseResult([
            shot("hero-01", "hero", "initial", 0),
            upper
          ])
        );

        const page = new FakePage();
        const outputDir =
          await mkdtemp(
            join(tmpdir(), "dev4-v15-numbered-packet-")
          );

        const packet =
          await captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl: "https://shop.test/item",
              sequence: 3,
              itemId: "item-003",
              outputDir
            }
          );
        const screenshots = numberedShots(packet);

        expect(packet.manifestPath).toBe(
          join(outputDir, "capture_manifest.json")
        );
        expect(packet.imagePaths).toHaveLength(screenshots.length);
        expect(screenshots[0]?.path).toBe("01-hero-final.png");
        expect(screenshots[1]?.path).toBe("02-upper.png");
        expect(screenshots[1]?.dimensions).toEqual({
          width: 1_000,
          height: 700
        });
        expect(
          await readFile(
            join(outputDir, "02-upper.png")
          )
        ).toEqual(upper.bytes);

        const persisted =
          JSON.parse(
            await readFile(
              packet.manifestPath!,
              "utf8"
            )
          );

        expect(persisted.finalUrl).toBe(packet.finalUrl);
        expect(persisted.shots).toHaveLength(screenshots.length);
        expect(persisted.shots[0]).toMatchObject({
          sequence: 1,
          shotId: "01-hero-final",
          pageZone: "HERO",
          scrollY: 0,
          documentHeight: 4_000,
          dimensions: {
            width: 1_200,
            height: 900
          },
          contentHash: screenshots[0]?.contentHash,
          path: "01-hero-final.png",
          isAuthoritativeHero: true
        });
        expect(persisted.shots[1]).toMatchObject({
          sequence: 2,
          shotId: "02-upper",
          pageZone: "UPPER",
          scrollY: 700,
          documentHeight: 4_000,
          dimensions: {
            width: 1_000,
            height: 700
          },
          contentHash: screenshots[1]?.contentHash,
          path: "02-upper.png",
          isAuthoritativeHero: false
        });
      }
    );

    it(
      "retries one transient navigation-race capture from a clean page with an extended navigation timeout",
      async () => {
        captureAdaptiveVisualEvidence
          .mockRejectedValueOnce(
            new Error(
              "page.evaluate: Execution context was destroyed, most likely because of a navigation"
            )
          )
          .mockResolvedValueOnce(
            baseResult([
              shot("hero-01", "hero", "retry-success", 0)
            ])
          );

        const page =
          new FakePage();

        const packet =
          await captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl:
                "https://shop.test/item",
              sequence:
                0,
              itemId:
                "item-001"
            }
          );

        expect(
          captureAdaptiveVisualEvidence
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          page.gotoCalls
        ).toEqual([
          expect.objectContaining({
            url:
              "about:blank"
          })
        ]);

        expect(
          captureAdaptiveVisualEvidence.mock.calls[1]?.[1]
        ).toMatchObject({
          url:
            "https://shop.test/item",
          navigationTimeoutMs:
            40_000
        });

        expect(
          packet.screenshots
        ).toHaveLength(
          1
        );
      }
    );


    it(
      "retries one page.goto timeout but does not retry unrelated capture failures",
      async () => {
        expect(
          isRecoverableProductCaptureNavigationError(
            new Error(
              "page.goto: Timeout 20000ms exceeded."
            )
          )
        ).toBe(
          true
        );

        expect(
          isRecoverableProductCaptureNavigationError(
            new Error(
              "capture artifact write permission denied"
            )
          )
        ).toBe(
          false
        );

        captureAdaptiveVisualEvidence.mockRejectedValue(
          new Error(
            "capture artifact write permission denied"
          )
        );

        const page =
          new FakePage();

        await expect(
          captureProductVisualPacket(
            page as unknown as Page,
            {
              pageUrl:
                "https://shop.test/item",
              sequence:
                1,
              itemId:
                "item-002"
            }
          )
        ).rejects.toThrow(
          "capture artifact write permission denied"
        );

        expect(
          captureAdaptiveVisualEvidence
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          page.gotoCalls
        ).toHaveLength(
          0
        );
      }
    );

  }
);
