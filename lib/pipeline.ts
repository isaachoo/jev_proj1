// Decision pipeline:
//   1. plan    — one Jev call: which data sources to fetch (Noul per source),
//                which things to ask the person (Noul per ask), and the shape
//                of the question itself (stakes, urgency, tone, intent…)
//      options — a chat model drafts the candidate answers (Jev only picks, never writes)
//   2. ask     — the UI shows at most MAX_ASKS quick questions (mood, budget…)
//   3. gather  — fetch the chosen sources in parallel
//   4. decide  — Jev picks one option (Choice) from question + data + self-report + profile
// The explanation is a separate call (see explain()) so the decision shows first.

import { ASKS, ASK_KEYS, MAX_ASKS, type AskAnswers, type AskKey } from "./asks";
import { chat, hasApiKey, decide as jevDecide, type ChoiceAnswer, type NoulAnswer, type Question } from "./openrouter";
import * as src from "./sources";
import * as mock from "./mock";

export type Lang = "en" | "zh-Hant";
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  "zh-Hant": "Traditional Chinese as used in Hong Kong (繁體中文)",
};

export type Option = { id: string; label: string; description: string };

export type Source =
  | "weather"
  | "forecast_week"
  | "air_quality"
  | "daylight"
  | "alerts"
  | "marine"
  | "place"
  | "nearby"
  | "transit"
  | "routes"
  | "calendar"
  | "web";
export const SOURCES: Source[] = [
  "weather",
  "forecast_week",
  "air_quality",
  "daylight",
  "alerts",
  "marine",
  "place",
  "nearby",
  "transit",
  "routes",
  "calendar",
  "web",
];
// Sources that only make sense with coordinates.
const NEEDS_COORDS: Source[] = ["weather", "forecast_week", "air_quality", "daylight", "alerts", "marine", "place", "nearby", "transit", "routes"];
// Sources that work much better once the place name (and country) is known.
const WANTS_PLACE: Source[] = ["web", "nearby", "transit", "routes", "calendar"];

export type Input = {
  question: string;
  lang: Lang;
  coords?: src.Coords;
  localTime: string; // ISO-ish string from the browser
  timezone: string;
  profile?: Record<string, unknown>; // compact form, see profile.ts
  places?: { home?: src.Coords; work?: src.Coords }; // for "go home" style routes
  history?: unknown; // recent rated decisions
};

export type Signals = {
  stakes: "low" | "medium" | "high";
  urgency: "now" | "today" | "can_wait";
  reversibility: "easy_to_undo" | "hard_to_undo";
  tone: "neutral" | "stressed" | "sad" | "anxious" | "excited" | "frustrated" | "conflicted";
  intent: "information" | "permission" | "reassurance" | "venting";
  involves_others: number;
};

export type PlanResult = {
  need: Record<Source, number>;
  selected: Source[];
  askNeed: Record<AskKey, number>;
  asks: AskKey[];
  signals: Signals;
  cost?: number;
};
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
      "Would the current or next few hours of weather (rain, temperature, humidity, wind, UV, heat stress) meaningfully change the best answer to the user's question?",
    threshold: 0.4,
  },
  forecast_week: {
    instructions:
      "Does the question concern a day later than today (tomorrow, the weekend, a date this week), so that the multi-day forecast would change the best answer?",
    threshold: 0.55,
  },
  air_quality: {
    instructions:
      "Would outdoor air quality (AQI, pollution, pollen) meaningfully change the best answer to the user's question?",
    threshold: 0.5,
  },
  daylight: {
    instructions:
      "Would whether it is daytime, the sunrise/sunset time, or the moon phase meaningfully change the best answer to the user's question?",
    threshold: 0.5,
  },
  alerts: {
    instructions:
      "Would an official warning in force (typhoon, rainstorm, thunderstorm, extreme heat, cold, flood, earthquake) meaningfully change the best answer? True for most questions about going outdoors, travelling, or making plans today.",
    threshold: 0.5,
  },
  marine: {
    instructions:
      "Does the question involve the sea: swimming, beach, boat, ferry, kayak, fishing, so that wave height and sea temperature would change the answer?",
    threshold: 0.6,
  },
  place: {
    instructions:
      "Does answering the user's question depend on knowing which city or neighbourhood the user is in?",
    threshold: 0.5,
  },
  nearby: {
    instructions:
      "Does answering the user's question depend on what places (restaurants, cafes, parks, shops, pharmacies, clinics, toilets, gyms) are within walking distance of the user?",
    threshold: 0.5,
  },
  transit: {
    instructions:
      "Does the question involve choosing or using public transport (bus, MTR/metro, tram, ferry, taxi) so that nearby stops and stations would change the answer?",
    threshold: 0.55,
  },
  routes: {
    instructions:
      "Does the question involve getting to a specific destination (a named place, 'home', 'work', 'the office') so that distance, travel time, and hills would change the answer?",
    threshold: 0.55,
  },
  calendar: {
    instructions:
      "Would whether today is a weekend, public holiday, or rush hour meaningfully change the best answer (crowds, opening, traffic, offices)?",
    threshold: 0.5,
  },
  web: {
    instructions:
      "Does answering the user's question require up-to-date facts NOT covered by weather, warnings, air quality, daylight, place name, nearby places, transit stops, or holidays — for example events, news, strikes, opening hours of a specific shop, prices, or product information?",
    threshold: 0.55,
  },
};

