"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASKS, type AskAnswers, type AskKey } from "@/lib/asks";
import { FITNESS_OPTIONS, PROFILE_FIELDS, RISK_OPTIONS, STRINGS } from "@/lib/i18n";
import { PROXY_URL, setAccessCode, setApiKey } from "@/lib/openrouter";
import { explain, type Lang, type Option, type Signals, type Source } from "@/lib/pipeline";
import {
  EMPTY_PROFILE,
  historyForModel,
  isProfileEmpty,
  loadHistory,
  loadProfile,
  profileForModel,
  pushHistory,
  saveProfile,
  setVerdict,
  type HistoryItem,
  type Profile,
} from "@/lib/profile";
import { runDecision } from "@/lib/run";

type Coords = { lat: number; lon: number };
type LocState = { status: "locating" } | { status: "on"; coords: Coords } | { status: "off" };
type SourceStatus = { ok: boolean; ms: number; error?: string };
type Decision = {
  choice: string;
  confidence?: number;
  probabilities: Record<string, number>;
  enoughInfo?: number;
  ms: number;
  totalCost: number;
};
type Run = {
  mock?: boolean;
  plan?: { need: Record<Source, number>; selected: Source[]; signals: Signals };
  options?: Option[];
  destination?: string;
  asks?: AskKey[];
  answers?: AskAnswers;
  sources: Partial<Record<Source, SourceStatus>>;
  data?: Record<string, unknown>;
  decision?: Decision;
  explanation?: string;
  explainError?: string;
  error?: string;
  historyAt?: string;
  verdict?: "good" | "bad";
  took: Partial<Record<"plan" | "options" | "ask" | "gather" | "decide" | "explain", number>>;
};

