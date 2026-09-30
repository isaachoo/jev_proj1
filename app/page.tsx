"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STRINGS } from "@/lib/i18n";
import type { Lang, Option, Source } from "@/lib/pipeline";

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
  plan?: { need: Record<Source, number>; selected: Source[] };
  options?: Option[];
  sources: Partial<Record<Source, SourceStatus>>;
  data?: Record<string, unknown>;
  decision?: Decision;
  explanation?: string;
  explainError?: string;
  error?: string;
};

function localTimeString() {
  const d = new Date();
  const wd = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.toLocaleString("sv-SE").slice(0, 16)} (${wd})`;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const t = STRINGS[lang];
  const [loc, setLoc] = useState<LocState>({ status: "locating" });
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "zh-Hant") setLang(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh-Hant" ? "zh-Hant-HK" : "en";
    try {
      localStorage.setItem("lang", lang);
    } catch {}
  }, [lang]);

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

  async function submit(q = question) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(text);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    const localTime = localTimeString();
    let current: Run = { sources: {} };
    const update = (patch: Partial<Run>) => {
      current = { ...current, ...patch };
      setRun(current);
    };
    update({});

    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          lang,
          coords: loc.status === "on" ? loc.coords : undefined,
          localTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "start") update({ mock: e.mock });
          else if (e.type === "plan") update({ plan: { need: e.need, selected: e.selected } });
          else if (e.type === "options") update({ options: e.options });
          else if (e.type === "source")
            update({ sources: { ...current.sources, [e.source]: { ok: e.ok, ms: e.ms, error: e.error } } });
          else if (e.type === "data") update({ data: e.data });
          else if (e.type === "decision") update({ decision: e });
          else if (e.type === "error") update({ error: e.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }

    const { decision, options, data } = current;
    if (!decision || !options || ac.signal.aborted) return;
    const chosen = options.find((o) => o.id === decision.choice) ?? { id: decision.choice, label: decision.choice, description: "" };
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          lang,
          chosen,
          others: options.filter((o) => o.id !== chosen.id),
          confidence: decision.confidence,
          data,
          localTime,
        }),
        signal: ac.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      update({ explanation: body.text });
    } catch (err) {
      if ((err as Error).name !== "AbortError") update({ explainError: (err as Error).message });
    }
  }

  const chosen = run?.decision && run.options?.find((o) => o.id === run.decision!.choice);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>{t.title}</h1>
          <p className="muted">{t.subtitle}</p>
        </div>
        <div className="toggle" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "zh-Hant" ? "on" : ""} onClick={() => setLang("zh-Hant")}>繁中</button>
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
          <Step label={t.steps.plan} done={!!run.plan} active={busy && !run.plan}>
            {run.plan &&
              (run.plan.selected.length ? (
                <div className="tags">
                  {run.plan.selected.map((s) => (
                    <span key={s} className="tag">
                      {t.sources[s]} <small>{Math.round((run.plan!.need[s] ?? 0) * 100)}%</small>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted">{t.noSources}</span>
              ))}
          </Step>
          <Step label={t.steps.options} done={!!run.options} active={busy && !run.options}>
            {run.options && <span className="muted">{run.options.map((o) => o.label).join(" · ")}</span>}
          </Step>
          <Step label={t.steps.gather} done={!!run.data} active={busy && !!run.plan && !run.data}>
            <div className="tags">
              {Object.entries(run.sources).map(([s, st]) => (
                <span key={s} className={`tag ${st!.ok ? "" : "bad"}`} title={st!.error}>
                  {st!.ok ? "✓" : "✗"} {t.sources[s as Source]} <small>{st!.ms}ms</small>
                </span>
              ))}
            </div>
          </Step>
          <Step label={t.steps.decide} done={!!run.decision} active={busy && !!run.data && !run.decision} />
        </section>
      )}

      {run?.error && (
        <p className="banner error">
          {t.error}: {run.error}
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

function Step({ label, done, active, children }: { label: string; done: boolean; active: boolean; children?: React.ReactNode }) {
  return (
    <div className={`step ${done ? "done" : ""} ${active ? "active" : ""}`}>
      <span className="mark">{done ? "✓" : active ? "…" : "○"}</span>
      <div>
        <strong>{label}</strong>
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
