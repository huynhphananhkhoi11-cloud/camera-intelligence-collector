import { assertGroundTruthFresh } from "./groundTruthFreshness.js";

try {
  await assertGroundTruthFresh();
  process.stdout.write("Ground truth freshness gate PASS\n");
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + "\n"
  );
  process.exitCode = 1;
}