const SIGNAL_QUESTIONS: Record<keyof Signals, Question> = {
  stakes: {
    type: "choice",
    instructions: "How much does getting this decision wrong matter for the person?",
    criteria: {
      low: "Trivial or easily fixed: what to eat, umbrella, small purchases",
      medium: "Costs real time, money, comfort or a mildly awkward moment",
      high: "Affects health, safety, money that matters, a relationship, a job, or a commitment",
    },
  },
  urgency: {
    type: "choice",
    instructions: "How soon does the person need to act on this?",
    criteria: {
      now: "Within the next few minutes or hour",
      today: "Sometime today",
      can_wait: "Can be decided later today or another day",
    },
  },
  reversibility: {
    type: "choice",
    instructions: "If the person picks an option and regrets it, how easily can they change course?",
    criteria: {
      easy_to_undo: "Can switch, return, or redo with little cost",
      hard_to_undo: "Sending a message, cancelling, spending, committing, or confronting someone",
    },
  },
  tone: {
    type: "choice",
    instructions: "What emotional tone does the wording of the question carry?",
    criteria: {
      neutral: "Plain, practical question",
      stressed: "Pressured, overwhelmed, too much going on",
      sad: "Low, lonely, discouraged",
      anxious: "Worried, second-guessing, afraid of an outcome",
      excited: "Eager, upbeat, looking forward",
      frustrated: "Annoyed, angry, fed up",
      conflicted: "Torn between options, guilt, 'should I really'",
    },
  },
  intent: {
    type: "choice",
    instructions: "What is the person really after?",
    criteria: {
      information: "Wants the practically best option given the facts",
      permission: "Already leans one way and wants a nudge or a check",
      reassurance: "Wants to feel okay about a situation more than a fact",
      venting: "Mostly expressing frustration; the decision is secondary",
    },
  },
  involves_others: {
    type: "noul",
    instructions: "Does this decision directly affect or involve another specific person (partner, family, friend, colleague, boss)?",
    criteria: { true: "Another person is involved", false: "Only the person themselves" },
  },
};

function firstKey<T extends string>(answer: unknown, fallback: T): T {
  const a = answer as ChoiceAnswer | undefined;
  return (a && a.type === "choice" ? a.choice : fallback) as T;
}

