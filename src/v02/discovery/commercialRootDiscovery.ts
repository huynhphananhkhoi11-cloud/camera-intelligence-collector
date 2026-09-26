import {
  chromium,
  type BrowserContext
} from "playwright";

import type {
  SiteBootstrapResult
} from "./siteBootstrapper.js";

import {
  buildRootCandidates,
  type RootCandidate,
  type RootEvidence
} from "./commercialRootCandidate.js";

import {
  probeCommercialRootHtml,
  type CommercialRootProbeResult
} from "./commercialRootProbe.js";

import {
  attachNetworkObserver
} from "../network/networkObserver.js";


export interface ProbedRootCandidate
  extends RootCandidate {

  initialScore:
    number;

  probe:
    CommercialRootProbeResult;
}


export interface CommercialRootError {
  url:
    string;

  error:
    string;
}


export interface CommercialRootDiscoveryResult {
  candidates:
    RootCandidate[];

  probed:
    ProbedRootCandidate[];

  roots:
    ProbedRootCandidate[];

  errors:
    CommercialRootError[];
}


export interface CommercialRootDiscoveryOptions {
  headless?: boolean;

  maxCandidates?: number;

  minimumInitialScore?: number;

  minimumRootScore?: number;

  navigationTimeoutMs?: number;

  settleTimeoutMs?: number;

  candidateTimeoutMs?: number;

  observerStopTimeoutMs?: number;

  onProgress?: (
    current: number,
    total: number,
    url: string
  ) => void;
}


async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {

  let timer:
    ReturnType<
      typeof setTimeout
    > | undefined;


  const timeout =
    new Promise<never>(
      (
        _,
        reject
      ) => {

        timer =
          setTimeout(
            () => {

              reject(
                new Error(
                  `${label} timed out after ${timeoutMs}ms`
                )
              );
            },
            timeoutMs
          );
      }
    );


  try {

    return await Promise.race([
      promise,
      timeout
    ]);
  }
  finally {

    if (
      timer !==
      undefined
    ) {

      clearTimeout(
        timer
      );
    }
  }
}


function mergeEvidence(
  root:
    readonly RootEvidence[],
  probe:
    CommercialRootProbeResult
): RootEvidence[] {

  const probeEvidence:
    RootEvidence[] =
    probe.evidence.map(
      evidence => ({
        kind:
          "PROBE",

        weight:
          evidence.weight,

        detail:
          `${evidence.kind}: ${evidence.detail}`
      })
    );


  return [
    ...root,
    ...probeEvidence
  ];
}


/**
 * Live probe evidence is stronger than
 * URL/menu hints, but initial provenance
 * remains visible.
 */
export function mergeCandidateAndProbe(
  candidate:
    RootCandidate,
  probe:
    CommercialRootProbeResult
): ProbedRootCandidate {

  const probeContribution =
    Math.round(
      probe.score *
      0.7
    );


  return {
    ...candidate,

    initialScore:
      candidate.score,

    score:
      Math.min(
        100,
        candidate.score +
        probeContribution
      ),

    evidence:
      mergeEvidence(
        candidate.evidence,
        probe
      ),

    probe
  };
}


export function selectCommercialRoots(
  candidates:
    readonly ProbedRootCandidate[],
  minimumRootScore =
    45
): ProbedRootCandidate[] {

  return candidates
    .filter(
      candidate =>
        candidate.score >=
        minimumRootScore
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    );
}


interface ProbeOneOptions {
  navigationTimeoutMs:
    number;

  settleTimeoutMs:
    number;

  candidateTimeoutMs:
    number;

  observerStopTimeoutMs:
    number;
}


/**
 * Probe ONE root candidate with a fresh page.
 *
 * The whole candidate has a hard timeout.
 * A hung response body therefore cannot block
 * root discovery forever.
 */
