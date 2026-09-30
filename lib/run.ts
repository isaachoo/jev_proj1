// Runs the whole pipeline in the browser, emitting one event per step so the
// UI can show progress as it lands. `ask` pauses the run while the person
// answers the quick questions Jev picked (or skips them).

import type { AskAnswers, AskKey } from "./asks";
import { decide, draftOptions, gather, mockMode, plan, type Input } from "./pipeline";

export type RunEvent = { type: string } & Record<string, unknown>;

export async function runDecision(input: Input, send: (e: RunEvent) => void, ask: (keys: AskKey[]) => Promise<AskAnswers>) {
  const t0 = Date.now();
  let cost = 0;
  try {
    send({ type: "start", mock: mockMode() });

    const [planned, drafted] = await Promise.all([
      plan(input).then((p) => (send({ type: "plan", ...p, ms: Date.now() - t0 }), p)),
      draftOptions(input).then((o) => (send({ type: "options", options: o.options, destination: o.destination, ms: Date.now() - t0 }), o)),
    ]);
    cost += (planned.cost ?? 0) + (drafted.cost ?? 0);

    let answers: AskAnswers = {};
    if (planned.asks.length) {
      send({ type: "ask", asks: planned.asks });
      answers = await ask(planned.asks);
      send({ type: "answers", answers });
    }

    const gathered = await gather(input, planned.selected, drafted.destination, (e) => send({ type: "source", ...e }));
    cost += gathered.cost;
    send({ type: "data", data: gathered.data, ms: Date.now() - t0 });

    const decision = await decide(input, drafted.options, gathered.data, { signals: planned.signals, answers });
    cost += decision.cost ?? 0;
    send({ type: "decision", ...decision, ms: Date.now() - t0, totalCost: cost });
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  }
}
