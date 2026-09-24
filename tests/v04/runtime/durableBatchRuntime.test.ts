import {
  createHash
} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  writeFile
} from "node:fs/promises";
import {
  join
} from "node:path";
import {
  tmpdir
} from "node:os";

import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import type {
  Camera13Row,
  MinimalVisualDecision
} from "../../../src/v04/contracts/minimalVisualDecision.js";
import {
  runDurableBatch,
  type DurableWorkbookSink,
  type SemanticRequest
} from "../../../src/v04/runtime/durableBatchRuntime.js";
import {
  toResolvedProviderProfile,
  type ResolvedProviderProfile
} from "../../../src/v03/provider/providerProfile.js";
import {
  AtomicRunStateStore
} from "../../../src/v03/state/atomicRunStateStore.js";
import {
  createRunState
} from "../../../src/v03/state/runState.js";


function cameraRow(
  url: string,
  name = "Canon EOS R5"
): Camera13Row {
  return {
    website: "model.invalid",
    productName: name,
    condition: "NEW",
    specs: [
      "45 MP"
    ],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: 4.8,
    reviewCount: 20,
    stock: "In stock",
    salePrice: {
      value: 1000,
      currency: "USD"
    },
    url
  };
}


function cameraDecision(
  url: string,
  name?: string
): MinimalVisualDecision {
  return {
    classification: "CAMERA_PRODUCT",
    row: cameraRow(
      url,
      name
    )
  };
}


function nonCameraDecision(): MinimalVisualDecision {
  return {
    classification: "NON_CAMERA",
    row: null
  };
}


function provider(
  id: string,
  projectId = id
): ResolvedProviderProfile {
  return toResolvedProviderProfile({
    id,
    label: id.toUpperCase(),
    projectId,
    authKey: "fake-key-" + id
  });
}


function hashUrls(
  urls: readonly string[]
): string {
  return createHash("sha256")
    .update(
      urls.join("\n")
    )
    .digest("hex");
}


async function tempRun(
  name: string
): Promise<{
  readonly root: string;
  readonly statePath: string;
}> {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "v04-runtime-" + name + "-"
      )
    );

  return {
    root,
    statePath:
      join(
        root,
        "run-state.json"
      )
  };
}


function workbookSink(): {
  readonly sink: DurableWorkbookSink;
  readonly writes: Camera13Row[][];
} {
  const writes:
    Camera13Row[][] = [];

  return {
    writes,
    sink: {
      async replaceRows(
        rows
      ): Promise<void> {
        writes.push(
          rows.map(
            row => ({
              ...row,
              specs: [...row.specs],
              accessoriesIncluded:
                row.accessoriesIncluded
                  ? [...row.accessoriesIncluded]
                  : null,
              bundleIncluded:
                row.bundleIncluded
                  ? [...row.bundleIncluded]
                  : null
            })
          )
        );
      }
    }
  };
}


async function fakeRequest(
  root: string,
  index: number,
  url: string,
  execute: SemanticRequest["execute"]
): Promise<SemanticRequest> {
  const captureManifestPath =
    join(
      root,
      "capture-" +
      index +
      ".json"
    );

  const requestPayloadPath =
    join(
      root,
      "request-" +
      index +
      ".json"
    );

  await Promise.all([
    writeFile(
      captureManifestPath,
      "{}\n",
      "utf8"
    ),
    writeFile(
      requestPayloadPath,
      "{}\n",
      "utf8"
    )
  ]);

  return {
    authoritativeUrl: url,
    captureManifestPath,
    requestPayloadPath,
    execute
  };
}


