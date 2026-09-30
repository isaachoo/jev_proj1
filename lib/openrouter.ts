// Thin clients for the two OpenRouter surfaces the app uses:
// - Decisions API (Jev): typed answers with probabilities
// - Chat Completions: option drafting, web search, explanations
// Request/response shapes follow @openrouter/sdk's Decisions models.

const BASE = "https://openrouter.ai";

export const JEV_MODEL = process.env.NEXT_PUBLIC_JEV_MODEL || "typesafe/jev-1.13";
export const CHAT_MODEL = process.env.NEXT_PUBLIC_CHAT_MODEL || "deepseek/deepseek-chat";
// Tried in order if the primary chat model's provider errors (e.g. blocks the region).
export const CHAT_FALLBACKS = (process.env.NEXT_PUBLIC_CHAT_FALLBACKS ?? "openai/gpt-4.1-mini,google/gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m && m !== CHAT_MODEL);

// Runs in the browser (static GitHub Pages build). Two ways to authenticate:
// - PROXY_URL set at build time: requests go through the Cloudflare Worker in
//   worker/, which holds the key. An optional access code is sent along.
// - Otherwise each visitor pastes their own key (kept in localStorage by the UI).
export const PROXY_URL = (process.env.NEXT_PUBLIC_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_PATHS: Record<string, string> = {
  "/api/alpha/decisions": "/decisions",
  "/api/v1/chat/completions": "/chat",
};

let apiKey = "";
let accessCode = "";
export const setApiKey = (key: string) => {
  apiKey = key.trim();
};
export const setAccessCode = (code: string) => {
  accessCode = code.trim();
};
export const hasApiKey = () => PROXY_URL.length > 0 || apiKey.length > 0;

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

function headers(): Record<string, string> {
  if (PROXY_URL) {
    return { "Content-Type": "application/json", ...(accessCode ? { "X-Access-Code": accessCode } : {}) };
  }
  if (!apiKey) throw new Error("OpenRouter API key is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "Jev Decider",
  };
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const url = PROXY_URL ? `${PROXY_URL}${PROXY_PATHS[path]}` : `${BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 && PROXY_URL) throw new Error("ACCESS_CODE_REQUIRED");
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
): Promise<{ text: string; cost?: number; model?: string }> {
  const data = await post<{
    model?: string;
    choices: { message: { content: string | { type: string; text?: string }[] | null } }[];
    usage?: { cost?: number };
  }>(
    "/api/v1/chat/completions",
    {
      ...(CHAT_FALLBACKS.length ? { models: [CHAT_MODEL, ...CHAT_FALLBACKS] } : { model: CHAT_MODEL }),
      messages,
      // Generous budget: routed models may spend tokens on reasoning first.
      max_tokens: opts.maxTokens ?? 1500,
      usage: { include: true },
      ...(opts.webSearch ? { plugins: [{ id: "web", max_results: 3 }] } : {}),
    },
    opts.timeoutMs ?? 30_000,
  );
  const content = data.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((p) => p.text ?? "").join("") : content ?? "";
  return { text, cost: data.usage?.cost, model: data.model };
}
