// Runs the whole pipeline in the browser, emitting one event per step so the
// UI can show progress as it lands. Data fetching starts as soon as the plan
// is known and overlaps with option drafting and the person's check-in.

import type { AskAnswers, AskKey } from "./asks";
import { decide, draftOptions, gather, mockMode, plan, type Input } from "./pipeline";

export type RunEvent = { type: string } & Record<string, unknown>;

export async function runDecision(input: Input, send: (e: RunEvent) => void, ask: (keys: AskKey[]) => Promise<AskAnswers>) {
  const t0 = Date.now();
  let cost = 0;
  try {
    send({ type: "start", mock: mockMode() });

    const optionsP = draftOptions(input).then((o) => (send({ type: "options", options: o.options, destination: o.destination, ms: Date.now() - t0 }), o));
    optionsP.catch(() => {}); // surfaced via Promise.all below; avoids an unhandled-rejection warning if plan fails first
    const planned = await plan(input);
    send({ type: "plan", ...planned, ms: Date.now() - t0 });

    const askP: Promise<AskAnswers> = planned.asks.length
      ? (send({ type: "ask", asks: planned.asks }), ask(planned.asks).then((a) => (send({ type: "answers", answers: a }), a)))
      : Promise.resolve({});

    const gatherP = gather(input, planned.selected, () => optionsP.then((o) => o.destination), (e) => send({ type: "source", ...e })).then(
      (g) => (send({ type: "data", data: g.data, ms: Date.now() - t0 }), g),
    );

    const [drafted, answers, gathered] = await Promise.all([optionsP, askP, gatherP]);
    cost += (planned.cost ?? 0) + (drafted.cost ?? 0) + gathered.cost;

    const decision = await decide(input, drafted.options, gathered.data, { signals: planned.signals, answers });
    cost += decision.cost ?? 0;
    send({ type: "decision", ...decision, ms: Date.now() - t0, totalCost: cost });
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  }
}
