import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../apps/core-servicing/server";

const servers: Server[] = [];

async function start() {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
});

async function page(base: string, path = "/") {
  return (await fetch(`${base}${path}`)).text();
}

describe("core-servicing app", () => {
  it("serves a search form with Member ID and Search, and no test ids", async () => {
    const html = await page(await start());

    expect(html).toContain('label for="f1">Member ID</label>');
    expect(html).toContain('type="submit" id="cmd1" value="Search"');
    expect(html).not.toMatch(/data-testid/);
    expect(html).not.toMatch(/id="member-/i);
  });

  it("shows member detail and the savings balance for a known member", async () => {
    const html = await page(await start(), "/member?id=10001");

    expect(html).toContain("<h1>Member detail</h1>");
    expect(html).toContain("<th>Account</th><th>Balance</th>");
    expect(html).toContain("<td>Savings</td>");
    expect(html).toContain("<td>$1,240.50</td>");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Your session is about to expire.");
    expect(html).toContain('id="cmd2" value="Continue"');
    expect(html).toContain('id="member-body" hidden');
    expect(html).not.toContain("Member not found");
  });

  it("shows a different savings balance for member 10002", async () => {
    const html = await page(await start(), "/member?id=10002");

    expect(html).toContain("<h1>Member detail</h1>");
    expect(html).toContain("<td>$50.00</td>");
    expect(html).not.toContain("Member not found");
  });

  it("shows Member not found for an unknown id", async () => {
    const html = await page(await start(), "/member?id=99999");

    expect(html).toContain("Member not found");
    expect(html).not.toContain("<h1>Member detail</h1>");
  });

  it("shows a validation message when member id is missing", async () => {
    const html = await page(await start(), "/member?id=");

    expect(html).toContain("Member ID is required");
    expect(html).not.toContain("<h1>Member detail</h1>");
  });
});
