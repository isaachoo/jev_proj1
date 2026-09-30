// Decision pipeline:
//   1. plan    — Jev decides which data sources the question needs (Noul per source)
//      options — a chat model drafts the candidate answers (Jev only picks, never writes)
//   2. gather  — fetch the chosen sources in parallel
//   3. decide  — Jev picks one option (Choice) from question + gathered data
// The explanation is a separate call (see explain()) so the decision shows first.

import { chat, hasApiKey, decide as jevDecide, type ChoiceAnswer, type NoulAnswer, type Question } from "./openrouter";
import * as src from "./sources";
import * as mock from "./mock";

export type Lang = "en" | "zh-Hant";
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  "zh-Hant": "Traditional Chinese as used in Hong Kong (繁體中文)",
};

export type Option = { id: string; label: string; description: string };
export type Source = "weather" | "air_quality" | "daylight" | "place" | "nearby" | "web";
export const SOURCES: Source[] = ["weather", "air_quality", "daylight", "place", "nearby", "web"];

export type Input = {
  question: string;
  lang: Lang;
  coords?: src.Coords;
  localTime: string; // ISO-ish string from the browser
  timezone: string;
};

export type PlanResult = { need: Record<Source, number>; selected: Source[]; cost?: number };
export type Decision = {
  choice: string;
  confidence?: number;
  probabilities: Record<string, number>;
  enoughInfo?: number;
  cost?: number;
};

const isMock = () => !hasApiKey();
export const mockMode = isMock;

const SOURCE_QUESTIONS: Record<Source, { instructions: string; threshold: number }> = {
  weather: {
    instructions:
      "Would the current or next few hours of weather (rain, temperature, wind, UV) meaningfully change the best answer to the user's question?",
    threshold: 0.4,
  },
  air_quality: {
    instructions:
      "Would outdoor air quality (AQI, pollution) meaningfully change the best answer to the user's question?",
    threshold: 0.5,
  },
  daylight: {
    instructions:
      "Would whether it is daytime, or the sunrise/sunset time, meaningfully change the best answer to the user's question?",
    threshold: 0.5,
  },
  place: {
    instructions:
      "Does answering the user's question depend on knowing which city or neighbourhood the user is in?",
    threshold: 0.5,
  },
  nearby: {
    instructions:
      "Does answering the user's question depend on what places (restaurants, parks, shops, stations, clinics) are within walking distance of the user?",
    threshold: 0.5,
  },
  web: {
    instructions:
      "Does answering the user's question require up-to-date facts NOT covered by weather, air quality, daylight, the place name, or a list of nearby places — for example events, news, warnings, transit disruptions, opening hours, or prices?",
    threshold: 0.55,
  },
};

export async function plan(input: Input): Promise<PlanResult> {
  const questions: Record<string, Question> = {};
  for (const s of SOURCES) {
    questions[`need_${s}`] = {
      type: "noul",
      instructions: SOURCE_QUESTIONS[s].instructions,
      criteria: { true: "This data would change the answer", false: "This data is irrelevant to the answer" },
    };
  }
  const state = {
    user_question: input.question,
    local_time: input.localTime,
    location_available: Boolean(input.coords),
  };
  const res = isMock() ? mock.planResponse(input.question) : await jevDecide(state, questions);

  const need = {} as Record<Source, number>;
  for (const s of SOURCES) need[s] = (res.answers[`need_${s}`] as NoulAnswer | undefined)?.noul ?? 0;

  let selected = SOURCES.filter((s) => need[s] >= SOURCE_QUESTIONS[s].threshold);
  // Location-based sources are useless without coordinates.
  if (!input.coords) selected = selected.filter((s) => s === "web");
  // Nearby results and web search are far better with a place name.
  if ((selected.includes("web") || selected.includes("nearby")) && input.coords && !selected.includes("place")) {
    selected.push("place");
  }
  return { need, selected, cost: res.usage?.cost };
}

export async function draftOptions(input: Input): Promise<{ options: Option[]; cost?: number }> {
  if (isMock()) return { options: mock.options(input.question, input.lang) };

  const system = `You turn a person's everyday question into 2-6 mutually exclusive, concrete answer options for a decision engine to choose between.
Rules:
- Options must directly answer the question and be actionable right now.
- Yes/no questions get "yes"/"no" style options (you may add one nuanced middle option).
- Do not decide; just list the options.
- "label" is at most 8 words, "description" at most 25 words, both in ${LANG_NAME[input.lang]}.
- "id" is a short lowercase snake_case English slug, unique.
Reply with JSON only, no markdown, no commentary: {"options":[{"id":"...","label":"...","description":"..."}]}`;

  let cost = 0;
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: attempt === 0 ? input.question : `${input.question}\n\n(Reply with the JSON object only.)` },
      ],
      { maxTokens: 1500, timeoutMs: 25_000 },
    );
    cost += res.cost ?? 0;
    lastText = res.text;
    const options = parseOptions(res.text);
    if (options.length >= 2) return { options, cost };
  }
  const snippet = lastText.trim().replace(/\s+/g, " ").slice(0, 160) || "(empty reply)";
  throw new Error(`Could not draft answer options for this question. Model replied: ${snippet}`);
}

