// Free, keyless data sources. Each fetcher returns a compact object that is
// passed to Jev as part of `state`, so keep the fields small and readable.

import { chat } from "./openrouter";

export type Coords = { lat: number; lon: number };

async function getJson<T>(url: string, timeoutMs = 6000, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
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
const wmo = (code: number | string | undefined) => WMO[Number(code)] ?? `code ${code}`;

// Rough thermal comfort from apparent temperature (°C).
function heatStress(feelsLike: number) {
  if (feelsLike >= 41) return "extreme heat";
  if (feelsLike >= 33) return "high heat stress";
  if (feelsLike >= 29) return "warm, some heat stress";
  if (feelsLike <= 0) return "freezing";
  if (feelsLike <= 8) return "cold";
  if (feelsLike <= 14) return "cool";
  return "comfortable";
}

// ---------------------------------------------------------------- weather

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
  const rainSoon = Math.max(0, ...r.hourly.precipitation_probability.slice(0, 3));
  const out: Record<string, unknown> = {
    now: {
      condition: wmo(c.weather_code),
      temperature_c: c.temperature_2m,
      feels_like_c: c.apparent_temperature,
      comfort: heatStress(Number(c.apparent_temperature)),
      humidity_pct: c.relative_humidity_2m,
      precipitation_mm: c.precipitation,
      wind_kmh: c.wind_speed_10m,
      uv_index: c.uv_index,
    },
    rain_chance_next_3h_pct: rainSoon,
    next_hours: r.hourly.time.map((t, i) => ({
      time: t.slice(11),
      temperature_c: r.hourly.temperature_2m[i],
      rain_chance_pct: r.hourly.precipitation_probability[i],
      condition: wmo(r.hourly.weather_code[i]),
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
      moon: moonPhase(),
    };
  }
  return out;
}

export async function forecastWeek({ lat, lon }: Coords) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max",
    forecast_days: "7",
    timezone: "auto",
  });
  type R = {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
      precipitation_sum: number[];
      wind_speed_10m_max: number[];
      uv_index_max: number[];
    };
  };
  const { daily: d } = await getJson<R>(`https://api.open-meteo.com/v1/forecast?${params}`);
  return d.time.map((date, i) => ({
    date,
    weekday: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
    condition: wmo(d.weather_code[i]),
    high_c: d.temperature_2m_max[i],
    low_c: d.temperature_2m_min[i],
    rain_chance_pct: d.precipitation_probability_max[i],
    rain_mm: d.precipitation_sum[i],
    wind_max_kmh: d.wind_speed_10m_max[i],
    uv_max: d.uv_index_max[i],
  }));
}

export async function airQuality({ lat, lon }: Coords) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "us_aqi,pm2_5,pm10,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
    timezone: "auto",
  });
  const r = await getJson<{ current: Record<string, number | null> }>(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
  );
  const c = r.current;
  const aqi = c.us_aqi ?? 0;
  const level =
    aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 150 ? "unhealthy for sensitive groups"
      : aqi <= 200 ? "unhealthy" : aqi <= 300 ? "very unhealthy" : "hazardous";
  const out: Record<string, unknown> = { us_aqi: aqi, level, pm2_5: c.pm2_5, pm10: c.pm10, ozone: c.ozone };
  // Pollen is only modelled for Europe; Open-Meteo returns null elsewhere.
  const pollen: Record<string, number> = {};
  for (const k of ["alder", "birch", "grass", "mugwort", "olive", "ragweed"]) {
    const v = c[`${k}_pollen`];
    if (typeof v === "number" && v > 0) pollen[k] = v;
  }
  out.pollen_grains_m3 = Object.keys(pollen).length ? pollen : "not available in this region";
  return out;
}

export async function marine({ lat, lon }: Coords) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "wave_height,wave_period,swell_wave_height,sea_surface_temperature",
    timezone: "auto",
  });
  const r = await getJson<{ current: Record<string, number | null> }>(
    `https://marine-api.open-meteo.com/v1/marine?${params}`,
  );
  const c = r.current;
  if (c.wave_height == null) return { note: "no sea nearby or no marine data for this spot" };
  const h = c.wave_height;
  const sea = h < 0.5 ? "calm" : h < 1.25 ? "slight" : h < 2.5 ? "moderate" : h < 4 ? "rough" : "very rough";
  return {
    wave_height_m: h,
    sea_state: sea,
    wave_period_s: c.wave_period,
    swell_height_m: c.swell_wave_height,
    sea_temperature_c: c.sea_surface_temperature,
  };
}

