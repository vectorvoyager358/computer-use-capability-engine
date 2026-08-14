import type { Step } from "../schema/capability";
import type { Policy } from "./schema";

export type Denial = {
  kind: "block" | "escalate";
  reason: string;
};

export function authorize(
  step: Step,
  url: string | undefined,
  policy: Policy,
): Denial | null {
  if (!policy.allowedActions.includes(step.action)) {
    return {
      kind: "block",
      reason: `action "${step.action}" is not allowlisted`,
    };
  }

  if (step.action === "navigate" && url) {
    const denied = authorizeUrl(url, policy);
    if (denied) return denied;
  }

  if (step.risk === "irreversible") {
    return {
      kind: policy.onIrreversible,
      reason: `irreversible step "${step.id}"`,
    };
  }

  return null;
}

export function authorizeUrl(url: string, policy: Policy): Denial | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "block", reason: `invalid url "${url}"` };
  }

  if (!policy.allowedHosts.includes(parsed.hostname)) {
    return {
      kind: "block",
      reason: `host "${parsed.hostname}" is not allowlisted`,
    };
  }

  const allowedPath = policy.allowedPathPrefixes.some((prefix) =>
    pathAllowed(parsed.pathname, prefix),
  );
  if (!allowedPath) {
    return {
      kind: "block",
      reason: `path "${parsed.pathname}" is not allowlisted`,
    };
  }

  return null;
}

function pathAllowed(pathname: string, prefix: string): boolean {
  if (prefix === "/") return true;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
