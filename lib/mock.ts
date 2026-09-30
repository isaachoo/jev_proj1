// Offline stand-ins used when no API key is set, so the UI can be
// developed without network access. Shapes match the real responses.

import type { AskKey } from "./asks";
import type { DecisionsResponse } from "./openrouter";
import type { Lang, Option, Source } from "./pipeline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KEYWORDS: Record<Source, RegExp> = {
  weather: /rain|umbrella|wear|jacket|outside|outdoor|walk|run|hike|beach|weather|bus|taxi|cold|hot|雨|遮|著|外|行|跑|天氣|凍|熱/i,
  forecast_week: /tomorrow|weekend|saturday|sunday|next week|聽日|週末|周末|星期|下星期/i,
  air_quality: /run|jog|exercise|outdoor|air|mask|跑|運動|空氣|口罩/i,
  daylight: /hike|beach|photo|sunset|night|walk|行山|日落|影相|夜/i,
  alerts: /typhoon|storm|warning|outside|hike|beach|go out|颱風|警告|出街|行山/i,
  marine: /swim|beach|boat|ferry|kayak|sea|游水|沙灘|船|海/i,
  place: /where|near|eat|lunch|dinner|去|邊|食/i,
  nearby: /eat|lunch|dinner|coffee|park|near|pharmacy|食|咖啡|公園|附近|藥房/i,
  transit: /bus|mtr|metro|train|tram|ferry|taxi|巴士|港鐵|地鐵|電車|小巴|的士/i,
  routes: /\b(to|go|get)\b.*\b(home|work|office|central|station)\b|walk or|返屋企|返工|去.*站|行路定/i,
  calendar: /holiday|weekend|crowd|open|busy|office|bank|假期|週末|人多|開門|銀行/i,
  web: /event|news|typhoon|traffic|strike|price|buy|活動|新聞|颱風|交通|價錢|買/i,
};

const ASK_KEYWORDS: Record<AskKey, RegExp> = {
  mood: /feel|sad|stress|anxious|lonely|upset|cry|angry|bored|rough|bad day|exhausted|心情|唔開心|壓力|焦慮|悶|嬲|唔順/i,
  energy: /gym|run|exercise|workout|clean|cook|chores|健身|跑|運動|煮|做家務/i,
  social: /friends|party|alone|hang out|invite|dinner with|朋友|派對|一個人|約/i,
  companions: /kids|child|parents|mum|dad|partner|girlfriend|boyfriend|wife|husband|boss|小朋友|父母|阿媽|阿爸|另一半|老婆|老公|上司/i,
  time_available: /how long|quick|hours|afternoon|before|趕|幾耐|下晝|之前/i,
  budget: /taxi|expensive|cheap|buy|spend|afford|的士|貴|平|買|使錢/i,
  sleep: /coffee|nap|tired|sleep|drive|咖啡|瞓|攰|揸車/i,
  health: /sick|cold|headache|sore|injur|knee|病|頭痛|痛|受傷/i,
  hunger: /eat|lunch|dinner|hungry|snack|食|肚餓/i,
  context: /bad day|rough|celebrate|birthday|broke up|fired|promotion|唔順|慶祝|生日|分手|升職/i,
  risk: /should i (text|call|quit|buy|tell|confront|cancel)|risk|gamble|辭職|表白|講唔講|博/i,
};

const pick = (question: string, table: [string, RegExp][], fallback: string) =>
  table.find(([, re]) => re.test(question))?.[0] ?? fallback;