describe(
  "V04 durable batch runtime",
  () => {
    test(
      "creates exactly one semantic request per product and writes one validated row",
      async () => {
        const run =
          await tempRun(
            "one-call"
          );

        const workbook =
          workbookSink();

        const createSemanticRequest =
          vi.fn(
            async ({ index, url }: { readonly index: number; readonly url: string }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () =>
                  cameraDecision(
                    url
                  )
              )
          );

        const result =
          await runDurableBatch({
            runId: "one-call",
            urls: [
              "https://shop.example/camera/canon-r5"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest,
            workbookSink:
              workbook.sink
          });

        expect(
          createSemanticRequest
        ).toHaveBeenCalledTimes(1);

        expect(
          result.summary
        ).toEqual({
          total: 1,
          validated: 1,
          review: 0,
          skippedNonCamera: 0,
          errors: 0
        });

        expect(
          workbook.writes
        ).toHaveLength(1);

        expect(
          workbook.writes[0]
        ).toHaveLength(1);

        expect(
          workbook.writes[0]?.[0]
        ).toMatchObject({
          website: "shop.example",
          url: "https://shop.example/camera/canon-r5"
        });
      }
    );


    test(
      "emits live progress across capture, Gemini and commit stages",
      async () => {
        const run =
          await tempRun(
            "progress"
          );

        const workbook =
          workbookSink();

        const events:
          string[] = [];

        await runDurableBatch({
          runId: "progress",
          urls: [
            "https://shop.example/camera/progress"
          ],
          statePath:
            run.statePath,
          providers: [
            provider("p1")
          ],
          createSemanticRequest:
            async ({ index, url }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () =>
                  cameraDecision(
                    url
                  )
              ),
          workbookSink:
            workbook.sink,
          onProgress:
            event => {
              events.push(
                event.type
              );
            }
        });

        expect(
          events
        ).toEqual([
          "ITEM_START",
          "CAPTURE_START",
          "CAPTURED",
          "GEMINI_ATTEMPT",
          "ITEM_DONE"
        ]);
      }
    );


    test(
      "emits progress stages around capture, Gemini, and commit",
      async () => {
        const run =
          await tempRun(
            "progress-events"
          );

        const workbook =
          workbookSink();

        const events: string[] = [];

        const result =
          await runDurableBatch({
            runId: "progress-events",
            urls: [
              "https://shop.example/camera/progress"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              async ({ index, url }) =>
                fakeRequest(
                  run.root,
                  index,
                  url,
                  async () =>
                    cameraDecision(
                      url
                    )
                ),
            workbookSink:
              workbook.sink,
            onProgress:
              event => {
                events.push(
                  event.type
                );
              }
          });

        expect(
          result.summary.validated
        ).toBe(1);

        expect(
          events
        ).toEqual([
          "ITEM_START",
          "CAPTURE_START",
          "CAPTURED",
          "GEMINI_ATTEMPT",
          "ITEM_DONE"
        ]);
      }
    );


    test(
      "persists capture and first attempt metadata before provider execution",
      async () => {
        const run =
          await tempRun(
            "checkpoint-before-execute"
          );

        const url =
          "https://shop.example/camera/checkpoint";

        const captureManifestPath =
          join(
            run.root,
            "capture-before-execute.json"
          );

        const requestPayloadPath =
          join(
            run.root,
            "request-before-execute.json"
          );

        await Promise.all([
          writeFile(
            captureManifestPath,
            "{}\n",
            "utf8"
          ),
          writeFile(
            requestPayloadPath,
            "{}\n",
            "utf8"
          )
        ]);

        await runDurableBatch({
          runId:
            "checkpoint-before-execute",
          urls: [url],
          statePath:
            run.statePath,
          providers: [
            provider("p1")
          ],
          createSemanticRequest:
            async () => ({
              authoritativeUrl:
                url,
              captureManifestPath,
              requestPayloadPath,
              execute:
                async () => {
                  const state =
                    await new AtomicRunStateStore(
                      run.statePath
                    ).load();

                  expect(
                    state.items[0]
                      ?.captureManifestPath
                  ).toBe(
                    captureManifestPath
                  );

                  expect(
                    state.items[0]
                      ?.requestPayloadPath
                  ).toBe(
                    requestPayloadPath
                  );

                  expect(
                    state.items[0]
                      ?.status
                  ).toBe(
                    "AI_IN_FLIGHT"
                  );

                  expect(
                    state.items[0]
                      ?.providerProfileId
                  ).toBe("p1");

                  expect(
                    state.items[0]
                      ?.attempts
                  ).toBe(1);

                  return cameraDecision(
                    url
                  );
                }
            }),
          workbookSink:
            workbookSink().sink
        });
      }
    );


    test(
      "transport retry reuses one semantic interpretation request",
      async () => {
        const run =
          await tempRun(
            "retry"
          );

        const workbook =
          workbookSink();

        let providerAttempts = 0;

        const createSemanticRequest =
          vi.fn(
            async ({ index, url }: { readonly index: number; readonly url: string }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () => {
                  providerAttempts += 1;

                  if (
                    providerAttempts === 1
                  ) {
                    throw Object.assign(
                      new Error(
                        "service unavailable"
                      ),
                      {
                        status: 503
                      }
                    );
                  }

                  return cameraDecision(
                    url
                  );
                }
              )
          );

        const result =
          await runDurableBatch({
            runId: "retry",
            urls: [
              "https://shop.example/camera/sony-a7"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest,
            workbookSink:
              workbook.sink,
            sleep:
              async () => undefined
          });

        expect(
          createSemanticRequest
        ).toHaveBeenCalledTimes(1);

        expect(
          providerAttempts
        ).toBe(2);

        expect(
          result.summary.validated
        ).toBe(1);

        const state =
          await new AtomicRunStateStore(
            run.statePath
          ).load();

        expect(
          state.items[0]?.attempts
        ).toBe(2);

        expect(
          state.items[0]?.status
        ).toBe("COMMITTED");
      }
    );


    test(
      "failed provider attempt keeps capture request provider and nonzero attempts durable",
      async () => {
        const run =
          await tempRun(
            "failed-attempt-durable"
          );

        const url =
          "https://shop.example/camera/fails";

        const result =
          await runDurableBatch({
            runId:
              "failed-attempt-durable",
            urls: [url],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              async ({ index }) =>
                fakeRequest(
                  run.root,
                  index,
                  url,
                  async () => {
                    throw new Error(
                      "structured output malformed"
                    );
                  }
                ),
            workbookSink:
              workbookSink().sink
          });

        expect(
          result.summary.errors
        ).toBe(1);

        const state =
          await new AtomicRunStateStore(
            run.statePath
          ).load();

        expect(
          state.items[0]
            ?.status
        ).toBe(
          "AI_IN_FLIGHT"
        );

        expect(
          state.items[0]
            ?.attempts
        ).toBeGreaterThan(0);

        expect(
          state.items[0]
            ?.providerProfileId
        ).toBe("p1");

        expect(
          state.items[0]
            ?.errorClass
        ).toBe(
          "SCHEMA_FORMAT"
        );

        expect(
          state.items[0]
            ?.captureManifestPath
        ).toBe(
          join(
            run.root,
            "capture-0.json"
          )
        );

        expect(
          state.items[0]
            ?.requestPayloadPath
        ).toBe(
          join(
            run.root,
            "request-0.json"
          )
        );
      }
    );


    test(
      "rate limit backs off and retries the same semantic request once",
      async () => {
        const run =
          await tempRun(
            "rate-limit"
          );

        const workbook =
          workbookSink();

        const sleeps: number[] = [];
        let providerAttempts = 0;

        const factory =
          vi.fn(
            async ({ index, url }: { readonly index: number; readonly url: string }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () => {
                  providerAttempts += 1;

                  if (
                    providerAttempts === 1
                  ) {
                    throw Object.assign(
                      new Error(
                        "rate limit exceeded"
                      ),
                      {
                        status: 429
                      }
                    );
                  }

                  return cameraDecision(
                    url
                  );
                }
              )
          );

        const result =
          await runDurableBatch({
            runId: "rate-limit",
            urls: [
              "https://shop.example/camera/panasonic-s5"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              factory,
            workbookSink:
              workbook.sink,
            sleep:
              async ms => {
                sleeps.push(ms);
              },
            now:
              () =>
                new Date(
                  "2026-09-21T00:00:00.000Z"
                )
          });

        expect(
          factory
        ).toHaveBeenCalledTimes(1);

        expect(
          providerAttempts
        ).toBe(2);

        expect(
          sleeps
        ).toEqual([
          1_000
        ]);

        expect(
          result.summary.validated
        ).toBe(1);

        expect(
          result.providerState[0]
            ?.health
        ).toBe("HEALTHY");
      }
    );


    test(
      "decision sidecar without capture checkpoint fails closed and never becomes captureManifestPath",
      async () => {
        const run =
          await tempRun(
            "sidecar-no-capture"
          );

        const url =
          "https://shop.example/camera/crash-window";

        const state =
          createRunState({
            runId:
              "sidecar-no-capture",
            inputHash:
              hashUrls([url]),
            urls: [url]
          });

        await new AtomicRunStateStore(
          run.statePath
        ).save(state);

        const decisionRoot =
          join(
            run.root,
            "v04-decisions"
          );

        await mkdir(
          decisionRoot,
          {
            recursive: true
          }
        );

        const decisionPath =
          join(
            decisionRoot,
            "0001.decision.json"
          );

        await writeFile(
          decisionPath,
          JSON.stringify(
            cameraDecision(
              url
            )
          ) +
          "\n",
          "utf8"
        );

        const factory =
          vi.fn(
            async () => {
              throw new Error(
                "fail-closed recovery must not create a new request"
              );
            }
          );

        const result =
          await runDurableBatch({
            runId:
              "sidecar-no-capture",
            urls: [url],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              factory,
            workbookSink:
              workbookSink().sink
          });

        expect(
          factory
        ).not.toHaveBeenCalled();

        expect(
          result.summary.errors
        ).toBe(1);

        expect(
          result.itemErrors[0]
            ?.errorClass
        ).toBe(
          "MISSING_CAPTURE_CHECKPOINT"
        );

        const resumedState =
          await new AtomicRunStateStore(
            run.statePath
          ).load();

        expect(
          resumedState.items[0]
            ?.captureManifestPath
        ).toBeNull();

        expect(
          resumedState.items[0]
            ?.captureManifestPath
        ).not.toBe(
          decisionPath
        );
      }
    );


    test(
      "resume skips a completed item and rebuilds workbook without duplicate row",
      async () => {
        const run =
          await tempRun(
            "resume"
          );

        const firstWorkbook =
          workbookSink();

        const firstFactory =
          vi.fn(
            async ({ index, url }: { readonly index: number; readonly url: string }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () =>
                  cameraDecision(
                    url
                  )
              )
          );

        await runDurableBatch({
          runId: "resume",
          urls: [
            "https://shop.example/camera/fuji-x100"
          ],
          statePath:
            run.statePath,
          providers: [
            provider("p1")
          ],
          createSemanticRequest:
            firstFactory,
          workbookSink:
            firstWorkbook.sink
        });

        const resumedWorkbook =
          workbookSink();

        const resumedFactory =
          vi.fn(
            async () => {
              throw new Error(
                "resume must not create a new semantic request"
              );
            }
          );

        const result =
          await runDurableBatch({
            runId: "resume",
            urls: [
              "https://shop.example/camera/fuji-x100"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              resumedFactory,
            workbookSink:
              resumedWorkbook.sink
          });

        expect(
          firstFactory
        ).toHaveBeenCalledTimes(1);

        expect(
          resumedFactory
        ).not.toHaveBeenCalled();

        expect(
          result.summary.validated
        ).toBe(1);

        expect(
          resumedWorkbook.writes
        ).toHaveLength(1);

        expect(
          resumedWorkbook.writes[0]
        ).toHaveLength(1);
      }
    );


    test(
      "uses Dev4 structural validator as the status authority for malformed camera rows",
      async () => {
        const run =
          await tempRun(
            "validator-authority"
          );

        const workbook =
          workbookSink();

        const url =
          "https://shop.example/camera/malformed";

        const malformedDecision =
          {
            classification:
              "CAMERA_PRODUCT",
            row: {
              ...cameraRow(url),
              specs:
                "not-an-array"
            }
          } as unknown as MinimalVisualDecision;

        const result =
          await runDurableBatch({
            runId:
              "validator-authority",
            urls: [url],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              async ({ index }) =>
                fakeRequest(
                  run.root,
                  index,
                  url,
                  async () =>
                    malformedDecision
                ),
            workbookSink:
              workbook.sink
          });

        expect(
          result.summary
        ).toEqual({
          total: 1,
          validated: 0,
          review: 1,
          skippedNonCamera: 0,
          errors: 0
        });

        expect(
          workbook.writes[0]
        ).toEqual([]);

        const state =
          await new AtomicRunStateStore(
            run.statePath
          ).load();

        expect(
          state.items[0]
            ?.status
        ).toBe("REVIEW");
      }
    );


    test(
      "NON_CAMERA increments skippedNonCamera and never writes a workbook row",
      async () => {
        const run =
          await tempRun(
            "non-camera"
          );

        const workbook =
          workbookSink();

        const result =
          await runDurableBatch({
            runId: "non-camera",
            urls: [
              "https://shop.example/lens/50mm"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              async ({ index, url }: { readonly index: number; readonly url: string }) =>
                fakeRequest(
                  run.root,
                  index,
                  url,
                  async () =>
                    nonCameraDecision()
                ),
            workbookSink:
              workbook.sink
          });

        expect(
          result.summary
        ).toEqual({
          total: 1,
          validated: 0,
          review: 0,
          skippedNonCamera: 1,
          errors: 0
        });

        expect(
          workbook.writes[0]
        ).toEqual([]);
      }
    );


    test(
      "isolates item errors so the next product can still validate",
      async () => {
        const run =
          await tempRun(
            "isolation"
          );

        const workbook =
          workbookSink();

        const result =
          await runDurableBatch({
            runId: "isolation",
            urls: [
              "https://shop.example/camera/broken",
              "https://shop.example/camera/good"
            ],
            statePath:
              run.statePath,
            providers: [
              provider("p1")
            ],
            createSemanticRequest:
              async ({ index, url }: { readonly index: number; readonly url: string }) =>
                fakeRequest(
                  run.root,
                  index,
                  url,
                  async () => {
                    if (
                      index === 0
                    ) {
                      throw new Error(
                        "structured output malformed"
                      );
                    }

                    return cameraDecision(
                      url,
                      "Nikon Z8"
                    );
                  }
                ),
            workbookSink:
              workbook.sink
          });

        expect(
          result.summary
        ).toEqual({
          total: 2,
          validated: 1,
          review: 0,
          skippedNonCamera: 0,
          errors: 1
        });

        expect(
          result.itemErrors[0]
            ?.index
        ).toBe(0);

        expect(
          workbook.writes[0]
        ).toHaveLength(1);

        expect(
          workbook.writes[0]?.[0]
            ?.productName
        ).toBe("Nikon Z8");
      }
    );


    test(
      "daily quota pauses later AI work and preserves V3 project cooldown state",
      async () => {
        const run =
          await tempRun(
            "quota"
          );

        const workbook =
          workbookSink();

        const factory =
          vi.fn(
            async ({ index, url }: { readonly index: number; readonly url: string }) =>
              fakeRequest(
                run.root,
                index,
                url,
                async () => {
                  throw Object.assign(
                    new Error(
                      "daily quota exceeded"
                    ),
                    {
                      status: 429
                    }
                  );
                }
              )
          );

        const result =
          await runDurableBatch({
            runId: "quota",
            urls: [
              "https://shop.example/camera/one",
              "https://shop.example/camera/two"
            ],
            statePath:
              run.statePath,
            providers: [
              provider(
                "p1",
                "shared-project"
              ),
              provider(
                "p2",
                "shared-project"
              )
            ],
            createSemanticRequest:
              factory,
            workbookSink:
              workbook.sink
          });

        expect(
          result.pausedForQuota
        ).toBe(true);

        expect(
          factory
        ).toHaveBeenCalledTimes(1);

        expect(
          result.summary.errors
        ).toBe(1);

        expect(
          result.providerState.map(
            item =>
              item.health
          )
        ).toEqual([
          "COOLDOWN",
          "COOLDOWN"
        ]);

        expect(
          result.providerState.map(
            item =>
              item.cooldownReason
          )
        ).toEqual([
          "DAILY_QUOTA",
          "DAILY_QUOTA"
        ]);
      }
    );
  }
);
