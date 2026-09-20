import readline from "node:readline/promises";
import {
  stdin as input,
  stdout as output
} from "node:process";

import {
  healthCheckGeminiAuthKey
} from "../provider/providerHealthCheck.js";
import {
  saveProviderProfiles
} from "../provider/localProfileStore.js";
import type {
  StoredProviderProfile
} from "../provider/providerProfile.js";

async function readHidden(
  prompt: string
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error(
      "Hidden credential input requires an interactive TTY"
    );
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return await new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = (): void => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Provider setup cancelled"));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value.trim());
          return;
        }

        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        if (char >= " ") {
          value += char;
        }
      }
    };

    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    const countRaw = await rl.question(
      "Số Gemini API Profile muốn cấu hình: "
    );
    const count = Number.parseInt(countRaw, 10);

    if (!Number.isInteger(count) || count <= 0 || count > 20) {
      throw new Error("Profile count must be an integer from 1 to 20");
    }

    const profiles: StoredProviderProfile[] = [];

    for (let index = 0; index < count; index += 1) {
      const ordinal = index + 1;
      const label = (
        await rl.question("Profile " + ordinal + " label: ")
      ).trim();
      const projectId = (
        await rl.question("Google Cloud Project ID/label: ")
      ).trim();

      rl.pause();
      const authKey = await readHidden("Gemini Auth Key: ");
      rl.resume();

      if (!label || !projectId || !authKey) {
        throw new Error("Profile label, projectId and auth key are required");
      }

      output.write("Checking credential... ");
      const health = await healthCheckGeminiAuthKey(authKey);

      if (!health.ok) {
        output.write(
          "FAILED (" + (health.errorClass ?? "UNKNOWN") + ")\n"
        );
        throw new Error(
          "Credential health check failed for profile " + label
        );
      }

      output.write("OK\n");

      profiles.push({
        id: "profile-" + ordinal + "-" + label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
        label,
        projectId,
        authKey
      });
    }

    await saveProviderProfiles(profiles);
    output.write("Profiles saved locally under .camintel. Secrets were not printed.\n");
  } finally {
    rl.close();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "Provider setup failed";
  console.error(message);
  process.exitCode = 1;
});
