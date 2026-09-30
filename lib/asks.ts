// "Ask the user" sources: context that no API can provide (mood, energy,
// budget…). Jev decides in plan() which of these matter for the question;
// the UI then shows at most MAX_ASKS of them as quick chips before deciding.

import type { Lang } from "./pipeline";

export type AskKey =
  | "mood"
  | "energy"
  | "social"
  | "companions"
  | "time_available"
  | "budget"
  | "sleep"
  | "health"
  | "hunger"
  | "context"
  | "risk";

export const ASK_KEYS: AskKey[] = [
  "mood",
  "energy",
  "social",
  "companions",
  "time_available",
  "budget",
  "sleep",
  "health",
  "hunger",
  "context",
  "risk",
];

export const MAX_ASKS = 3;

type AskDef = {
  // What Jev is asked in plan(): would knowing this change the answer?
  instructions: string;
  threshold: number;
  // Shown to the user; option ids are what get sent to Jev as state.
  prompt: Record<Lang, string>;
  // More than one answer may apply (e.g. stressed AND tired).
  multi?: boolean;
  options: { id: string; label: Record<Lang, string> }[];
};

const opt = (id: string, en: string, zh: string) => ({ id, label: { en, "zh-Hant": zh } });

export const ASKS: Record<AskKey, AskDef> = {
  mood: {
    multi: true,
    instructions:
      "Would the person's current mood (calm, stressed, sad, anxious, bored, excited, angry) meaningfully change the best answer? True for emotional, social, self-care, or motivation questions.",
    threshold: 0.5,
    prompt: { en: "How are you feeling right now?", "zh-Hant": "你而家心情點？" },
    options: [
      opt("calm", "Calm", "平靜"),
      opt("stressed", "Stressed", "有壓力"),
      opt("sad", "Sad / low", "低落"),
      opt("anxious", "Anxious", "焦慮"),
      opt("bored", "Bored", "悶"),
      opt("excited", "Excited", "興奮"),
      opt("angry", "Angry / frustrated", "嬲 / 煩躁"),
      opt("tired", "Drained", "好攰"),
    ],
  },
  energy: {
    instructions:
      "Would the person's physical energy level right now meaningfully change the best answer (e.g. exercise, chores, cooking, going out vs resting)?",
    threshold: 0.5,
    prompt: { en: "Energy level?", "zh-Hant": "精力水平？" },
    options: [opt("low", "Low", "低"), opt("medium", "Medium", "中"), opt("high", "High", "高")],
  },
  social: {
    instructions:
      "Does the best answer depend on whether the person wants company or wants to be alone right now (social battery)?",
    threshold: 0.55,
    prompt: { en: "Feel like company?", "zh-Hant": "想唔想有人陪？" },
    options: [
      opt("alone", "Want to be alone", "想一個人"),
      opt("small", "One or two people", "一兩個人就好"),
      opt("social", "Up for a crowd", "想熱鬧"),
    ],
  },
  companions: {
    multi: true,
    instructions:
      "Does the best answer depend on who is with the person or involved in the decision (alone, partner, kids, elderly parents, friends, colleagues)?",
    threshold: 0.55,
    prompt: { en: "Who's with you / involved?", "zh-Hant": "同邊個一齊 / 牽涉邊個？" },
    options: [
      opt("alone", "Just me", "得我一個"),
      opt("partner", "Partner", "另一半"),
      opt("kids", "With kids", "有小朋友"),
      opt("elderly", "Elderly family", "有長者"),
      opt("friends", "Friends", "朋友"),
      opt("colleagues", "Colleagues / boss", "同事 / 上司"),
    ],
  },
  time_available: {
    instructions:
      "Does the best answer depend on how much free time the person has right now (minutes vs hours vs a whole day)?",
    threshold: 0.55,
    prompt: { en: "How much time do you have?", "zh-Hant": "你有幾多時間？" },
    options: [
      opt("under_30m", "Under 30 min", "少於 30 分鐘"),
      opt("1_2h", "1–2 hours", "1 至 2 小時"),
      opt("half_day", "Half a day", "半日"),
      opt("flexible", "Whole day / flexible", "成日 / 彈性"),
    ],
  },
  budget: {
    instructions:
      "Does the best answer depend on how much money the person is willing to spend on this (e.g. taxi vs bus, eat out vs cook, buy vs wait)?",
    threshold: 0.55,
    prompt: { en: "Budget for this?", "zh-Hant": "呢件事預算點？" },
    options: [
      opt("tight", "Keep it cheap", "慳住使"),
      opt("normal", "Normal", "正常"),
      opt("treat", "Happy to spend", "唔介意使錢"),
    ],
  },
  sleep: {
    instructions:
      "Would how well the person slept last night meaningfully change the best answer (e.g. coffee, nap, driving, workout, big decisions)?",
    threshold: 0.6,
    prompt: { en: "How did you sleep last night?", "zh-Hant": "尋晚瞓得點？" },
    options: [opt("poor", "Badly", "差"), opt("ok", "OK", "一般"), opt("good", "Well", "好")],
  },
  health: {
    multi: true,
    instructions:
      "Would the person's current physical condition (unwell, sore, injured, fine) meaningfully change the best answer?",
    threshold: 0.6,
    prompt: { en: "How's your body today?", "zh-Hant": "今日身體狀況？" },
    options: [
      opt("fine", "Fine", "正常"),
      opt("sore", "Tired or sore", "攰 / 痠痛"),
      opt("unwell", "A bit unwell", "有啲唔舒服"),
      opt("injured", "Injured / limited", "受傷 / 行動不便"),
    ],
  },
  hunger: {
    instructions: "Does the best answer depend on when the person last ate or how hungry they are?",
    threshold: 0.6,
    prompt: { en: "When did you last eat?", "zh-Hant": "上次食嘢係幾時？" },
    options: [
      opt("just_ate", "Just now", "啱啱食完"),
      opt("hours_ago", "A few hours ago", "幾個鐘前"),
      opt("hungry", "Hungry", "肚餓"),
    ],
  },
  context: {
    multi: true,
    instructions:
      "Would knowing whether today is a normal day, a rough day, a celebration, or a day with big news meaningfully change the best answer? True for comfort, treat-yourself, social, or relationship questions.",
    threshold: 0.6,
    prompt: { en: "Anything going on today?", "zh-Hant": "今日有咩特別？" },
    options: [
      opt("normal", "Normal day", "普通一日"),
      opt("rough", "Rough day", "唔順利嘅一日"),
      opt("celebrating", "Celebrating", "慶祝緊"),
      opt("big_news", "Big news / change", "有大事 / 變動"),
      opt("grieving", "Grieving / heavy", "傷心 / 沉重"),
    ],
  },
  risk: {
    instructions:
      "Is this a decision where the person's appetite for risk or regret (play it safe vs take the chance) would change the best answer? True for spending, commitments, confrontations, cancellations, or bold moves.",
    threshold: 0.6,
    prompt: { en: "How do you want to play this?", "zh-Hant": "想點處理？" },
    options: [
      opt("safe", "Play it safe", "穩陣啲"),
      opt("balanced", "Balanced", "平衡"),
      opt("bold", "Take the chance", "博一博"),
    ],
  },
};

export type AskAnswers = Partial<Record<AskKey, string[]>>;
