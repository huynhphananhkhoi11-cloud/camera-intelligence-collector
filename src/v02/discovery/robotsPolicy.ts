import {
  canonicalizeUrl,
  getCanonicalOrigin
} from "./urlPolicy.js";


export type RobotsRuleType =
  | "ALLOW"
  | "DISALLOW";


export interface RobotsRule {
  type: RobotsRuleType;
  path: string;
}


export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}


export interface RobotsPolicy {
  robotsUrl: string;
  status: number | null;
  available: boolean;
  sitemapUrls: string[];
  groups: RobotsGroup[];
  rawText: string;
  error: string | null;
}


export interface RobotsParseResult {
  sitemapUrls: string[];
  groups: RobotsGroup[];
}


export type RobotsFetch = (
  input:
    | string
    | URL
    | Request,
  init?: RequestInit
) => Promise<Response>;


export interface FetchRobotsOptions {
  timeoutMs?: number;
  fetchFn?: RobotsFetch;
}


function stripComment(
  raw: string
): string {

  const index =
    raw.indexOf("#");

  return (
    index >= 0
      ? raw.slice(
          0,
          index
        )
      : raw
  ).trim();
}


export function parseRobotsTxt(
  rawText: string,
  baseUrl: string
): RobotsParseResult {

  const sitemapUrls =
    new Set<string>();

  const groups:
    RobotsGroup[] = [];

  let currentGroup:
    RobotsGroup | null = null;

  for (
    const rawLine
    of rawText.split(
      /\r?\n/
    )
  ) {

    const line =
      stripComment(
        rawLine
      );

    if (!line) {
      continue;
    }

    const separator =
      line.indexOf(":");

    if (separator < 0) {
      continue;
    }

    const key =
      line
        .slice(
          0,
          separator
        )
        .trim()
        .toLowerCase();

    const value =
      line
        .slice(
          separator + 1
        )
        .trim();


    if (
      key === "sitemap"
    ) {

      const canonical =
        canonicalizeUrl(
          value,
          baseUrl
        );

      if (canonical) {
        sitemapUrls.add(
          canonical
        );
      }

      continue;
    }


    if (
      key === "user-agent"
    ) {

      /*
       * Consecutive User-agent lines belong
       * to the same group until rules begin.
       */
      if (
        !currentGroup ||
        currentGroup.rules.length > 0
      ) {

        currentGroup = {
          userAgents: [],
          rules: []
        };

        groups.push(
          currentGroup
        );
      }

      if (value) {

        const agent =
          value.toLowerCase();

        if (
          !currentGroup.userAgents.includes(
            agent
          )
        ) {
          currentGroup.userAgents.push(
            agent
          );
        }
      }

      continue;
    }


    if (
      key === "allow" ||
      key === "disallow"
    ) {

      if (!currentGroup) {
        continue;
      }

      /*
       * Empty Disallow means allow everything,
       * so there is no useful rule to store.
       */
      if (
        !value
      ) {
        continue;
      }

      currentGroup.rules.push({
        type:
          key === "allow"
            ? "ALLOW"
            : "DISALLOW",

        path:
          value
      });
    }
  }


  return {
    sitemapUrls:
      Array.from(
        sitemapUrls
      ),

    groups
  };
}


function matchingGroups(
  groups: readonly RobotsGroup[],
  userAgent: string
): RobotsGroup[] {

  const agent =
    userAgent
      .toLowerCase()
      .trim();

  const scored =
    groups
      .map(
        group => {

          let specificity =
            -1;

          for (
            const token
            of group.userAgents
          ) {

            if (
              token === "*"
            ) {
              specificity =
                Math.max(
                  specificity,
                  0
                );

              continue;
            }

            if (
              agent.includes(
                token
              )
            ) {
              specificity =
                Math.max(
                  specificity,
                  token.length
                );
            }
          }

          return {
            group,
            specificity
          };
        }
      )
      .filter(
        item =>
          item.specificity >= 0
      );


  if (
    scored.length === 0
  ) {
    return [];
  }


  const best =
    Math.max(
      ...scored.map(
        item =>
          item.specificity
      )
    );


  return scored
    .filter(
      item =>
        item.specificity ===
        best
    )
    .map(
      item =>
        item.group
    );
}


