import {
  MinimalVisualDecisionSchema,
  type Camera13Row
} from "../contracts/minimalVisualDecision.js";

export type ValidationResult =
  | {
      readonly status: "VALIDATED";
      readonly row: Camera13Row;
    }
  | {
      readonly status: "SKIPPED_NON_CAMERA";
      readonly row: null;
    }
  | {
      readonly status: "REVIEW";
      readonly row: Camera13Row | null;
    };

function classificationOf(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return (value as { readonly classification?: unknown }).classification;
}

export function validateVisualDecision(
  decision: unknown
): ValidationResult {
  const classification = classificationOf(decision);

  if (classification === "NON_CAMERA") {
    return {
      status: "SKIPPED_NON_CAMERA",
      row: null
    };
  }

  const parsed = MinimalVisualDecisionSchema.safeParse(decision);

  if (!parsed.success) {
    return {
      status: "REVIEW",
      row: null
    };
  }

  if (parsed.data.classification === "REVIEW") {
    return {
      status: "REVIEW",
      row: parsed.data.row
    };
  }

  if (
    parsed.data.classification !== "CAMERA_PRODUCT" ||
    parsed.data.row === null
  ) {
    return {
      status: "REVIEW",
      row: null
    };
  }

  return {
    status: "VALIDATED",
    row: parsed.data.row
  };
}
