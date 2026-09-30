// Runs the whole pipeline in the browser, emitting one event per step so the
// UI can show progress as it lands.

import { decide, draftOptions, gather, mockMode, plan, type Input } from "./pipeline";

export type RunEvent = { type: string } & Record<string, unknown>;

export async function runDecision(input: Input, send: (e: RunEvent) => void) {
  const t0 = Date.now();
  let cost = 0;
  try {
    send({ type: "start", mock: mockMode() });

    const [planned, drafted] = await Promise.all([
      plan(input).then((p) => (send({ type: "plan", ...p, ms: Date.now() - t0 }), p)),
      draftOptions(input).then((o) => (send({ type: "options", options: o.options, ms: Date.now() - t0 }), o)),
    ]);
    cost += (planned.cost ?? 0) + (drafted.cost ?? 0);

    const gathered = await gather(input, planned.selected, (e) => send({ type: "source", ...e }));
    cost += gathered.cost;
    send({ type: "data", data: gathered.data, ms: Date.now() - t0 });

    const decision = await decide(input, drafted.options, gathered.data);
    cost += decision.cost ?? 0;
    send({ type: "decision", ...decision, ms: Date.now() - t0, totalCost: cost });
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  }
}
