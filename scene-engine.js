(() => {
  "use strict";

  const lab = document.querySelector("[data-scene-lab], [data-home-scene]");
  const surface = lab?.querySelector("[data-scene-surface]");
  const world = lab?.querySelector("[data-scene-world]");
  const sceneImage = lab?.querySelector("[data-scene-image]");
  const canvas = lab?.querySelector("[data-scene-canvas]");
  const statusLabel = lab?.querySelector("[data-scene-status]");
  const context = canvas?.getContext("2d", { alpha: true, desynchronized: true });

  if (!lab || !surface || !world || !sceneImage || !canvas || !context) return;
  const isHomeScene = lab.hasAttribute("data-home-scene");
  if (isHomeScene && surface.dataset.motionScene !== "beijing") return;
  const seasonBlendImage = document.createElement("img");
  seasonBlendImage.className = "scene-season-blend";
  seasonBlendImage.alt = "";
  seasonBlendImage.width = 1672;
  seasonBlendImage.height = 941;
  seasonBlendImage.decoding = "async";
  seasonBlendImage.setAttribute("aria-hidden", "true");
  canvas.before(seasonBlendImage);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const parameters = new URLSearchParams(window.location.search);
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const numberParameter = (name, fallback, minimum, maximum) => {
    const value = Number.parseFloat(parameters.get(name));
    return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
  };

  const beijingMonth = Number.parseInt(new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    timeZone: "Asia/Shanghai"
  }).format(new Date()), 10) || new Date().getMonth() + 1;
  const defaultSeason = beijingMonth >= 3 && beijingMonth <= 5 ? "spring"
    : beijingMonth >= 6 && beijingMonth <= 8 ? "summer"
      : beijingMonth >= 9 && beijingMonth <= 11 ? "autumn"
        : "winter";
  const weatherKinds = ["clear", "cloudy", "rain", "snow", "storm", "wind"];
  const seasons = ["spring", "summer", "autumn", "winter"];
  const hasWeatherOverride = weatherKinds.includes(parameters.get("weather"));
  const hasSeasonOverride = seasons.includes(parameters.get("season"));
  const weatherKind = hasWeatherOverride ? parameters.get("weather") : "clear";
  const season = hasSeasonOverride ? parameters.get("season") : isHomeScene ? defaultSeason : "summer";
  const temperatureC = numberParameter("temperature", weatherKind === "snow" ? -4 : 18, -35, 50);
  const naturalFreeze = season === "winter" ? clamp((-2 - temperatureC) / 12, 0, 1) : 0;
  const defaultWind = weatherKind === "wind" ? 1.7 : weatherKind === "storm" ? 1.25 : .75;

  const settings = {
    birds: parameters.get("birds") !== "0",
    clouds: parameters.get("clouds") !== "0",
    ripples: parameters.get("ripples") !== "0",
    freeze: numberParameter("freeze", naturalFreeze, 0, 1),
    intensity: numberParameter("intensity", .65, 0, 1),
    lightning: parameters.get("lightning") !== "0" && weatherKind === "storm",
    season,
    seasonFrom: season,
    seasonMix: 0,
    seasonTo: season,
    solar: null,
    temperatureC,
    weather: weatherKind,
    wind: numberParameter("wind", defaultWind, -2, 2)
  };

  const weatherProfiles = {
    clear:  { clouds: 2, cloudAlpha: .76, tint: [246, 219, 171, .018], haze: 0, rain: 0, snow: 0, windStreaks: 0 },
    cloudy: { clouds: 6, cloudAlpha: 1.15, tint: [45, 64, 76, .13], haze: .08, rain: 0, snow: 0, windStreaks: 0 },
    rain:   { clouds: 7, cloudAlpha: 1.2, tint: [35, 57, 72, .16], haze: .08, rain: 1, snow: 0, windStreaks: 0 },
    snow:   { clouds: 5, cloudAlpha: 1.04, tint: [202, 219, 227, .08], haze: .1, rain: 0, snow: 1, windStreaks: 0 },
    storm:  { clouds: 7, cloudAlpha: 1.34, tint: [20, 36, 52, .29], haze: .15, rain: 1.45, snow: 0, windStreaks: .35 },
    wind:   { clouds: 5, cloudAlpha: .9, tint: [91, 105, 100, .055], haze: .02, rain: 0, snow: 0, windStreaks: 1 }
  };
  let weather = weatherProfiles[settings.weather];

  const weatherLabels = {
    clear: "CLEAR / 晴",
    cloudy: "CLOUDY / 云",
    rain: "RAIN / 雨",
    snow: "SNOW / 雪",
    storm: "STORM / 雷暴",
    wind: "WIND / 大风"
  };
  const seasonLabels = {
    spring: "SPRING",
    summer: "SUMMER",
    autumn: "AUTUMN",
    winter: "WINTER"
  };
  const seasonImages = {
    spring: "./assets/scenes/beijing/spring.webp",
    summer: "./assets/scenes/beijing/summer.webp",
    autumn: "./assets/scenes/beijing/autumn.webp",
    winter: "./assets/scenes/beijing/winter.webp"
  };
  const motionAssetSources = {
    clouds: "./assets/scenes/beijing/motion/clouds-atlas-v1.png",
    magpie: "./assets/scenes/beijing/motion/magpie-atlas-v1.png",
    rippleClick: "./assets/scenes/beijing/motion/ripples-click-atlas-v1.png",
    rippleTrail: "./assets/scenes/beijing/motion/ripples-trail-atlas-v1.png"
  };
  const motionAssets = {};
  const cloudTintCache = new Map();
  let loadedMotionAssets = 0;

  Object.entries(motionAssetSources).forEach(([name, source]) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      loadedMotionAssets += 1;
      if (name === "clouds") cloudTintCache.clear();
      draw();
    });
    image.src = source;
    motionAssets[name] = image;
  });

  const contextCacheKey = "yunzesong.scene-context.v1";
  const forcedTimeMinutes = (() => {
    const value = parameters.get("time");
    if (!value) return null;
    if (/^\d{1,2}:\d{2}$/.test(value)) {
      const [hour, minute] = value.split(":").map(Number);
      return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
    }
    const numericHour = Number(value);
    return Number.isFinite(numericHour) && numericHour >= 0 && numericHour < 24 ? Math.round(numericHour * 60) : null;
  })();

  function beijingDayStart(timestamp = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: "Asia/Shanghai",
      year: "numeric"
    }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day) - 8 * 60 * 60 * 1000;
  }

  function fallbackContext() {
    const now = Date.now();
    const dayStart = beijingDayStart(now);
    return {
      version: 1,
      observedAt: now,
      expiresAt: now + 15 * 60 * 1000,
      season: { from: season, to: season, mix: 0 },
      solar: {
        mode: "normal",
        sunrise: dayStart + 6 * 60 * 60 * 1000,
        solarNoon: dayStart + 12 * 60 * 60 * 1000,
        sunset: dayStart + 18 * 60 * 60 * 1000
      },
      weather: {
        kind: weatherKind,
        intensity: settings.intensity,
        temperatureC: settings.temperatureC,
        cloudCover: weatherKind === "clear" ? .18 : .65,
        rain: 0,
        snow: 0,
        fog: 0,
        windSpeed: 3,
        windDirection: 270,
        lightning: settings.lightning
      }
    };
  }

  let sceneContextSource = isHomeScene ? "beijing-fallback" : "lab";
  let activeContext = fallbackContext();
  let solarVisual = { alpha: 0, color: [255, 245, 220], isDay: true, label: "noon", night: 0 };
  let lastSolarMinute = Number.NaN;

  function setSeasonLayers(from, to = from, mix = 0) {
    const safeFrom = seasons.includes(from) ? from : defaultSeason;
    const safeTo = seasons.includes(to) ? to : safeFrom;
    const safeMix = safeFrom === safeTo ? 0 : clamp(Number(mix) || 0, 0, 1);
    settings.seasonFrom = safeFrom;
    settings.seasonTo = safeTo;
    settings.seasonMix = safeMix;
    settings.season = safeMix >= .5 ? safeTo : safeFrom;
    settings.winterMix = (safeFrom === "winter" ? 1 - safeMix : 0) + (safeTo === "winter" ? safeMix : 0);

    if (sceneImage.getAttribute("src") !== seasonImages[safeFrom]) {
      sceneImage.src = seasonImages[safeFrom];
    }
    if (safeMix > .001) {
      if (seasonBlendImage.getAttribute("src") !== seasonImages[safeTo]) {
        seasonBlendImage.src = seasonImages[safeTo];
      }
      seasonBlendImage.style.opacity = String(safeMix);
    } else {
      seasonBlendImage.style.opacity = "0";
      seasonBlendImage.removeAttribute("src");
    }
  }

  lab.dataset.weather = settings.weather;
  settings.solar = activeContext.solar;
  setSeasonLayers(settings.season);
  if (statusLabel) {
    statusLabel.textContent = `WEATHER PREVIEW · ${seasonLabels[settings.season]} / NOON / ${weatherLabels[settings.weather]}`;
  }
  lab.querySelectorAll("[data-weather-link]").forEach((link) => {
    if (link.dataset.weatherLink === settings.weather) link.setAttribute("aria-current", "page");
  });

  const pointer = {
    active: false,
    down: false,
    normalizedX: -1,
    normalizedY: -1,
    lastTrailX: -1,
    lastTrailY: -1,
    lastTrailAt: 0
  };

  const ripples = [];
  const weatherParticles = [];
  let magpie = null;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let sceneVisible = true;
  let pageVisible = document.visibilityState !== "hidden";
  let elapsed = 0;
  let lastTimestamp = performance.now();
  let lastDraw = 0;
  let renderedFrames = 0;
  let animationFrame = 0;
  let startleStartedAt = -10;
  let nextBirdAt = Number.POSITIVE_INFINITY;
  let lightningStartedAt = -10;
  let nextLightningAt = settings.lightning ? 2.2 : Number.POSITIVE_INFINITY;

  function randomFactory(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = randomFactory(20260822);

  const solarLooks = {
    deepNight:  { color: [7, 18, 39], alpha: .56, isDay: false, label: "deep-night", night: 1 },
    preDawn:    { color: [38, 58, 83], alpha: .38, isDay: false, label: "pre-dawn", night: .72 },
    sunrise:    { color: [220, 128, 82], alpha: .22, isDay: true, label: "sunrise", night: .22 },
    morning:    { color: [245, 205, 150], alpha: .06, isDay: true, label: "morning", night: 0 },
    noon:       { color: [255, 245, 220], alpha: 0, isDay: true, label: "noon", night: 0 },
    afternoon:  { color: [233, 178, 105], alpha: .08, isDay: true, label: "afternoon", night: 0 },
    sunset:     { color: [185, 84, 73], alpha: .28, isDay: true, label: "sunset", night: .18 },
    earlyNight: { color: [26, 40, 68], alpha: .46, isDay: false, label: "early-night", night: .78 }
  };

  function sceneTimestamp() {
    if (forcedTimeMinutes !== null && settings.solar?.solarNoon) {
      return settings.solar.solarNoon + (forcedTimeMinutes - 12 * 60) * 60 * 1000;
    }
    if (!isHomeScene && settings.solar?.solarNoon) return settings.solar.solarNoon;
    return Date.now();
  }

  function interpolateLook(left, right, mix) {
    return {
      color: left.color.map((value, index) => Math.round(value + (right.color[index] - value) * mix)),
      alpha: left.alpha + (right.alpha - left.alpha) * mix,
      isDay: mix < .5 ? left.isDay : right.isDay,
      label: mix < .5 ? left.label : right.label,
      night: left.night + (right.night - left.night) * mix
    };
  }

  function calculateSolarVisual(timestamp) {
    const solar = settings.solar;
    if (!solar || solar.mode === "polar-day") return { ...solarLooks.noon, label: "polar-day" };
    if (solar.mode === "polar-night") return { ...solarLooks.deepNight, label: "polar-night" };
    if (!(solar.sunrise > 0 && solar.solarNoon > solar.sunrise && solar.sunset > solar.solarNoon)) return solarLooks.noon;

    const day = 24 * 60 * 60 * 1000;
    let sunrise = solar.sunrise;
    let solarNoon = solar.solarNoon;
    let sunset = solar.sunset;
    while (timestamp < solarNoon - day / 2) {
      sunrise -= day;
      solarNoon -= day;
      sunset -= day;
    }
    while (timestamp >= solarNoon + day / 2) {
      sunrise += day;
      solarNoon += day;
      sunset += day;
    }

    const dayStart = solarNoon - day / 2;
    const anchors = [
      [dayStart, solarLooks.deepNight],
      [sunrise - 60 * 60 * 1000, solarLooks.preDawn],
      [sunrise, solarLooks.sunrise],
      [(sunrise + solarNoon) / 2, solarLooks.morning],
      [solarNoon, solarLooks.noon],
      [(solarNoon + sunset) / 2, solarLooks.afternoon],
      [sunset, solarLooks.sunset],
      [sunset + 75 * 60 * 1000, solarLooks.earlyNight],
      [dayStart + day, solarLooks.deepNight]
    ];

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const [start, left] = anchors[index];
      const [end, right] = anchors[index + 1];
      if (timestamp < start || timestamp > end) continue;
      return interpolateLook(left, right, clamp((timestamp - start) / Math.max(1, end - start), 0, 1));
    }
    return solarLooks.deepNight;
  }

  const cloudFrames = [
    { x: 40, y: 40, width: 112, height: 15 },
    { x: 235, y: 40, width: 106, height: 19 },
    { x: 422, y: 40, width: 116, height: 19 },
    { x: 7, y: 97, width: 178, height: 68 },
    { x: 195, y: 97, width: 186, height: 60 }
  ];

  const clouds = [
    { x: .435, y: .065, scale: .72, speed: .0018, sprite: 0, alpha: .58 },
    { x: .797, y: .121, scale: .75, speed: .0021, sprite: 2, alpha: .52 },
    { x: .315, y: .005, scale: .72, speed: .0038, sprite: 3, alpha: .72 },
    { x: .566, y: .016, scale: .96, speed: .0034, sprite: 4, alpha: .79 },
    { x: .665, y: .164, scale: .76, speed: .0024, sprite: 1, alpha: .6 },
    { x: .855, y: .177, scale: .78, speed: .002, sprite: 0, alpha: .63 },
    { x: .463, y: .1, scale: .66, speed: .0027, sprite: 2, alpha: .55 }
  ];

  const magpieAtlas = { columns: 4, frameWidth: 40, frameHeight: 28, frames: 12 };

  function scheduleMagpie(firstFlight = false) {
    magpie = null;
    nextBirdAt = elapsed + (firstFlight ? 4 + random() * 8 : 35 + random() * 55);
  }

  function startMagpieFlight() {
    if (!birdsCanFly()) return false;
    const direction = random() >= .5 ? 1 : -1;
    const startY = .13 + random() * .1;
    const endY = .12 + random() * .11;
    const controlY1 = clamp(startY + (random() - .5) * .09, .08, .3);
    const controlY2 = clamp(endY + (random() - .5) * .08, .08, .3);
    magpie = {
      active: true,
      avoidY: 0,
      controlX1: direction > 0 ? .23 : .77,
      controlX2: direction > 0 ? .72 : .28,
      controlY1,
      controlY2,
      direction,
      duration: 13 + random() * 4,
      endX: direction > 0 ? 1.09 : -.09,
      endY,
      frameClock: random() * 8,
      progress: 0,
      scared: false,
      startX: direction > 0 ? -.09 : 1.09,
      startY,
      x: direction > 0 ? -.09 : 1.09,
      y: startY
    };
    return true;
  }

  function birdsCanFly() {
    if (!settings.birds || reducedMotion.matches) return false;
    if (!solarVisual.isDay) return false;
    if (settings.weather === "storm") return false;
    if (settings.weather === "rain" && settings.intensity >= .76) return false;
    if (settings.weather === "snow" && settings.intensity >= .62) return false;
    return true;
  }

  function createWeatherParticles() {
    weatherParticles.length = 0;
    let count = 0;
    if (weather.rain) count = Math.round((54 + settings.intensity * 76) * weather.rain);
    if (weather.snow) count = Math.round(38 + settings.intensity * 54);
    if (weather.windStreaks && !weather.rain) count = Math.round(18 + settings.intensity * 28);

    for (let index = 0; index < count; index += 1) {
      weatherParticles.push({
        x: random() * 1.18 - .09,
        y: random() * 1.2 - .1,
        depth: .55 + random() * .8,
        drift: (random() - .5) * .018,
        length: 2 + random() * 5,
        phase: random() * Math.PI * 2,
        size: random() > .78 ? 2 : 1,
        speed: weather.snow ? .035 + random() * .075 : weather.rain ? .62 + random() * .72 : .08 + random() * .12
      });
    }
  }

  function isValidSceneContext(value) {
    return Boolean(
      value && value.version === 1
      && value.season && seasons.includes(value.season.from) && seasons.includes(value.season.to)
      && Number.isFinite(Number(value.season.mix))
      && value.solar && ["normal", "polar-day", "polar-night"].includes(value.solar.mode)
      && value.weather && weatherKinds.includes(value.weather.kind)
      && Number.isFinite(Number(value.expiresAt))
    );
  }

  function derivedWind(weatherContext) {
    const speed = clamp(Number(weatherContext.windSpeed) || 0, 0, 40);
    const direction = ((Number(weatherContext.windDirection) || 0) * Math.PI) / 180;
    const horizontal = -Math.sin(direction);
    const magnitude = clamp(speed / 6, .08, 2);
    const component = Math.abs(horizontal) < .08 ? .08 : horizontal;
    return clamp(component * magnitude, -2, 2);
  }

  function applySceneContext(value, source) {
    if (!isValidSceneContext(value)) return false;
    activeContext = value;
    sceneContextSource = source;
    settings.solar = value.solar;

    const selectedSeason = hasSeasonOverride
      ? { from: season, to: season, mix: 0 }
      : value.season;
    setSeasonLayers(selectedSeason.from, selectedSeason.to, selectedSeason.mix);

    const selectedWeather = hasWeatherOverride ? weatherKind : value.weather.kind;
    settings.weather = weatherKinds.includes(selectedWeather) ? selectedWeather : "clear";
    settings.intensity = numberParameter("intensity", clamp(Number(value.weather.intensity) || .5, 0, 1), 0, 1);
    settings.temperatureC = numberParameter("temperature", clamp(Number(value.weather.temperatureC) || 18, -35, 50), -35, 50);
    settings.wind = parameters.has("wind")
      ? numberParameter("wind", .75, -2, 2)
      : derivedWind(value.weather);
    settings.lightning = settings.weather === "storm"
      && parameters.get("lightning") !== "0"
      && (hasWeatherOverride || Boolean(value.weather.lightning));
    const freezeFromTemperature = clamp((-2 - settings.temperatureC) / 12, 0, 1);
    settings.freeze = numberParameter("freeze", (settings.winterMix || 0) * freezeFromTemperature, 0, 1);
    weather = weatherProfiles[settings.weather];
    lab.dataset.weather = settings.weather;
    nextLightningAt = settings.lightning ? elapsed + 2.2 : Number.POSITIVE_INFINITY;
    lastSolarMinute = Number.NaN;
    solarVisual = calculateSolarVisual(sceneTimestamp());
    createWeatherParticles();

    if (statusLabel) {
      const seasonText = settings.seasonMix > .001
        ? `${seasonLabels[settings.seasonFrom]}→${seasonLabels[settings.seasonTo]}`
        : seasonLabels[settings.season];
      statusLabel.textContent = `WEATHER PREVIEW · ${seasonText} / ${solarVisual.label.toUpperCase()} / ${weatherLabels[settings.weather]}`;
    }
    draw();
    return true;
  }

  function cachedSceneContext() {
    try {
      const value = JSON.parse(window.localStorage.getItem(contextCacheKey));
      return isValidSceneContext(value) ? value : null;
    } catch {
      return null;
    }
  }

  function storeSceneContext(value) {
    try {
      window.localStorage.setItem(contextCacheKey, JSON.stringify(value));
    } catch {
      // Storage can be disabled; the in-memory context still works.
    }
  }

  let contextRefreshTimer = 0;
  async function requestSceneContext(staleContext = null) {
    const endpoint = window.siteLocation?.siteConfig?.sceneContextEndpoint;
    if (!endpoint) {
      if (staleContext) applySceneContext(staleContext, "stale-cache");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        mode: "cors",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Scene context returned ${response.status}`);
      const value = await response.json();
      if (!applySceneContext(value, "live")) throw new Error("Invalid scene context");
      storeSceneContext(value);
      scheduleContextRefresh(value.expiresAt);
    } catch {
      if (staleContext) applySceneContext(staleContext, "stale-cache");
      window.clearTimeout(contextRefreshTimer);
      contextRefreshTimer = window.setTimeout(() => requestSceneContext(staleContext), 5 * 60 * 1000);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function scheduleContextRefresh(expiresAt) {
    window.clearTimeout(contextRefreshTimer);
    const delay = clamp(Number(expiresAt) - Date.now() + 1000, 1000, 15 * 60 * 1000);
    contextRefreshTimer = window.setTimeout(() => requestSceneContext(activeContext), delay);
  }

  function loadSceneContext() {
    if (!isHomeScene) return;
    const cached = cachedSceneContext();
    if (cached && Number(cached.expiresAt) > Date.now()) {
      applySceneContext(cached, "cache");
      scheduleContextRefresh(cached.expiresAt);
      return;
    }
    requestSceneContext(cached);
  }

  function waterTop(normalizedX) {
    if (normalizedX < .16) return 2;
    if (normalizedX < .45) return .705;
    if (normalizedX < .62) return .705 - ((normalizedX - .45) / .17) * .055;
    return .65;
  }

  function waterBottom(normalizedX) {
    return normalizedX < .78 ? .66 + normalizedX * .43 : 1.02;
  }

  function isWater(normalizedX, normalizedY) {
    if (normalizedX < .16 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) return false;
    if (normalizedX > .87 && normalizedY > .9) return false;
    return normalizedY > waterTop(normalizedX) && normalizedY < waterBottom(normalizedX);
  }

  function waterDepth(normalizedX, normalizedY) {
    const top = waterTop(normalizedX);
    const bottom = waterBottom(normalizedX);
    return clamp((normalizedY - top) / Math.max(.001, bottom - top), 0, 1);
  }

  function isResponsiveWater(normalizedX, normalizedY) {
    if (!isWater(normalizedX, normalizedY) || settings.freeze >= .96) return false;
    return waterDepth(normalizedX, normalizedY) >= settings.freeze * .48;
  }

  function waterPath() {
    const path = new Path2D();
    path.moveTo(sceneWidth * .16, sceneHeight * .705);
    path.lineTo(sceneWidth * .45, sceneHeight * .705);
    path.lineTo(sceneWidth * .62, sceneHeight * .65);
    path.lineTo(sceneWidth, sceneHeight * .65);
    path.lineTo(sceneWidth, sceneHeight);
    path.lineTo(sceneWidth * .78, sceneHeight);
    path.lineTo(sceneWidth * .64, sceneHeight * .935);
    path.lineTo(sceneWidth * .5, sceneHeight * .875);
    path.lineTo(sceneWidth * .3, sceneHeight * .789);
    path.closePath();
    return path;
  }

  function addRipple(normalizedX, normalizedY, strength = 1, delay = 0, requestedType = null, direction = 1) {
    if (!settings.ripples || reducedMotion.matches || !isResponsiveWater(normalizedX, normalizedY)) return false;
    const type = requestedType || (strength < .6 ? "trail" : "click");
    const depth = waterDepth(normalizedX, normalizedY);
    const depthBand = depth < .34 ? 0 : depth < .68 ? 1 : 2;
    const responsiveness = 1 - settings.freeze * .86;
    const baseLife = type === "trail"
      ? [.9, .76, .64][depthBand]
      : [1.55, 1.34, 1.16][depthBand];

    ripples.push({
      age: -delay,
      depthBand,
      direction: direction < 0 ? -1 : 1,
      life: baseLife * (1 + settings.freeze * .8),
      strength: strength * responsiveness,
      type,
      x: normalizedX,
      y: normalizedY
    });

    if (ripples.length > 22) ripples.splice(0, ripples.length - 22);
    return true;
  }

  function startleMagpie() {
    if (!magpie?.active || !birdsCanFly()) return false;
    magpie.scared = true;
    magpie.avoidY = Math.min(magpie.avoidY, -.035);
    startleStartedAt = elapsed;
    return true;
  }

  function updateClouds(deltaSeconds) {
    if (!settings.clouds) return;
    const weatherAcceleration = settings.weather === "wind" ? 1.7 : settings.weather === "storm" ? 1.3 : 1;
    const wind = (Math.abs(settings.wind) < .05 ? .05 : settings.wind) * weatherAcceleration;
    clouds.forEach((cloud) => {
      cloud.x += cloud.speed * wind * deltaSeconds;
      if (wind >= 0 && cloud.x > 1.1) cloud.x = -.3 - random() * .16;
      if (wind < 0 && cloud.x < -.34) cloud.x = 1.06 + random() * .12;
    });
  }

  function updateBirds(deltaSeconds) {
    if (!birdsCanFly()) {
      if (magpie?.active) scheduleMagpie(false);
      return;
    }
    if (!magpie?.active) {
      if (elapsed >= nextBirdAt) startMagpieFlight();
      return;
    }

    const speed = magpie.scared ? 2.35 : 1;
    magpie.progress += (deltaSeconds / magpie.duration) * speed;
    magpie.frameClock += deltaSeconds * (magpie.scared ? 12 : 8);
    if (magpie.progress >= 1) {
      scheduleMagpie(false);
      return;
    }

    const t = clamp(magpie.progress, 0, 1);
    const inverse = 1 - t;
    const routeX = inverse ** 3 * magpie.startX
      + 3 * inverse ** 2 * t * magpie.controlX1
      + 3 * inverse * t ** 2 * magpie.controlX2
      + t ** 3 * magpie.endX;
    const routeY = inverse ** 3 * magpie.startY
      + 3 * inverse ** 2 * t * magpie.controlY1
      + 3 * inverse * t ** 2 * magpie.controlY2
      + t ** 3 * magpie.endY;

    let avoidanceTarget = magpie.scared ? -.07 : 0;
    if (pointer.active && pointer.normalizedY < .48) {
      const distance = Math.hypot(routeX - pointer.normalizedX, routeY + magpie.avoidY - pointer.normalizedY);
      if (distance < .16) avoidanceTarget -= ((.16 - distance) / .16) * .075;
    }
    magpie.avoidY += (avoidanceTarget - magpie.avoidY) * Math.min(1, deltaSeconds * 3.8);
    magpie.x = routeX;
    magpie.y = clamp(routeY + magpie.avoidY + Math.sin(elapsed * 2.1) * .0035, .045, .34);
  }

  function updateWeather(deltaSeconds) {
    weatherParticles.forEach((particle) => {
      if (weather.snow) {
        particle.x += (Math.sin(elapsed * 1.7 + particle.phase) * .012 + settings.wind * .012 + particle.drift) * deltaSeconds;
        particle.y += particle.speed * particle.depth * deltaSeconds;
      } else if (weather.rain) {
        particle.x += (settings.wind * .075 + particle.drift) * particle.depth * deltaSeconds;
        particle.y += particle.speed * particle.depth * deltaSeconds;
      } else {
        particle.x += (Math.sign(settings.wind || 1) * (.2 + Math.abs(settings.wind) * .13)) * particle.depth * deltaSeconds;
        particle.y += Math.sin(elapsed * 1.2 + particle.phase) * .018 * deltaSeconds;
      }

      if (particle.y > 1.08) {
        particle.y = -.08 - random() * .12;
        particle.x = random() * 1.08 - .04;
      }
      if (particle.x > 1.12) particle.x = -.1;
      if (particle.x < -.12) particle.x = 1.1;
    });

    if (settings.lightning && elapsed >= nextLightningAt) {
      lightningStartedAt = elapsed;
      nextLightningAt = elapsed + 8 + random() * 9;
    }
  }

  function updateRipples(deltaSeconds) {
    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      ripples[index].age += deltaSeconds;
      if (ripples[index].age > ripples[index].life) ripples.splice(index, 1);
    }
  }

  function cloudPalette() {
    const palettes = {
      clear: [[145, 166, 181], [244, 247, 244]],
      cloudy: [[91, 111, 126], [205, 216, 220]],
      rain: [[58, 78, 92], [158, 171, 176]],
      snow: [[153, 171, 183], [239, 243, 240]],
      storm: [[48, 67, 82], [147, 162, 169]],
      wind: [[126, 143, 150], [230, 234, 226]]
    };
    const [dayLow, dayHigh] = palettes[settings.weather] || palettes.clear;
    const nightLow = [37, 50, 73];
    const nightHigh = [102, 120, 145];
    const nightMix = clamp(solarVisual.night * .9, 0, 1);
    const warm = solarVisual.label === "sunrise" || solarVisual.label === "sunset" ? .12 : 0;
    const blend = (left, right) => left.map((value, index) => Math.round(value + (right[index] - value) * nightMix));
    const low = blend(dayLow, nightLow);
    const high = blend(dayHigh, nightHigh);
    high[0] = Math.min(255, Math.round(high[0] + 34 * warm));
    high[1] = Math.min(255, Math.round(high[1] + 12 * warm));
    return { high, low };
  }

  function tintedCloudAtlas() {
    const source = motionAssets.clouds;
    if (!source?.complete || !source.naturalWidth) return null;
    const key = `${settings.weather}:${Math.round(solarVisual.night * 10)}:${solarVisual.label}`;
    if (cloudTintCache.has(key)) return cloudTintCache.get(key);

    const offscreen = document.createElement("canvas");
    offscreen.width = source.naturalWidth;
    offscreen.height = source.naturalHeight;
    const offscreenContext = offscreen.getContext("2d", { alpha: true });
    offscreenContext.imageSmoothingEnabled = false;
    offscreenContext.drawImage(source, 0, 0);

    try {
      const imageData = offscreenContext.getImageData(0, 0, offscreen.width, offscreen.height);
      const { high, low } = cloudPalette();
      for (let index = 0; index < imageData.data.length; index += 4) {
        if (imageData.data[index + 3] === 0) continue;
        const luminance = (imageData.data[index] * .2126
          + imageData.data[index + 1] * .7152
          + imageData.data[index + 2] * .0722) / 255;
        const amount = clamp((luminance - .42) / .55, 0, 1);
        imageData.data[index] = Math.round(low[0] + (high[0] - low[0]) * amount);
        imageData.data[index + 1] = Math.round(low[1] + (high[1] - low[1]) * amount);
        imageData.data[index + 2] = Math.round(low[2] + (high[2] - low[2]) * amount);
      }
      offscreenContext.putImageData(imageData, 0, 0);
    } catch {
      return source;
    }

    cloudTintCache.set(key, offscreen);
    if (cloudTintCache.size > 24) cloudTintCache.delete(cloudTintCache.keys().next().value);
    return offscreen;
  }

  function drawClouds() {
    if (!settings.clouds) return;
    const atlas = tintedCloudAtlas();
    if (!atlas) return;
    const assetScale = sceneWidth / 760;
    const weatherScale = settings.weather === "storm" ? 1.1
      : settings.weather === "rain" ? 1.06
        : settings.weather === "snow" ? .96
          : settings.weather === "clear" ? .95
            : 1;

    clouds.slice(0, weather.clouds).forEach((cloud) => {
      const frame = cloudFrames[cloud.sprite];
      const originX = Math.round(cloud.x * sceneWidth);
      const originY = Math.round(cloud.y * sceneHeight);
      context.save();
      context.globalAlpha = clamp(
        cloud.alpha * weather.cloudAlpha * (.72 + settings.intensity * .36) * (1 - solarVisual.night * .18),
        0,
        .88
      );
      context.drawImage(
        atlas,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        originX,
        originY,
        Math.max(1, Math.round(frame.width * assetScale * cloud.scale * weatherScale)),
        Math.max(1, Math.round(frame.height * assetScale * cloud.scale * weatherScale))
      );
      context.restore();
    });
  }

  function drawSolarLighting() {
    const minute = Math.floor(sceneTimestamp() / 60000);
    if (minute !== lastSolarMinute) {
      solarVisual = calculateSolarVisual(sceneTimestamp());
      lastSolarMinute = minute;
    }

    if (solarVisual.alpha <= 0) return;
    const [red, green, blue] = solarVisual.color;
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${solarVisual.alpha})`;
    context.fillRect(0, 0, sceneWidth, sceneHeight);
  }

  const palaceLights = [
    [.328, .497], [.347, .497], [.365, .496], [.384, .494], [.404, .49], [.423, .485],
    [.442, .478], [.459, .47], [.476, .463], [.494, .456], [.514, .449], [.533, .444],
    [.373, .555], [.397, .548], [.421, .54], [.445, .532], [.469, .524], [.493, .515]
  ];
  const skylineLights = [
    [.612, .489], [.627, .475], [.645, .448], [.662, .462], [.681, .437], [.704, .426],
    [.731, .398], [.756, .413], [.783, .388], [.808, .424], [.839, .397], [.873, .421],
    [.903, .405], [.932, .432], [.958, .418]
  ];

  function drawNightLights() {
    const level = clamp((solarVisual.night - .12) / .88, 0, 1);
    if (level <= 0) return;
    const unit = Math.max(1, Math.round(sceneWidth / 620));
    const flicker = reducedMotion.matches ? 1 : .93 + Math.sin(elapsed * 1.7) * .035;

    context.save();
    context.globalAlpha = (.3 + level * .62) * flicker;
    palaceLights.forEach(([x, y], index) => {
      context.fillStyle = index % 4 === 0 ? "#ffd48a" : "#efae55";
      context.fillRect(Math.round(x * sceneWidth), Math.round(y * sceneHeight), unit, unit);
    });
    context.globalAlpha = (.18 + level * .48) * flicker;
    skylineLights.forEach(([x, y], index) => {
      context.fillStyle = index % 3 === 0 ? "#f3c780" : "#cf984f";
      context.fillRect(Math.round(x * sceneWidth), Math.round(y * sceneHeight), unit, unit);
    });
    context.restore();

    context.save();
    context.clip(waterPath());
    context.globalAlpha = level * .14 * flicker;
    palaceLights.filter((_, index) => index % 2 === 0).forEach(([x], index) => {
      const y = sceneHeight * (.69 + (index % 4) * .012);
      const height = Math.max(2, Math.round(sceneHeight * (.025 + (index % 3) * .009)));
      context.fillStyle = index % 3 === 0 ? "#ffd38a" : "#e49746";
      context.fillRect(Math.round(x * sceneWidth), Math.round(y), unit, height);
    });
    context.restore();
  }

  function drawAtmosphere() {
    const [red, green, blue, baseAlpha] = weather.tint;
    const alpha = baseAlpha * (.58 + settings.intensity * .72);
    if (alpha > 0) {
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      context.fillRect(0, 0, sceneWidth, sceneHeight);
    }
  }

  function drawHaze() {
    if (!weather.haze) return;
    const strength = weather.haze * settings.intensity;

    context.save();
    context.fillStyle = `rgba(214, 222, 220, ${.052 + strength * .13})`;
    context.fillRect(0, Math.round(sceneHeight * .16), sceneWidth, Math.round(sceneHeight * .53));

    for (let index = 0; index < 3; index += 1) {
      const bandY = .28 + index * .062 + Math.sin(elapsed * .11 + index * 1.7) * .012;
      const bandWidth = sceneWidth * (.42 + ((index * 17) % 5) * .09);
      const travel = sceneWidth + bandWidth;
      const offset = elapsed * (2.4 + index * .35) * Math.sign(settings.wind || 1) + index * sceneWidth * .21;
      const bandX = ((offset % travel) + travel) % travel - bandWidth;
      context.fillStyle = `rgba(229, 234, 229, ${.03 + strength * .06})`;
      context.fillRect(Math.round(bandX), Math.round(bandY * sceneHeight), Math.round(bandWidth), Math.max(2, Math.round(sceneHeight * (.026 + strength * .022))));
    }
    context.restore();
  }

  function drawWeatherParticles() {
    if (!weatherParticles.length) return;

    context.save();
    if (weather.rain) {
      const alpha = .15 + settings.intensity * .24;
      context.strokeStyle = `rgba(202, 221, 230, ${alpha})`;
      context.lineWidth = 1;
      context.beginPath();
      weatherParticles.forEach((particle) => {
        const x = Math.round(particle.x * sceneWidth);
        const y = Math.round(particle.y * sceneHeight);
        const slant = settings.wind * particle.length * .85;
        context.moveTo(x, y);
        context.lineTo(Math.round(x - slant), Math.round(y - particle.length * particle.depth * .68));
      });
      context.stroke();
    } else if (weather.snow) {
      context.fillStyle = `rgba(243, 246, 239, ${.5 + settings.intensity * .34})`;
      weatherParticles.forEach((particle) => {
        const size = Math.max(1, Math.round(particle.size * particle.depth));
        context.fillRect(Math.round(particle.x * sceneWidth), Math.round(particle.y * sceneHeight), size, size);
      });
    } else if (weather.windStreaks) {
      context.strokeStyle = `rgba(224, 218, 187, ${.13 + settings.intensity * .17})`;
      context.lineWidth = 1;
      context.beginPath();
      weatherParticles.forEach((particle) => {
        const x = Math.round(particle.x * sceneWidth);
        const y = Math.round(particle.y * sceneHeight);
        const length = particle.length * 2.4 * Math.sign(settings.wind || 1);
        context.moveTo(x, y);
        context.lineTo(Math.round(x - length), y + (particle.size % 2));
      });
      context.stroke();
    }
    context.restore();
  }

  function drawWeatherWater() {
    if (!weather.rain && !weather.windStreaks) return;
    context.save();
    context.clip(waterPath());

    if (weather.rain) {
      const atlas = motionAssets.rippleClick;
      context.globalAlpha = .18 + settings.intensity * .2;
      weatherParticles.forEach((particle, index) => {
        if (index % 4 !== 0 || !isWater(particle.x, particle.y) || !atlas?.complete || !atlas.naturalWidth) return;
        const pulse = (elapsed * particle.speed * 3 + particle.phase) % 1;
        const frameIndex = Math.min(3, Math.floor(pulse * 4));
        const scale = sceneWidth / 760 * (.1 + pulse * .06);
        const width = Math.max(2, Math.round(96 * scale));
        const height = Math.max(1, Math.round(28 * scale));
        context.drawImage(
          atlas,
          frameIndex * 96,
          0,
          96,
          28,
          Math.round(particle.x * sceneWidth - width / 2),
          Math.round(particle.y * sceneHeight - height / 2),
          width,
          height
        );
      });
    }

    if (weather.windStreaks) {
      context.strokeStyle = `rgba(224, 238, 240, ${.12 + settings.intensity * .12})`;
      context.lineWidth = 1;
      const direction = Math.sign(settings.wind || 1);
      for (let index = 0; index < 11; index += 1) {
        const x = ((elapsed * 16 * direction + index * sceneWidth * .12) % (sceneWidth * 1.15)) - sceneWidth * .08;
        const y = sceneHeight * (.7 + (index % 6) * .043);
        context.beginPath();
        context.moveTo(Math.round(x), Math.round(y));
        context.lineTo(Math.round(x + direction * (8 + index % 4 * 4)), Math.round(y));
        context.stroke();
      }
    }
    context.restore();
  }

  function lightningLevel() {
    if (!settings.lightning || reducedMotion.matches) return 0;
    const age = elapsed - lightningStartedAt;
    if (age < 0 || age > .42) return 0;
    if (age < .055) return .12;
    if (age < .13) return .025;
    if (age < .19) return .085;
    return .02 * (1 - (age - .19) / .23);
  }

  function drawLightning() {
    const level = lightningLevel();
    if (level <= 0) return;
    context.fillStyle = `rgba(223, 232, 242, ${level})`;
    context.fillRect(0, 0, sceneWidth, sceneHeight);

    const age = elapsed - lightningStartedAt;
    if (age >= .19) return;
    const unit = Math.max(1, Math.round(sceneWidth / 620));
    const originX = Math.round(sceneWidth * .91);
    const originY = Math.round(sceneHeight * .035);
    const bolt = [
      [0, 0, 2, 8], [-5, 7, 7, 2], [-5, 8, 2, 9],
      [-9, 16, 6, 2], [-9, 17, 2, 8], [-13, 24, 6, 2],
      [-13, 25, 2, 7], [-17, 31, 6, 2]
    ];
    context.fillStyle = `rgba(226, 235, 242, ${Math.min(.3, level * 2.4)})`;
    bolt.forEach(([x, y, width, height]) => {
      context.fillRect(originX + x * unit, originY + y * unit, width * unit, height * unit);
    });
  }

  function drawCoverSlice(image, destinationX, destinationY, destinationWidth, destinationHeight, shiftX, alpha) {
    if (!image?.complete || !image.naturalWidth || !image.naturalHeight || destinationWidth <= 0 || destinationHeight <= 0) return;
    const coverScale = Math.max(sceneWidth / image.naturalWidth, sceneHeight / image.naturalHeight);
    const renderedWidth = image.naturalWidth * coverScale;
    const renderedHeight = image.naturalHeight * coverScale;
    const cropX = (renderedWidth - sceneWidth) / 2;
    const cropY = (renderedHeight - sceneHeight) / 2;
    const sourceX = clamp((destinationX + cropX) / coverScale, 0, image.naturalWidth);
    const sourceY = clamp((destinationY + cropY) / coverScale, 0, image.naturalHeight);
    const sourceWidth = clamp(destinationWidth / coverScale, 0, image.naturalWidth - sourceX);
    const sourceHeight = clamp(destinationHeight / coverScale, 0, image.naturalHeight - sourceY);
    if (sourceWidth <= 0 || sourceHeight <= 0) return;
    context.globalAlpha = alpha;
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      Math.round(destinationX + shiftX),
      Math.round(destinationY),
      Math.ceil(destinationWidth),
      Math.ceil(destinationHeight)
    );
  }

  function drawSeasonSlice(destinationX, destinationY, destinationWidth, destinationHeight, shiftX, alpha) {
    drawCoverSlice(sceneImage, destinationX, destinationY, destinationWidth, destinationHeight, shiftX, alpha);
    if (settings.seasonMix > .001) {
      drawCoverSlice(
        seasonBlendImage,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
        shiftX,
        alpha * settings.seasonMix
      );
    }
  }

  function drawReflectionDistortion(ripple, progress, width, height) {
    const depthAmplitude = [1, 2, 3][ripple.depthBand];
    const amplitude = depthAmplitude * (sceneWidth / 760) * (1 - settings.freeze * .72) * Math.sin(progress * Math.PI);
    if (amplitude < .18) return;
    const centerX = ripple.x * sceneWidth;
    const centerY = ripple.y * sceneHeight;
    const regionWidth = width * 1.12;
    const regionHeight = Math.max(3, height * 1.18);
    const left = centerX - regionWidth / 2;
    const top = centerY - regionHeight / 2;
    const bands = ripple.type === "trail" ? 3 : 5;
    const bandHeight = regionHeight / bands;
    const opacity = ripple.strength * Math.pow(1 - progress, .72) * (ripple.type === "trail" ? .24 : .44);

    context.save();
    context.clip(waterPath());
    context.beginPath();
    context.ellipse(centerX, centerY, regionWidth / 2, regionHeight / 2, 0, 0, Math.PI * 2);
    context.clip();
    for (let index = 0; index < bands; index += 1) {
      const wave = Math.sin((index + 1) * 1.9 + progress * Math.PI * 3.2);
      const shift = Math.round(wave * amplitude);
      drawSeasonSlice(left, top + index * bandHeight, regionWidth, bandHeight + 1, shift, opacity);
    }
    context.restore();
  }

  function drawRipples() {
    if (!settings.ripples || !ripples.length) return;
    const clickAtlas = motionAssets.rippleClick;
    const trailAtlas = motionAssets.rippleTrail;
    if ((!clickAtlas?.complete || !clickAtlas.naturalWidth) && (!trailAtlas?.complete || !trailAtlas.naturalWidth)) return;
    context.save();
    context.clip(waterPath());

    ripples.forEach((ripple) => {
      if (ripple.age < 0) return;
      const progress = clamp(ripple.age / ripple.life, 0, 1);
      const isTrail = ripple.type === "trail";
      const atlas = isTrail ? trailAtlas : clickAtlas;
      if (!atlas?.complete || !atlas.naturalWidth) return;
      const columns = isTrail ? 3 : 5;
      const frameWidth = isTrail ? 48 : 96;
      const frameHeight = isTrail ? 18 : 28;
      const frameCount = isTrail ? 6 : 10;
      const frameIndex = Math.min(frameCount - 1, Math.floor(progress * frameCount));
      const depthScale = [.48, .72, .96][ripple.depthBand] * (1 - settings.freeze * .58);
      const perspective = [.72, .86, 1][ripple.depthBand];
      const assetScale = sceneWidth / 760;
      const width = Math.max(1, Math.round(frameWidth * assetScale * depthScale));
      const height = Math.max(1, Math.round(frameHeight * assetScale * depthScale * perspective));
      const x = ripple.x * sceneWidth;
      const y = ripple.y * sceneHeight;
      drawReflectionDistortion(ripple, progress, width, height);

      context.save();
      context.globalAlpha = clamp(
        ripple.strength * (.72 + (1 - progress) * .22) * (1 - solarVisual.night * .24),
        0,
        .9
      );
      context.translate(Math.round(x), Math.round(y));
      if (isTrail && ripple.direction < 0) context.scale(-1, 1);
      context.drawImage(
        atlas,
        (frameIndex % columns) * frameWidth,
        Math.floor(frameIndex / columns) * frameHeight,
        frameWidth,
        frameHeight,
        -Math.round(width / 2),
        -Math.round(height / 2),
        width,
        height
      );
      context.restore();
    });

    context.restore();
  }

  function drawBirds() {
    const atlas = motionAssets.magpie;
    if (!birdsCanFly() || !magpie?.active || !atlas?.complete || !atlas.naturalWidth) return;
    const frameIndex = magpie.scared
      ? 8 + Math.floor(magpie.frameClock) % 4
      : Math.floor(magpie.frameClock) % 8;
    const sourceX = (frameIndex % magpieAtlas.columns) * magpieAtlas.frameWidth;
    const sourceY = Math.floor(frameIndex / magpieAtlas.columns) * magpieAtlas.frameHeight;
    const assetScale = sceneWidth / 760;
    const width = Math.max(1, Math.round(magpieAtlas.frameWidth * assetScale));
    const height = Math.max(1, Math.round(magpieAtlas.frameHeight * assetScale));

    context.save();
    context.globalAlpha = .96;
    context.translate(Math.round(magpie.x * sceneWidth), Math.round(magpie.y * sceneHeight));
    context.scale(magpie.direction, 1);
    context.drawImage(
      atlas,
      sourceX,
      sourceY,
      magpieAtlas.frameWidth,
      magpieAtlas.frameHeight,
      -Math.round(width / 2),
      -Math.round(height / 2),
      width,
      height
    );
    context.restore();
  }

  function draw() {
    renderedFrames += 1;
    context.clearRect(0, 0, sceneWidth, sceneHeight);
    drawSolarLighting();
    drawAtmosphere();
    drawNightLights();
    drawClouds();
    drawHaze();
    drawWeatherParticles();
    drawWeatherWater();
    drawRipples();
    drawBirds();
    drawLightning();
  }

  function animationLoop(timestamp) {
    const deltaMilliseconds = Math.min(80, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    const running = !reducedMotion.matches && pageVisible && sceneVisible;
    const targetInterval = finePointer.matches ? 1000 / 30 : 1000 / 24;

    if (running) {
      const deltaSeconds = deltaMilliseconds / 1000;
      elapsed += deltaSeconds;
      updateClouds(deltaSeconds);
      updateBirds(deltaSeconds);
      updateWeather(deltaSeconds);
      updateRipples(deltaSeconds);

      const sinceLastDraw = timestamp - lastDraw;
      if (sinceLastDraw >= targetInterval) {
        draw();
        lastDraw = timestamp - (sinceLastDraw % targetInterval);
      }
    }

    animationFrame = window.requestAnimationFrame(animationLoop);
  }

  function resize() {
    const bounds = surface.getBoundingClientRect();
    const resolutionScale = bounds.width < 620 ? .55 : .5;
    const minimumWidth = isHomeScene ? 160 : 240;
    const minimumHeight = isHomeScene ? 90 : 135;
    const width = Math.max(minimumWidth, Math.round(bounds.width * resolutionScale));
    const height = Math.max(minimumHeight, Math.round(bounds.height * resolutionScale));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    sceneWidth = width;
    sceneHeight = height;
    context.imageSmoothingEnabled = false;
    draw();
  }

  function updatePointer(event) {
    const bounds = surface.getBoundingClientRect();
    pointer.normalizedX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    pointer.normalizedY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    pointer.active = true;
    const overWater = isResponsiveWater(pointer.normalizedX, pointer.normalizedY);
    surface.classList.toggle("is-water", overWater && !reducedMotion.matches);

    if (finePointer.matches && !reducedMotion.matches) {
      world.style.setProperty("--parallax-x", `${(pointer.normalizedX - .5) * -4}px`);
      world.style.setProperty("--parallax-y", `${(pointer.normalizedY - .5) * -3}px`);
    }

    const shouldTrail = event.pointerType === "mouse" || pointer.down;
    const now = performance.now();
    if (!overWater || !shouldTrail || now - pointer.lastTrailAt < 70) return;

    if (pointer.lastTrailX < 0) {
      pointer.lastTrailX = pointer.normalizedX;
      pointer.lastTrailY = pointer.normalizedY;
      pointer.lastTrailAt = now;
      return;
    }

    const trailDistance = Math.hypot(
      pointer.normalizedX - pointer.lastTrailX,
      pointer.normalizedY - pointer.lastTrailY
    );
    if (trailDistance > .012) {
      const direction = pointer.normalizedX >= pointer.lastTrailX ? 1 : -1;
      addRipple(pointer.normalizedX, pointer.normalizedY, .42, 0, "trail", direction);
      pointer.lastTrailX = pointer.normalizedX;
      pointer.lastTrailY = pointer.normalizedY;
      pointer.lastTrailAt = now;
    }
  }

  surface.addEventListener("pointerenter", updatePointer, { passive: true });
  surface.addEventListener("pointermove", updatePointer, { passive: true });
  surface.addEventListener("pointerdown", (event) => {
    pointer.down = true;
    updatePointer(event);
    if (surface.setPointerCapture) surface.setPointerCapture(event.pointerId);

    if (isResponsiveWater(pointer.normalizedX, pointer.normalizedY)) {
      addRipple(pointer.normalizedX, pointer.normalizedY, 1, 0, "click");
    }
    startleMagpie();
  });

  const releasePointer = (event) => {
    pointer.down = false;
    if (event && surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  };
  surface.addEventListener("pointerup", releasePointer);
  surface.addEventListener("pointercancel", releasePointer);
  surface.addEventListener("pointerleave", () => {
    pointer.active = false;
    pointer.down = false;
    pointer.lastTrailX = -1;
    pointer.lastTrailY = -1;
    surface.classList.remove("is-water");
    world.style.setProperty("--parallax-x", "0px");
    world.style.setProperty("--parallax-y", "0px");
  });

  surface.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    addRipple(.74, .78, 1, 0, "click");
    startleMagpie();
  });

  reducedMotion.addEventListener("change", () => {
    ripples.length = 0;
    if (reducedMotion.matches) {
      magpie = null;
      nextBirdAt = Number.POSITIVE_INFINITY;
    } else {
      scheduleMagpie(true);
    }
    surface.classList.remove("is-water");
    world.style.setProperty("--parallax-x", "0px");
    world.style.setProperty("--parallax-y", "0px");
    draw();
  });

  document.addEventListener("visibilitychange", () => {
    pageVisible = document.visibilityState !== "hidden";
    lastTimestamp = performance.now();
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      sceneVisible = entries[0]?.isIntersecting ?? true;
      lastTimestamp = performance.now();
    }, { threshold: .05 });
    observer.observe(surface);
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);
  } else {
    window.addEventListener("resize", resize, { passive: true });
  }

  sceneImage.addEventListener("load", draw);
  seasonBlendImage.addEventListener("load", draw);

  window.__beijingScene = {
    addRipple: (x = .74, y = .78, strength = 1) => addRipple(x, y, strength),
    scatterBirds: () => startleMagpie(),
    spawnBird: () => {
      nextBirdAt = elapsed;
      return startMagpieFlight();
    },
    triggerLightning: () => {
      if (!settings.lightning || reducedMotion.matches) return false;
      lightningStartedAt = elapsed;
      nextLightningAt = elapsed + 8 + random() * 9;
      return true;
    },
    isWater,
    isResponsiveWater,
    state: () => ({
      assetsLoaded: loadedMotionAssets,
      assetsTotal: Object.keys(motionAssetSources).length,
      birdActive: Boolean(magpie?.active),
      birdPosition: magpie?.active ? [magpie.x, magpie.y] : null,
      birdScared: Boolean(magpie?.scared),
      birds: magpie?.active ? 1 : 0,
      birdsCanFly: birdsCanFly(),
      canvas: [sceneWidth, sceneHeight],
      cloudsEnabled: settings.clouds,
      elapsed,
      freeze: settings.freeze,
      intensity: settings.intensity,
      lightning: lightningLevel(),
      pageVisible,
      reducedMotion: reducedMotion.matches,
      renderedFrames,
      ripplesEnabled: settings.ripples,
      ripples: ripples.length,
      rippleStrength: ripples.at(-1)?.strength ?? 0,
      rippleType: ripples.at(-1)?.type ?? null,
      scatterActive: elapsed - startleStartedAt < 1.35,
      sceneVisible,
      season: settings.season,
      seasonFrom: settings.seasonFrom,
      seasonMix: settings.seasonMix,
      seasonTo: settings.seasonTo,
      solarAnchor: solarVisual.label,
      solarMode: settings.solar?.mode ?? "normal",
      solarIsDay: solarVisual.isDay,
      contextExpiresAt: activeContext.expiresAt,
      contextSource: sceneContextSource,
      temperatureC: settings.temperatureC,
      weather: settings.weather,
      weatherParticles: weatherParticles.length,
      wind: settings.wind
    })
  };

  scheduleMagpie(true);
  createWeatherParticles();
  resize();
  draw();
  loadSceneContext();
  animationFrame = window.requestAnimationFrame(animationLoop);

  window.addEventListener("pagehide", () => {
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(contextRefreshTimer);
  }, { once: true });
})();
