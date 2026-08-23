const API_VERSION = 1;
const EDGE_CACHE_SECONDS = 600;
const BROWSER_CACHE_MILLISECONDS = 15 * 60 * 1000;
const DEFAULT_LOCATION = Object.freeze({ latitude: 39.9042, longitude: 116.4074 });
const WEATHER_KINDS = new Set(["clear", "cloudy", "rain", "snow", "storm", "wind"]);
const SEASONS = new Set(["spring", "summer", "autumn", "winter"]);
const ALLOWED_ORIGINS = new Set([
  "https://yunzesong.com",
  "https://www.yunzesong.com",
  "https://yunzesong.github.io"
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function roundCoordinate(value) {
  return Math.round(finiteNumber(value) * 4) / 4;
}

export function allowedOrigin(origin) {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return false;
}

function responseHeaders(origin, cacheControl = "private, max-age=900, stale-if-error=86400") {
  const headers = new Headers({
    "Cache-Control": cacheControl,
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex"
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function jsonResponse(body, status, origin, cacheControl) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, cacheControl)
  });
}

function seasonTargets(latitude) {
  const southern = latitude < -23.5;
  return [
    { month: 2, day: 1, target: southern ? "autumn" : "spring" },
    { month: 5, day: 1, target: southern ? "winter" : "summer" },
    { month: 8, day: 1, target: southern ? "spring" : "autumn" },
    { month: 11, day: 1, target: southern ? "summer" : "winter" }
  ];
}

export function computeSeason(observedAt, latitude, utcOffsetSeconds = 0) {
  if (Math.abs(latitude) < 23.5) return { from: "summer", to: "summer", mix: 0 };

  const localTime = observedAt + utcOffsetSeconds * 1000;
  const localYear = new Date(localTime).getUTCFullYear();
  const targets = seasonTargets(latitude);
  const boundaries = [];

  for (let year = localYear - 1; year <= localYear + 1; year += 1) {
    targets.forEach((boundary) => {
      boundaries.push({
        at: Date.UTC(year, boundary.month, boundary.day),
        target: boundary.target
      });
    });
  }
  boundaries.sort((left, right) => left.at - right.at);

  const transitionHalf = 7 * 24 * 60 * 60 * 1000;
  const nearestIndex = boundaries.reduce((bestIndex, boundary, index) => {
    const bestDistance = Math.abs(boundaries[bestIndex].at - localTime);
    return Math.abs(boundary.at - localTime) < bestDistance ? index : bestIndex;
  }, 0);
  const nearest = boundaries[nearestIndex];

  if (Math.abs(localTime - nearest.at) <= transitionHalf) {
    const previous = boundaries[Math.max(0, nearestIndex - 1)].target;
    return {
      from: previous,
      to: nearest.target,
      mix: Number(clamp((localTime - nearest.at + transitionHalf) / (transitionHalf * 2), 0, 1).toFixed(4))
    };
  }

  let current = boundaries[0].target;
  boundaries.forEach((boundary) => {
    if (boundary.at <= localTime) current = boundary.target;
  });
  return { from: current, to: current, mix: 0 };
}

export function classifyWeather(current = {}) {
  const code = Math.round(finiteNumber(current.weather_code));
  const temperatureC = finiteNumber(current.temperature_2m, 18);
  const precipitation = Math.max(0, finiteNumber(current.precipitation));
  const rain = Math.max(0, finiteNumber(current.rain));
  const snow = Math.max(0, finiteNumber(current.snowfall));
  const cloudCover = clamp(finiteNumber(current.cloud_cover) / 100, 0, 1);
  const windSpeed = Math.max(0, finiteNumber(current.wind_speed_10m));
  const windDirection = ((finiteNumber(current.wind_direction_10m) % 360) + 360) % 360;
  const visibility = Math.max(0, finiteNumber(current.visibility, 24000));
  const thunder = code >= 95;
  const snowCode = code >= 71 && code <= 77 || code >= 85 && code <= 86;
  const rainCode = code >= 51 && code <= 67 || code >= 80 && code <= 82;
  const fogCode = code === 45 || code === 48;

  let kind = "clear";
  let intensity = clamp(cloudCover * .26, .08, .34);
  if (thunder) {
    kind = "storm";
    intensity = clamp(.64 + precipitation / 7 + windSpeed / 55, .68, 1);
  } else if (snowCode || snow > 0) {
    kind = "snow";
    intensity = clamp(.3 + snow / 2.4 + precipitation / 8, .32, 1);
  } else if (rainCode || rain > 0 || precipitation > 0) {
    kind = "rain";
    intensity = clamp(.26 + rain / 3.5 + precipitation / 7, .28, 1);
  } else if (windSpeed >= 12) {
    kind = "wind";
    intensity = clamp(windSpeed / 22, .48, 1);
  } else if (code >= 1 && code <= 3 || fogCode || cloudCover >= .38) {
    kind = "cloudy";
    const visibilityPenalty = fogCode ? clamp(1 - visibility / 10000, .35, .9) : 0;
    intensity = clamp(Math.max(cloudCover, visibilityPenalty), .35, 1);
  }

  return {
    kind,
    intensity: Number(intensity.toFixed(4)),
    temperatureC: Number(temperatureC.toFixed(1)),
    cloudCover: Number(cloudCover.toFixed(4)),
    rain: Number(rain.toFixed(3)),
    snow: Number(snow.toFixed(3)),
    fog: 0,
    windSpeed: Number(windSpeed.toFixed(2)),
    windDirection: Number(windDirection.toFixed(1)),
    lightning: thunder
  };
}

export function buildSceneContext(data, latitude, generatedAt = Date.now()) {
  const current = data?.current || {};
  const daily = data?.daily || {};
  const utcOffsetSeconds = finiteNumber(data?.utc_offset_seconds);
  const observedAt = finiteNumber(current.time, Math.floor(generatedAt / 1000)) * 1000;
  const sunrise = finiteNumber(daily.sunrise?.[0]) * 1000;
  const sunset = finiteNumber(daily.sunset?.[0]) * 1000;
  const hasNormalSolarDay = sunrise > 0 && sunset > sunrise;
  const solarMode = hasNormalSolarDay ? "normal" : finiteNumber(current.is_day) === 1 ? "polar-day" : "polar-night";

  return {
    version: API_VERSION,
    observedAt,
    expiresAt: generatedAt + BROWSER_CACHE_MILLISECONDS,
    season: computeSeason(observedAt, latitude, utcOffsetSeconds),
    solar: {
      mode: solarMode,
      sunrise: hasNormalSolarDay ? sunrise : 0,
      solarNoon: hasNormalSolarDay ? Math.round((sunrise + sunset) / 2) : 0,
      sunset: hasNormalSolarDay ? sunset : 0
    },
    weather: classifyWeather(current)
  };
}

function parseDebugTime(value) {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
  }
  const numericHour = Number(value);
  if (Number.isFinite(numericHour) && numericHour >= 0 && numericHour < 24) return Math.round(numericHour * 60);
  return null;
}

