// Offline stand-ins used when no API key is set, so the UI can be
// developed without network access. Shapes match the real responses.

import type { DecisionsResponse } from "./openrouter";
import type { Lang, Option, Source } from "./pipeline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KEYWORDS: Record<Source, RegExp> = {
  weather: /rain|umbrella|wear|jacket|outside|outdoor|walk|run|hike|beach|weather|bus|taxi|cold|hot|雨|遮|著|外|行|跑|天氣|凍|熱/i,
  air_quality: /run|jog|exercise|outdoor|air|mask|跑|運動|空氣|口罩/i,
  daylight: /hike|beach|photo|sunset|walk|行山|日落|影相/i,
  place: /where|near|eat|lunch|dinner|去|邊|食/i,
  nearby: /eat|lunch|dinner|coffee|park|near|食|咖啡|公園|附近/i,
  web: /event|open|news|typhoon|mtr|traffic|today|颱風|港鐵|交通|活動|今日/i,
};

export function planResponse(question: string): DecisionsResponse {
  const answers: DecisionsResponse["answers"] = {};
  for (const [s, re] of Object.entries(KEYWORDS)) {
    answers[`need_${s}`] = { type: "noul", noul: re.test(question) ? 0.85 : 0.12 };
  }
  return { model: "mock", answers, usage: { input_tokens: 0, output_tokens: 0, cost: 0 } };
}

export function options(question: string, lang: Lang): Option[] {
  const zh = lang === "zh-Hant";
  if (/umbrella|遮/i.test(question)) {
    return [
      { id: "yes", label: zh ? "帶遮" : "Bring an umbrella", description: zh ? "有機會落雨" : "Rain is possible" },
      { id: "no", label: zh ? "唔使帶" : "No umbrella needed", description: zh ? "天氣穩定" : "Weather looks stable" },
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
        now: { condition: "light showers", temperature_c: 27, feels_like_c: 31, humidity_pct: 84, precipitation_mm: 0.4, wind_kmh: 12, uv_index: 4 },
        next_hours: [
          { time: "15:00", temperature_c: 27, rain_chance_pct: 60, condition: "light showers" },
          { time: "16:00", temperature_c: 26, rain_chance_pct: 45, condition: "partly cloudy" },
        ],
        today: { max_rain_chance_pct: 70, uv_index_max: 7 },
        daylight: { is_day: true, sunrise: "06:13", sunset: "18:05" },
      };
    case "daylight":
      return { is_day: true, sunrise: "06:13", sunset: "18:05" };
    case "air_quality":
      return { us_aqi: 58, level: "moderate", pm2_5: 17, pm10: 30, ozone: 70 };
    case "place":
      return { area: "Tsim Sha Tsui", city: "Hong Kong", country: "Hong Kong", full: "Tsim Sha Tsui, Kowloon, Hong Kong" };
    case "nearby":
      return [
        { name: "Kowloon Park", type: "park", distance_m: 320 },
        { name: "Mock Cafe", type: "cafe", distance_m: 140 },
      ];
    case "web":
      return { summary: "- (mock) No weather warnings in force [hko.gov.hk]", cost: 0 };
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
