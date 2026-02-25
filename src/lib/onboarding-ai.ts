import OpenAI from "openai";

type MessageParam = { role: "user" | "assistant"; content: string };

type AIQuestion = { type: "question"; content: string };
type AIComplete = { type: "complete"; draft: OnboardingDraft };
export type AIResult = AIQuestion | AIComplete;

export type OnboardingDraft = {
  status: "complete";
  board_type: string;
  objective: string | null;
  success_metrics: Record<string, unknown> | null;
  target_date: string | null;
  user_profile: null;
  lead_agent: null;
};

const SYSTEM_PROMPT = `You are an onboarding assistant helping users define a clear goal for a new project board.
Ask up to 4 focused questions ONE AT A TIME:
1. Board type (product/engineering/ops/research/other)
2. Primary objective (1-sentence outcome)
3. 2-3 success metrics
4. Target date or timeframe

Always respond with pure JSON — no markdown, no prose.

For questions use:
{"question":"...","options":["option1","option2","...","I'll type my own"]}

After receiving 4 user messages, respond with the complete draft:
{"status":"complete","board_type":"...","objective":"...","success_metrics":{"metric1":"..."},"target_date":"...","user_profile":null,"lead_agent":null}`;

function isDraft(parsed: unknown): parsed is OnboardingDraft {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  return obj.status === "complete" && typeof obj.board_type === "string";
}

export async function callOnboardingAI(
  messages: MessageParam[],
  apiKey: string
): Promise<AIResult> {
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  const model =
    process.env.OPENROUTER_MODEL ?? "openrouter/auto:free";

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response from AI");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Strip markdown fences and retry
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!match) throw new Error("AI response was not valid JSON");
    parsed = JSON.parse(match[1]);
  }

  if (isDraft(parsed)) {
    return { type: "complete", draft: parsed };
  }

  return { type: "question", content: text };
}
