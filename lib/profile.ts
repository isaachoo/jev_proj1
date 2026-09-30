// Persistent personal context, kept only in this browser (localStorage) and
// sent to Jev as `state.profile`. Every field is optional; empty ones are
// dropped before sending so the model only sees what the person chose to add.

import type { Coords } from "./sources";

export type Profile = {
  home?: Coords;
  work?: Coords;
  // Health sensitivities that lower the thresholds for heat / air quality.
  sensitivities: ("asthma" | "heat" | "cold" | "pollen" | "pregnant" | "mobility")[];
  fitness?: "low" | "medium" | "high";
  transport: ("car" | "bike" | "octopus")[];
  household: ("kids" | "elderly" | "pet")[];
  diet: ("vegetarian" | "vegan" | "halal" | "no_pork" | "no_beef" | "gluten_free" | "nut_allergy")[];
  values: ("health" | "money" | "career" | "family" | "friends" | "rest" | "adventure" | "environment")[];
  risk?: "safe" | "balanced" | "bold";
  notes?: string; // free text, e.g. "knee injury, avoid stairs"
};

export const EMPTY_PROFILE: Profile = {
  sensitivities: [],
  transport: [],
  household: [],
  diet: [],
  values: [],
};

export type HistoryItem = {
  at: string; // ISO date
  question: string;
  choice: string; // option label
  verdict?: "good" | "bad";
};

const PROFILE_KEY = "profile";
const HISTORY_KEY = "history";
const HISTORY_MAX = 30;

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {}
}

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: HistoryItem): HistoryItem[] {
  const list = [item, ...loadHistory()].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {}
  return list;
}

export function setVerdict(at: string, verdict: "good" | "bad"): HistoryItem[] {
  const list = loadHistory().map((h) => (h.at === at ? { ...h, verdict } : h));
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {}
  return list;
}

export function isProfileEmpty(p: Profile) {
  return (
    !p.home &&
    !p.work &&
    !p.fitness &&
    !p.risk &&
    !p.notes?.trim() &&
    p.sensitivities.length + p.transport.length + p.household.length + p.diet.length + p.values.length === 0
  );
}

// Compact form for the model: drop empties, round coordinates.
export function profileForModel(p: Profile, here?: Coords): Record<string, unknown> | undefined {
  if (isProfileEmpty(p)) return undefined;
  const out: Record<string, unknown> = {};
  const km = (a: Coords, b: Coords) => Math.round(haversineKm(a, b) * 10) / 10;
  if (p.home) out.home = here ? { distance_km: km(here, p.home) } : "set";
  if (p.work) out.work = here ? { distance_km: km(here, p.work) } : "set";
  if (p.sensitivities.length) out.sensitivities = p.sensitivities;
  if (p.fitness) out.fitness = p.fitness;
  if (p.transport.length) out.has = p.transport;
  if (p.household.length) out.household = p.household;
  if (p.diet.length) out.diet = p.diet;
  if (p.values.length) out.values = p.values;
  if (p.risk) out.risk_appetite = p.risk;
  if (p.notes?.trim()) out.notes = p.notes.trim().slice(0, 300);
  return out;
}

// Recent outcomes, so Jev can learn what this person considered a good call.
export function historyForModel(list: HistoryItem[]) {
  const rated = list.filter((h) => h.verdict).slice(0, 10);
  if (!rated.length) return undefined;
  return rated.map((h) => ({ question: h.question.slice(0, 80), chose: h.choice.slice(0, 40), was: h.verdict }));
}

export function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
