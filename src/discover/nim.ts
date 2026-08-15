import {
  type Decision,
  DecisionSchema,
  type Model,
  type ModelInput,
} from "./decision";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";

export const DEFAULT_NIM_BASE = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_NIM_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

const TOOLS = [
  tool(
    "fill",
    "Type into a labeled control.",
    {
      role: { type: "string" },
      name: { type: "string" },
      value: { type: "string" },
      param: { type: "string" },
      reason: { type: "string" },
    },
    ["role", "name", "value", "reason"],
  ),
  tool(
    "click",
    "Activate a control by role and accessible name.",
    {
      role: { type: "string" },
      name: { type: "string" },
      reason: { type: "string" },
    },
    ["role", "name", "reason"],
  ),
  tool(
    "extract",
    "Read a table cell by row text and column header.",
    {
      rowText: { type: "string" },
      columnHeader: { type: "string" },
      output: { type: "string" },
      outputType: {
        type: "string",
        enum: ["string", "number", "boolean", "money"],
      },
      reason: { type: "string" },
    },
    ["rowText", "columnHeader", "output", "reason"],
  ),
  tool(
    "done",
    "Goal is met. Emit the capability title and success checkpoint.",
    {
      name: { type: "string" },
      description: { type: "string" },
      checkpointKind: {
        type: "string",
        enum: ["text", "url", "heading", "role_name"],
      },
      checkpointValue: { type: "string" },
      businessOutcomes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            matchText: { type: "string" },
            code: { type: "string" },
          },
          required: ["matchText", "code"],
        },
      },
      reason: { type: "string" },
    },
    ["name", "description", "checkpointKind", "checkpointValue", "reason"],
  ),
  tool(
    "give_up",
    "No safe next action.",
    {
      reason: { type: "string" },
    },
    ["reason"],
  ),
];

export class NvidiaNimModel implements Model {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    model = process.env.NVIDIA_MODEL ?? DEFAULT_NIM_MODEL,
    private readonly baseUrl = process.env.NVIDIA_BASE_URL ?? DEFAULT_NIM_BASE,
  ) {
    this.name = model;
  }

  async decide(input: ModelInput): Promise<Decision> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.name,
          temperature: 0,
          max_tokens: 1024,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt(input) },
          ],
          tools: TOOLS,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`nim ${response.status}: ${body.slice(0, 240)}`);
    }
    return parseChatDecision(await response.json());
  }
}

export function parseChatDecision(data: unknown): Decision {
  const message = (
    data as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            function?: { name?: string; arguments?: unknown };
          }>;
        };
      }>;
    }
  ).choices?.[0]?.message;
  const call = message?.tool_calls?.[0]?.function;
  if (call?.name) {
    return DecisionSchema.parse({
      type: call.name,
      ...asObject(call.arguments),
    });
  }
  const raw = message?.content;
  if (!raw) throw new Error("nim returned an empty decision");
  return DecisionSchema.parse(JSON.parse(stripFence(raw)));
}

function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string")
    return JSON.parse(raw) as Record<string, unknown>;
  return {};
}

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced?.[1] ?? trimmed;
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}
