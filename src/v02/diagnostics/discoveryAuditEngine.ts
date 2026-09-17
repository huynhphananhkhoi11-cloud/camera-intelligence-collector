import {
  buildDiscoveryTelemetry,
  type DiscoveryTelemetry,
  type DiscoveryTelemetryInput
} from "./discoveryTelemetry.js";

import {
  runDeterministicDiscoveryAudit
} from "./deterministicDiscoveryAudit.js";

import {
  runContextualDiscoveryAudit
} from "./contextualDiscoveryAudit.js";

import {
  compareDiscoveryBaseline,
  type DiscoveryBaseline
} from "./discoveryRegression.js";

import type {
  DiscoveryAuditFinding,
  DiscoveryAuditStatus,
  DiscoveryAuditSummary
} from "./discoveryAuditTypes.js";


export interface DiscoveryAuditOptions {
  baseline?:
    DiscoveryBaseline | null;
}


export interface DiscoveryAuditReport {
  schemaVersion:
    "discovery-audit-v1";

  telemetry:
    DiscoveryTelemetry;

  findings:
    DiscoveryAuditFinding[];

  summary:
    DiscoveryAuditSummary;
}


function summarize(
  findings:
    readonly DiscoveryAuditFinding[]
): DiscoveryAuditSummary {

  const failures =
    findings.filter(
      finding =>
        finding.status ===
        "FAIL"
    ).length;


  const warnings =
    findings.filter(
      finding =>
        finding.status ===
        "WARN"
    ).length;


  const passed =
    findings.filter(
      finding =>
        finding.status ===
        "PASS"
    ).length;


  let status:
    DiscoveryAuditStatus =
    "PASS";


  if (
    failures >
    0
  ) {

    status =
      "FAIL";
  }
  else if (
    warnings >
    0
  ) {

    status =
      "WARN";
  }


  return {
    status,
    passed,
    warnings,
    failures,
    total:
      findings.length
  };
}


export function runDiscoveryAudit(
  input:
    DiscoveryTelemetryInput,
  options:
    DiscoveryAuditOptions = {}
): DiscoveryAuditReport {

  /*
   * Build telemetry ONCE.
   * Every audit layer reads the same fact snapshot.
   */
  const telemetry =
    buildDiscoveryTelemetry(
      input
    );


  const deterministic =
    runDeterministicDiscoveryAudit(
      input,
      telemetry
    );


  const contextual =
    runContextualDiscoveryAudit(
      input,
      telemetry
    );


  const regression =
    options.baseline
      ? compareDiscoveryBaseline(
          telemetry,
          options.baseline
        )
      : [];


  const findings = [
    ...deterministic,
    ...contextual,
    ...regression
  ];


  return {
    schemaVersion:
      "discovery-audit-v1",

    telemetry,

    findings,

    summary:
      summarize(
        findings
      )
  };
}