export async function plan(input: Input): Promise<PlanResult> {
  // Two smaller Decisions calls in parallel: data sources, and person-facing
  // questions + question signals. Cuts wall-clock time versus one big call.
  const sourceQs: Record<string, Question> = {};
  for (const s of SOURCES) {
    sourceQs[`need_${s}`] = {
      type: "noul",
      instructions: SOURCE_QUESTIONS[s].instructions,
      criteria: { true: "This data would change the answer", false: "This data is irrelevant to the answer" },
    };
  }
  const personQs: Record<string, Question> = {};
  for (const k of ASK_KEYS) {
    personQs[`ask_${k}`] = {
      type: "noul",
      instructions: ASKS[k].instructions,
      criteria: { true: "Knowing this would change the answer", false: "Not needed for this question" },
    };
  }
  for (const [k, q] of Object.entries(SIGNAL_QUESTIONS)) personQs[`signal_${k}`] = q;

  const state = {
    user_question: input.question,
    local_time: input.localTime,
    location_available: Boolean(input.coords),
    ...(input.profile ? { profile: input.profile } : {}),
  };
  let answers: Record<string, unknown>;
  let cost: number | undefined;
  if (isMock()) {
    const m = mock.planResponse(input.question);
    answers = m.answers;
    cost = m.usage.cost;
  } else {
    const [a, b] = await Promise.all([jevDecide(state, sourceQs), jevDecide(state, personQs)]);
    answers = { ...a.answers, ...b.answers };
    cost = (a.usage?.cost ?? 0) + (b.usage?.cost ?? 0);
  }
  const res = { answers };
  const noul = (key: string) => (res.answers[key] as NoulAnswer | undefined)?.noul ?? 0;

  const need = {} as Record<Source, number>;
  for (const s of SOURCES) need[s] = noul(`need_${s}`);
  const askNeed = {} as Record<AskKey, number>;
  for (const k of ASK_KEYS) askNeed[k] = noul(`ask_${k}`);

  const signals: Signals = {
    stakes: firstKey(res.answers.signal_stakes, "low"),
    urgency: firstKey(res.answers.signal_urgency, "today"),
    reversibility: firstKey(res.answers.signal_reversibility, "easy_to_undo"),
    tone: firstKey(res.answers.signal_tone, "neutral"),
    intent: firstKey(res.answers.signal_intent, "information"),
    involves_others: noul("signal_involves_others"),
  };

  let selected = SOURCES.filter((s) => need[s] >= SOURCE_QUESTIONS[s].threshold);
  if (!input.coords) selected = selected.filter((s) => !NEEDS_COORDS.includes(s));
  if (input.coords && selected.some((s) => WANTS_PLACE.includes(s)) && !selected.includes("place")) selected.push("place");
  // Warnings matter whenever we are already looking at the sky.
  if (input.coords && selected.includes("weather") && !selected.includes("alerts") && need.alerts >= 0.3) selected.push("alerts");

  // Asks: strongest signals first, capped. Emotional wording always earns a mood check.
  let asks = ASK_KEYS.filter((k) => askNeed[k] >= ASKS[k].threshold).sort((a, b) => askNeed[b] - askNeed[a]);
  if (signals.tone !== "neutral" && !asks.includes("mood")) asks = ["mood", ...asks];
  if (signals.involves_others >= 0.6 && !asks.includes("companions")) asks.push("companions");
  if ((signals.stakes === "high" || signals.reversibility === "hard_to_undo") && !asks.includes("risk")) asks.push("risk");
  asks = asks.slice(0, MAX_ASKS);

  return { need, selected, askNeed, asks, signals, cost };
}

export async function draftOptions(input: Input): Promise<{ options: Option[]; destination?: string; cost?: number }> {
  if (isMock()) return { options: mock.options(input.question, input.lang), destination: mock.destination(input.question) };

  const system = `You turn a person's everyday question into 2-6 mutually exclusive, concrete answer options for a decision engine to choose between.
Rules:
- Options must directly answer the question and be actionable right now.
- Yes/no questions get "yes"/"no" style options (you may add one nuanced middle option).
- For emotional, relationship, money, or otherwise high-stakes questions, include exactly one option that defers or seeks support (e.g. "sleep on it", "talk to them first", "wait until tomorrow"). Do not add it to purely practical questions.
- Do not decide; just list the options.
- "label" is at most 8 words, "description" at most 25 words, both in ${LANG_NAME[input.lang]}.
- "id" is a short lowercase snake_case English slug, unique.
- "destination": if the question is about going to a specific place, the place as the person wrote it (e.g. "home", "the office", "Central", "IFC mall"); otherwise null.
Reply with JSON only, no markdown, no commentary: {"options":[{"id":"...","label":"...","description":"..."}],"destination":null}`;

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
    const parsed = parseOptions(res.text);
    if (parsed.options.length >= 2) return { ...parsed, cost };
  }
  const snippet = lastText.trim().replace(/\s+/g, " ").slice(0, 160) || "(empty reply)";
  throw new Error(`Could not draft answer options for this question. Model replied: ${snippet}`);
}

function parseOptions(text: string): { options: Option[]; destination?: string } {
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
  const obj = (Array.isArray(raw) ? { options: raw } : raw) as { options?: unknown; destination?: unknown } | undefined;
  const list = obj?.options;
  if (!Array.isArray(list)) return { options: [] };

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
  const destination = typeof obj?.destination === "string" && obj.destination.trim() ? obj.destination.trim().slice(0, 80) : undefined;
  return { options: out.slice(0, 6), destination };
}

export type GatherEvent = { source: Source; ok: boolean; ms: number; error?: string };

