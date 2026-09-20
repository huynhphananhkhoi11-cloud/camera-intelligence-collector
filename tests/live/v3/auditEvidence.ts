import ExcelJS from "exceljs";

export type AuditEvidenceValue = {
  value: unknown;
  rawText: string;
  shotId: string;
  currency?: string;
};

export type AuditEvidencePayload = {
  website?: AuditEvidenceValue | null;
  productName?: AuditEvidenceValue | null;
  condition?: AuditEvidenceValue | null;
  specs?: AuditEvidenceValue[];
  rentalPricePerDay?: AuditEvidenceValue | null;
  rentalTerms?: AuditEvidenceValue | null;
  accessoriesIncluded?: AuditEvidenceValue | null;
  bundleIncluded?: AuditEvidenceValue | null;
  rating?: AuditEvidenceValue | null;
  reviewCount?: AuditEvidenceValue | null;
  stock?: AuditEvidenceValue | null;
  salePrice?: AuditEvidenceValue | null;
};

export type AuditRecord = {
  url: string;
  validationStatus: string;
  validationIssues: string;
  evidence: AuditEvidencePayload | null;
  runId: string;
};

export type FieldEvidence = {
  rawText: string;
  shotIds: string[];
};

const AUDIT_HEADERS = [
  "URL",
  "Validation status",
  "Validation issues",
  "Evidence JSON",
  "Run ID"
] as const;

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return String(value);
}

export async function readDecisionAudit(path: string): Promise<AuditRecord[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = workbook.getWorksheet("Decision Audit");
  if (!sheet) return [];

  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value ?? ""));
  if (JSON.stringify(headers) !== JSON.stringify(AUDIT_HEADERS)) {
    throw new Error("Decision Audit headers mismatch.");
  }

  const rows: AuditRecord[] = [];
  for (let index = 2; index <= sheet.actualRowCount; index += 1) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;

    const evidenceText = text(row.getCell(4).value);
    let evidence: AuditEvidencePayload | null = null;

    if (evidenceText.trim().length > 0) {
      try {
        evidence = JSON.parse(evidenceText) as AuditEvidencePayload;
      } catch {
        evidence = null;
      }
    }

    rows.push({
      url: text(row.getCell(1).value),
      validationStatus: text(row.getCell(2).value),
      validationIssues: text(row.getCell(3).value),
      evidence,
      runId: text(row.getCell(5).value)
    });
  }

  return rows;
}

function unique(values: string[]): string[] {
  return values.filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

function fromValues(values: Array<AuditEvidenceValue | null | undefined>): FieldEvidence {
  const kept = values.filter((value): value is AuditEvidenceValue => Boolean(value));

  return {
    rawText: unique(kept.map((value) => value.rawText.trim())).join(" | "),
    shotIds: unique(kept.map((value) => value.shotId.trim()))
  };
}

export function evidenceForField(
  payload: AuditEvidencePayload | null,
  field: string
): FieldEvidence {
  if (!payload) return { rawText: "", shotIds: [] };

  if (field === "specs") {
    return fromValues(payload.specs ?? []);
  }

  const direct: Record<string, AuditEvidenceValue | null | undefined> = {
    website: payload.website,
    productName: payload.productName,
    condition: payload.condition,
    rentalPricePerDay: payload.rentalPricePerDay,
    rentalTerms: payload.rentalTerms,
    accessoriesIncluded: payload.accessoriesIncluded,
    bundleIncluded: payload.bundleIncluded,
    rating: payload.rating,
    reviewCount: payload.reviewCount,
    stock: payload.stock,
    salePrice: payload.salePrice
  };

  return fromValues([direct[field]]);
}
