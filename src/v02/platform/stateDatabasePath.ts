import {
  resolve
} from "node:path";


export interface StateDatabasePathOptions {
  readonly cwd?:
    string;

  readonly environment?:
    Readonly<
      NodeJS.ProcessEnv
    >;
}


/*
 * Pure path policy only.
 *
 * No mkdir/stat/open belongs here. Callers decide whether they are
 * creating persistent state or only inspecting already-existing state.
 */
export function resolveStateDatabasePath(
  options:
    StateDatabasePathOptions = {}
): string {

  const cwd =
    options.cwd ??
    process.cwd();


  const environment =
    options.environment ??
    process.env;


  const override =
    environment
      .CAMINTEL_STATE_DB
      ?.trim();


  if (
    override
  ) {

    return resolve(
      cwd,
      override
    );
  }


  return resolve(
    cwd,
    "data",
    "camera-intelligence.sqlite"
  );
}