// Thin clients for the two OpenRouter surfaces the app uses:
// - Decisions API (Jev): typed answers with probabilities
// - Chat Completions: option drafting, web search, explanations
// Request/response shapes follow @openrouter/sdk's Decisions models.

const BASE = "https://openrouter.ai";

export const JEV_MODEL = process.env.NEXT_PUBLIC_JEV_MODEL || "typesafe/jev-1.13";
export const CHAT_MODEL = process.env.NEXT_PUBLIC_CHAT_MODEL || "typesafe/jev-router";

// Runs in the browser (static GitHub Pages build), so each visitor supplies
// their own key; it is kept in memory here and in localStorage by the UI.
let apiKey = "";
export const setApiKey = (key: string) => {
  apiKey = key.trim();
};
export const hasApiKey = () => apiKey.length > 0;

type Guidance = string | Record<string, unknown> | unknown[];

export type ChoiceQuestion = {
  type: "choice";
  instructions: Guidance;
  criteria: Record<string, Guidance | null>;
};
export type NoulQuestion = {
  type: "noul";
  instructions: Guidance;
  criteria?: { true: Guidance; false: Guidance };
};
export type ScoreQuestion = {
  type: "score";
  instructions: Guidance;
  criteria: Guidance[];
};
export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};
export type NoulAnswer = { type: "noul"; noul: number };
export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};
export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export type DecisionsResponse = {
  id?: string;
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost?: number };
};

function headers() {
  if (!apiKey) throw new Error("OpenRouter API key is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "Jev Decider",
  };
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export function decide(
  state: unknown,
  questions: Record<string, Question>,
): Promise<DecisionsResponse> {
  return post<DecisionsResponse>(
    "/api/alpha/decisions",
    { model: JEV_MODEL, state, questions },
    15_000,
  );
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
  messages: ChatMessage[],
  opts: { webSearch?: boolean; maxTokens?: number; timeoutMs?: number } = {},
): Promise<{ text: string; cost?: number }> {
  const data = await post<{
    choices: { message: { content: string | null } }[];
    usage?: { cost?: number };
  }>(
    "/api/v1/chat/completions",
    {
      model: CHAT_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 600,
      usage: { include: true },
      ...(opts.webSearch ? { plugins: [{ id: "web", max_results: 3 }] } : {}),
    },
    opts.timeoutMs ?? 30_000,
  );
  return { text: data.choices?.[0]?.message?.content ?? "", cost: data.usage?.cost };
}
