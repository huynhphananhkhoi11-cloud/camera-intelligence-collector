export type AuditConfidence =
  | string
  | number;


export interface ResolvedFieldAuditInput {
  field: string;

  selectedValue:
    unknown;

  confidence: number;

  conflict: boolean;
}


export interface ResolvedFieldAuditRecord
extends ResolvedFieldAuditInput {
  runId: string;

  canonicalUrl: string;

  auditVersion: string;

  resolverVersion: string;

  createdAt: string;
}


export interface EvidenceAuditInput {
  productName: string;

  decision: string;

  field: string;

  selectedValue: string;

  source: string;

  raw: string;

  weight:
    number |
    null;

  confidence:
    AuditConfidence;

  ruleId: string;
}


export interface EvidenceAuditRecord
extends EvidenceAuditInput {
  evidenceId: number;

  runId: string;

  canonicalUrl: string;

  auditVersion: string;

  createdAt: string;
}


export interface ConflictAuditInput {
  productName: string;

  field: string;

  severity:
    | "REVIEW"
    | "INFO";

  values: string;

  explanation: string;

  selectedValue:
    string |
    null;

  meta:
    unknown;
}


export interface ConflictAuditRecord
extends ConflictAuditInput {
  conflictId: number;

  runId: string;

  canonicalUrl: string;

  auditVersion: string;

  createdAt: string;
}


export interface PersistProductAuditInput {
  runId: string;

  canonicalUrl: string;

  contentHash: string;

  classifierVersion: string;

  resolverVersion: string;

  auditVersion: string;

  entity:
    unknown;

  offer:
    unknown;

  condition:
    unknown;

  validation:
    unknown;

  resolvedFields:
    readonly ResolvedFieldAuditInput[];

  evidence:
    readonly EvidenceAuditInput[];

  conflicts:
    readonly ConflictAuditInput[];
}


export interface ProductAuditSnapshot {
  runId: string;

  canonicalUrl: string;

  contentHash: string;

  classifierVersion: string;

  resolverVersion: string;

  auditVersion: string;

  entity:
    unknown;

  offer:
    unknown;

  condition:
    unknown;

  validation:
    unknown;

  createdAt: string;

  resolvedFields:
    ResolvedFieldAuditRecord[];

  evidence:
    EvidenceAuditRecord[];

  conflicts:
    ConflictAuditRecord[];
}


export interface AppendAuditErrorInput {
  runId: string;

  canonicalUrl:
    string |
    null;

  stage: string;

  errorClass: string;

  message: string;

  attempts: number;

  lastStatus:
    string |
    number |
    null;

  retriable: boolean;

  diagnosticPath:
    string |
    null;
}


export interface AuditErrorRecord
extends AppendAuditErrorInput {
  errorId: number;

  createdAt: string;
}


export interface IntelligenceAuditStore {
  persistProductAudit(
    input:
      PersistProductAuditInput
  ): void;

  getProductAudit(
    runId:
      string,
    canonicalUrl:
      string,
    auditVersion:
      string
  ): ProductAuditSnapshot | null;

  appendError(
    input:
      AppendAuditErrorInput
  ): AuditErrorRecord;

  listErrors(
    runId:
      string
  ): AuditErrorRecord[];

  close(): void;
}