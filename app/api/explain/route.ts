import { explain, type Lang, type Option } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as {
    question?: string;
    lang?: Lang;
    chosen?: Option;
    others?: Option[];
    confidence?: number;
    data?: Record<string, unknown>;
    localTime?: string;
  } | null;
  if (!b?.question || !b.chosen?.label) return Response.json({ error: "question and chosen are required" }, { status: 400 });

  try {
    const result = await explain({
      question: b.question.slice(0, 500),
      lang: b.lang === "zh-Hant" ? "zh-Hant" : "en",
      chosen: b.chosen,
      others: Array.isArray(b.others) ? b.others.slice(0, 6) : [],
      confidence: b.confidence,
      data: b.data ?? {},
      localTime: b.localTime ?? new Date().toISOString(),
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
