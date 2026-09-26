import {
  writeSync
} from "node:fs";


export const CRASH_INJECTION_EXIT_CODE =
  86;


export const CRASH_POINTS = [
  "AFTER_URL_REGISTER",
  "AFTER_BEGIN_PRODUCT",
  "AFTER_RAW_FACTS_PERSISTED",
  "AFTER_CLASSIFICATION",
  "AFTER_TERMINALIZATION",
  "BEFORE_EXPORT",
  "AFTER_WORKBOOK_BEFORE_MANIFEST",
  "AFTER_MANIFEST_BEFORE_FINALIZE"
] as const;


export type CrashPoint =
  typeof CRASH_POINTS[number];


export interface CrashContext {
  runId?: string;

  url?: string;
}


export interface CrashInjectionHost {
  env:
    NodeJS.ProcessEnv;

  write:
    (
      message:
        string
    ) => void;

  exit:
    (
      code:
        number
    ) => never;
}


function defaultHost():
  CrashInjectionHost {

  return {
    env:
      process.env,

    write:
      message => {
        writeSync(
          2,
          `${message}\n`,
          null,
          "utf8"
        );
      },

    exit:
      code =>
        process.exit(
          code
        )
  };
}


function isCrashPoint(
  value:
    string
): value is CrashPoint {

  return (
    CRASH_POINTS as
      readonly string[]
  ).includes(
    value
  );
}


/**
 * Deterministic hard-crash hook used only by Phase 10 crash tests.
 *
 * It is intentionally double-armed:
 *
 *   CAMINTEL_CRASH_ENABLE=1
 *   CAMINTEL_CRASH_POINT=<known point>
 *
 * Normal production execution therefore has no behavioral change.
 *
 * process.exit() is deliberate: it bypasses normal finally/cleanup
 * paths so resume semantics are exercised against a genuinely
 * interrupted process lifecycle.
 */
export function crashIfRequested(
  point:
    CrashPoint,

  context:
    CrashContext = {},

  host:
    CrashInjectionHost =
      defaultHost()
): void {

  if (
    host.env
      .CAMINTEL_CRASH_ENABLE !==
    "1"
  ) {
    return;
  }


  const requested =
    host.env
      .CAMINTEL_CRASH_POINT
      ?.trim();


  if (!requested) {
    throw new Error(
      "CAMINTEL_CRASH_ENABLE=1 requires CAMINTEL_CRASH_POINT."
    );
  }


  if (
    !isCrashPoint(
      requested
    )
  ) {
    throw new Error(
      `Unsupported CAMINTEL_CRASH_POINT: ${requested}`
    );
  }


  if (
    requested !==
    point
  ) {
    return;
  }


  const details =
    JSON.stringify({
      point,

      runId:
        context.runId ??
        null,

      url:
        context.url ??
        null
    });


  host.write(
    `[CAMINTEL_CRASH_INJECTION] ${details}`
  );


  host.exit(
    CRASH_INJECTION_EXIT_CODE
  );
}