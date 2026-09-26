import {
  mkdir,
  readFile,
  rename,
  rm,
  chmod,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  toResolvedProviderProfile,
  type ResolvedProviderProfile,
  type StoredProviderProfile
} from "./providerProfile.js";

interface StoredProviderProfileFile {
  readonly schemaVersion: 1;
  readonly profiles: readonly StoredProviderProfile[];
}

export function defaultProviderStorePath(): string {
  return path.resolve(
    process.cwd(),
    ".camintel",
    "provider-profiles.json"
  );
}

function validateUniqueProfiles(
  profiles: readonly StoredProviderProfile[]
): void {
  const ids = new Set<string>();

  for (const profile of profiles) {
    const normalized = toResolvedProviderProfile(profile);
    if (ids.has(normalized.profile.id)) {
      throw new Error(
        "Duplicate provider profile id: " + normalized.profile.id
      );
    }
    ids.add(normalized.profile.id);
  }
}

export async function saveProviderProfiles(
  profiles: readonly StoredProviderProfile[],
  filePath = defaultProviderStorePath()
): Promise<void> {
  validateUniqueProfiles(profiles);

  await mkdir(path.dirname(filePath), { recursive: true });

  const payload: StoredProviderProfileFile = {
    schemaVersion: 1,
    profiles
  };

  const tempPath = filePath + "." + process.pid + ".tmp";

  try {
    await writeFile(
      tempPath,
      JSON.stringify(payload, null, 2) + "\n",
      {
        encoding: "utf8",
        mode: 0o600
      }
    );

    try {
      await chmod(tempPath, 0o600);
    } catch {
      // Windows ACLs may not map cleanly to POSIX mode bits.
    }

    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function loadProviderProfiles(
  filePath = defaultProviderStorePath()
): Promise<readonly ResolvedProviderProfile[]> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoredProviderProfileFile>;

  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.profiles)) {
    throw new Error("Unsupported provider profile store schema");
  }

  validateUniqueProfiles(parsed.profiles);
  return parsed.profiles.map(toResolvedProviderProfile);
}
