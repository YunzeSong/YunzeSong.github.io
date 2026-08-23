import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  allowedOrigin,
  applyDebugOverrides,
  buildSceneContext,
  classifyWeather,
  computeSeason,
  roundCoordinate
} from "../src/index.js";

const DAY = 24 * 60 * 60 * 1000;

function sampleWeather(overrides = {}) {
  return {
    utc_offset_seconds: 8 * 60 * 60,
    current: {
      time: 1787415300,
      temperature_2m: 26.4,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
      weather_code: 1,
      cloud_cover: 38,
      wind_speed_10m: 1.82,
      wind_direction_10m: 164,
      is_day: 0,
      visibility: 24000,
      ...overrides
    },
    daily: {
      sunrise: [1787434428],
      sunset: [1787482841]
    }
  };
}

test("coordinates are rounded to a quarter degree", () => {
  assert.equal(roundCoordinate(39.9042), 40);
  assert.equal(roundCoordinate(116.4074), 116.5);
  assert.equal(roundCoordinate(-33.8688), -33.75);
});

test("CORS accepts only production and local development origins", () => {
  assert.equal(allowedOrigin("https://yunzesong.com"), "https://yunzesong.com");
  assert.equal(allowedOrigin("https://yunzesong.github.io"), "https://yunzesong.github.io");
  assert.equal(allowedOrigin("http://127.0.0.1:4173"), "http://127.0.0.1:4173");
  assert.equal(allowedOrigin("https://example.com"), false);
});

test("season mapping supports hemispheres, tropics, and fourteen-day blends", () => {
  const june15 = Date.UTC(2026, 5, 15);
  assert.deepEqual(computeSeason(june15, 40, 0), { from: "summer", to: "summer", mix: 0 });
  assert.deepEqual(computeSeason(june15, -34, 0), { from: "winter", to: "winter", mix: 0 });
  assert.deepEqual(computeSeason(june15, 1.3, 0), { from: "summer", to: "summer", mix: 0 });

  const boundary = computeSeason(Date.UTC(2026, 5, 1), 40, 0);
  assert.equal(boundary.from, "spring");
  assert.equal(boundary.to, "summer");
  assert.equal(boundary.mix, .5);
  assert.equal(computeSeason(Date.UTC(2026, 4, 25), 40, 0).mix, 0);
  assert.equal(computeSeason(Date.UTC(2026, 5, 8) - 1, 40, 0).mix > .99, true);
});

test("weather codes map to the six retained visual states", () => {
  assert.equal(classifyWeather({ weather_code: 0 }).kind, "clear");
  assert.equal(classifyWeather({ weather_code: 2, cloud_cover: 70 }).kind, "cloudy");
  assert.equal(classifyWeather({ weather_code: 45, visibility: 1000 }).kind, "cloudy");
  assert.equal(classifyWeather({ weather_code: 63, rain: 2 }).kind, "rain");
  assert.equal(classifyWeather({ weather_code: 73, snowfall: 1 }).kind, "snow");
  assert.equal(classifyWeather({ weather_code: 96, precipitation: 4 }).kind, "storm");
  assert.equal(classifyWeather({ weather_code: 0, wind_speed_10m: 15 }).kind, "wind");
});

test("scene response contains no visitor location fields", () => {
  const context = buildSceneContext(sampleWeather(), 40, Date.UTC(2026, 7, 23));
  assert.equal(context.version, 1);
  assert.equal(context.solar.mode, "normal");
  assert.equal(context.solar.solarNoon, Math.round((1787434428 + 1787482841) * 500));
  assert.equal("latitude" in context, false);
  assert.equal("longitude" in context, false);
  assert.equal("city" in context, false);
  assert.equal("ip" in context, false);
  assert.equal(JSON.stringify(context).includes("Asia/Shanghai"), false);
});

test("debug overrides do not alter the response schema", () => {
  const context = buildSceneContext(sampleWeather(), 40, Date.now());
  const parameters = new URLSearchParams("season=winter&weather=storm&time=18:30&wind=20&temperature=-8&intensity=.9");
  const debug = applyDebugOverrides(context, parameters);
  assert.deepEqual(debug.season, { from: "winter", to: "winter", mix: 0 });
  assert.equal(debug.weather.kind, "storm");
  assert.equal(debug.weather.lightning, true);
  assert.equal(debug.weather.windSpeed, 20);
  assert.equal(debug.weather.temperatureC, -8);
  assert.equal(debug.weather.intensity, .9);
  assert.equal(debug.observedAt, debug.solar.solarNoon + 6.5 * 60 * 60 * 1000);
});

test("HTTP handler rejects unknown origins before fetching weather", async () => {
  const request = new Request("https://worker.test/v1/scene-context", {
    headers: { Origin: "https://example.com" }
  });
  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
});

test("normal solar dates remain ordered", () => {
  const context = buildSceneContext(sampleWeather(), 40, Date.now() + DAY);
  assert.ok(context.solar.sunrise < context.solar.solarNoon);
  assert.ok(context.solar.solarNoon < context.solar.sunset);
});
