import {
  chromium
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
}


function mergeEvidence(
  root:
    RootEvidence[],
  probe:
    CommercialRootProbeResult
): RootEvidence[] {

  return [
    ...root,

    ...probe.evidence.map<RootEvidence>(
      evidence => ({
        kind:
          "PROBE",

        weight:
          evidence.weight,

        detail:
          `${evidence.kind}: ${evidence.detail}`
      })
    )
  ];
}


/**
 * Combine seed evidence and live probe score.
 *
 * Probe evidence is deliberately stronger than
 * URL/menu hints but initial provenance remains.
 */
export function mergeCandidateAndProbe(
  candidate:
    RootCandidate,
  probe:
    CommercialRootProbeResult
): ProbedRootCandidate {

  const combinedScore =
    Math.min(
      100,

      candidate.score +
      Math.round(
        probe.score *
        0.7
      )
    );


  return {
    ...candidate,

    initialScore:
      candidate.score,

    score:
      combinedScore,

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


export async function discoverCommercialRootsLive(
  bootstrap:
    SiteBootstrapResult,
  options:
    CommercialRootDiscoveryOptions = {}
): Promise<CommercialRootDiscoveryResult> {

  const maxCandidates =
    options.maxCandidates ??
    8;

  const minimumInitialScore =
    options.minimumInitialScore ??
    20;

  const minimumRootScore =
    options.minimumRootScore ??
    45;

  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    30000;

  const settleTimeoutMs =
    options.settleTimeoutMs ??
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

  const page =
    await context.newPage();


  const probed:
    ProbedRootCandidate[] = [];

  const errors:
    CommercialRootError[] = [];


  try {

    for (
      const candidate
      of queue
    ) {

      /*
       * Attach observer before each candidate
       * navigation.
       */
      const observer =
        attachNetworkObserver(
          page
        );


      try {

        await page.goto(
          candidate.url,
          {
            waitUntil:
              "domcontentloaded",

            timeout:
              navigationTimeoutMs
          }
        );


        if (
          settleTimeoutMs >
          0
        ) {

          try {

            await page.waitForLoadState(
              "networkidle",
              {
                timeout:
                  settleTimeoutMs
              }
            );
          }
          catch {
            // Polling/analytics may prevent networkidle.
          }
        }


        const html =
          await page.content();


        const network =
          await observer.stop();


        const probe =
          probeCommercialRootHtml(
            html,
            page.url(),
            network
          );


        probed.push(
          mergeCandidateAndProbe(
            candidate,
            probe
          )
        );
      }
      catch (
        error
      ) {

        try {
          await observer.stop();
        }
        catch {
          // Preserve original error.
        }


        errors.push({
          url:
            candidate.url,

          error:
            String(
              error
            )
        });
      }
    }
  }
  finally {

    await context.close()
      .catch(
        () => undefined
      );

    await browser.close()
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