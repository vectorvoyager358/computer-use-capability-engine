import {
  type Browser,
  chromium,
  type Page,
  type Locator as PwLocator,
} from "playwright";
import type { Checkpoint, Locator, LocatorSet } from "../schema/capability";
import {
  describeTarget,
  LocatorError,
  type Observation,
  type Surface,
} from "./surface";

const TIMEOUT_MS = 5_000;

export class PlaywrightWebSurface implements Surface {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async launch(
    options: { headless?: boolean } = {},
  ): Promise<PlaywrightWebSurface> {
    const browser = await chromium.launch({
      headless: options.headless ?? true,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    return new PlaywrightWebSurface(browser, page);
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async click(target: LocatorSet) {
    await (await this.resolve(target)).click();
  }

  async fill(target: LocatorSet, value: string) {
    await (await this.resolve(target)).fill(value);
  }

  async select(target: LocatorSet, value: string) {
    await (await this.resolve(target)).selectOption(value);
  }

  async extract(target: LocatorSet) {
    return (await (await this.resolve(target)).innerText()).trim();
  }

  async dismiss(target: LocatorSet) {
    await (await this.resolve(target)).click();
  }

  async observe(): Promise<Observation> {
    const dialog = this.page.locator('[role="dialog"], [role="alertdialog"]');
    const dialogText =
      (await dialog.count()) > 0
        ? (await dialog.first().innerText()).trim()
        : undefined;
    return {
      url: this.page.url(),
      text: await this.page.locator("body").innerText(),
      dialog: dialogText,
    };
  }

  async checkpointMet(checkpoint: Checkpoint) {
    switch (checkpoint.kind) {
      case "text":
        return (await this.observe()).text.includes(checkpoint.value);
      case "url":
        return this.page.url().includes(checkpoint.value);
      case "heading":
        return (
          (await this.page
            .getByRole("heading", { name: checkpoint.value })
            .count()) > 0
        );
      case "role_name": {
        const [role, name] = checkpoint.value.split(":", 2);
        if (!role || !name) return false;
        return (await this.page.getByRole(asRole(role), { name }).count()) > 0;
      }
    }
  }

  async screenshot(path: string) {
    await this.page.screenshot({ path, fullPage: true });
  }

  async close() {
    await this.browser.close();
  }

  private async resolve(target: LocatorSet): Promise<PwLocator> {
    for (const candidate of target.candidates) {
      const locator = await this.candidateLocator(candidate);
      if (!locator) continue;
      if ((await locator.count()) > 0 && (await locator.first().isVisible())) {
        return locator.first();
      }
    }
    const observed = (await this.observe()).text.slice(0, 240);
    throw new LocatorError(describeTarget(target), observed || "(empty page)");
  }

  private async candidateLocator(
    candidate: Locator,
  ): Promise<PwLocator | null> {
    switch (candidate.strategy) {
      case "role_name":
        return this.page.getByRole(asRole(candidate.role), {
          name: candidate.name,
          exact: candidate.exact,
        });
      case "label":
        return this.page.getByLabel(candidate.label);
      case "nearby_text":
        return candidate.role
          ? this.page.getByRole(asRole(candidate.role), {
              name: candidate.text,
            })
          : this.page.getByText(candidate.text);
      case "table_cell":
        return this.tableCell(candidate.rowText, candidate.columnHeader);
      case "structural":
        return this.page.locator(candidate.path);
      case "css":
        return this.page.locator(candidate.selector);
    }
  }

  private async tableCell(
    rowText: string,
    columnHeader: string,
  ): Promise<PwLocator | null> {
    const tables = this.page.locator("table");
    const tableCount = await tables.count();
    for (let i = 0; i < tableCount; i += 1) {
      const table = tables.nth(i);
      const rows = table.locator(":scope > tbody > tr, :scope > tr");
      const rowCount = await rows.count();
      if (rowCount === 0) continue;
      const headers = (
        await rows.first().locator(":scope > th").allTextContents()
      ).map((h) => h.trim());
      const col = headers.indexOf(columnHeader);
      if (col < 0) continue;
      for (let r = 1; r < rowCount; r += 1) {
        const row = rows.nth(r);
        const cells = (await row.locator(":scope > td").allTextContents()).map(
          (c) => c.trim(),
        );
        if (cells.includes(rowText) && cells[col]) {
          return row.locator(":scope > td").nth(col);
        }
      }
    }
    return null;
  }
}

function asRole(role: string): Parameters<Page["getByRole"]>[0] {
  return role as Parameters<Page["getByRole"]>[0];
}
