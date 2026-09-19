import {
  createHash
} from "node:crypto";

import {
  load
} from "cheerio";

import {
  buildReplayRequest,
  detectPaginationMutation
} from "./paginationLearning.js";

import type {
  EndpointCandidate,
  EndpointDiscoveryRun,
  EndpointQualificationResult,
  EndpointReplayRequest,
  EndpointReplayResponse,
  ReplayDiscoveryResult
} from "./endpointReplayTypes.js";

import {
  FetchEndpointReplayTransport
} from "./endpointReplayTransport.js";

import type {
  EndpointReplayTransport
} from "./endpointReplayTransport.js";


export interface EndpointReplayEngineOptions {
  readonly transport?:
    EndpointReplayTransport;

  readonly maxPagesPerCandidate?:
    number;
}


const DEFAULT_MAX_PAGES_PER_CANDIDATE =
  5;


function bodyHash(
  body:
    string
): string {

  return createHash(
    "sha256"
  )
    .update(
      body
    )
    .digest(
      "hex"
    );
}


function uniqueInOrder(
  values:
    readonly string[]
): string[] {

  return [
    ...new Set(
      values
    )
  ];
}


function resolveHttpUrl(
  value:
    string,
  baseUrl:
    string,
  rootOrigin:
    string
): string |
  null {

  try {

    const url =
      new URL(
        value,
        baseUrl
      );


    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }


    if (
      url.origin !==
        rootOrigin
    ) {
      return null;
    }


    url.hash = "";


    return url.toString();
  }
  catch {
    return null;
  }
}


function collectJsonUrls(
  value:
    unknown,
  output:
    string[],
  baseUrl:
    string,
  rootOrigin:
    string
): void {

  if (
    typeof value ===
      "string"
  ) {

    const resolved =
      resolveHttpUrl(
        value,
        baseUrl,
        rootOrigin
      );


    if (
      resolved !==
        null
    ) {
      output.push(
        resolved
      );
    }


    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const item
      of value
    ) {
      collectJsonUrls(
        item,
        output,
        baseUrl,
        rootOrigin
      );
    }


    return;
  }


  if (
    value !==
      null &&
    typeof value ===
      "object"
  ) {

    for (
      const nested
      of Object.values(
        value as
          Record<
            string,
            unknown
          >
      )
    ) {
      collectJsonUrls(
        nested,
        output,
        baseUrl,
        rootOrigin
      );
    }
  }
}


function extractSameOriginUrls(
  response:
    EndpointReplayResponse,
  rootUrl:
    string
): string[] {

  const rootOrigin =
    new URL(
      rootUrl
    ).origin;


  const output:
    string[] =
      [];


  const contentType =
    response.contentType ??
    "";


  if (
    contentType.includes(
      "html"
    ) ||
    contentType.startsWith(
      "text/"
    )
  ) {

    const $ =
      load(
        response.body
      );


    $("a[href]")
      .each(
        (
          _,
          element
        ) => {

          const href =
            $(element)
              .attr(
                "href"
              );


          if (
            href ===
              undefined
          ) {
            return;
          }


          const resolved =
            resolveHttpUrl(
              href,
              response.finalUrl,
              rootOrigin
            );


          if (
            resolved !==
              null
          ) {
            output.push(
              resolved
            );
          }
        }
      );
  }


  if (
    contentType.includes(
      "json"
    )
  ) {

    try {

      const parsed =
        JSON.parse(
          response.body
        );


      collectJsonUrls(
        parsed,
        output,
        response.finalUrl,
        rootOrigin
      );
    }
    catch {
      // Keep raw response evidence; malformed JSON is not fatal to replay.
    }
  }


  return uniqueInOrder(
    output
  );
}


function isSuccessfulReplay(
  response:
    EndpointReplayResponse
): boolean {

  return (
    response.status >=
      200 &&
    response.status <
      300 &&
    response.challengeState ===
      "NONE"
  );
}


function requestFingerprint(
  request:
    EndpointReplayRequest
): string {

  return JSON.stringify([
    request.method,
    request.url,
    request.contentType,
    request.body
  ]);
}


export class EndpointReplayEngine {
  private readonly transport:
    EndpointReplayTransport;


  private readonly maxPagesPerCandidate:
    number;


