import {
  canonicalizeUrl,
  getCanonicalOrigin,
  normalizeSiteInput
} from "./urlPolicy.js";


export type RedirectRequestMethod =
  | "HEAD"
  | "GET";


export interface RedirectHop {
  from: string;
  to: string;
  status: number;
  method: RedirectRequestMethod;
}


export interface RedirectResolution {
  inputUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  canonicalOrigin: string;
  status: number;
  method: RedirectRequestMethod;
  redirects: RedirectHop[];
}


export interface RedirectResolverOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  fetchFn?: SiteFetch;
}


export type SiteFetch = (
  input:
    | string
    | URL
    | Request,
  init?: RequestInit
) => Promise<Response>;


const REDIRECT_STATUSES =
  new Set([
    301,
    302,
    303,
    307,
    308
  ]);


function shouldFallbackToGet(
  status: number
): boolean {

  return (
    status === 403 ||
    status === 405 ||
    status === 501
  );
}


async function request(
  url: string,
  method: RedirectRequestMethod,
  fetchFn: SiteFetch,
  timeoutMs: number
): Promise<Response> {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );

  try {

    return await fetchFn(
      url,
      {
        method,
        redirect: "manual",
        signal:
          controller.signal,

        headers: {
          "user-agent":
            "CameraIntelligenceCollector/0.2"
        }
      }
    );
  }
  finally {
    clearTimeout(timer);
  }
}


async function requestWithFallback(
  url: string,
  fetchFn: SiteFetch,
  timeoutMs: number
): Promise<{
  response: Response;
  method: RedirectRequestMethod;
}> {

  try {

    const head =
      await request(
        url,
        "HEAD",
        fetchFn,
        timeoutMs
      );

    if (
      !shouldFallbackToGet(
        head.status
      )
    ) {
      return {
        response: head,
        method: "HEAD"
      };
    }
  }
  catch {

    /*
     * Some servers/proxies reject HEAD
     * completely. Try GET before giving up.
     */
  }

  const get =
    await request(
      url,
      "GET",
      fetchFn,
      timeoutMs
    );

  return {
    response: get,
    method: "GET"
  };
}


/**
 * Resolve the actual HTTP(S) entry URL of a site.
 *
 * Responsibilities:
 *
 * - normalize user input
 * - follow HTTP redirects deterministically
 * - support relative Location headers
 * - detect redirect loops
 * - derive final canonical origin
 *
 * This layer does NOT parse HTML canonical tags.
 */
export async function resolveSiteEntry(
  inputUrl: string,
  options:
    RedirectResolverOptions = {}
): Promise<RedirectResolution> {

  const normalizedUrl =
    normalizeSiteInput(
      inputUrl
    );

  if (!normalizedUrl) {
    throw new Error(
      `Invalid site URL: ${inputUrl}`
    );
  }

  const maxRedirects =
    options.maxRedirects ??
    8;

  const timeoutMs =
    options.timeoutMs ??
    15000;

  const fetchFn =
    options.fetchFn ??
    fetch;

  const redirects:
    RedirectHop[] = [];

  const visited =
    new Set<string>([
      normalizedUrl
    ]);

  let current =
    normalizedUrl;

  for (
    let index = 0;
    index <= maxRedirects;
    index += 1
  ) {

    const {
      response,
      method
    } =
      await requestWithFallback(
        current,
        fetchFn,
        timeoutMs
      );

    if (
      !REDIRECT_STATUSES.has(
        response.status
      )
    ) {

      const finalUrl =
        canonicalizeUrl(
          current
        );

      if (!finalUrl) {
        throw new Error(
          `Invalid final URL: ${current}`
        );
      }

      const canonicalOrigin =
        getCanonicalOrigin(
          finalUrl
        );

      if (!canonicalOrigin) {
        throw new Error(
          `Cannot derive origin from: ${finalUrl}`
        );
      }

      return {
        inputUrl,
        normalizedUrl,
        finalUrl,
        canonicalOrigin,
        status:
          response.status,
        method,
        redirects
      };
    }


    if (
      index >= maxRedirects
    ) {
      throw new Error(
        `Too many redirects: ${normalizedUrl}`
      );
    }


    const location =
      response.headers.get(
        "location"
      );

    if (!location) {
      throw new Error(
        `Redirect ${response.status} without Location header: ${current}`
      );
    }


    const next =
      canonicalizeUrl(
        location,
        current
      );

    if (!next) {
      throw new Error(
        `Invalid redirect target: ${location}`
      );
    }


    if (
      visited.has(
        next
      )
    ) {
      throw new Error(
        `Redirect loop detected: ${next}`
      );
    }


    redirects.push({
      from: current,
      to: next,
      status:
        response.status,
      method
    });


    visited.add(
      next
    );

    current =
      next;
  }


  throw new Error(
    `Unable to resolve site entry: ${normalizedUrl}`
  );
}