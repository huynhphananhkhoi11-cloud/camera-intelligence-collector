import type {
  DiscoveryAuditFinding
} from "./discoveryAuditTypes.js";

import type {
  DiscoveryAuditReport
} from "./discoveryAuditEngine.js";


function symbol(
  finding:
    DiscoveryAuditFinding
): string {

  switch (
    finding.status
  ) {

    case "FAIL":
      return "FAIL";

    case "WARN":
      return "WARN";

    default:
      return "PASS";
  }
}


export function formatDiscoveryAuditReport(
  report:
    DiscoveryAuditReport
): string[] {

  const lines:
    string[] = [];


  lines.push(
    "Discovery Self-Audit:"
  );


  for (
    const finding
    of report.findings
  ) {

    lines.push(
      `  ${symbol(finding)} ${finding.ruleId}`
    );

    lines.push(
      `       ${finding.message}`
    );


    if (
      finding.status !==
      "PASS" &&
      finding.recommendation
    ) {

      lines.push(
        `       Action: ${finding.recommendation}`
      );
    }
  }


  lines.push(
    ""
  );


  lines.push(
    `Audit result: ${report.summary.status}`
  );


  lines.push(
    `  Pass: ${report.summary.passed}`
  );

  lines.push(
    `  Warn: ${report.summary.warnings}`
  );

  lines.push(
    `  Fail: ${report.summary.failures}`
  );


  return lines;
}