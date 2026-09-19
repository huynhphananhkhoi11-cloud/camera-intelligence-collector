import type {
  EndpointCandidate,
  EndpointReplayRequest,
  PaginationMutation
} from "./endpointReplayTypes.js";


const PAGE_KEYS =
  new Set([
    "page",
    "p",
    "page_no",
    "page_num",
    "page_number",
    "current_page"
  ]);


const OFFSET_KEYS =
  new Set([
    "offset",
    "start"
  ]);


const PAGE_SIZE_KEYS =
  [
    "limit",
    "page_size",
    "pagesize",
    "per_page",
    "page_per"
  ];


function parseNumeric(
  value:
    string |
    null
): number |
  null {

  if (
    value ===
      null ||
    !/^\d+$/.test(
      value.trim()
    )
  ) {
    return null;
  }


  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function nextForKey(
  key:
    string,
  current:
    number,
  params:
    URLSearchParams
): number {

  if (
    OFFSET_KEYS.has(
      key
    )
  ) {

    for (
      const sizeKey
      of PAGE_SIZE_KEYS
    ) {

      const size =
        parseNumeric(
          params.get(
            sizeKey
          )
        );


      if (
        size !==
          null &&
        size >
          0
      ) {
        return (
          current +
          size
        );
      }
    }
  }


  return (
    current +
    1
  );
}


function firstMutableParam(
  params:
    URLSearchParams,
  location:
    "QUERY" |
    "BODY"
): PaginationMutation |
  null {

  for (
    const [
      key,
      rawValue
    ]
    of params.entries()
  ) {

    const normalized =
      key.toLowerCase();


    if (
      !PAGE_KEYS.has(
        normalized
      ) &&
      !OFFSET_KEYS.has(
        normalized
      )
    ) {
      continue;
    }


    const current =
      parseNumeric(
        rawValue
      );


    if (
      current ===
        null
    ) {
      continue;
    }


    return {
      location,
      key,
      currentValue:
        current,
      nextValue:
        nextForKey(
          normalized,
          current,
          params
        )
    };
  }


  return null;
}


export function detectPaginationMutation(
  candidate:
    EndpointCandidate
): PaginationMutation |
  null {

  try {

    const url =
      new URL(
        candidate.url
      );


    const queryMutation =
      firstMutableParam(
        url.searchParams,
        "QUERY"
      );


    if (
      queryMutation !==
        null
    ) {
      return queryMutation;
    }
  }
  catch {
    return null;
  }


  if (
    candidate.requestBody ===
      null ||
    candidate.requestContentType
      ?.includes(
        "application/x-www-form-urlencoded"
      ) !==
      true
  ) {
    return null;
  }


  return firstMutableParam(
    new URLSearchParams(
      candidate.requestBody
    ),
    "BODY"
  );
}


export function buildReplayRequest(
  candidate:
    EndpointCandidate,
  mutation?:
    PaginationMutation
): EndpointReplayRequest {

  if (
    candidate.method !==
      "GET" &&
    candidate.method !==
      "POST"
  ) {
    throw new Error(
      "Endpoint candidate is not replay-safe: unsupported method " +
      candidate.method
    );
  }


  if (
    !candidate.replayable
  ) {
    throw new Error(
      "Endpoint candidate is not replayable."
    );
  }


  let url =
    candidate.url;


  let body =
    candidate.requestBody;


  if (
    mutation !==
      undefined
  ) {

    if (
      mutation.location ===
        "QUERY"
    ) {

      const parsed =
        new URL(
          url
        );


      parsed.searchParams.set(
        mutation.key,
        String(
          mutation.nextValue
        )
      );


      url =
        parsed.toString();
    }
    else {

      const params =
        new URLSearchParams(
          body ??
          ""
        );


      params.set(
        mutation.key,
        String(
          mutation.nextValue
        )
      );


      body =
        params.toString();
    }
  }


  return {
    candidateId:
      candidate.candidateId,

    url,

    method:
      candidate.method,

    contentType:
      candidate.requestContentType,

    body:
      candidate.method ===
        "GET"
        ? null
        : body,

    reason:
      mutation ===
        undefined
        ? "observed_request"
        : (
            "pagination_mutation:" +
            mutation.location +
            ":" +
            mutation.key +
            "=" +
            mutation.nextValue
          )
  };
}
