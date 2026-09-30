# Jev Decider

Fast everyday decisions ("Should I bring an umbrella?", "Walk or bus?", "Should I text her back tonight?") from your current location, live data, and how you're doing right now, powered by [Jev](https://openrouter.ai/docs/guides/community/jev) on OpenRouter.

## How it works

| Step | Who | What |
|---|---|---|
| 1a. Read the question | Jev (one Decisions call) | Scores every data source (12 Nouls), every check-in question (11 Nouls), and the shape of the question: stakes, urgency, reversibility, emotional tone, intent, whether someone else is involved |
| 1b. Draft options | Chat model | Turns the question into 2–6 concrete answer options, plus a destination if the question is about going somewhere (runs in parallel with 1a) |
| 2. Quick check-in | You | At most 3 optional chips (mood, energy, budget…) chosen by Jev. Skipped entirely for practical questions |
| 3. Fetch data | Browser | The selected sources below, in parallel |
| 4. Decide | Jev (Choice) | Picks one option with probabilities + confidence, and checks if info was sufficient |
| 5. Explain | Chat model | 2–3 sentence reason in the chosen language (loaded after the decision shows) |

Everything runs in the browser (static site), so each step shows as soon as it finishes.

### Fetched sources (all free, keyless)

| Source | Provider | Used for |
|---|---|---|
| Weather (now + next hours, heat-stress label) | Open-Meteo | Umbrella, clothing, going out |
| Week ahead (7-day) | Open-Meteo | "Hike this weekend?" |
| Air quality + pollen (pollen: Europe only) | Open-Meteo | Running, masks, allergies |
| Daylight + moon phase | Open-Meteo, computed | Night walks, photos |
| Official warnings | HK Observatory (Hong Kong), NWS (USA), USGS quakes (global) | Whether to go out at all |
| Sea state | Open-Meteo Marine | Beach, swim, boat, ferry |
| Place name + country | Nominatim | Context for everything else |
| Nearby places (with open-now heuristic) | Overpass | Lunch, pharmacy, shelter |
| Transit stops | Overpass | Bus, MTR, tram, ferry, taxi |
| Route & travel time (drive via OSRM; walk/bike estimated with climb) | OSRM, Open-Meteo elevation, Nominatim | Walk vs bus vs taxi, "go home" |
| Calendar (weekend, rush hour, public holidays) | Nager.Date, computed | Crowds, opening, traffic |
| Web search | OpenRouter `web` plugin (paid) | Events, news, prices |

### "Which place?" questions

When Jev judges that the answer should be a specific nearby venue ("Where should I eat?", "Nearest pharmacy?"), the app waits for the nearby-places list, has the chat model shortlist 3–5 real places from it (right type, open now, distance, diet notes), and Jev chooses between those named places instead of generic categories. Falls back to the generic options if the list is empty or the shortlist fails.

### Check-in questions (asked, never fetched)

Mood, energy, social battery, who's involved, time available, budget, sleep, physical condition, hunger, what kind of day it is, risk appetite. Jev picks the relevant ones; emotional wording always adds the mood check; high-stakes or hard-to-undo questions add the risk check.

### Profile and memory (this browser only)

"About you" stores home/work locations, sensitivities (asthma, heat, pollen, mobility…), fitness, transport you own, household, diet, current priorities, default risk appetite and free-text notes. It is sent as `state.profile` so Jev treats constraints as hard limits and priorities as tie-breakers.

After each decision you can rate it 👍/👎. The last rated decisions are sent as `state.past_decisions` so Jev leans towards what you considered a good call.

## Live site

https://isaachoo.github.io/jev_proj1/

Paste your OpenRouter API key into the page (stored only in your browser's localStorage, sent only to OpenRouter). Without a key the page runs in demo mode with fake data. Use a key with a spending limit.

Deploys automatically on push via `.github/workflows/pages.yml`.

### Keeping the key on a server (Cloudflare Worker)

`worker/worker.js` is a small proxy that holds the OpenRouter key as a secret, forces the Jev/chat models, caps tokens, allows only the Pages origin, rate-limits per IP, and can require an access code.

1. Cloudflare dashboard → Workers & Pages → Create → Worker → paste `worker/worker.js` → Deploy.
2. Worker → Settings → Variables and Secrets: add secret `OPENROUTER_API_KEY` (and optionally secret `ACCESS_CODE`).
3. GitHub repo → Settings → Secrets and variables → Actions → Variables: add `PROXY_URL` = the Worker URL, then re-run the Pages workflow.

With `PROXY_URL` set, the page hides the key box and calls the Worker instead.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

## Config (optional, build time)

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_JEV_MODEL` | `typesafe/jev-1.13` | Or `~typesafe/jev-latest` |
| `NEXT_PUBLIC_CHAT_MODEL` | `deepseek/deepseek-chat` | Used for options, web search, explanation. `typesafe/jev-router` also works where Meta models are available |
| `NEXT_PUBLIC_CHAT_FALLBACKS` | `openai/gpt-4.1-mini,google/gemini-2.5-flash` | Tried in order if the chat model's provider errors (e.g. "not available in your region"). In proxy mode set `CHAT_MODEL` / `CHAT_FALLBACKS` on the Worker instead |
| `NEXT_PUBLIC_PROXY_URL` | — | Cloudflare Worker URL; set from the `PROXY_URL` repo variable in CI |

Web search uses OpenRouter's `web` plugin (paid per result) and only runs when Jev decides it's needed.

## Files

- `lib/pipeline.ts` — plan / options / gather / decide / explain; source list, thresholds, question signals
- `lib/asks.ts` — the check-in questions (bilingual) and their Jev triggers
- `lib/profile.ts` — profile + decision history in localStorage, compacted for the model
- `lib/openrouter.ts` — Decisions API + chat clients
- `lib/sources.ts` — free data fetchers
- `lib/run.ts` — runs the pipeline and emits progress events
- `lib/mock.ts` — offline stand-ins used in demo mode
- `app/page.tsx` — UI (EN / 繁中 toggle, check-in card, profile editor, feedback)
- `worker/worker.js` — Cloudflare Worker proxy that keeps the key server-side

## Adding a source

1. Add it to the `Source` union and `SOURCES` in `lib/pipeline.ts`, with an entry in `SOURCE_QUESTIONS` (Jev instruction + threshold).
2. Write the fetcher in `lib/sources.ts` and wire it into `gather()`.
3. Add labels in `lib/i18n.ts` (`sources`) and a stand-in in `lib/mock.ts`.
