import { chromium, type BrowserContext, type Page } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs";

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
}

export async function openBrowser(): Promise<BrowserSession> {
  const profileDir = path.resolve(
    process.cwd(),
    "data",
    "profiles",
    "default"
  );

  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    ignoreHTTPSErrors: true
  });

  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();

  return {
    context,
    page
  };
}
