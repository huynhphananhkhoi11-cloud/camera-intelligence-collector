import {
  load
} from "cheerio";

import type {
  NetworkExchange,
  NetworkReconSnapshot
} from "./networkReconTypes.js";

import type {
  EndpointCandidate,
  EndpointQualificationResult
} from "./endpointReplayTypes.js";


const QUALIFIED_SCORE =
  45;


function familyKey(
  exchange:
    NetworkExchange
): string {

  try {

    const url =
      new URL(
        exchange.url
      );


    return [
      exchange.method.toUpperCase(),
      url.origin,
      url.pathname
    ].join(
      " "
    );
  }
  catch {

    return [
      exchange.method.toUpperCase(),
      exchange.url
    ].join(
      " "
    );
  }
}


function candidateId(
  exchange:
    NetworkExchange
): string {

  return [
    exchange.sequence,
    exchange.method.toUpperCase(),
    exchange.url
  ].join(
    ":"
  );
}


function uniqueSameOriginLinks(
  body:
    string,
  rootUrl:
    string
): string[] {

  const $ =
    load(
      body
    );


  const rootOrigin =
    new URL(
      rootUrl
    ).origin;


  const links:
    string[] =
      [];


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


        try {

          const resolved =
            new URL(
              href,
              rootUrl
            );


          if (
            resolved.protocol !==
              "http:" &&
            resolved.protocol !==
              "https:"
          ) {
            return;
          }


          if (
            resolved.origin !==
              rootOrigin
          ) {
            return;
          }


          resolved.hash = "";


          links.push(
            resolved.toString()
          );
        }
        catch {
          // Ignore malformed hrefs in reconnaissance previews.
        }
      }
    );


  return [
    ...new Set(
      links
    )
  ];
}


function isTextualListingResponse(
  contentType:
    string |
    null
): boolean {

  if (
    contentType ===
      null
  ) {
    return false;
  }


  return (
    contentType.includes(
      "html"
    ) ||
    contentType.includes(
      "json"
    ) ||
    contentType.startsWith(
      "text/"
    )
  );
}


function isReplayable(
  exchange:
    NetworkExchange
): boolean {

  const method =
    exchange.method.toUpperCase();


  if (
    method !==
      "GET" &&
    method !==
      "POST"
  ) {
    return false;
  }


  if (
    exchange.failed ||
    exchange.status ===
      null ||
    exchange.status <
      200 ||
    exchange.status >=
      300
  ) {
    return false;
  }


  if (
    exchange.url.includes(
      "[REDACTED]"
    ) ||
    exchange.requestBodyRedacted
      ?.includes(
        "[REDACTED]"
      )
  ) {
    return false;
  }


  return true;
}


export function qualifyEndpointCandidates(
  snapshot:
    NetworkReconSnapshot
): EndpointQualificationResult {

  const familyCounts =
    new Map<
      string,
      number
    >();


  for (
    const exchange
    of snapshot.exchanges
  ) {

    const key =
      familyKey(
        exchange
      );


    familyCounts.set(
      key,
      (
        familyCounts.get(
          key
        ) ??
        0
      ) +
      1
    );
  }


  const candidates =
    snapshot.exchanges.map(
      exchange => {

        const reasons:
          string[] =
            [];


        let score =
          0;


        if (
          exchange.status !==
            null &&
          exchange.status >=
            200 &&
          exchange.status <
            300
        ) {
          score +=
            10;

          reasons.push(
            "successful_response"
          );
        }


        if (
          isTextualListingResponse(
            exchange.responseContentType
          )
        ) {
          score +=
            10;

          reasons.push(
            "textual_response"
          );
        }


        const body =
          exchange.responseBodyPreview ??
          "";


        if (
          body.length >=
            200
        ) {
          score +=
            5;

          reasons.push(
            "nontrivial_body"
          );
        }


        let linkCount =
          0;


        if (
          exchange.responseContentType
            ?.includes(
              "html"
            ) &&
          body.length >
            0
        ) {

          linkCount =
            uniqueSameOriginLinks(
              body,
              snapshot.rootUrl
            ).length;


          if (
            linkCount >=
              5
          ) {
            score +=
              35;

            reasons.push(
              "many_same_origin_links"
            );
          }
          else if (
            linkCount >=
              2
          ) {
            score +=
              25;

            reasons.push(
              "multiple_same_origin_links"
            );
          }
          else if (
            linkCount ===
              1
          ) {
            score +=
              8;

            reasons.push(
              "single_same_origin_link"
            );
          }
        }


        const key =
          familyKey(
            exchange
          );


        const count =
          familyCounts.get(
            key
          ) ??
          1;


        if (
          count >=
            2
        ) {
          score +=
            15;

          reasons.push(
            "repeated_endpoint_family"
          );
        }


        if (
          exchange.requestBodyRedacted !==
            null &&
          exchange.requestBodyRedacted.length >
            0
        ) {
          score +=
            5;

          reasons.push(
            "parameterized_request"
          );
        }


        if (
          exchange.responseBodyTruncated
        ) {
          score +=
            5;

          reasons.push(
            "large_response_preview"
          );
        }


        const replayable =
          isReplayable(
            exchange
          );


        if (
          replayable
        ) {
          reasons.push(
            "safe_replay_candidate"
          );
        }


        return {
          candidateId:
            candidateId(
              exchange
            ),

          familyKey:
            key,

          familyCount:
            count,

          url:
            exchange.url,

          method:
            exchange.method.toUpperCase(),

          requestContentType:
            exchange.requestContentType,

          requestBody:
            exchange.requestBodyRedacted,

          responseContentType:
            exchange.responseContentType,

          responseBodyPreview:
            exchange.responseBodyPreview,

          score,

          reasons,

          replayable
        } satisfies
          EndpointCandidate;
      }
    )
    .sort(
      (
        left,
        right
      ) =>
        (
          right.score -
          left.score
        ) ||
        left.candidateId.localeCompare(
          right.candidateId
        )
    );


  return {
    candidates,

    qualified:
      candidates.filter(
        candidate =>
          candidate.score >=
            QUALIFIED_SCORE &&
          candidate.replayable
      )
  };
}