// ---------------------------------------------------------------- alerts

const inHongKong = ({ lat, lon }: Coords) => lat > 22.1 && lat < 22.6 && lon > 113.8 && lon < 114.5;
const inUSA = ({ lat, lon }: Coords) =>
  (lat > 24 && lat < 50 && lon > -125 && lon < -66) || (lat > 51 && lat < 72 && lon > -170 && lon < -129) || (lat > 18 && lat < 23 && lon > -161 && lon < -154);

export async function alerts(coords: Coords, lang: string) {
  const out: Record<string, unknown> = {};
  const jobs: Promise<void>[] = [];

  if (inHongKong(coords)) {
    type Warn = { name: string; code: string; actionCode: string; type?: string; issueTime?: string };
    jobs.push(
      getJson<Record<string, Warn>>(
        `https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=${lang.startsWith("zh") ? "tc" : "en"}`,
      )
        .then((r) => {
          const active = Object.values(r ?? {}).filter((w) => w && w.actionCode !== "CANCEL");
          out.hong_kong_observatory_warnings = active.length
            ? active.map((w) => ({ warning: w.name, ...(w.type ? { level: w.type } : {}), since: w.issueTime?.slice(11, 16) }))
            : "none in force";
        })
        .catch((e) => {
          out.hong_kong_observatory_warnings = `unavailable (${(e as Error).message})`;
        }),
    );
  } else if (inUSA(coords)) {
    type F = { properties: { event: string; severity: string; headline: string; expires: string } };
    jobs.push(
      getJson<{ features: F[] }>(`https://api.weather.gov/alerts/active?point=${coords.lat},${coords.lon}`, 8000)
        .then((r) => {
          out.nws_alerts = r.features.length
            ? r.features.slice(0, 5).map((f) => ({ event: f.properties.event, severity: f.properties.severity, until: f.properties.expires.slice(0, 16) }))
            : "none in force";
        })
        .catch((e) => {
          out.nws_alerts = `unavailable (${(e as Error).message})`;
        }),
    );
  } else {
    out.official_weather_warnings = "no free feed for this region; rely on weather data and web search";
  }

  // Significant earthquakes nearby in the last 24 h (global).
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const q = new URLSearchParams({
    format: "geojson",
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    maxradiuskm: "300",
    minmagnitude: "4",
    starttime: since,
    orderby: "magnitude",
    limit: "3",
  });
  type Quake = { properties: { mag: number; place: string; time: number } };
  jobs.push(
    getJson<{ features: Quake[] }>(`https://earthquake.usgs.gov/fdsnws/event/1/query?${q}`, 8000)
      .then((r) => {
        out.earthquakes_24h = r.features.length
          ? r.features.map((f) => ({ magnitude: f.properties.mag, place: f.properties.place }))
          : "none";
      })
      .catch(() => {
        out.earthquakes_24h = "unavailable";
      }),
  );

  await Promise.all(jobs);
  return out;
}

// ---------------------------------------------------------------- place / nearby

type NominatimAddress = Record<string, string>;

export async function placeName({ lat, lon }: Coords, lang: string) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    zoom: "16",
    "accept-language": lang,
  });
  const r = await getJson<{ display_name: string; address: NominatimAddress }>(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
  );
  const a = r.address;
  return {
    area: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.village,
    city: a.city || a.town || a.state,
    country: a.country,
    country_code: (a.country_code || "").toUpperCase(),
    full: r.display_name,
  };
}
export type Place = Awaited<ReturnType<typeof placeName>>;

export async function geocode(query: string, near: Coords, lang: string): Promise<(Coords & { name: string }) | undefined> {
  const d = 0.35;
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    viewbox: `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`,
    "accept-language": lang,
  });
  const r = await getJson<{ lat: string; lon: string; display_name: string; name?: string }[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
  );
  const hit = r[0];
  if (!hit) return undefined;
  return { lat: Number(hit.lat), lon: Number(hit.lon), name: hit.name || hit.display_name.split(",")[0] };
}

type OverpassEl = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };

async function overpass(query: string, timeoutMs = 9000): Promise<OverpassEl[]> {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const { elements } = (await res.json()) as { elements: OverpassEl[] };
  return elements;
}

const elCoords = (e: OverpassEl) => e.center ?? { lat: e.lat!, lon: e.lon! };

