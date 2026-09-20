export type ProviderHealth =
  | "HEALTHY"
  | "UNHEALTHY"
  | "COOLDOWN";

export interface ProviderProfilePublic {
  readonly id: string;
  readonly label: string;
  readonly projectId: string;
  readonly quotaBucketId: string;
}

export interface ProviderCredential {
  readonly profileId: string;
  readonly authKey: string;
}

export interface ResolvedProviderProfile {
  readonly profile: ProviderProfilePublic;
  readonly credential: ProviderCredential;
}

export interface StoredProviderProfile {
  readonly id: string;
  readonly label: string;
  readonly projectId: string;
  readonly authKey: string;
}

export function normalizeProjectId(
  projectId: string
): string {
  return projectId.trim().toLowerCase();
}

export function quotaBucketIdForProject(
  projectId: string
): string {
  const normalized = normalizeProjectId(projectId);

  if (!normalized) {
    throw new Error("projectId must not be empty");
  }

  return "gemini-project:" + normalized;
}

export function toResolvedProviderProfile(
  stored: StoredProviderProfile
): ResolvedProviderProfile {
  const id = stored.id.trim();
  const label = stored.label.trim();
  const projectId = stored.projectId.trim();
  const authKey = stored.authKey.trim();

  if (!id || !label || !projectId || !authKey) {
    throw new Error("Provider profile fields must not be empty");
  }

  return {
    profile: {
      id,
      label,
      projectId,
      quotaBucketId: quotaBucketIdForProject(projectId)
    },
    credential: {
      profileId: id,
      authKey
    }
  };
}
