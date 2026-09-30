// Cloudflare Worker: keeps the OpenRouter key server-side for the GitHub Pages site.
//
// Routes (POST, JSON):
//   /decisions -> https://openrouter.ai/api/alpha/decisions   (Jev)
//   /chat      -> https://openrouter.ai/api/v1/chat/completions
//
// Settings (Worker -> Settings -> Variables and Secrets):
//   OPENROUTER_API_KEY  secret, required
//   ACCESS_CODE         secret, optional: if set, callers must send it as X-Access-Code
//   ALLOWED_ORIGINS     optional, comma-separated (default: the Pages site + localhost)
//   JEV_MODEL           optional (default typesafe/jev-1.13)
//   CHAT_MODEL          optional (default typesafe/jev-router)
//   CHAT_FALLBACKS      optional, comma-separated models tried in order if the
//                       primary fails, e.g. a provider that blocks the region
//                       (default openai/gpt-4.1-mini,google/gemini-2.5-flash)
//   RATE_LIMIT_PER_MIN  optional, per IP (default 30; one decision uses ~4-5 calls)

const DEFAULT_ORIGINS = "https://isaachoo.github.io,http://localhost:3000";
const MAX_BODY_BYTES = 192 * 1024;

// Best-effort per-isolate limiter; Cloudflare may run several isolates.
const hits = new Map();

function rateLimited(ip, limit) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim());
    if (!allowed.includes(origin)) return json(403, { error: "Origin not allowed" }, {});
    const h = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (request.method !== "POST") return json(405, { error: "POST only" }, h);
    if (!env.OPENROUTER_API_KEY) return json(500, { error: "Worker is missing OPENROUTER_API_KEY" }, h);

    if (env.ACCESS_CODE && request.headers.get("X-Access-Code") !== env.ACCESS_CODE) {
      return json(401, { error: "Access code required" }, h);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip, Number(env.RATE_LIMIT_PER_MIN) || 30)) {
      return json(429, { error: "Too many requests, try again in a minute" }, h);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Request too large" }, h);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "Invalid JSON" }, h);
    }

    const path = new URL(request.url).pathname;
    let upstream;
    let payload;

    if (path === "/decisions") {
      upstream = "https://openrouter.ai/api/alpha/decisions";
      payload = {
        model: env.JEV_MODEL || "typesafe/jev-1.13",
        state: body.state,
        questions: body.questions,
      };
    } else if (path === "/chat") {
      upstream = "https://openrouter.ai/api/v1/chat/completions";
      const wantsWeb = Array.isArray(body.plugins) && body.plugins.some((p) => p && p.id === "web");
      const primary = env.CHAT_MODEL || "typesafe/jev-router";
      const fallbacks = (env.CHAT_FALLBACKS ?? "openai/gpt-4.1-mini,google/gemini-2.5-flash")
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m && m !== primary);
      payload = {
        // OpenRouter tries `models` in order when a provider errors (e.g. region block).
        ...(fallbacks.length ? { models: [primary, ...fallbacks] } : { model: primary }),
        messages: Array.isArray(body.messages) ? body.messages.slice(0, 10) : [],
        max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
        usage: { include: true },
        ...(wantsWeb ? { plugins: [{ id: "web", max_results: 3 }] } : {}),
      };
    } else {
      return json(404, { error: "Unknown route" }, h);
    }

    const res = await fetch(upstream, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://isaachoo.github.io/jev_proj1/",
        "X-Title": "Jev Decider",
      },
      body: JSON.stringify(payload),
    });

    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json", ...h },
    });
  },
};