export function planResponse(question: string): DecisionsResponse {
  const answers: DecisionsResponse["answers"] = {};
  for (const [s, re] of Object.entries(KEYWORDS)) answers[`need_${s}`] = { type: "noul", noul: re.test(question) ? 0.85 : 0.12 };
  for (const [k, re] of Object.entries(ASK_KEYWORDS)) answers[`ask_${k}`] = { type: "noul", noul: re.test(question) ? 0.8 : 0.1 };

  const choice = (c: string) => ({ type: "choice" as const, choice: c, confidence: 0.7, probabilities: { [c]: 0.7 } });
  answers.signal_stakes = choice(
    pick(question, [["high", /quit|break ?up|marry|move|invest|surgery|辭職|分手|結婚|搬|投資/i], ["medium", /buy|cancel|text|call|買|取消|覆/i]], "low"),
  );
  answers.signal_urgency = choice(pick(question, [["can_wait", /tomorrow|weekend|next|聽日|週末|下/i], ["now", /now|right now|而家|即刻/i]], "today"));
  answers.signal_reversibility = choice(
    pick(question, [["hard_to_undo", /text|send|cancel|quit|tell|buy|覆|傳|取消|辭|話俾|買/i]], "easy_to_undo"),
  );
  answers.signal_tone = choice(
    pick(
      question,
      [
        ["sad", /sad|lonely|down|唔開心|孤單|低落/i],
        ["stressed", /stress|overwhelm|too much|rough|bad day|壓力|頂唔順|唔順/i],
        ["anxious", /anxious|worried|nervous|scared|焦慮|擔心|驚/i],
        ["frustrated", /angry|annoyed|fed up|嬲|煩/i],
        ["conflicted", /should i really|guilty|torn|內疚|掙扎/i],
        ["excited", /excited|can't wait|興奮|期待/i],
      ],
      "neutral",
    ),
  );
  answers.signal_intent = choice(
    pick(question, [["venting", /\bugh\b|\bhate\b|so tired of|好煩|頂唔順/i], ["reassurance", /is it ok|am i|okay to|係咪冇問題|會唔會/i], ["permission", /can i|allowed|treat myself|可唔可以|獎勵自己/i]], "information"),
  );
  answers.signal_involves_others = { type: "noul", noul: ASK_KEYWORDS.companions.test(question) ? 0.8 : 0.1 };
  return { model: "mock", answers, usage: { input_tokens: 0, output_tokens: 0, cost: 0 } };
}

export function destination(question: string): string | undefined {
  if (/home|屋企|回家/i.test(question)) return "home";
  if (/work|office|公司|返工/i.test(question)) return "work";
  const m = question.match(/\b(?:to|get to|go to)\s+([A-Z][\w' ]{2,30})/);
  return m?.[1]?.trim();
}

export function options(question: string, lang: Lang): Option[] {
  const zh = lang === "zh-Hant";
  if (/umbrella|遮/i.test(question)) {
    return [
      { id: "yes", label: zh ? "帶遮" : "Bring an umbrella", description: zh ? "有機會落雨" : "Rain is possible" },
      { id: "no", label: zh ? "唔使帶" : "No umbrella needed", description: zh ? "天氣穩定" : "Weather looks stable" },
    ];
  }
  if (/text|call|message|覆|打俾|訊息/i.test(question)) {
    return [
      { id: "reply_now", label: zh ? "而家覆" : "Reply now", description: zh ? "簡短、誠實咁覆" : "Keep it short and honest" },
      { id: "wait", label: zh ? "等聽日先" : "Sleep on it", description: zh ? "冷靜咗先決定" : "Decide with a clearer head tomorrow" },
      { id: "talk", label: zh ? "當面傾" : "Talk in person", description: zh ? "唔好用文字處理" : "Take it out of text" },
    ];
  }
  return [
    { id: "go_outside", label: zh ? "去戶外" : "Go outdoors", description: zh ? "天氣適合戶外活動" : "Conditions suit being outside" },
    { id: "stay_inside", label: zh ? "留喺室內" : "Stay indoors", description: zh ? "室內活動較舒適" : "Indoor plans are more comfortable" },
    { id: "wait", label: zh ? "等一陣先" : "Wait an hour", description: zh ? "天氣稍後會改善" : "Conditions improve soon" },
  ];
}

export async function source(s: Source): Promise<unknown> {
  await sleep(150 + Math.random() * 300);
  switch (s) {
    case "weather":
      return {
        now: { condition: "light showers", temperature_c: 27, feels_like_c: 31, comfort: "warm, some heat stress", humidity_pct: 84, precipitation_mm: 0.4, wind_kmh: 12, uv_index: 4 },
        rain_chance_next_3h_pct: 60,
        next_hours: [
          { time: "15:00", temperature_c: 27, rain_chance_pct: 60, condition: "light showers" },
          { time: "16:00", temperature_c: 26, rain_chance_pct: 45, condition: "partly cloudy" },
        ],
        today: { max_rain_chance_pct: 70, uv_index_max: 7 },
        daylight: { is_day: true, sunrise: "06:13", sunset: "18:05", moon: "waxing gibbous" },
      };
    case "forecast_week":
      return [
        { date: "2026-10-01", weekday: "Thu", condition: "showers", high_c: 29, low_c: 25, rain_chance_pct: 70 },
        { date: "2026-10-02", weekday: "Fri", condition: "partly cloudy", high_c: 30, low_c: 25, rain_chance_pct: 30 },
        { date: "2026-10-03", weekday: "Sat", condition: "clear sky", high_c: 31, low_c: 26, rain_chance_pct: 10 },
      ];
    case "daylight":
      return { is_day: true, sunrise: "06:13", sunset: "18:05", moon: "waxing gibbous" };
    case "air_quality":
      return { us_aqi: 58, level: "moderate", pm2_5: 17, pm10: 30, ozone: 70, pollen_grains_m3: "not available in this region" };
    case "alerts":
      return { hong_kong_observatory_warnings: [{ warning: "Thunderstorm Warning", since: "13:40" }], earthquakes_24h: "none" };
    case "marine":
      return { wave_height_m: 0.6, sea_state: "slight", wave_period_s: 5, sea_temperature_c: 27 };
    case "place":
      return { area: "Tsim Sha Tsui", city: "Hong Kong", country: "Hong Kong", country_code: "HK", full: "Tsim Sha Tsui, Kowloon, Hong Kong" };
    case "nearby":
      return [
        { name: "Kowloon Park", type: "park", distance_m: 320 },
        { name: "Mock Cafe", type: "cafe", distance_m: 140, opening_hours: "Mo-Su 08:00-22:00", open_now: true },
      ];
    case "transit":
      return [
        { name: "Tsim Sha Tsui", type: "metro entrance", distance_m: 210 },
        { name: "Nathan Road", type: "bus stop", distance_m: 90, routes: "1, 1A, 2, 6, 7" },
      ];
    case "routes":
      return { destination: "home", straight_line_m: 1800, drive: { distance_km: 2.6, minutes: 9 }, walk: { distance_km: 2.6, minutes: 33, hilly: false }, bike: { minutes: 11 } };
    case "calendar":
      return { weekday: "Wednesday", is_weekend: false, rush_hour_now: false, part_of_day: "afternoon", public_holiday_today: false, next_public_holiday: { date: "2026-10-01", name: "National Day" } };
    case "web":
      return { summary: "- (mock) No transport disruptions reported [mtr.com.hk]", cost: 0 };
  }
}

export function decideResponse(opts: Option[]): DecisionsResponse {
  const raw = opts.map((_, i) => 1 / (i + 1.5));
  const total = raw.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(opts.map((o, i) => [o.id, raw[i] / total]));
  return {
    model: "mock",
    answers: {
      decision: { type: "choice", choice: opts[0].id, confidence: 0.72, probabilities },
      enough_info: { type: "noul", noul: 0.8 },
    },
    usage: { input_tokens: 0, output_tokens: 0, cost: 0 },
  };
}

export function explanation(chosen: Option, lang: Lang): string {
  return lang === "zh-Hant"
    ? `（示範模式）揀咗「${chosen.label}」，因為未來一小時有 60% 機會落雨。建議出門前再睇一次天氣。`
    : `(Demo mode) Chose "${chosen.label}" because there is a 60% chance of rain in the next hour. Check again before heading out.`;
}
