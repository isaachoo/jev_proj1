import type { Lang, Signals, Source } from "./pipeline";
import type { Profile } from "./profile";

type Strings = {
  title: string;
  subtitle: string;
  privacy: string;
  disclaimer: string;
  aiNote: string;
  placeholder: string;
  decide: string;
  deciding: string;
  examples: string[];
  locating: string;
  locationOn: (lat: number, lon: number) => string;
  locationOff: string;
  retryLocation: string;
  mockBanner: string;
  keyMissing: string;
  keySaved: string;
  keySave: string;
  keyClear: string;
  keyNote: string;
  codeMissing: string;
  codeSaved: string;
  steps: { plan: string; options: string; ask: string; gather: string; decide: string; explain: string };
  noSources: string;
  noAsks: string;
  sources: Record<Source, string>;
  signals: {
    stakes: Record<Signals["stakes"], string>;
    urgency: Record<Signals["urgency"], string>;
    reversibility: Record<Signals["reversibility"], string>;
    tone: Record<Signals["tone"], string>;
    intent: Record<Signals["intent"], string>;
    others: string;
  };
  askTitle: string;
  askHint: string;
  askSkip: string;
  askMulti: string;
  askContinue: string;
  decision: string;
  confidence: string;
  enoughInfo: string;
  lowInfo: string;
  whyTitle: string;
  explaining: string;
  dataTitle: string;
  cost: (usd: number, ms: number) => string;
  error: string;
  feedbackAsk: string;
  feedbackGood: string;
  feedbackBad: string;
  feedbackThanks: string;
  profile: {
    title: string;
    empty: string;
    filled: (n: number) => string;
    note: string;
    home: string;
    work: string;
    setHere: string;
    clear: string;
    unset: string;
    sensitivities: string;
    fitness: string;
    transport: string;
    household: string;
    diet: string;
    values: string;
    risk: string;
    notes: string;
    notesPlaceholder: string;
    reset: string;
    labels: Record<string, string>;
  };
};

const PROFILE_LABELS_EN: Record<string, string> = {
  asthma: "Asthma / breathing",
  heat: "Heat sensitive",
  cold: "Cold sensitive",
  pollen: "Pollen allergy",
  pregnant: "Pregnant",
  mobility: "Limited mobility",
  low: "Low",
  medium: "Medium",
  high: "High",
  car: "Car",
  bike: "Bike",
  octopus: "Transit pass",
  kids: "Kids",
  elderly: "Elderly family",
  pet: "Pet",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  no_pork: "No pork",
  no_beef: "No beef",
  gluten_free: "Gluten-free",
  nut_allergy: "Nut allergy",
  health: "Health",
  money: "Saving money",
  career: "Career",
  family: "Family",
  friends: "Friends",
  rest: "Rest",
  adventure: "Adventure",
  environment: "Environment",
  safe: "Play it safe",
  balanced: "Balanced",
  bold: "Take chances",
};

