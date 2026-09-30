# Jev Decider

Fast everyday decisions ("Should I bring an umbrella?", "Walk or bus?") from your current location and live data, powered by [Jev](https://openrouter.ai/docs/guides/community/jev) on OpenRouter.

## How it works

| Step | Who | What |
|---|---|---|
| 1a. Choose data | Jev (Noul ×6) | Decides which sources the question needs: weather, air quality, daylight, place name, nearby places, web search |
| 1b. Draft options | Chat model | Turns the question into 2–6 concrete answer options (runs in parallel with 1a) |
| 2. Fetch data | Browser | Open-Meteo (weather, air quality), Nominatim (place), Overpass (nearby), OpenRouter web plugin (search) |
| 3. Decide | Jev (Choice) | Picks one option with probabilities + confidence, and checks if info was sufficient |
| 4. Explain | Chat model | 2–3 sentence reason in the chosen language (loaded after the decision shows) |

Everything runs in the browser (static site), so each step shows as soon as it finishes.

## Live site

https://isaachoo.github.io/jev_proj1/

Paste your OpenRouter API key into the page (stored only in your browser's localStorage, sent only to OpenRouter). Without a key the page runs in demo mode with fake data. Use a key with a spending limit.

Deploys automatically on push via `.github/workflows/pages.yml`.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

## Config (optional, build time)

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_JEV_MODEL` | `typesafe/jev-1.13` | Or `~typesafe/jev-latest` |
| `NEXT_PUBLIC_CHAT_MODEL` | `typesafe/jev-router` | Used for options, web search, explanation |

Web search uses OpenRouter's `web` plugin (paid per result) and only runs when Jev decides it's needed.

## Files

- `lib/pipeline.ts` — plan / options / gather / decide / explain
- `lib/openrouter.ts` — Decisions API + chat clients
- `lib/sources.ts` — free data fetchers
- `lib/run.ts` — runs the pipeline and emits progress events
- `app/page.tsx` — UI (EN / 繁中 toggle)
