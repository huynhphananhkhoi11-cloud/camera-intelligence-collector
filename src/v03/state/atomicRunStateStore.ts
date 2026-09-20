import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  assertRunState,
  type RunState
} from "./runState.js";

export class AtomicRunStateStore {
  public constructor(
    private readonly filePath: string
  ) {}

  public async load(): Promise<RunState> {
    const raw = await readFile(this.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    assertRunState(parsed);
    return parsed;
  }

  public async save(
    state: RunState
  ): Promise<void> {
    assertRunState(state);

    await mkdir(path.dirname(this.filePath), { recursive: true });

    const tempPath =
      this.filePath + "." + process.pid + "." + Date.now() + ".tmp";

    try {
      await writeFile(
        tempPath,
        JSON.stringify(state, null, 2) + "\n",
        "utf8"
      );
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
