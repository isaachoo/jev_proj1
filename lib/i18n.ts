import type { Lang, Source } from "./pipeline";

type Strings = {
  title: string;
  subtitle: string;
  placeholder: string;
  decide: string;
  deciding: string;
  examples: string[];
  locating: string;
  locationOn: (lat: number, lon: number) => string;
  locationOff: string;
  retryLocation: string;
  mockBanner: string;
  steps: { plan: string; options: string; gather: string; decide: string };
  noSources: string;
  sources: Record<Source, string>;
  decision: string;
  confidence: string;
  enoughInfo: string;
  lowInfo: string;
  whyTitle: string;
  explaining: string;
  dataTitle: string;
  cost: (usd: number, ms: number) => string;
  error: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    title: "Jev Decider",
    subtitle: "Quick everyday decisions based on where you are and what's happening right now.",
    placeholder: "e.g. Should I bring an umbrella? Walk or take the bus to the MTR?",
    decide: "Decide",
    deciding: "Deciding…",
    examples: [
      "Should I bring an umbrella today?",
      "What should I wear to go out now?",
      "Is it a good time for a run outside?",
      "Walk, bus, or taxi for a 2 km trip?",
      "Where should I grab lunch nearby?",
    ],
    locating: "Getting your location…",
    locationOn: (lat, lon) => `Location: ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    locationOff: "Location unavailable — decisions will use less data.",
    retryLocation: "Retry",
    mockBanner: "Mock mode: no API key or MOCK=1, so data and decisions are fake.",
    steps: { plan: "Choose data", options: "Draft options", gather: "Fetch data", decide: "Decide" },
    noSources: "No extra data needed",
    sources: {
      weather: "Weather",
      air_quality: "Air quality",
      daylight: "Daylight",
      place: "Place name",
      nearby: "Nearby places",
      web: "Web search",
    },
    decision: "Decision",
    confidence: "Confidence",
    enoughInfo: "Info sufficiency",
    lowInfo: "Jev thinks some important information may be missing — treat this as a best guess.",
    whyTitle: "Why",
    explaining: "Writing explanation…",
    dataTitle: "Data used",
    cost: (usd, ms) => `Decided in ${(ms / 1000).toFixed(1)}s · cost $${usd.toFixed(5)}`,
    error: "Something went wrong",
  },
  "zh-Hant": {
    title: "Jev 決策助手",
    subtitle: "根據你身處嘅位置同即時情況，幫你快速做日常決定。",
    placeholder: "例如：今日使唔使帶遮？行路定搭巴士去港鐵站？",
    decide: "幫我決定",
    deciding: "決定緊…",
    examples: [
      "今日使唔使帶遮？",
      "而家出街應該著咩？",
      "而家適唔適合出去跑步？",
      "兩公里路程應該行路、搭巴士定搭的士？",
      "附近食咩午餐好？",
    ],
    locating: "正在取得你嘅位置…",
    locationOn: (lat, lon) => `位置：${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    locationOff: "無法取得位置——決定會用較少資料。",
    retryLocation: "重試",
    mockBanner: "示範模式：未設定 API key 或 MOCK=1，資料同決定都係假嘅。",
    steps: { plan: "揀選資料", options: "草擬選項", gather: "取得資料", decide: "作出決定" },
    noSources: "唔需要額外資料",
    sources: {
      weather: "天氣",
      air_quality: "空氣質素",
      daylight: "日照",
      place: "地區名稱",
      nearby: "附近地點",
      web: "網上搜尋",
    },
    decision: "決定",
    confidence: "信心",
    enoughInfo: "資料充足度",
    lowInfo: "Jev 認為可能欠缺重要資料——呢個只係最佳估計。",
    whyTitle: "原因",
    explaining: "撰寫解釋中…",
    dataTitle: "使用咗嘅資料",
    cost: (usd, ms) => `用時 ${(ms / 1000).toFixed(1)} 秒 · 費用 $${usd.toFixed(5)}`,
    error: "出現錯誤",
  },
};
