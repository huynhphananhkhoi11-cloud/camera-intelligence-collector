export type DiscoveryAuditStatus =
  | "PASS"
  | "WARN"
  | "FAIL";


export type DiscoveryAuditConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";


export interface DiscoveryAuditFinding {
  ruleId:
    string;

  status:
    DiscoveryAuditStatus;

  confidence:
    DiscoveryAuditConfidence;

  title:
    string;

  message:
    string;

  evidence:
    Record<
      string,
      unknown
    >;

  recommendation:
    string | null;
}


export interface DiscoveryAuditSummary {
  status:
    DiscoveryAuditStatus;

  passed:
    number;

  warnings:
    number;

  failures:
    number;

  total:
    number;
}