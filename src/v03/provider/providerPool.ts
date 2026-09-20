import {
  classifyProviderError,
  type ProviderErrorClassification
} from "./errorClassifier.js";
import {
  type ProviderHealth,
  type ResolvedProviderProfile
} from "./providerProfile.js";

export type ProviderFailureAction =
  | "FAILOVER_CREDENTIAL"
  | "RETRY_ONCE_THEN_FAILOVER"
  | "BACKOFF_SAME_PROJECT"
  | "PAUSE_AI_QUEUE"
  | "REVIEW";

export interface ProviderRuntimeSnapshot {
  readonly profileId: string;
  readonly quotaBucketId: string;
  readonly health: ProviderHealth;
  readonly cooldownReason: "RATE_LIMIT" | "DAILY_QUOTA" | null;
  readonly cooldownUntil: string | null;
}

export interface ProviderFailureDecision {
  readonly classification: ProviderErrorClassification;
  readonly action: ProviderFailureAction;
  readonly nextProfileId: string | null;
  readonly retryAfterMs: number | null;
}

interface MutableProviderRuntime {
  health: ProviderHealth;
  cooldownReason: "RATE_LIMIT" | "DAILY_QUOTA" | null;
  cooldownUntil: string | null;
}

export class ProviderPool {
  private readonly profilesById = new Map<string, ResolvedProviderProfile>();
  private readonly runtimeByProfileId = new Map<string, MutableProviderRuntime>();

  public constructor(
    profiles: readonly ResolvedProviderProfile[]
  ) {
    for (const profile of profiles) {
      if (this.profilesById.has(profile.profile.id)) {
        throw new Error("Duplicate provider profile id: " + profile.profile.id);
      }

      this.profilesById.set(profile.profile.id, profile);
      this.runtimeByProfileId.set(profile.profile.id, {
        health: "HEALTHY",
        cooldownReason: null,
        cooldownUntil: null
      });
    }
  }

  public getProfile(
    profileId: string
  ): ResolvedProviderProfile | null {
    return this.profilesById.get(profileId) ?? null;
  }

  public snapshot(): readonly ProviderRuntimeSnapshot[] {
    return [...this.profilesById.values()].map(profile => {
      const runtime = this.runtimeByProfileId.get(profile.profile.id)!;
      return {
        profileId: profile.profile.id,
        quotaBucketId: profile.profile.quotaBucketId,
        health: runtime.health,
        cooldownReason: runtime.cooldownReason,
        cooldownUntil: runtime.cooldownUntil
      };
    });
  }

  public selectEligibleProfile(
    excludeProfileId: string | null = null
  ): ResolvedProviderProfile | null {
    for (const profile of this.profilesById.values()) {
      if (profile.profile.id === excludeProfileId) {
        continue;
      }

      const runtime = this.runtimeByProfileId.get(profile.profile.id)!;
      if (runtime.health === "HEALTHY") {
        return profile;
      }
    }

    return null;
  }

  private markProjectCooldown(
    quotaBucketId: string,
    reason: "RATE_LIMIT" | "DAILY_QUOTA",
    cooldownUntil: string | null
  ): void {
    for (const profile of this.profilesById.values()) {
      if (profile.profile.quotaBucketId !== quotaBucketId) {
        continue;
      }

      const runtime = this.runtimeByProfileId.get(profile.profile.id)!;
      runtime.health = "COOLDOWN";
      runtime.cooldownReason = reason;
      runtime.cooldownUntil = cooldownUntil;
    }
  }

  public clearCooldowns(
    now = new Date()
  ): void {
    for (const runtime of this.runtimeByProfileId.values()) {
      if (
        runtime.health !== "COOLDOWN" ||
        runtime.cooldownUntil === null
      ) {
        continue;
      }

      if (Date.parse(runtime.cooldownUntil) <= now.getTime()) {
        runtime.health = "HEALTHY";
        runtime.cooldownReason = null;
        runtime.cooldownUntil = null;
      }
    }
  }

  public handleFailure(
    profileId: string,
    error: unknown,
    options: {
      readonly quotaResetAt?: string | null;
      readonly now?: Date;
    } = {}
  ): ProviderFailureDecision {
    const profile = this.profilesById.get(profileId);
    if (!profile) {
      throw new Error("Unknown provider profile: " + profileId);
    }

    const classification = classifyProviderError(error);
    const runtime = this.runtimeByProfileId.get(profileId)!;

    switch (classification.errorClass) {
      case "AUTH_INVALID": {
        runtime.health = "UNHEALTHY";
        runtime.cooldownReason = null;
        runtime.cooldownUntil = null;

        return {
          classification,
          action: "FAILOVER_CREDENTIAL",
          nextProfileId:
            this.selectEligibleProfile(profileId)?.profile.id ?? null,
          retryAfterMs: null
        };
      }

      case "TRANSIENT_PROVIDER":
        return {
          classification,
          action: "RETRY_ONCE_THEN_FAILOVER",
          nextProfileId:
            this.selectEligibleProfile(profileId)?.profile.id ?? null,
          retryAfterMs: classification.retryAfterMs
        };

      case "RATE_LIMIT": {
        const now = options.now ?? new Date();
        const retryMs = classification.retryAfterMs ?? 1_000;
        const cooldownUntil = new Date(now.getTime() + retryMs).toISOString();

        this.markProjectCooldown(
          profile.profile.quotaBucketId,
          "RATE_LIMIT",
          cooldownUntil
        );

        return {
          classification,
          action: "BACKOFF_SAME_PROJECT",
          nextProfileId: null,
          retryAfterMs: retryMs
        };
      }

      case "DAILY_QUOTA":
        this.markProjectCooldown(
          profile.profile.quotaBucketId,
          "DAILY_QUOTA",
          options.quotaResetAt ?? null
        );

        return {
          classification,
          action: "PAUSE_AI_QUEUE",
          nextProfileId: null,
          retryAfterMs: classification.retryAfterMs
        };

      case "SCHEMA_FORMAT":
      case "UNKNOWN":
      default:
        return {
          classification,
          action: "REVIEW",
          nextProfileId: null,
          retryAfterMs: classification.retryAfterMs
        };
    }
  }
}
