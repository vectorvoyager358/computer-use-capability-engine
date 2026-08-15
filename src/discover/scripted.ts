import type { Decision, Model, ModelInput } from "./decision";

/** Test double: returns a fixed decision sequence. Not used for evidence. */
export class ScriptedModel implements Model {
  readonly name = "scripted";
  private index = 0;

  constructor(private readonly decisions: Decision[]) {}

  async decide(_input: ModelInput): Promise<Decision> {
    const next = this.decisions[this.index];
    if (!next) {
      return { type: "give_up", reason: "scripted model exhausted" };
    }
    this.index += 1;
    return next;
  }
}

export function lookupMemberScript(memberId: string): Decision[] {
  return [
    {
      type: "fill",
      role: "textbox",
      name: "Member ID",
      value: memberId,
      param: "memberId",
      reason: "enter the member number from params",
    },
    {
      type: "click",
      role: "button",
      name: "Search",
      reason: "submit the inquiry",
    },
    {
      type: "click",
      role: "button",
      name: "Continue",
      reason: "dismiss the session warning",
    },
    {
      type: "extract",
      rowText: "Savings",
      columnHeader: "Balance",
      output: "savingsBalance",
      outputType: "money",
      reason: "read savings from the account table",
    },
    {
      type: "done",
      name: "Look up member savings balance",
      description:
        "Search a member by ID and read the savings balance from the member detail table.",
      checkpointKind: "heading",
      checkpointValue: "Member detail",
      businessOutcomes: [
        { matchText: "Member not found", code: "member_not_found" },
      ],
      reason: "goal met",
    },
  ];
}