export async function nearbyPlaces({ lat, lon }: Coords, radiusM = 800) {
  const q = `[out:json][timeout:8];
(
  nwr(around:${radiusM},${lat},${lon})[amenity~"^(restaurant|cafe|fast_food|food_court|bar|pharmacy|library|cinema|hospital|clinic|toilets|place_of_worship|community_centre)$"][name];
  nwr(around:${radiusM},${lat},${lon})[leisure~"^(park|garden|sports_centre|playground|fitness_centre|swimming_pool)$"][name];
  nwr(around:${radiusM},${lat},${lon})[shop~"^(supermarket|mall|convenience|bakery|department_store)$"][name];
  nwr(around:${radiusM},${lat},${lon})[tourism~"^(museum|attraction|viewpoint)$"][name];
);
out center 60;`;
  const elements = await overpass(q);
  return elements
    .map((e) => {
      const p = elCoords(e);
      const t = e.tags;
      const open = t.opening_hours ? openNow(t.opening_hours) : undefined;
      return {
        name: t.name,
        type: t.amenity || t.leisure || t.shop || t.tourism || "place",
        distance_m: Math.round(haversine(lat, lon, p.lat, p.lon)),
        ...(t.cuisine ? { cuisine: t.cuisine } : {}),
        ...(t.opening_hours ? { opening_hours: t.opening_hours } : {}),
        ...(open !== undefined ? { open_now: open } : {}),
        ...(t.wheelchair ? { wheelchair: t.wheelchair } : {}),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 25);
}

export async function transitStops({ lat, lon }: Coords) {
  const q = `[out:json][timeout:8];
(
  nwr(around:500,${lat},${lon})[highway=bus_stop][name];
  nwr(around:900,${lat},${lon})[railway~"^(station|subway_entrance|tram_stop|halt)$"][name];
  nwr(around:900,${lat},${lon})[amenity=ferry_terminal][name];
  nwr(around:500,${lat},${lon})[amenity=taxi];
);
out center 80;`;
  const elements = await overpass(q);
  const seen = new Set<string>();
  const stops = elements
    .map((e) => {
      const p = elCoords(e);
      const t = e.tags;
      const type =
        t.highway === "bus_stop" ? "bus stop"
          : t.railway === "subway_entrance" ? "metro entrance"
            : t.railway === "tram_stop" ? "tram stop"
              : t.railway ? "rail station"
                : t.amenity === "ferry_terminal" ? "ferry pier"
                  : "taxi stand";
      return {
        name: t.name || type,
        type,
        distance_m: Math.round(haversine(lat, lon, p.lat, p.lon)),
        ...(t.route_ref || t.ref ? { routes: (t.route_ref || t.ref).split(";").slice(0, 12).join(", ") } : {}),
        ...(t.network ? { network: t.network } : {}),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m)
    .filter((s) => {
      const k = `${s.type}:${s.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 15);
  return stops.length ? stops : { note: "no mapped transit stops within ~900 m" };
}

// ---------------------------------------------------------------- routes

export async function routes(from: Coords, to: Coords & { name: string }) {
  const straight = haversine(from.lat, from.lon, to.lat, to.lon);
  const out: Record<string, unknown> = { destination: to.name, straight_line_m: Math.round(straight) };

  // OSRM's public demo only routes the car profile; walking and cycling are
  // estimated from the road distance plus the climb. Both lookups in parallel.
  let roadM = straight * 1.3;
  let climbM = 0;
  await Promise.all([
    getJson<{ routes: { distance: number; duration: number }[] }>(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`,
      8000,
    )
      .then((r) => {
        const best = r.routes?.[0];
        if (!best) throw new Error("no route");
        roadM = best.distance;
        out.drive = { distance_km: Math.round(best.distance / 100) / 10, minutes: Math.round(best.duration / 60), note: "free-flow, no traffic" };
      })
      .catch(() => {
        out.drive = "unavailable";
      }),
    getJson<{ elevation: number[] }>(
      `https://api.open-meteo.com/v1/elevation?latitude=${from.lat},${to.lat}&longitude=${from.lon},${to.lon}`,
    )
      .then((e) => {
        const [a, b] = e.elevation;
        climbM = Math.max(0, b - a);
        out.elevation = { here_m: Math.round(a), destination_m: Math.round(b), climb_m: Math.round(b - a) };
      })
      .catch(() => {}),
  ]);

  // Naismith: 12 min/km + 10 min per 100 m climb; bike ~15 km/h + climb penalty.
  const walkMin = (roadM / 1000) * 12 + (climbM / 100) * 10;
  const bikeMin = (roadM / 1000) * 4 + (climbM / 100) * 6;
  out.walk = { distance_km: Math.round(roadM / 100) / 10, minutes: Math.round(walkMin), hilly: climbM > 40 };
  out.bike = { minutes: Math.round(bikeMin) };
  return out;
}

// ---------------------------------------------------------------- calendar

export async function calendar(countryCode: string | undefined, now = new Date()) {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const weekday = day >= 1 && day <= 5;
  const rush = weekday && ((mins >= 450 && mins <= 570) || (mins >= 1050 && mins <= 1170));
  const out: Record<string, unknown> = {
    weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
    is_weekend: !weekday,
    rush_hour_now: rush,
    part_of_day: mins < 300 ? "night" : mins < 720 ? "morning" : mins < 1020 ? "afternoon" : mins < 1320 ? "evening" : "night",
  };
  if (!countryCode) return { ...out, public_holidays: "unknown country" };
  try {
    type H = { date: string; localName: string; name: string };
    const y = now.getFullYear();
    const list = await getJson<H[]>(`https://date.nager.at/api/v3/PublicHolidays/${y}/${countryCode}`);
    const today = now.toLocaleDateString("sv-SE");
    const hit = list.find((h) => h.date === today);
    const next = list.find((h) => h.date > today);
    out.public_holiday_today = hit ? hit.name : false;
    if (next) out.next_public_holiday = { date: next.date, name: next.name };
  } catch {
    out.public_holidays = `unavailable for ${countryCode}`;
  }
  return out;
}

// ---------------------------------------------------------------- web

export async function webSearch(question: string, context: { place?: string; localTime: string; lang: string }) {
  const { text, cost } = await chat(
    [
      {
        role: "system",
        content:
          "You gather current facts for a decision engine. Search the web and reply with at most 8 short bullet points of concrete, current facts relevant to the question (events, warnings, closures, transit disruptions, opening hours, prices, news). No advice, no preamble. Cite source domains in brackets.",
      },
      {
        role: "user",
        content: `Question: ${question}\nLocation: ${context.place ?? "unknown"}\nLocal time: ${context.localTime}`,
      },
    ],
    { webSearch: true, maxTokens: 1500, timeoutMs: 30_000 },
  );
  return { summary: text.trim(), cost };
}

// ---------------------------------------------------------------- helpers

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function moonPhase(d = new Date()) {
  const synodic = 29.530588853;
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  const age = ((days % synodic) + synodic) % synodic;
  const names = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"];
  const idx = Math.round((age / synodic) * 8) % 8;
  return names[idx];
}

// Best-effort "open now" for the common OSM opening_hours shapes:
//   "24/7", "Mo-Fr 09:00-18:00; Sa 10:00-14:00", "Mo,We,Fr 08:00-12:00,13:00-17:00".
// Anything fancier returns undefined so the raw string still reaches the model.
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export function openNow(spec: string, now = new Date()): boolean | undefined {
  const s = spec.trim();
  if (s === "24/7") return true;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  // Every rule must parse; a day no rule mentions counts as closed.
  let verdict: boolean | undefined = false;
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2},?\s*)+|off|closed)$/);
    if (!m) return undefined;
    const dayPart = m[1];
    let applies = true;
    if (dayPart) {
      applies = false;
      for (const tok of dayPart.split(",").filter(Boolean)) {
        if (tok === "PH") continue;
        const [a, b] = tok.split("-");
        const ia = DAYS.indexOf(a);
        const ib = b ? DAYS.indexOf(b) : ia;
        if (ia < 0 || ib < 0) return undefined;
        const inRange = ia <= ib ? day >= ia && day <= ib : day >= ia || day <= ib;
        if (inRange) applies = true;
      }
    }
    if (!applies) continue;
    if (m[2] === "off" || m[2] === "closed") {
      verdict = false;
      continue;
    }
    let open = false;
    for (const range of m[2].split(",").map((r) => r.trim()).filter(Boolean)) {
      const [from, to] = range.split("-").map((t) => t.trim());
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      const f = fh * 60 + fm;
      const t = th * 60 + tm;
      if (t <= f ? mins >= f || mins < t : mins >= f && mins < t) open = true;
    }
    verdict = open;
  }
  return verdict;
}