  constructor(
    options:
      EndpointReplayEngineOptions = {}
  ) {

    this.transport =
      options.transport ??
      new FetchEndpointReplayTransport();


    this.maxPagesPerCandidate =
      options.maxPagesPerCandidate ??
      DEFAULT_MAX_PAGES_PER_CANDIDATE;


    if (
      !Number.isInteger(
        this.maxPagesPerCandidate
      ) ||
      this.maxPagesPerCandidate <=
        0
    ) {
      throw new Error(
        "maxPagesPerCandidate must be a positive integer."
      );
    }
  }


  async replayCandidate(
    candidate:
      EndpointCandidate,
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      ReplayDiscoveryResult
    > {

    const requests:
      EndpointReplayRequest[] =
        [];


    const responses:
      EndpointReplayResponse[] =
        [];


    const warnings:
      string[] =
        [];


    const discoveredUrls:
      string[] =
        [];


    const seenBodyHashes =
      new Set<string>();


    const seenRequestFingerprints =
      new Set<string>();


    const initialRequest =
      buildReplayRequest(
        candidate
      );


    const pagination =
      detectPaginationMutation(
        candidate
      );


    const pageStep =
      pagination ===
        null
        ? 0
        : (
            pagination.nextValue -
            pagination.currentValue
          );


    for (
      let pageIndex =
        0;
      pageIndex <
        this.maxPagesPerCandidate;
      pageIndex +=
        1
    ) {

      const request =
        pageIndex ===
          0 ||
        pagination ===
          null
          ? initialRequest
          : buildReplayRequest(
              candidate,
              {
                ...pagination,

                nextValue:
                  pagination.currentValue +
                  (
                    pageStep *
                    pageIndex
                  )
              }
            );


      const fingerprint =
        requestFingerprint(
          request
        );


      if (
        seenRequestFingerprints.has(
          fingerprint
        )
      ) {
        break;
      }


      seenRequestFingerprints.add(
        fingerprint
      );


      requests.push(
        request
      );


      let response:
        EndpointReplayResponse;


      try {

        response =
          await this.transport.execute(
            request,
            rootUrl,
            signal
          );
      }
      catch (
        error
      ) {

        warnings.push(
          "Replay failed: " +
          (
            error instanceof
              Error
              ? error.message
              : String(
                  error
                )
          )
        );


        break;
      }


      responses.push(
        response
      );


      if (
        !isSuccessfulReplay(
          response
        )
      ) {

        warnings.push(
          "Replay stopped at status " +
          response.status +
          " with state " +
          response.challengeState +
          "."
        );


        break;
      }


      const hash =
        bodyHash(
          response.body
        );


      if (
        seenBodyHashes.has(
          hash
        )
      ) {

        warnings.push(
          "Replay stopped because the response repeated."
        );


        break;
      }


      seenBodyHashes.add(
        hash
      );


      const pageUrls =
        extractSameOriginUrls(
          response,
          rootUrl
        );


      const before =
        new Set(
          discoveredUrls
        ).size;


      discoveredUrls.push(
        ...pageUrls
      );


      const after =
        new Set(
          discoveredUrls
        ).size;


      if (
        pagination ===
          null
      ) {
        break;
      }


      if (
        after ===
          before
      ) {

        warnings.push(
          "Replay stopped because pagination produced no new URLs."
        );


        break;
      }
    }


    return {
      candidate,
      requests,
      responses,
      discoveredUrls:
        uniqueInOrder(
          discoveredUrls
        ),
      warnings
    };
  }


  async replayQualified(
    qualification:
      EndpointQualificationResult,
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      EndpointDiscoveryRun
    > {

    const discoveries:
      ReplayDiscoveryResult[] =
        [];


    const warnings:
      string[] =
        [];


    const discoveredUrls:
      string[] =
        [];


    const seenCandidates =
      new Set<string>();


    for (
      const candidate
      of qualification.qualified
    ) {

      const replayKey =
        JSON.stringify([
          candidate.method,
          candidate.url,
          candidate.requestContentType,
          candidate.requestBody
        ]);


      if (
        seenCandidates.has(
          replayKey
        )
      ) {
        continue;
      }


      seenCandidates.add(
        replayKey
      );


      const discovery =
        await this.replayCandidate(
          candidate,
          rootUrl,
          signal
        );


      discoveries.push(
        discovery
      );


      warnings.push(
        ...discovery.warnings
      );


      discoveredUrls.push(
        ...discovery.discoveredUrls
      );
    }


    return {
      qualifiedCandidateCount:
        qualification.qualified.length,

      replayedCandidateCount:
        discoveries.length,

      discoveries,

      discoveredUrls:
        uniqueInOrder(
          discoveredUrls
        ),

      warnings
    };
  }
}