export function applyDebugOverrides(context, searchParams) {
  const result = structuredClone(context);
  const forcedSeason = searchParams.get("season");
  const forcedWeather = searchParams.get("weather");
  const forcedTime = parseDebugTime(searchParams.get("time"));

  if (SEASONS.has(forcedSeason)) result.season = { from: forcedSeason, to: forcedSeason, mix: 0 };
  if (WEATHER_KINDS.has(forcedWeather)) {
    result.weather.kind = forcedWeather;
    result.weather.lightning = forcedWeather === "storm" && searchParams.get("lightning") !== "0";
  }
  if (forcedTime !== null && result.solar.solarNoon > 0) {
    result.observedAt = result.solar.solarNoon + (forcedTime - 12 * 60) * 60 * 1000;
  }

  const numericOverrides = [
    ["intensity", "intensity", 0, 1],
    ["temperature", "temperatureC", -50, 60],
    ["wind", "windSpeed", 0, 60]
  ];
  numericOverrides.forEach(([parameter, property, minimum, maximum]) => {
    if (!searchParams.has(parameter)) return;
    const value = Number(searchParams.get(parameter));
    if (Number.isFinite(value)) result.weather[property] = clamp(value, minimum, maximum);
  });
  return result;
}

function weatherRequestUrl(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(2));
  url.searchParams.set("longitude", longitude.toFixed(2));
  url.searchParams.set("current", [
    "temperature_2m", "precipitation", "rain", "snowfall", "weather_code",
    "cloud_cover", "wind_speed_10m", "wind_direction_10m", "is_day", "visibility"
  ].join(","));
  url.searchParams.set("daily", "sunrise,sunset,daylight_duration");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");
  return url;
}

async function fetchSceneContext(latitude, longitude) {
  const response = await fetch(weatherRequestUrl(latitude, longitude), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return buildSceneContext(await response.json(), latitude);
}

async function readCachedContext(cache, cacheKey) {
  if (!cache) return null;
  try {
    const response = await cache.match(cacheKey);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const origin = allowedOrigin(requestOrigin);

    if (origin === false) return jsonResponse({ error: "Origin not allowed" }, 403, null, "no-store");
    if (url.pathname !== "/v1/scene-context") return jsonResponse({ error: "Not found" }, 404, origin, "no-store");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin, "no-store") });
    if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405, origin, "no-store");

    const cf = request.cf || {};
    const latitude = roundCoordinate(Number.isFinite(Number(cf.latitude)) ? cf.latitude : DEFAULT_LOCATION.latitude);
    const longitude = roundCoordinate(Number.isFinite(Number(cf.longitude)) ? cf.longitude : DEFAULT_LOCATION.longitude);
    const cacheKey = new Request(`https://scene-context-cache.invalid/v1/${latitude}/${longitude}`);
    const cache = globalThis.caches?.default;
    let context = await readCachedContext(cache, cacheKey);

    if (!context) {
      try {
        context = await fetchSceneContext(latitude, longitude);
        if (cache) {
          const cachedResponse = jsonResponse(context, 200, null, `public, max-age=${EDGE_CACHE_SECONDS}`);
          ctx?.waitUntil?.(cache.put(cacheKey, cachedResponse));
        }
      } catch {
        return jsonResponse({ error: "Scene context temporarily unavailable" }, 502, origin, "no-store");
      }
    }

    return jsonResponse(applyDebugOverrides(context, url.searchParams), 200, origin);
  }
};
