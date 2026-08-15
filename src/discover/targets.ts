import type { LocatorSet, Risk } from "../schema/capability";

export function roleTarget(role: string, name: string): LocatorSet {
  const candidates: LocatorSet["candidates"] = [
    { strategy: "role_name", role, name },
  ];
  if (role === "textbox") {
    candidates.push({ strategy: "label", label: name });
  }
  return { candidates };
}

export function tableTarget(rowText: string, columnHeader: string): LocatorSet {
  return {
    candidates: [{ strategy: "table_cell", rowText, columnHeader }],
  };
}

export function clickRisk(name: string): Risk {
  return /transfer|delete|confirm|wire|post/i.test(name)
    ? "irreversible"
    : "read";
}

export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "step"
  );
}
