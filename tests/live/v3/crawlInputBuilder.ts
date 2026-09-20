export type CrawlInputBuildResult = {
  site: string;
  selected: string[];
  rejected: Array<{
    value: string;
    reason: "INVALID_URL" | "WRONG_HOST" | "DUPLICATE";
  }>;
};

function normalizedHost(value: string): string {
  return value.replace(/^www\./u, "").toLowerCase();
}

function canonicalUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildCrawlInput(
  site: string,
  values: readonly string[],
  cap = 15
): CrawlInputBuildResult {
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("cap must be a positive integer");
  }

  const expectedHost = normalizedHost(site);
  const selected: string[] = [];
  const rejected: CrawlInputBuildResult["rejected"] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const value = raw.trim();

    if (!value || value.startsWith("#")) continue;

    const canonical = canonicalUrl(value);

    if (!canonical) {
      rejected.push({ value, reason: "INVALID_URL" });
      continue;
    }

    const actualHost = normalizedHost(new URL(canonical).hostname);

    if (actualHost !== expectedHost) {
      rejected.push({ value, reason: "WRONG_HOST" });
      continue;
    }

    if (seen.has(canonical)) {
      rejected.push({ value, reason: "DUPLICATE" });
      continue;
    }

    seen.add(canonical);

    if (selected.length < cap) {
      selected.push(canonical);
    }
  }

  return { site, selected, rejected };
}
