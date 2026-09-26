import {
  readCameraWorkbook,
  type CameraRow
} from "./workbookComparator.js";

export type CrawlSmokeIssue = {
  code: string;
  url: string;
  message: string;
};

export type CrawlSmokeResult = {
  site: string;
  rowCount: number;
  cap: number;
  status: "PASS" | "FAIL";
  issues: CrawlSmokeIssue[];
};

function host(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return "";
  }
}

function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function contaminationIssues(row: CameraRow): CrawlSmokeIssue[] {
  const issues: CrawlSmokeIssue[] = [];

  if (/(?:bảo\s*hành|bao\s*hanh|warranty|vat|chính\s*sách|chinh\s*sach)/iu.test(row.accessories)) {
    issues.push({
      code: "ACCESSORY_POLICY_CONTAMINATION",
      url: row.url,
      message: "Warranty/VAT/policy text leaked into accessories."
    });
  }

  if (/(?:khách\s*thường\s*mua\s*thêm|khach\s*thuong\s*mua\s*them|customers?\s+also\s+buy|frequently\s+bought|related\s+products?)/iu.test(row.bundle)) {
    issues.push({
      code: "RELATED_PRODUCT_AS_BUNDLE",
      url: row.url,
      message: "Related/customers-also-buy content leaked into bundle."
    });
  }

  return issues;
}

export function validateCrawlRows(
  site: string,
  rows: CameraRow[],
  cap = 15
): CrawlSmokeResult {
  const expectedHost = site.replace(/^www\./u, "").toLowerCase();
  const issues: CrawlSmokeIssue[] = [];

  if (rows.length > cap) {
    issues.push({
      code: "CAP_EXCEEDED",
      url: "",
      message: `Camera Data contains ${rows.length} rows, exceeding smoke cap ${cap}.`
    });
  }

  const seen = new Set<string>();

  for (const row of rows) {
    const rowHost = host(row.url);

    if (row.website.toLowerCase().replace(/^www\./u, "") !== expectedHost) {
      issues.push({
        code: "WEBSITE_MISMATCH",
        url: row.url,
        message: `Workbook website is ${row.website}, expected ${site}.`
      });
    }

    if (rowHost && rowHost !== expectedHost) {
      issues.push({
        code: "URL_HOST_MISMATCH",
        url: row.url,
        message: `URL host is ${rowHost}, expected ${site}.`
      });
    }

    const canonical = canonicalUrl(row.url);

    if (seen.has(canonical)) {
      issues.push({
        code: "DUPLICATE_URL",
        url: row.url,
        message: "Duplicate final URL found in crawl smoke output."
      });
    } else {
      seen.add(canonical);
    }

    issues.push(...contaminationIssues(row));
  }

  return {
    site,
    rowCount: rows.length,
    cap,
    status: issues.length === 0 ? "PASS" : "FAIL",
    issues
  };
}

export async function validateCrawlWorkbook(
  site: string,
  workbookPath: string,
  cap = 15
): Promise<CrawlSmokeResult> {
  const rows = await readCameraWorkbook(workbookPath);
  return validateCrawlRows(site, rows, cap);
}