async function probeOneCandidate(
  context:
    BrowserContext,
  candidate:
    RootCandidate,
  options:
    ProbeOneOptions
): Promise<ProbedRootCandidate> {

  const page =
    await context.newPage();


  const observer =
    attachNetworkObserver(
      page,
      {
        maxBodyBytes:
          512 * 1024,

        maxResponseBodies:
          25,

        maxRecordedEvents:
          500
      }
    );


  const work =
    async (): Promise<
      ProbedRootCandidate
    > => {

      await page.goto(
        candidate.url,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            options
              .navigationTimeoutMs
        }
      );


      if (
        options.settleTimeoutMs >
        0
      ) {

        try {

          await page.waitForLoadState(
            "networkidle",
            {
              timeout:
                options
                  .settleTimeoutMs
            }
          );
        }
        catch {
          /*
           * Analytics/polling/websocket can
           * prevent networkidle.
           *
           * This is not fatal.
           */
        }
      }


      const html =
        await page.content();


      /*
       * NetworkObserver may still have async
       * response-body reads.
       *
       * Do not let those block root discovery.
       */
      let network =
        observer.snapshot();


      try {

        network =
          await withTimeout(
            observer.stop(),
            options
              .observerStopTimeoutMs,
            "network observer stop"
          );
      }
      catch {

        network =
          observer.snapshot();
      }


      const probe =
        probeCommercialRootHtml(
          html,
          page.url(),
          network
        );


      return mergeCandidateAndProbe(
        candidate,
        probe
      );
    };


  try {

    return await withTimeout(
      work(),
      options.candidateTimeoutMs,
      `root probe ${candidate.url}`
    );
  }
  finally {

    /*
     * Closing the page cancels leftover page
     * network work from this candidate.
     */
    await page.close({
      runBeforeUnload:
        false
    })
      .catch(
        () => undefined
      );


    /*
     * Do not await indefinitely here.
     *
     * observer.stop() removes listeners before
     * its internal async flush.
     */
    void observer.stop()
      .catch(
        () => undefined
      );
  }
}


export async function discoverCommercialRootsLive(
  bootstrap:
    SiteBootstrapResult,
  options:
    CommercialRootDiscoveryOptions = {}
): Promise<CommercialRootDiscoveryResult> {

  const maxCandidates =
    Math.max(
      1,
      options.maxCandidates ??
      4
    );


  const minimumInitialScore =
    options.minimumInitialScore ??
    20;


  const minimumRootScore =
    options.minimumRootScore ??
    45;


  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    10000;


  const settleTimeoutMs =
    options.settleTimeoutMs ??
    750;


  const candidateTimeoutMs =
    options.candidateTimeoutMs ??
    15000;


  const observerStopTimeoutMs =
    options.observerStopTimeoutMs ??
    1500;


  const candidates =
    buildRootCandidates(
      bootstrap
    );


  const queue =
    candidates
      .filter(
        candidate =>
          candidate.score >=
          minimumInitialScore
      )
      .slice(
        0,
        maxCandidates
      );


  const browser =
    await chromium.launch({
      headless:
        options.headless ??
        true
    });


  const context =
    await browser.newContext();


  const probed:
    ProbedRootCandidate[] = [];


  const errors:
    CommercialRootError[] = [];


  try {

    for (
      const [
        index,
        candidate
      ]
      of queue.entries()
    ) {

      options.onProgress?.(
        index + 1,
        queue.length,
        candidate.url
      );


      try {

        const result =
          await probeOneCandidate(
            context,
            candidate,
            {
              navigationTimeoutMs,
              settleTimeoutMs,
              candidateTimeoutMs,
              observerStopTimeoutMs
            }
          );


        probed.push(
          result
        );
      }
      catch (
        error
      ) {

        errors.push({
          url:
            candidate.url,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error
                )
        });
      }
    }
  }
  finally {

    await withTimeout(
      context.close(),
      5000,
      "browser context close"
    )
      .catch(
        () => undefined
      );


    await withTimeout(
      browser.close(),
      5000,
      "browser close"
    )
      .catch(
        () => undefined
      );
  }


  probed.sort(
    (a, b) =>
      b.score -
      a.score
  );


  return {
    candidates,

    probed,

    roots:
      selectCommercialRoots(
        probed,
        minimumRootScore
      ),

    errors
  };
}