const PROFILE_LABELS_ZH: Record<string, string> = {
  asthma: "哮喘 / 呼吸道",
  heat: "怕熱",
  cold: "怕凍",
  pollen: "花粉敏感",
  pregnant: "懷孕",
  mobility: "行動不便",
  low: "低",
  medium: "中",
  high: "高",
  car: "有車",
  bike: "有單車",
  octopus: "八達通 / 月票",
  kids: "小朋友",
  elderly: "長者",
  pet: "寵物",
  vegetarian: "素食",
  vegan: "純素",
  halal: "清真",
  no_pork: "不吃豬",
  no_beef: "不吃牛",
  gluten_free: "無麩質",
  nut_allergy: "堅果敏感",
  health: "健康",
  money: "慳錢",
  career: "事業",
  family: "家庭",
  friends: "朋友",
  rest: "休息",
  adventure: "冒險",
  environment: "環保",
  safe: "穩陣",
  balanced: "平衡",
  bold: "敢博",
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    title: "Jev Decider",
    subtitle: "Quick everyday decisions based on where you are, what's happening, and how you're doing.",
    privacy:
      "Privacy: this site never stores your data. Your profile, history and settings stay in this browser only. Your question, approximate location and answers are sent to Jev solely to work out the answer, and are not kept by this site.",
    disclaimer:
      "Disclaimer: all suggestions are AI-generated and may be wrong. Use your own judgement, especially for anything involving safety, health, money or relationships. The site owner accepts no responsibility for any decision you make or its consequences.",
    aiNote: "AI-generated suggestion, for reference only. You are responsible for your own decisions.",
    placeholder: "e.g. Should I bring an umbrella? Walk or MTR to Central? Should I text him back tonight?",
    decide: "Decide",
    deciding: "Deciding…",
    examples: [
      "Should I bring an umbrella today?",
      "Walk, bus, or taxi to get home?",
      "Is it a good time for a run outside?",
      "Where should I grab lunch nearby?",
      "Should I text her back tonight or wait?",
      "Rough day. Gym or just go home and rest?",
    ],
    locating: "Getting your location…",
    locationOn: (lat, lon) => `Location: ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    locationOff: "Location unavailable — decisions will use less data.",
    retryLocation: "Retry",
    mockBanner: "Demo mode: no OpenRouter API key set, so data and decisions are fake.",
    keyMissing: "Add your OpenRouter API key to use live data",
    keySaved: "OpenRouter API key saved in this browser",
    keySave: "Save",
    keyClear: "Remove",
    keyNote: "Stored only in this browser and sent only to OpenRouter. Use a key with a spending limit. Get one at",
    codeMissing: "Enter the access code to use this site",
    codeSaved: "Access code saved in this browser",
    steps: { plan: "Read the question", options: "Draft options", ask: "Quick check-in", gather: "Fetch data", decide: "Decide", explain: "Explain" },
    noSources: "No extra data needed",
    noAsks: "Nothing to ask",
    sources: {
      weather: "Weather",
      forecast_week: "Week ahead",
      air_quality: "Air quality",
      daylight: "Daylight",
      alerts: "Warnings",
      marine: "Sea",
      place: "Place name",
      nearby: "Nearby places",
      transit: "Transit stops",
      routes: "Route & travel time",
      calendar: "Calendar",
      web: "Web search",
    },
    signals: {
      stakes: { low: "low stakes", medium: "medium stakes", high: "high stakes" },
      urgency: { now: "needs an answer now", today: "today", can_wait: "can wait" },
      reversibility: { easy_to_undo: "easy to undo", hard_to_undo: "hard to undo" },
      tone: {
        neutral: "",
        stressed: "sounds stressed",
        sad: "sounds low",
        anxious: "sounds anxious",
        excited: "sounds excited",
        frustrated: "sounds frustrated",
        conflicted: "sounds torn",
      },
      intent: { information: "", permission: "looking for a nudge", reassurance: "looking for reassurance", venting: "venting" },
      others: "involves someone else",
    },
    askTitle: "Two seconds — this helps Jev decide",
    askHint: "Optional. Answers stay in your browser for this decision only.",
    askSkip: "Skip",
    askMulti: "pick all that apply",
    askContinue: "Continue",
    decision: "Decision",
    confidence: "Confidence",
    enoughInfo: "Info sufficiency",
    lowInfo: "Jev thinks some important information may be missing — treat this as a best guess.",
    whyTitle: "Why",
    explaining: "Writing explanation…",
    dataTitle: "Data used",
    cost: (usd, ms) => `Decided in ${(ms / 1000).toFixed(1)}s · cost $${usd.toFixed(5)}`,
    error: "Something went wrong",
    feedbackAsk: "Was this the right call?",
    feedbackGood: "👍 Yes",
    feedbackBad: "👎 No",
    feedbackThanks: "Noted — future decisions will take this into account.",
    profile: {
      title: "About you",
      empty: "Optional: tell Jev a little about yourself for better decisions",
      filled: (n) => `About you · ${n} thing${n === 1 ? "" : "s"} set`,
      note: "Stored only in this browser. Sent to Jev with each question so it can respect your constraints.",
      home: "Home",
      work: "Work",
      setHere: "Use current location",
      clear: "Clear",
      unset: "not set",
      sensitivities: "Sensitivities",
      fitness: "Fitness",
      transport: "You have",
      household: "Household",
      diet: "Diet",
      values: "What matters most right now",
      risk: "Default risk appetite",
      notes: "Anything else",
      notesPlaceholder: "e.g. knee injury, avoid stairs; new to the city; on a tight deadline this week",
      reset: "Reset profile",
      labels: PROFILE_LABELS_EN,
    },
  },
  "zh-Hant": {
    title: "Jev 決策助手",
    subtitle: "根據你身處嘅位置、即時情況同你嘅狀態，幫你快速做日常決定。",
    privacy:
      "私隱：本網站唔會儲存你任何資料。你嘅個人設定、紀錄同偏好只會留喺呢個瀏覽器。你嘅問題、大概位置同答案只會傳送去 Jev 計算答案，本網站唔會保留。",
    disclaimer:
      "免責聲明：所有建議均由 AI 生成，可能有錯。請自行判斷，尤其涉及安全、健康、金錢或人際關係嘅事。網站擁有人對你嘅任何決定及其後果概不負責。",
    aiNote: "AI 生成建議，僅供參考，決定同後果由你自己負責。",
    placeholder: "例如：今日使唔使帶遮？行路定搭港鐵去中環？今晚應唔應該覆佢？",
    decide: "幫我決定",
    deciding: "決定緊…",
    examples: [
      "今日使唔使帶遮？",
      "返屋企應該行路、搭巴士定搭的士？",
      "而家適唔適合出去跑步？",
      "附近食咩午餐好？",
      "今晚覆唔覆佢好，定係等陣先？",
      "今日好唔順。去健身定直接返屋企唞？",
    ],
    locating: "正在取得你嘅位置…",
    locationOn: (lat, lon) => `位置：${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    locationOff: "無法取得位置——決定會用較少資料。",
    retryLocation: "重試",
    mockBanner: "示範模式：未設定 OpenRouter API key，資料同決定都係假嘅。",
    keyMissing: "加入你嘅 OpenRouter API key 以使用即時資料",
    keySaved: "OpenRouter API key 已儲存喺呢個瀏覽器",
    keySave: "儲存",
    keyClear: "移除",
    keyNote: "只會儲存喺呢個瀏覽器，並只會傳送去 OpenRouter。建議用有消費上限嘅 key。可喺呢度建立：",
    codeMissing: "請輸入存取碼以使用本網站",
    codeSaved: "存取碼已儲存喺呢個瀏覽器",
    steps: { plan: "理解問題", options: "草擬選項", ask: "快速問幾句", gather: "取得資料", decide: "作出決定", explain: "解釋" },
    noSources: "唔需要額外資料",
    noAsks: "唔使問",
    sources: {
      weather: "天氣",
      forecast_week: "未來一週",
      air_quality: "空氣質素",
      daylight: "日照",
      alerts: "警告",
      marine: "海面",
      place: "地區名稱",
      nearby: "附近地點",
      transit: "交通站點",
      routes: "路線同車程",
      calendar: "日曆",
      web: "網上搜尋",
    },
    signals: {
      stakes: { low: "影響細", medium: "影響中等", high: "影響大" },
      urgency: { now: "而家要決定", today: "今日內", can_wait: "可以等" },
      reversibility: { easy_to_undo: "容易改變", hard_to_undo: "難以挽回" },
      tone: {
        neutral: "",
        stressed: "似乎有壓力",
        sad: "似乎低落",
        anxious: "似乎焦慮",
        excited: "似乎興奮",
        frustrated: "似乎煩躁",
        conflicted: "似乎掙扎緊",
      },
      intent: { information: "", permission: "想有人推一把", reassurance: "想安心啲", venting: "呻緊" },
      others: "牽涉其他人",
    },
    askTitle: "兩秒鐘——呢啲有助 Jev 決定",
    askHint: "可以唔答。答案只會用喺今次決定，唔會離開你嘅瀏覽器。",
    askSkip: "跳過",
    askMulti: "可以揀多過一個",
    askContinue: "繼續",
    decision: "決定",
    confidence: "信心",
    enoughInfo: "資料充足度",
    lowInfo: "Jev 認為可能欠缺重要資料——呢個只係最佳估計。",
    whyTitle: "原因",
    explaining: "撰寫解釋中…",
    dataTitle: "使用咗嘅資料",
    cost: (usd, ms) => `用時 ${(ms / 1000).toFixed(1)} 秒 · 費用 $${usd.toFixed(5)}`,
    error: "出現錯誤",
    feedbackAsk: "呢個決定啱唔啱？",
    feedbackGood: "👍 啱",
    feedbackBad: "👎 唔啱",
    feedbackThanks: "記低咗——之後嘅決定會參考。",
    profile: {
      title: "關於你",
      empty: "可選：話俾 Jev 知多少少關於你，決定會更貼心",
      filled: (n) => `關於你 · 已設定 ${n} 項`,
      note: "只會儲存喺呢個瀏覽器。每次提問會連同問題傳送俾 Jev，等佢顧及你嘅限制。",
      home: "屋企",
      work: "公司",
      setHere: "用而家嘅位置",
      clear: "清除",
      unset: "未設定",
      sensitivities: "敏感 / 注意",
      fitness: "體能",
      transport: "你有",
      household: "家庭成員",
      diet: "飲食",
      values: "而家最重視",
      risk: "一般冒險傾向",
      notes: "其他",
      notesPlaceholder: "例如：膝頭受傷，避免樓梯；新嚟呢個城市；今個星期趕死線",
      reset: "重設",
      labels: PROFILE_LABELS_ZH,
    },
  },
};

// Field catalogue for the profile editor; keeps page.tsx free of enums.
export const PROFILE_FIELDS: {
  key: "sensitivities" | "transport" | "household" | "diet" | "values";
  options: string[];
}[] = [
  { key: "sensitivities", options: ["asthma", "heat", "cold", "pollen", "pregnant", "mobility"] },
  { key: "transport", options: ["car", "bike", "octopus"] },
  { key: "household", options: ["kids", "elderly", "pet"] },
  { key: "diet", options: ["vegetarian", "vegan", "halal", "no_pork", "no_beef", "gluten_free", "nut_allergy"] },
  { key: "values", options: ["health", "money", "career", "family", "friends", "rest", "adventure", "environment"] },
];
export const FITNESS_OPTIONS: NonNullable<Profile["fitness"]>[] = ["low", "medium", "high"];
export const RISK_OPTIONS: NonNullable<Profile["risk"]>[] = ["safe", "balanced", "bold"];
