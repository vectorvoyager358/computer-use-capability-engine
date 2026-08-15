import http from "node:http";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4173;

type Member = {
  displayName: string;
  accounts: { type: string; balance: string }[];
};

/** Synthetic members only — no real PII. */
export const MEMBERS: Record<string, Member> = {
  "10001": {
    displayName: "Alex Rivera",
    accounts: [
      { type: "Checking", balance: "$88.12" },
      { type: "Savings", balance: "$1,240.50" },
    ],
  },
  "10002": {
    displayName: "Jordan Lee",
    accounts: [{ type: "Savings", balance: "$50.00" }],
  },
};

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end("Method not allowed");
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      send(res, searchPage());
      return;
    }
    if (url.pathname === "/member") {
      send(res, memberPage(url.searchParams.get("id") ?? ""));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
}

function send(res: http.ServerResponse, html: string) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shell(body: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Core Servicing</title>
<style>
  body { margin: 0; background: #c0c0c0; font-family: Tahoma, sans-serif; font-size: 12px; }
  table.layout { width: 100%; background: navy; color: white; }
  table.panel { background: #e8e8e8; color: black; border: 2px inset #fff; }
  table.data { border-collapse: collapse; background: white; }
  table.data th, table.data td { border: 1px solid #666; padding: 4px 8px; }
  .banner { padding: 6px 10px; font-weight: bold; }
</style>
</head>
<body>
<table class="layout" cellpadding="0" cellspacing="0"><tr><td class="banner">Core Servicing — Member Inquiry</td></tr></table>
<table class="layout" cellpadding="8" cellspacing="0"><tr><td>
<table class="panel" cellpadding="8" cellspacing="0" width="100%"><tr><td>
${body}
</td></tr></table>
</td></tr></table>
</body>
</html>`;
}

function searchPage(message = "") {
  const notice = message
    ? `<tr><td colspan="2">${escapeHtml(message)}</td></tr>`
    : "";
  return shell(`
<form method="get" action="/member">
<table cellpadding="4" cellspacing="0">
${notice}
<tr>
  <td><label for="f1">Member ID</label></td>
  <td><input type="text" name="id" id="f1" size="16"></td>
</tr>
<tr>
  <td></td>
  <td><input type="submit" id="cmd1" value="Search"></td>
</tr>
</table>
</form>`);
}

function memberPage(rawId: string) {
  const id = rawId.trim();
  if (!id) {
    return searchPage("Member ID is required");
  }
  const member = MEMBERS[id];
  if (!member) {
    return searchPage("Member not found");
  }
  const rows = member.accounts
    .map(
      (account) =>
        `<tr><td>${escapeHtml(account.type)}</td><td>${escapeHtml(account.balance)}</td></tr>`,
    )
    .join("");
  return shell(`
<div role="dialog" aria-modal="true" aria-labelledby="sess-title">
<table class="panel" cellpadding="8" cellspacing="0">
  <tr><td id="sess-title"><b>Your session is about to expire.</b></td></tr>
  <tr><td><input type="button" id="cmd2" value="Continue"></td></tr>
</table>
</div>
<div id="member-body" hidden>
<h1>Member detail</h1>
<table cellpadding="4" cellspacing="0">
  <tr><td>Member</td><td>${escapeHtml(id)}</td></tr>
  <tr><td>Name</td><td>${escapeHtml(member.displayName)}</td></tr>
</table>
<br>
<table class="data">
  <tr><th>Account</th><th>Balance</th></tr>
  ${rows}
</table>
<p><a href="/">New search</a></p>
</div>
<script>
document.getElementById("cmd2").onclick = function () {
  var dialog = document.querySelector('[role="dialog"]');
  if (dialog) dialog.remove();
  document.getElementById("member-body").hidden = false;
};
</script>`);
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  createServer().listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Core servicing listening on http://127.0.0.1:${port}/\n`,
    );
  });
}
