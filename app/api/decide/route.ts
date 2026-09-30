// Streams the pipeline as NDJSON so the UI can show each step as it lands.

import { decide, draftOptions, gather, mockMode, plan, type Input, type Lang } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseInput(body: unknown): Input | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) return "question is required";
  if (question.length > 500) return "question is too long (max 500 characters)";
  const lang: Lang = b.lang === "zh-Hant" ? "zh-Hant" : "en";
  const c = b.coords as { lat?: unknown; lon?: unknown } | undefined;
  const coords =
    c && typeof c.lat === "number" && typeof c.lon === "number" && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180
      ? { lat: c.lat, lon: c.lon }
      : undefined;
  return {
    question,
    lang,
    coords,
    localTime: typeof b.localTime === "string" ? b.localTime.slice(0, 40) : new Date().toISOString(),
    timezone: typeof b.timezone === "string" ? b.timezone.slice(0, 60) : "UTC",
  };
}

export async function POST(req: Request) {
  const input = parseInput(await req.json().catch(() => null));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
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
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
