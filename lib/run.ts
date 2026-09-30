// Runs the whole pipeline in the browser, emitting one event per step so the
// UI can show progress as it lands. Data fetching starts as soon as the plan
// is known and overlaps with option drafting and the person's check-in.

import type { AskAnswers, AskKey } from "./asks";
import { decide, draftOptions, draftPlaceOptions, gather, mockMode, plan, type Input, type NearbyPlace } from "./pipeline";

export type RunEvent = { type: string } & Record<string, unknown>;

export async function runDecision(input: Input, send: (e: RunEvent) => void, ask: (keys: AskKey[]) => Promise<AskAnswers>) {
  const t0 = Date.now();
  let cost = 0;
  try {
    send({ type: "start", mock: mockMode() });

    // Every event carries `took`: how long that step itself ran (ms).
    const optionsP = draftOptions(input).then((o) => (send({ type: "options", options: o.options, destination: o.destination, model: o.model, took: Date.now() - t0 }), o));
    optionsP.catch(() => {}); // surfaced via Promise.all below; avoids an unhandled-rejection warning if plan fails first
    const planned = await plan(input);
    send({ type: "plan", ...planned, took: Date.now() - t0 });

    const askStart = Date.now();
    const askP: Promise<AskAnswers> = planned.asks.length
      ? (send({ type: "ask", asks: planned.asks }), ask(planned.asks).then((a) => (send({ type: "answers", answers: a, took: Date.now() - askStart }), a)))
      : Promise.resolve({});

    // "Which place?" questions: as soon as the nearby list lands, shortlist real
    // venues (needs the check-in answers, so it waits for those too).
    let placeOptionsP: ReturnType<typeof draftPlaceOptions> | undefined;
    const gatherStart = Date.now();
    const gatherP = gather(input, planned.selected, () => optionsP.then((o) => o.destination), (e) => {
      const { value, ...rest } = e;
      send({ type: "source", ...rest });
      if (e.source === "nearby" && e.ok && planned.signals.wants_place >= 0.6 && Array.isArray(value)) {
        placeOptionsP = askP.then((a) => draftPlaceOptions(input, value as NearbyPlace[], a)).catch(() => undefined);
      }
    }).then((g) => (send({ type: "data", data: g.data, took: Date.now() - gatherStart }), g));

    const [drafted, answers, gathered] = await Promise.all([optionsP, askP, gatherP]);
    cost += (planned.cost ?? 0) + (drafted.cost ?? 0) + gathered.cost;

    let options = drafted.options;
    const places = placeOptionsP ? await placeOptionsP : undefined;
    if (places) {
      options = places.options;
      cost += places.cost ?? 0;
      send({ type: "options", options, destination: drafted.destination, model: places.model, took: Date.now() - t0, concrete: true });
    }

    const decideStart = Date.now();
    const decision = await decide(input, options, gathered.data, { signals: planned.signals, answers });
    cost += decision.cost ?? 0;
    send({ type: "decision", ...decision, ms: Date.now() - t0, took: Date.now() - decideStart, totalCost: cost });
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  }
}
