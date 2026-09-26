import {
  createInterface
} from "node:readline/promises";


export interface CollectUrlIo {
  isInteractive:
    boolean;

  question:
    (
      prompt:
        string
    ) =>
      Promise<string>;
}


function validateWebsiteUrl(
  raw:
    string
): string {

  const trimmed =
    raw.trim();


  if (
    trimmed.length ===
      0
  ) {
    throw new Error(
      "Website URL is required."
    );
  }


  let parsed:
    URL;


  try {
    parsed =
      new URL(
        trimmed
      );
  }
  catch {
    throw new Error(
      "Invalid website URL. Use an absolute http:// or https:// URL."
    );
  }


  if (
    parsed.protocol !==
      "http:" &&
    parsed.protocol !==
      "https:"
  ) {
    throw new Error(
      "Invalid website URL. Use an absolute http:// or https:// URL."
    );
  }


  return parsed.toString();
}


async function askFromTerminal(
  prompt:
    string
): Promise<string> {

  const readline =
    createInterface({
      input:
        process.stdin,

      output:
        process.stdout
    });


  try {
    return await readline.question(
      prompt
    );
  }
  finally {
    readline.close();
  }
}


function defaultIo():
  CollectUrlIo {

  return {
    isInteractive:
      process.stdin.isTTY ===
        true &&
      process.stdout.isTTY ===
        true,

    question:
      askFromTerminal
  };
}


export async function resolveCollectUrl(
  rawUrl:
    string |
    undefined,

  io:
    CollectUrlIo =
      defaultIo()
): Promise<string> {

  if (
    rawUrl !==
      undefined &&
    rawUrl.trim().length >
      0
  ) {
    return validateWebsiteUrl(
      rawUrl
    );
  }


  if (
    !io.isInteractive
  ) {
    throw new Error(
      [
        "Website URL is required in non-interactive mode.",
        "Usage: camintel collect <url>"
      ].join(
        " "
      )
    );
  }


  const answer =
    await io.question(
      "Website URL > "
    );


  return validateWebsiteUrl(
    answer
  );
}