function localTimeString() {
  const d = new Date();
  const wd = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.toLocaleString("sv-SE").slice(0, 16)} (${wd})`;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("zh-Hant");
  const t = STRINGS[lang];
  const [dark, setDark] = useState(false);
  const [loc, setLoc] = useState<LocState>({ status: "locating" });
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const runIdRef = useRef(0);
  const askResolveRef = useRef<((a: AskAnswers) => void) | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<AskAnswers>({});
  const [keySet, setKeySet] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [codeSet, setCodeSet] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "zh-Hant") setLang(saved);
      setDark(localStorage.getItem("theme") === "dark");
      const code = localStorage.getItem("access_code");
      if (code) {
        setAccessCode(code);
        setCodeSet(true);
      }
      const key = localStorage.getItem("openrouter_key");
      if (key) {
        setApiKey(key);
        setKeySet(true);
      }
    } catch {}
    setProfile(loadProfile());
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh-Hant" ? "zh-Hant-HK" : "en";
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

  function setTheme(next: boolean) {
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setLoc({ status: "off" });
    setLoc({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ status: "on", coords: { lat: p.coords.latitude, lon: p.coords.longitude } }),
      () => setLoc({ status: "off" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(locate, [locate]);

  function updateProfile(p: Profile) {
    setProfile(p);
    saveProfile(p);
  }

  function finishAsk(answers: AskAnswers) {
    const resolve = askResolveRef.current;
    askResolveRef.current = null;
    setDraftAnswers({});
    resolve?.(answers);
  }

  async function submit(q = question) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(text);
    // A pending check-in from an older run must not block that run forever.
    finishAsk({});
    const runId = ++runIdRef.current;
    const stale = () => runId !== runIdRef.current;
    setBusy(true);
    const localTime = localTimeString();
    const coords = loc.status === "on" ? loc.coords : undefined;
    let current: Run = { sources: {}, took: {} };
    const update = (patch: Partial<Run>) => {
      if (stale()) return;
      current = { ...current, ...patch };
      setRun(current);
    };
    update({});

    const compactProfile = profileForModel(profile, coords);
    await runDecision(
      {
        question: text,
        lang,
        coords,
        localTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        profile: compactProfile,
        places: { home: profile.home, work: profile.work },
        history: historyForModel(history),
      },
      (e) => {
        const took = (k: keyof Run["took"]) => ({ took: { ...current.took, [k]: e.took as number } });
        if (e.type === "start") update({ mock: e.mock as boolean });
        else if (e.type === "plan")
          update({ plan: { need: e.need as Record<Source, number>, selected: e.selected as Source[], signals: e.signals as Signals }, ...took("plan") });
        else if (e.type === "options") update({ options: e.options as Option[], destination: e.destination as string | undefined, ...took("options") });
        else if (e.type === "ask") update({ asks: e.asks as AskKey[] });
        else if (e.type === "answers") update({ answers: e.answers as AskAnswers, ...took("ask") });
        else if (e.type === "source")
          update({ sources: { ...current.sources, [e.source as Source]: { ok: e.ok as boolean, ms: e.ms as number, error: e.error as string | undefined } } });
        else if (e.type === "data") update({ data: e.data as Record<string, unknown>, ...took("gather") });
        else if (e.type === "decision") update({ decision: e as unknown as Decision, ...took("decide") });
        else if (e.type === "error") update({ error: e.message as string });
      },
      (keys) =>
        new Promise<AskAnswers>((resolve) => {
          if (stale()) return resolve({});
          askResolveRef.current = resolve;
          setDraftAnswers({});
          void keys;
        }),
    );
    if (!stale()) setBusy(false);

    const { decision, options, data, plan: planned, answers } = current;
    if (!decision || !options || stale()) return;
    const chosen = options.find((o) => o.id === decision.choice) ?? { id: decision.choice, label: decision.choice, description: "" };
    const at = new Date().toISOString();
    setHistory(pushHistory({ at, question: text, choice: chosen.label }));
    update({ historyAt: at });
    const explainStart = Date.now();
    try {
      const res = await explain({
        question: text,
        lang,
        chosen,
        others: options.filter((o) => o.id !== chosen.id),
        confidence: decision.confidence,
        data: data ?? {},
        localTime,
        signals: planned?.signals,
        answers,
        profile: compactProfile,
      });
      update({ explanation: res.text, took: { ...current.took, explain: Date.now() - explainStart } });
    } catch (err) {
      update({ explainError: (err as Error).message, took: { ...current.took, explain: Date.now() - explainStart } });
    }
  }

  function rate(verdict: "good" | "bad") {
    if (!run?.historyAt) return;
    setHistory(setVerdict(run.historyAt, verdict));
    setRun({ ...run, verdict });
  }

  function saveCode(value: string) {
    const v = value.trim();
    setAccessCode(v);
    setCodeSet(v.length > 0);
    setCodeDraft("");
    try {
      if (v) localStorage.setItem("access_code", v);
      else localStorage.removeItem("access_code");
    } catch {}
    if (v && run?.error === "ACCESS_CODE_REQUIRED") setRun(null);
  }

  function saveKey(value: string) {
    const v = value.trim();
    setApiKey(v);
    setKeySet(v.length > 0);
    setKeyDraft("");
    try {
      if (v) localStorage.setItem("openrouter_key", v);
      else localStorage.removeItem("openrouter_key");
    } catch {}
  }

  const chosen = run?.decision && run.options?.find((o) => o.id === run.decision!.choice);
  const asking = busy && !!run?.asks && !run.answers;
  const signalTags = run?.plan ? signalLabels(run.plan.signals, t) : [];

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>{t.title}</h1>
          <p className="muted">{t.subtitle}</p>
        </div>
        <div className="toggles">
          <div className="toggle" role="group" aria-label="Language">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "zh-Hant" ? "on" : ""} onClick={() => setLang("zh-Hant")}>繁中</button>
          </div>
          <div className="toggle" role="group" aria-label="Theme">
            <button className={dark ? "" : "on"} onClick={() => setTheme(false)} title="Light">☀︎</button>
            <button className={dark ? "on" : ""} onClick={() => setTheme(true)} title="Dark">☾</button>
          </div>
        </div>
      </header>

      <div className={`loc loc-${loc.status}`}>
        <span className="dot" />
        {loc.status === "locating" && t.locating}
        {loc.status === "on" && t.locationOn(loc.coords.lat, loc.coords.lon)}
        {loc.status === "off" && (
          <>
            {t.locationOff} <button className="link" onClick={locate}>{t.retryLocation}</button>
          </>
        )}
      </div>

      {PROXY_URL ? (
        (codeSet || run?.error === "ACCESS_CODE_REQUIRED") && (
          <details className="keybox" open={run?.error === "ACCESS_CODE_REQUIRED"}>
            <summary>{codeSet ? t.codeSaved : t.codeMissing}</summary>
            <form
              className="keyform"
              onSubmit={(e) => {
                e.preventDefault();
                saveCode(codeDraft);
              }}
            >
              <input type="password" autoComplete="off" value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} />
              <button type="submit" disabled={!codeDraft.trim()}>{t.keySave}</button>
              {codeSet && (
                <button type="button" onClick={() => saveCode("")}>{t.keyClear}</button>
              )}
            </form>
          </details>
        )
      ) : (
        <details className="keybox" open={!keySet}>
          <summary>{keySet ? t.keySaved : t.keyMissing}</summary>
          <form
            className="keyform"
            onSubmit={(e) => {
              e.preventDefault();
              saveKey(keyDraft);
            }}
          >
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-or-v1-…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <button type="submit" disabled={!keyDraft.trim()}>{t.keySave}</button>
            {keySet && (
              <button type="button" onClick={() => saveKey("")}>{t.keyClear}</button>
            )}
          </form>
          <p className="muted small">
            {t.keyNote}{" "}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">openrouter.ai/settings/keys</a>
          </p>
        </details>
      )}

      <ProfileEditor profile={profile} onChange={updateProfile} coords={loc.status === "on" ? loc.coords : undefined} lang={lang} />

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t.placeholder}
          maxLength={500}
          rows={2}
        />
        <button type="submit" className="primary" disabled={busy || !question.trim()}>
          {busy ? t.deciding : t.decide}
        </button>
      </form>

      <div className="chips">
        {t.examples.map((ex) => (
          <button key={ex} className="chip" disabled={busy} onClick={() => submit(ex)}>
            {ex}
          </button>
        ))}
      </div>

      {run?.mock && <p className="banner">{t.mockBanner}</p>}

      {run && (
        <section className="card steps">
          <Step label={t.steps.plan} done={!!run.plan} active={busy && !run.plan} ms={run.took.plan}>
            {run.plan && (
              <>
                {signalTags.length > 0 && (
                  <div className="tags">
                    {signalTags.map((s) => (
                      <span key={s} className="tag soft">{s}</span>
                    ))}
                  </div>
                )}
                {run.plan.selected.length ? (
                  <div className="tags">
                    {run.plan.selected.map((s) => (
                      <span key={s} className="tag">
                        {t.sources[s]} <small>{Math.round((run.plan!.need[s] ?? 0) * 100)}%</small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted">{t.noSources}</span>
                )}
              </>
            )}
          </Step>
          <Step label={t.steps.options} done={!!run.options} active={busy && !run.options} ms={run.took.options}>
            {run.options && <span className="muted">{run.options.map((o) => o.label).join(" · ")}</span>}
          </Step>
          {(run.asks?.length ?? 0) > 0 && (
            <Step label={t.steps.ask} done={!!run.answers} active={asking} ms={run.took.ask} human>
              {run.answers && (
                <div className="tags">
                  {run.asks!.map((k) => {
                    const picked = run.answers![k] ?? [];
                    const label = picked
                      .map((id) => ASKS[k].options.find((o) => o.id === id)?.label[lang])
                      .filter(Boolean)
                      .join(" + ");
                    return (
                      <span key={k} className={`tag ${label ? "" : "soft"}`}>
                        {label || `— ${t.askSkip.toLowerCase()}`}
                      </span>
                    );
                  })}
                </div>
              )}
            </Step>
          )}
          <Step label={t.steps.gather} done={!!run.data} active={busy && !!run.plan && !run.data} ms={run.took.gather}>
            <div className="tags">
              {Object.entries(run.sources).map(([s, st]) => (
                <span key={s} className={`tag ${st!.ok ? "" : "bad"}`} title={st!.error}>
                  {st!.ok ? "✓" : "✗"} {t.sources[s as Source]} <small>{st!.ms}ms</small>
                </span>
              ))}
            </div>
          </Step>
          <Step label={t.steps.decide} done={!!run.decision} active={busy && !!run.data && !run.decision} ms={run.took.decide} />
          {run.decision && (
            <Step label={t.steps.explain} done={!!run.explanation || !!run.explainError} active={!run.explanation && !run.explainError} ms={run.took.explain} />
          )}
        </section>
      )}

      {asking && run?.asks && (
        <section className="card askcard">
          <p className="eyebrow">{t.steps.ask}</p>
          <h3 className="asktitle">{t.askTitle}</h3>
          {run.asks.map((k) => {
            const def = ASKS[k];
            const picked = draftAnswers[k] ?? [];
            const toggle = (id: string) => {
              const next = picked.includes(id) ? picked.filter((x) => x !== id) : def.multi ? [...picked, id] : [id];
              setDraftAnswers({ ...draftAnswers, [k]: next });
            };
            return (
              <div key={k} className="askq">
                <p className="askprompt">
                  {def.prompt[lang]}
                  {def.multi && <span className="muted small"> · {t.askMulti}</span>}
                </p>
                <div className="tags">
                  {def.options.map((o) => (
                    <button key={o.id} type="button" className={`chip ${picked.includes(o.id) ? "on" : ""}`} onClick={() => toggle(o.id)}>
                      {o.label[lang]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="askactions">
            <button type="button" className="primary" onClick={() => finishAsk(draftAnswers)}>
              {t.askContinue}
            </button>
            <button type="button" className="chip" onClick={() => finishAsk({})}>
              {t.askSkip}
            </button>
            <span className="muted small">{t.askHint}</span>
          </div>
        </section>
      )}

      {run?.error && (
        <p className="banner error">
          {t.error}: {run.error === "ACCESS_CODE_REQUIRED" ? t.codeMissing : run.error}
        </p>
      )}

      {run?.decision && run.options && (
        <section className="card result">
          <p className="eyebrow">{t.decision}</p>
          <h2>{chosen?.label ?? run.decision.choice}</h2>
          {chosen?.description && <p className="muted">{chosen.description}</p>}

          <div className="meters">
            {run.decision.confidence !== undefined && (
              <Meter label={t.confidence} value={run.decision.confidence} />
            )}
            {run.decision.enoughInfo !== undefined && <Meter label={t.enoughInfo} value={run.decision.enoughInfo} />}
          </div>
          {run.decision.enoughInfo !== undefined && run.decision.enoughInfo < 0.5 && (
            <p className="banner">{t.lowInfo}</p>
          )}

          <ul className="probs">
            {[...run.options]
              .sort((a, b) => (run.decision!.probabilities[b.id] ?? 0) - (run.decision!.probabilities[a.id] ?? 0))
              .map((o) => {
                const p = run.decision!.probabilities[o.id] ?? 0;
                return (
                  <li key={o.id} className={o.id === run.decision!.choice ? "picked" : ""}>
                    <span className="plabel">{o.label}</span>
                    <span className="bar">
                      <span style={{ width: `${Math.max(p * 100, 1)}%` }} />
                    </span>
                    <span className="pval">{Math.round(p * 100)}%</span>
                  </li>
                );
              })}
          </ul>

          <h3>{t.whyTitle}</h3>
          {run.explanation ? (
            <p>{run.explanation}</p>
          ) : run.explainError ? (
            <p className="muted">{run.explainError}</p>
          ) : (
            <p className="muted pulse">{t.explaining}</p>
          )}

          <div className="feedback">
            {run.verdict ? (
              <span className="muted small">{t.feedbackThanks}</span>
            ) : (
              <>
                <span className="muted small">{t.feedbackAsk}</span>
                <button type="button" className="chip" onClick={() => rate("good")}>{t.feedbackGood}</button>
                <button type="button" className="chip" onClick={() => rate("bad")}>{t.feedbackBad}</button>
              </>
            )}
          </div>

          <p className="muted small">{t.cost(run.decision.totalCost ?? 0, run.decision.ms)}</p>

          {run.data && Object.keys(run.data).length > 0 && (
            <details>
              <summary>{t.dataTitle}</summary>
              <pre>{JSON.stringify(run.data, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

function signalLabels(s: Signals, t: (typeof STRINGS)[Lang]) {
  const out: string[] = [];
  if (s.stakes !== "low") out.push(t.signals.stakes[s.stakes]);
  if (s.urgency === "now") out.push(t.signals.urgency.now);
  if (s.reversibility === "hard_to_undo") out.push(t.signals.reversibility.hard_to_undo);
  if (t.signals.tone[s.tone]) out.push(t.signals.tone[s.tone]);
  if (t.signals.intent[s.intent]) out.push(t.signals.intent[s.intent]);
  if (s.involves_others >= 0.6) out.push(t.signals.others);
  return out;
}

function ProfileEditor({
  profile,
  onChange,
  coords,
  lang,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  coords?: Coords;
  lang: Lang;
}) {
  const t = STRINGS[lang].profile;
  const count =
    (profile.home ? 1 : 0) +
    (profile.work ? 1 : 0) +
    (profile.fitness ? 1 : 0) +
    (profile.risk ? 1 : 0) +
    (profile.notes?.trim() ? 1 : 0) +
    profile.sensitivities.length +
    profile.transport.length +
    profile.household.length +
    profile.diet.length +
    profile.values.length;

  const toggle = (key: (typeof PROFILE_FIELDS)[number]["key"], value: string) => {
    const list = profile[key] as string[];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ ...profile, [key]: next });
  };

  const placeRow = (key: "home" | "work") => {
    const c = profile[key];
    return (
      <div className="prow" key={key}>
        <span className="plab">{t[key]}</span>
        <span className="muted small">{c ? `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}` : t.unset}</span>
        <button type="button" className="chip" disabled={!coords} onClick={() => coords && onChange({ ...profile, [key]: coords })}>
          {t.setHere}
        </button>
        {c && (
          <button type="button" className="chip" onClick={() => onChange({ ...profile, [key]: undefined })}>
            {t.clear}
          </button>
        )}
      </div>
    );
  };

  const chipRow = (label: string, options: string[], selected: string[], onPick: (v: string) => void) => (
    <div className="prow">
      <span className="plab">{label}</span>
      <div className="tags">
        {options.map((o) => (
          <button key={o} type="button" className={`chip ${selected.includes(o) ? "on" : ""}`} onClick={() => onPick(o)}>
            {t.labels[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <details className="keybox profile">
      <summary>{isProfileEmpty(profile) ? t.empty : t.filled(count)}</summary>
      <p className="muted small">{t.note}</p>
      {placeRow("home")}
      {placeRow("work")}
      {PROFILE_FIELDS.map((f) => (
        <div key={f.key}>{chipRow(t[f.key], f.options, profile[f.key], (v) => toggle(f.key, v))}</div>
      ))}
      {chipRow(t.fitness, FITNESS_OPTIONS, profile.fitness ? [profile.fitness] : [], (v) =>
        onChange({ ...profile, fitness: profile.fitness === v ? undefined : (v as Profile["fitness"]) }),
      )}
      {chipRow(t.risk, RISK_OPTIONS, profile.risk ? [profile.risk] : [], (v) =>
        onChange({ ...profile, risk: profile.risk === v ? undefined : (v as Profile["risk"]) }),
      )}
      <div className="prow">
        <span className="plab">{t.notes}</span>
        <textarea
          className="pnotes"
          rows={2}
          maxLength={300}
          placeholder={t.notesPlaceholder}
          value={profile.notes ?? ""}
          onChange={(e) => onChange({ ...profile, notes: e.target.value })}
        />
      </div>
      {!isProfileEmpty(profile) && (
        <button type="button" className="link small" onClick={() => onChange({ ...EMPTY_PROFILE })}>
          {t.reset}
        </button>
      )}
    </details>
  );
}

function Step({
  label,
  done,
  active,
  ms,
  human,
  children,
}: {
  label: string;
  done: boolean;
  active: boolean;
  ms?: number;
  human?: boolean; // time spent waiting on the person, not on a service
  children?: React.ReactNode;
}) {
  return (
    <div className={`step ${done ? "done" : ""} ${active ? "active" : ""}`}>
      <span className="mark">{done ? "✓" : active ? "…" : "○"}</span>
      <div>
        <strong>{label}</strong>
        {ms !== undefined && (
          <span className={`stepms ${human ? "human" : ""}`}>
            {(ms / 1000).toFixed(1)}s{human ? " 👤" : ""}
          </span>
        )}
        {children && <div className="detail">{children}</div>}
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="meter">
      <span className="muted small">{label}</span>
      <strong>{pct}%</strong>
    </div>
  );
}