function ruleRegex(
  rulePath: string
): RegExp {

  const anchoredEnd =
    rulePath.endsWith(
      "$"
    );

  const body =
    anchoredEnd
      ? rulePath.slice(
          0,
          -1
        )
      : rulePath;

  const escaped =
    body
      .replace(
        /[.+?^${}()|[\]\\]/g,
        "\\$&"
      )
      .replace(
        /\*/g,
        ".*"
      );

  return new RegExp(
    `^${escaped}${
      anchoredEnd
        ? "$"
        : ""
    }`
  );
}


function ruleSpecificity(
  path: string
): number {

  return path
    .replace(
      /[*$]/g,
      ""
    )
    .length;
}


export function isUrlAllowedByRobots(
  rawUrl: string,
  policy: Pick<
    RobotsPolicy,
    "groups"
  >,
  userAgent =
    "CameraIntelligenceCollector"
): boolean {

  const canonical =
    canonicalizeUrl(
      rawUrl
    );

  if (!canonical) {
    return false;
  }


  const groups =
    matchingGroups(
      policy.groups,
      userAgent
    );

  if (
    groups.length === 0
  ) {
    return true;
  }


  const target =
    new URL(
      canonical
    );

  const path =
    `${target.pathname}${target.search}`;


  const matchingRules:
    RobotsRule[] = [];

  for (
    const group
    of groups
  ) {

    for (
      const rule
      of group.rules
    ) {

      if (
        ruleRegex(
          rule.path
        ).test(
          path
        )
      ) {
        matchingRules.push(
          rule
        );
      }
    }
  }


  if (
    matchingRules.length === 0
  ) {
    return true;
  }


  matchingRules.sort(
    (a, b) => {

      const difference =
        ruleSpecificity(
          b.path
        ) -
        ruleSpecificity(
          a.path
        );

      if (
        difference !== 0
      ) {
        return difference;
      }

      /*
       * Allow wins an equal-length tie.
       */
      if (
        a.type === b.type
      ) {
        return 0;
      }

      return (
        a.type === "ALLOW"
          ? -1
          : 1
      );
    }
  );


  return (
    matchingRules[0]?.type !==
    "DISALLOW"
  );
}


export async function fetchRobotsPolicy(
  siteUrl: string,
  options:
    FetchRobotsOptions = {}
): Promise<RobotsPolicy> {

  const origin =
    getCanonicalOrigin(
      siteUrl
    );

  if (!origin) {
    throw new Error(
      `Invalid site URL: ${siteUrl}`
    );
  }


  const robotsUrl =
    new URL(
      "robots.txt",
      origin
    ).toString();


  const timeoutMs =
    options.timeoutMs ??
    15000;

  const fetchFn =
    options.fetchFn ??
    fetch;


  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );


  try {

    const response =
      await fetchFn(
        robotsUrl,
        {
          method: "GET",
          redirect: "follow",

          signal:
            controller.signal,

          headers: {
            "user-agent":
              "CameraIntelligenceCollector/0.2",

            accept:
              "text/plain,*/*;q=0.1"
          }
        }
      );


    if (
      response.status === 404 ||
      response.status === 410
    ) {

      return {
        robotsUrl,
        status:
          response.status,
        available:
          false,
        sitemapUrls: [],
        groups: [],
        rawText: "",
        error: null
      };
    }


    if (
      !response.ok
    ) {

      return {
        robotsUrl,
        status:
          response.status,
        available:
          false,
        sitemapUrls: [],
        groups: [],
        rawText: "",
        error:
          `HTTP ${response.status}`
      };
    }


    const rawText =
      await response.text();

    const parsed =
      parseRobotsTxt(
        rawText,
        origin
      );


    return {
      robotsUrl,
      status:
        response.status,
      available:
        true,
      sitemapUrls:
        parsed.sitemapUrls,
      groups:
        parsed.groups,
      rawText,
      error: null
    };
  }
  catch (
    error
  ) {

    return {
      robotsUrl,
      status: null,
      available:
        false,
      sitemapUrls: [],
      groups: [],
      rawText: "",
      error:
        String(error)
    };
  }
  finally {
    clearTimeout(
      timer
    );
  }
}