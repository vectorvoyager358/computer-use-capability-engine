import type { ModelInput } from "./decision";

export const SYSTEM_PROMPT = `You drive a legacy UI one action at a time to accomplish a goal.
You see an accessibility inventory (role + accessible name) and page text. Prefer those names. Never invent CSS or test IDs.
Call exactly one tool:
- fill — type into a control that has no value yet. Set param to the invocation parameter name when the value must not be hardcoded. Never fill the same control twice.
- click — activate a control. After Member ID is filled, click Search. Search is allowed. Do not transfer, delete, or confirm.
- extract — required before done when the goal asks for a displayed value. Read a table cell by row text and column header (Savings / Balance).
- done — only after extracts succeed. Use checkpointKind heading and the page h1 (e.g. Member detail). Never use a dollar amount as the checkpoint. If the UI can show "Member not found", include businessOutcomes [{ matchText: "Member not found", code: "member_not_found" }].
- give_up — no safe next action.
Do not return prose. Do not invent locators that are not in the inventory (table extract is the exception).
Do not put invocation param values (member numbers, balances) into done.name or done.description.
Page text often omits input values. Trust the inventory value= field and Already done. Do not repeat those actions.`;

export function userPrompt(input: ModelInput): string {
  return [
    `Goal: ${input.goal}`,
    `Invocation params: ${JSON.stringify(input.params)}`,
    `Param names (parameterize these in the artifact): ${input.paramNames.join(", ") || "(none)"}`,
    `URL: ${input.observation.url}`,
    input.observation.dialog ? `Dialog: ${input.observation.dialog}` : "",
    `Controls:\n${input.inventory.map(formatControl).join("\n") || "(none)"}`,
    `Page text:\n${input.observation.text.slice(0, 4000)}`,
    `Already done:\n${input.history.join("\n") || "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatControl(control: ModelInput["inventory"][number]): string {
  const value = control.value ? ` value=${JSON.stringify(control.value)}` : "";
  return `- ${control.role} "${control.name}"${value}`;
}
