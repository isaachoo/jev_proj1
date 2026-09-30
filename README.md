# Jev Decider

Fast everyday decisions ("Should I bring an umbrella?", "Walk or bus?") from your current location and live data, powered by [Jev](https://openrouter.ai/docs/guides/community/jev) on OpenRouter.

## How it works

| Step | Who | What |
|---|---|---|
| 1a. Choose data | Jev (Noul ×6) | Decides which sources the question needs: weather, air quality, daylight, place name, nearby places, web search |
| 1b. Draft options | Chat model | Turns the question into 2–6 concrete answer options (runs in parallel with 1a) |
| 2. Fetch data | Server | Open-Meteo (weather, air quality), Nominatim (place), Overpass (nearby), OpenRouter web plugin (search) |
| 3. Decide | Jev (Choice) | Picks one option with probabilities + confidence, and checks if info was sufficient |
| 4. Explain | Chat model | 2–3 sentence reason in the chosen language (loaded after the decision shows) |

Steps stream to the browser as NDJSON, so the decision appears as soon as Jev answers.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

Allow location access in the browser. Without an API key (or with `MOCK=1`) the app runs on fake data.

## Config (`.env.local`)

| Var | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Required for real calls |
| `JEV_MODEL` | `typesafe/jev-1.13` | Or `~typesafe/jev-latest` |
| `CHAT_MODEL` | `typesafe/jev-router` | Used for options, web search, explanation |
| `MOCK` | `0` | `1` = no network calls |

Web search uses OpenRouter's `web` plugin (paid per result) and only runs when Jev decides it's needed.

## Files

- `lib/pipeline.ts` — plan / options / gather / decide / explain
- `lib/openrouter.ts` — Decisions API + chat clients
- `lib/sources.ts` — free data fetchers
- `app/api/decide` — streaming pipeline endpoint
- `app/page.tsx` — UI (EN / 繁中 toggle)
