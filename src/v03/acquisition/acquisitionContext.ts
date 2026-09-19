import type {
  AcquisitionContext
} from "./acquisitionTypes.js";


export function normalizeRootUrl(
  value:
    string
): string {

  const trimmed =
    value.trim();


  if (
    trimmed.length ===
      0
  ) {
    throw new Error(
      "Root URL is required."
    );
  }


  const url =
    new URL(
      trimmed
    );


  if (
    url.protocol !==
      "http:" &&
    url.protocol !==
      "https:"
  ) {
    throw new Error(
      "Unsupported URL protocol: " +
      url.protocol
    );
  }


  url.hash = "";


  return url.toString();
}


export function createAcquisitionContext(
  rootUrl:
    string,
  signal?:
    AbortSignal
): AcquisitionContext {

  return {
    rootUrl:
      normalizeRootUrl(
        rootUrl
      ),

    signal
  };
}
