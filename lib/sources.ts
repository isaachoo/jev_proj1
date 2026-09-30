// Free, keyless data sources. Each fetcher returns a compact object that is
// passed to Jev as part of `state`, so keep the fields small and readable.

import { chat } from "./openrouter";

export type Coords = { lat: number; lon: number };

const UA = "jev-decider/0.1 (local dev)";

async function getJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

// WMO weather codes used by Open-Meteo.
const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle", 55: "dense drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "heavy freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "light showers", 81: "showers", 82: "violent showers",
  85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
};

export async function weather({ lat, lon }: Coords, withDaylight: boolean) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "sunrise,sunset,uv_index_max,precipitation_probability_max",
    forecast_hours: "6",
    forecast_days: "1",
    timezone: "auto",
  });
  type R = {
    timezone: string;
    current: Record<string, number | string>;
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
    daily: { sunrise: string[]; sunset: string[]; uv_index_max: number[]; precipitation_probability_max: number[] };
  };
  const r = await getJson<R>(`https://api.open-meteo.com/v1/forecast?${params}`);
  const c = r.current;
  const out: Record<string, unknown> = {
    now: {
      condition: WMO[Number(c.weather_code)] ?? `code ${c.weather_code}`,
      temperature_c: c.temperature_2m,
      feels_like_c: c.apparent_temperature,
      humidity_pct: c.relative_humidity_2m,
      precipitation_mm: c.precipitation,
      wind_kmh: c.wind_speed_10m,
      uv_index: c.uv_index,
    },
    next_hours: r.hourly.time.map((t, i) => ({
      time: t.slice(11),
      temperature_c: r.hourly.temperature_2m[i],
      rain_chance_pct: r.hourly.precipitation_probability[i],
      condition: WMO[r.hourly.weather_code[i]] ?? `code ${r.hourly.weather_code[i]}`,
    })),
    today: {
      max_rain_chance_pct: r.daily.precipitation_probability_max[0],
      uv_index_max: r.daily.uv_index_max[0],
    },
  };
  if (withDaylight) {
    out.daylight = {
      is_day: c.is_day === 1,
      sunrise: r.daily.sunrise[0]?.slice(11),
      sunset: r.daily.sunset[0]?.slice(11),
    };
  }
  return out;
}

export async function airQuality({ lat, lon }: Coords) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "us_aqi,pm2_5,pm10,ozone",
    timezone: "auto",
  });
  const r = await getJson<{ current: Record<string, number> }>(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
  );
  const aqi = r.current.us_aqi;
  const level =
    aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive groups"
      : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very unhealthy" : "hazardous";
  return { us_aqi: aqi, level, pm2_5: r.current.pm2_5, pm10: r.current.pm10, ozone: r.current.ozone };
}

export async function placeName({ lat, lon }: Coords, lang: string) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    zoom: "16",
    "accept-language": lang,
  });
  const r = await getJson<{ display_name: string; address: Record<string, string> }>(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
  );
  const a = r.address;
  return {
    area: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.village,
    city: a.city || a.town || a.state,
    country: a.country,
    full: r.display_name,
  };
}

export async function nearbyPlaces({ lat, lon }: Coords, radiusM = 800) {
  const q = `[out:json][timeout:8];
(
  nwr(around:${radiusM},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|food_court|pharmacy|convenience|library|cinema|hospital|clinic|bus_station|ferry_terminal)$"][name];
  nwr(around:${radiusM},${lat},${lon})[leisure~"^(park|sports_centre|playground|fitness_centre)$"][name];
  nwr(around:${radiusM},${lat},${lon})[shop~"^(supermarket|mall|convenience)$"][name];
  nwr(around:${radiusM},${lat},${lon})[railway=station][name];
);
out center 40;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(q)}`,
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  type El = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };
  const { elements } = (await res.json()) as { elements: El[] };
  return elements
    .map((e) => {
      const p = e.center ?? { lat: e.lat!, lon: e.lon! };
      const t = e.tags;
      return {
        name: t.name,
        type: t.amenity || t.leisure || t.shop || (t.railway ? "station" : "place"),
        distance_m: Math.round(haversine(lat, lon, p.lat, p.lon)),
        ...(t.cuisine ? { cuisine: t.cuisine } : {}),
        ...(t.opening_hours ? { opening_hours: t.opening_hours } : {}),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 25);
}

export async function webSearch(question: string, context: { place?: string; localTime: string; lang: string }) {
  const { text, cost } = await chat(
    [
      {
        role: "system",
        content:
          "You gather current facts for a decision engine. Search the web and reply with at most 8 short bullet points of concrete, current facts relevant to the question (events, warnings, closures, transit disruptions, opening hours, prices). No advice, no preamble. Cite source domains in brackets.",
      },
      {
        role: "user",
        content: `Question: ${question}\nLocation: ${context.place ?? "unknown"}\nLocal time: ${context.localTime}`,
      },
    ],
    { webSearch: true, maxTokens: 400, timeoutMs: 20_000 },
  );
  return { summary: text.trim(), cost };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