export async function gather(
  input: Input,
  selected: Source[],
  // Resolved lazily: the destination comes from option drafting, which may
  // still be running when fetching starts.
  destination: () => Promise<string | undefined>,
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
  const place = () => data.place as src.Place | undefined;

  // Place name first (fast) so web search, holidays and geocoding can use it.
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
  if (coords && has("forecast_week")) tasks.push(run("forecast_week", () => src.forecastWeek(coords)));
  if (coords && has("air_quality")) tasks.push(run("air_quality", () => src.airQuality(coords)));
  if (coords && has("alerts")) tasks.push(run("alerts", () => src.alerts(coords, input.lang)));
  if (coords && has("marine")) tasks.push(run("marine", () => src.marine(coords)));
  if (coords && has("nearby")) tasks.push(run("nearby", () => src.nearbyPlaces(coords)));
  if (coords && has("transit")) tasks.push(run("transit", () => src.transitStops(coords)));
  if (coords && has("routes")) {
    tasks.push(
      run("routes", async () => {
        const dest = await destination().catch(() => undefined);
        const to = await resolveDestination(dest, coords, input.places, osmLang);
        if (!to) throw new Error(dest ? `could not find "${dest}"` : "no destination in the question");
        return src.routes(coords, to);
      }),
    );
  }
  if (has("calendar")) {
    tasks.push(placeTask.then(() => run("calendar", () => src.calendar(place()?.country_code || undefined))));
  }
  if (has("web")) {
    tasks.push(
      placeTask.then(() => {
        const p = place();
        const where = p ? [p.area, p.city, p.country].filter(Boolean).join(", ") : undefined;
        return run("web", () => src.webSearch(input.question, { place: where, localTime: input.localTime, lang: input.lang }));
      }),
    );
  }
  await Promise.all(tasks);
  return { data, cost };
}

async function resolveDestination(
  destination: string | undefined,
  here: src.Coords,
  places: Input["places"],
  lang: string,
): Promise<(src.Coords & { name: string }) | undefined> {
  const d = (destination ?? "").toLowerCase();
  if (/\b(home|house|flat)\b|屋企|返屋企|回家|家/.test(d) && places?.home) return { ...places.home, name: "home" };
  if (/\b(work|office)\b|公司|返工|辦公室|上班/.test(d) && places?.work) return { ...places.work, name: "work" };
  if (!destination) return undefined;
  return src.geocode(destination, here, lang);
}

export type DecideContext = { signals: Signals; answers: AskAnswers };

export async function decide(input: Input, options: Option[], data: Record<string, unknown>, ctx: DecideContext): Promise<Decision> {
  const criteria: Record<string, string> = {};
  for (const o of options) criteria[o.id] = o.description ? `${o.label}: ${o.description}` : o.label;

  const selfReport: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(ctx.answers)) if (v && v.length) selfReport[k] = v.length === 1 ? v[0] : v;

  const state = {
    user_question: input.question,
    local_time: input.localTime,
    timezone: input.timezone,
    location: input.coords ? { lat: round(input.coords.lat), lon: round(input.coords.lon) } : "unknown",
    question_signals: ctx.signals,
    ...(Object.keys(selfReport).length ? { self_report: selfReport } : {}),
    ...(input.profile ? { profile: input.profile } : {}),
    ...(input.history ? { past_decisions: input.history } : {}),
    data,
  };
  const questions: Record<string, Question> = {
    decision: {
      type: "choice",
      instructions: [
        "Pick the option that best answers user_question for this person right now, using data, self_report, profile, past_decisions and question_signals.",
        "Prefer safe, practical choices when conditions are borderline.",
        "If question_signals.stakes is high or reversibility is hard_to_undo, favour the option that keeps choices open or defers, unless the data clearly supports acting now.",
        "If self_report or question_signals show stress, sadness, anxiety, poor sleep, low energy, illness, or a rough day, weigh rest, comfort and self-kindness more; never push.",
        "If intent is reassurance or venting, choose the gentlest option that still honestly answers the question.",
        "Treat profile sensitivities, diet, household and mobility as hard constraints; use values, budget and risk appetite as tie-breakers.",
        "Learn from past_decisions: lean towards what this person rated good and away from what they rated bad.",
      ].join(" "),
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
  signals?: Signals;
  answers?: AskAnswers;
  profile?: Record<string, unknown>;
}): Promise<{ text: string; cost?: number }> {
  if (isMock()) return { text: await mock.explanation(args.chosen, args.lang) };
  const emotional = args.signals && (args.signals.tone !== "neutral" || args.signals.intent !== "information");
  return chat(
    [
      {
        role: "system",
        content: [
          `A decision engine already chose an answer. Explain in ${LANG_NAME[args.lang]}, in 2-3 short sentences, why it fits the person's situation, citing the specific data points (numbers, times, place names) and anything they told you about themselves (self_report) that matter.`,
          emotional
            ? "The person seems to be having feelings about this; acknowledge that in one warm, non-cheesy clause before the reasoning. Do not lecture."
            : "",
          "Then give one practical tip. Do not change the decision. No headings, no bullet points.",
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          question: args.question,
          local_time: args.localTime,
          chosen: args.chosen,
          other_options: args.others.map((o) => o.label),
          confidence: args.confidence,
          question_signals: args.signals,
          self_report: args.answers,
          profile: args.profile,
          data: args.data,
        }),
      },
    ],
    { maxTokens: 1200, timeoutMs: 25_000 },
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