function parseOptions(text: string): Option[] {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  let raw: unknown;
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = cleaned.indexOf(open);
    const end = cleaned.lastIndexOf(close);
    if (start < 0 || end <= start) continue;
    try {
      raw = JSON.parse(cleaned.slice(start, end + 1));
      break;
    } catch {}
  }
  const list = Array.isArray(raw) ? raw : (raw as { options?: unknown } | undefined)?.options;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: Option[] = [];
  list.forEach((item, i) => {
    const o = (typeof item === "string" ? { label: item } : item) as Partial<Option>;
    if (!o || typeof o.label !== "string" || !o.label.trim()) return;
    let id = (typeof o.id === "string" ? o.id : "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if (!id || seen.has(id)) id = `option_${i + 1}`;
    seen.add(id);
    out.push({ id, label: o.label.trim(), description: typeof o.description === "string" ? o.description : "" });
  });
  return out.slice(0, 6);
}

export type GatherEvent = { source: Source; ok: boolean; ms: number; error?: string };

export async function gather(
  input: Input,
  selected: Source[],
  onEvent: (e: GatherEvent) => void,
): Promise<{ data: Record<string, unknown>; cost: number }> {
  const data: Record<string, unknown> = {};
  let cost = 0;
  const coords = input.coords;

  const run = async (source: Source, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      const value = isMock() ? await mock.source(source) : await fn();
      if (value && typeof value === "object" && "cost" in value) {
        const v = value as { cost?: number; summary: string };
        cost += v.cost ?? 0;
        data[source] = v.summary;
      } else {
        data[source] = value;
      }
      onEvent({ source, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      data[source] = { unavailable: true };
      onEvent({ source, ok: false, ms: Date.now() - t0, error: (err as Error).message });
    }
  };

  const has = (s: Source) => selected.includes(s);
  const osmLang = input.lang === "zh-Hant" ? "zh-HK,zh-Hant,en" : "en";

  // Place name first (fast) so web search can use it; everything else in parallel.
  const placeTask = has("place") && coords ? run("place", () => src.placeName(coords, osmLang)) : Promise.resolve();

  const tasks: Promise<void>[] = [placeTask];
  if (coords && (has("weather") || has("daylight"))) {
    // Daylight comes from the same Open-Meteo call as weather.
    const key: Source = has("weather") ? "weather" : "daylight";
    tasks.push(
      run(key, async () => {
        const w = await src.weather(coords, has("daylight"));
        if (!has("weather")) return w.daylight;
        return w;
      }),
    );
  }
  if (coords && has("air_quality")) tasks.push(run("air_quality", () => src.airQuality(coords)));
  if (coords && has("nearby")) tasks.push(run("nearby", () => src.nearbyPlaces(coords)));
  if (has("web")) {
    tasks.push(
      placeTask.then(() => {
        const p = data.place as { area?: string; city?: string; country?: string } | undefined;
        const place = p ? [p.area, p.city, p.country].filter(Boolean).join(", ") : undefined;
        return run("web", () => src.webSearch(input.question, { place, localTime: input.localTime, lang: input.lang }));
      }),
    );
  }
  await Promise.all(tasks);
  return { data, cost };
}

export async function decide(input: Input, options: Option[], data: Record<string, unknown>): Promise<Decision> {
  const criteria: Record<string, string> = {};
  for (const o of options) criteria[o.id] = o.description ? `${o.label}: ${o.description}` : o.label;

  const state = {
    user_question: input.question,
    local_time: input.localTime,
    timezone: input.timezone,
    location: input.coords ? { lat: round(input.coords.lat), lon: round(input.coords.lon) } : "unknown",
    data,
  };
  const questions: Record<string, Question> = {
    decision: {
      type: "choice",
      instructions:
        "Pick the option that best answers user_question for this person right now, using the current conditions in data. Prefer safe, practical choices when conditions are borderline.",
      criteria,
    },
    enough_info: {
      type: "noul",
      instructions: "Is the information in state sufficient to answer user_question with confidence?",
      criteria: { true: "Sufficient information", false: "Important information is missing" },
    },
  };

  const res = isMock() ? mock.decideResponse(options) : await jevDecide(state, questions);
  const answer = res.answers.decision as ChoiceAnswer | undefined;
  if (!answer || answer.type !== "choice") throw new Error("Jev returned no decision");
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities ?? { [answer.choice]: 1 },
    enoughInfo: (res.answers.enough_info as NoulAnswer | undefined)?.noul,
    cost: res.usage?.cost,
  };
}

export async function explain(args: {
  question: string;
  lang: Lang;
  chosen: Option;
  others: Option[];
  confidence?: number;
  data: Record<string, unknown>;
  localTime: string;
}): Promise<{ text: string; cost?: number }> {
  if (isMock()) return { text: mock.explanation(args.chosen, args.lang) };
  return chat(
    [
      {
        role: "system",
        content: `A decision engine already chose an answer. Explain in ${LANG_NAME[args.lang]}, in 2-3 short sentences, why it fits the person's situation, citing the specific data points (numbers, times, place names) that matter. Then give one practical tip. Do not change the decision. No headings.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          question: args.question,
          local_time: args.localTime,
          chosen: args.chosen,
          other_options: args.others.map((o) => o.label),
          confidence: args.confidence,
          data: args.data,
        }),
      },
    ],
    { maxTokens: 1200, timeoutMs: 25_000 },
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
