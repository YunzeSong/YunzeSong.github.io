// Change this one value when Yunze moves: beijing, singapore, shenzhen, hangzhou, or suzhou.
const siteConfig = {
  currentCity: "beijing"
};

const cities = {
  beijing: {
    label: "Beijing",
    coordinates: "39.90 N / 116.41 E",
    src: "./assets/scene-beijing.webp",
    caption: "Currently in Beijing.",
    alt: "Pixel art of Yunze exploring Beijing near the Forbidden City"
  },
  singapore: {
    label: "Singapore",
    coordinates: "1.30 N / 103.78 E",
    src: "./assets/scene-singapore.webp",
    caption: "Currently in Singapore.",
    alt: "Pixel art of Yunze near NUS in Singapore"
  },
  shenzhen: {
    label: "Shenzhen",
    coordinates: "22.54 N / 114.06 E",
    src: "./assets/scene-shenzhen.webp",
    caption: "Currently in Shenzhen.",
    alt: "Pixel art of Yunze looking across the Shenzhen skyline"
  },
  hangzhou: {
    label: "Hangzhou",
    coordinates: "30.27 N / 120.15 E",
    src: "./assets/scene-hangzhou.webp",
    caption: "Currently in Hangzhou.",
    alt: "Pixel art of Yunze exploring Hangzhou near West Lake"
  },
  suzhou: {
    label: "Suzhou",
    coordinates: "31.30 N / 120.58 E",
    src: "./assets/scene-suzhou.webp",
    caption: "Currently in Suzhou.",
    alt: "Pixel art of Yunze exploring Suzhou beside a canal"
  }
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionState = {
  paused: reducedMotion.matches
};

function setupMotionPreference() {
  const handlePreferenceChange = (event) => {
    motionState.paused = event.matches;
    window.dispatchEvent(new CustomEvent("motionchange", { detail: { paused: motionState.paused } }));
  };

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", handlePreferenceChange);
  } else if (typeof reducedMotion.addListener === "function") {
    reducedMotion.addListener(handlePreferenceChange);
  }
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });
}

function setupCityPlayer() {
  const player = document.querySelector("[data-city-player]");
  const image = document.querySelector("[data-current-city-image]");
  const coordinates = document.querySelector("[data-city-coordinates]");
  const caption = document.querySelector("[data-city-caption]");
  const motionSurface = player?.querySelector("[data-motion-scene]");

  if (!player || !image) return;

  const currentKey = siteConfig.currentCity in cities ? siteConfig.currentCity : "beijing";
  const city = cities[currentKey];
  if (coordinates) coordinates.textContent = city.coordinates;
  if (caption) caption.textContent = city.caption;
  if (motionSurface) motionSurface.dataset.motionScene = currentKey;
  if (image.getAttribute("src") !== city.src) image.src = city.src;
  image.alt = city.alt;

  const finePointer = window.matchMedia("(pointer: fine)");
  if (finePointer.matches && !reducedMotion.matches) {
    player.addEventListener("pointermove", (event) => {
      const bounds = player.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - .5) * -5;
      const y = ((event.clientY - bounds.top) / bounds.height - .5) * -4;
      player.style.setProperty("--scene-x", `${x}px`);
      player.style.setProperty("--scene-y", `${y}px`);
    });

    player.addEventListener("pointerleave", () => {
      player.style.setProperty("--scene-x", "0px");
      player.style.setProperty("--scene-y", "0px");
    });
  }
}

function setupJourney() {
  const items = [...document.querySelectorAll("[data-journey-scene]")];
  const stage = document.querySelector(".journey-stage");
  const image = document.querySelector("[data-journey-image]");
  const place = document.querySelector("[data-journey-place]");
  const counter = document.querySelector("[data-journey-index]");
  const caption = document.querySelector("[data-journey-caption]");
  const motionSurface = stage?.querySelector("[data-motion-scene]");

  if (!items.length || !stage || !image) return;

  let activeIndex = -1;
  let changeId = 0;
  const preloadCache = new Map();

  const ensurePreloaded = (src) => {
    if (!preloadCache.has(src)) preloadCache.set(src, preloadImage(src));
    return preloadCache.get(src);
  };

  items.forEach((item) => {
    const city = cities[item.dataset.journeyScene];
    if (city) ensurePreloaded(city.src);
  });

  async function activate(index, animate = true) {
    if (index === activeIndex || !items[index]) return;

    activeIndex = index;
    const item = items[index];
    const key = item.dataset.journeyScene;
    const city = cities[key] || cities.beijing;
    const currentChange = ++changeId;

    items.forEach((entry, entryIndex) => {
      entry.classList.toggle("is-active", entryIndex === index);
    });

    if (counter) counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    if (place) place.textContent = city.label;
    if (caption) caption.textContent = item.dataset.journeyCaption || city.caption;
    stage.style.setProperty("--journey-progress", String(index + 1));

    if (image.getAttribute("src") === city.src) {
      image.alt = `Pixel art scene for ${city.label}`;
      if (motionSurface) motionSurface.dataset.motionScene = key;
      stage.classList.remove("is-switching");
      return;
    }

    if (animate && !reducedMotion.matches) stage.classList.add("is-switching");
    await ensurePreloaded(city.src);
    if (currentChange !== changeId) return;

    image.src = city.src;
    image.alt = `Pixel art scene for ${city.label}`;
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // The preloaded image can still be displayed if decoding is interrupted.
      }
    }
    if (currentChange !== changeId) return;
    if (motionSurface) motionSurface.dataset.motionScene = key;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => stage.classList.remove("is-switching"));
    });
  }

  activate(0, false);

  if ("IntersectionObserver" in window) {
    const ratios = new Map(items.map((item) => [item, 0]));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      });

      let nextIndex = activeIndex;
      let nextRatio = -1;
      items.forEach((item, index) => {
        const ratio = ratios.get(item) || 0;
        if (ratio > nextRatio) {
          nextIndex = index;
          nextRatio = ratio;
        }
      });

      const activeRatio = ratios.get(items[activeIndex]) || 0;
      const hasClearLead = nextRatio >= activeRatio + .1;
      if (nextRatio > 0 && nextIndex !== activeIndex && (activeRatio < .04 || hasClearLead)) {
        activate(nextIndex);
      }
    }, {
      rootMargin: "-24% 0px -38% 0px",
      threshold: [0, .05, .1, .2, .3, .4, .5, .6, .75]
    });

    items.forEach((item) => observer.observe(item));
  }
}

function setupNavigation() {
  const links = [...document.querySelectorAll(".section-nav a[href^='#']")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (!("IntersectionObserver" in window) || !sections.length) return;

  const activate = (hash) => {
    links.forEach((link) => {
      link.classList.toggle("is-current", link.getAttribute("href") === hash);
    });
  };

  const contact = document.querySelector("#contact");
  const isContactCurrent = () => (
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 48
    || (contact && contact.getBoundingClientRect().top <= window.innerHeight * .78)
  );

  const updatePageEnd = () => {
    if (isContactCurrent()) activate("#contact");
  };

  const observer = new IntersectionObserver((entries) => {
    if (isContactCurrent()) {
      activate("#contact");
      return;
    }

    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    activate(`#${visible.target.id}`);
  }, {
    rootMargin: "-22% 0px -64% 0px",
    threshold: [0, .1, .3]
  });

  sections.forEach((section) => observer.observe(section));
  window.addEventListener("scroll", updatePageEnd, { passive: true });
  window.addEventListener("resize", updatePageEnd);
  requestAnimationFrame(updatePageEnd);
}

function setupStarCounts() {
  const repositories = [...document.querySelectorAll("[data-repo]")];

  repositories.forEach(async (element) => {
    try {
      const response = await fetch(`https://api.github.com/repos/${element.dataset.repo}`, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) return;
      const repository = await response.json();
      const output = element.querySelector("[data-star-count]");
      if (output && Number.isFinite(repository.stargazers_count)) {
        output.textContent = new Intl.NumberFormat("en", { notation: "compact" }).format(repository.stargazers_count);
      }
    } catch {
      // The rest of the page works normally when the GitHub API is unavailable.
    }
  });
}

function preloadJourneyScenes() {
  const load = () => Object.values(cities).forEach((city) => preloadImage(city.src));
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(load, { timeout: 2500 });
  } else {
    window.setTimeout(load, 1000);
  }
}

const worldPalettes = {
  beijing: {
    sky: [245, 240, 229],
    cloud: [255, 250, 236],
    horizon: [151, 169, 154],
    ground: [220, 207, 177],
    route: [167, 70, 57],
    mote: [206, 151, 54]
  },
  research: {
    sky: [241, 239, 231],
    cloud: [251, 249, 241],
    horizon: [145, 169, 165],
    ground: [214, 219, 205],
    route: [39, 90, 74],
    mote: [109, 143, 161]
  },
  signal: {
    sky: [246, 238, 222],
    cloud: [255, 249, 232],
    horizon: [126, 159, 156],
    ground: [218, 200, 159],
    route: [167, 70, 57],
    mote: [214, 168, 77]
  },
  journey: {
    sky: [23, 55, 47],
    cloud: [68, 94, 83],
    horizon: [51, 88, 74],
    ground: [17, 43, 36],
    route: [225, 182, 87],
    mote: [226, 210, 166]
  },
  home: {
    sky: [241, 235, 222],
    cloud: [252, 247, 236],
    horizon: [150, 169, 154],
    ground: [218, 207, 181],
    route: [39, 90, 74],
    mote: [214, 168, 77]
  }
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function mixNumber(from, to, amount) {
  return from + (to - from) * amount;
}

function mixColor(from, to, amount) {
  return from.map((channel, index) => Math.round(mixNumber(channel, to[index], amount)));
}

function colorString(color, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function smoothStep(value) {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let output = state;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function setupWorldBackground() {
  const canvas = document.querySelector("[data-world-background]");
  const context = canvas?.getContext("2d", { alpha: false });
  const moodElements = [...document.querySelectorAll("[data-world-mood]")];
  if (!canvas || !context || !moodElements.length) return;

  const random = createRandom(97277);
  const clouds = Array.from({ length: 9 }, (_, index) => ({
    x: random(),
    y: .08 + random() * .46,
    size: 1 + Math.floor(random() * 3),
    speed: .22 + random() * .42,
    alpha: .2 + random() * .28,
    layer: index % 3
  }));
  const motes = Array.from({ length: 52 }, () => ({
    x: random(),
    y: random(),
    speed: .35 + random() * .9,
    drift: random() * 2 - 1,
    size: random() > .78 ? 2 : 1,
    phase: random() * Math.PI * 2
  }));

  let pixelSize = 4;
  let width = 1;
  let height = 1;
  let elapsed = 0;
  let lastFrame = performance.now();
  let lastDraw = 0;
  let needsDraw = true;
  let pageVisible = document.visibilityState !== "hidden";
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let moodAnchors = [];

  function measureMoods() {
    moodAnchors = moodElements.map((element) => ({
      key: element.dataset.worldMood in worldPalettes ? element.dataset.worldMood : "beijing",
      point: element.offsetTop + Math.min(element.offsetHeight * .2, window.innerHeight * .38)
    }));
  }

  function resize() {
    pixelSize = window.innerWidth <= 600 ? 4 : 5;
    width = Math.max(1, Math.ceil(window.innerWidth / pixelSize));
    height = Math.max(1, Math.ceil(window.innerHeight / pixelSize));
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
    measureMoods();
    needsDraw = true;
  }

  function currentMood() {
    const pagePoint = window.scrollY + window.innerHeight * .52;
    if (pagePoint <= moodAnchors[0].point) {
      const key = moodAnchors[0].key;
      return { fromKey: key, toKey: key, amount: 0 };
    }

    for (let index = 0; index < moodAnchors.length - 1; index += 1) {
      const from = moodAnchors[index];
      const to = moodAnchors[index + 1];
      if (pagePoint <= to.point) {
        const rawAmount = (pagePoint - from.point) / Math.max(1, to.point - from.point);
        return { fromKey: from.key, toKey: to.key, amount: smoothStep(rawAmount) };
      }
    }

    const key = moodAnchors[moodAnchors.length - 1].key;
    return { fromKey: key, toKey: key, amount: 0 };
  }

  function drawCloud(x, y, size, color, alpha) {
    const unit = Math.max(1, size);
    context.globalAlpha = alpha;
    context.fillStyle = colorString(color);
    context.fillRect(Math.round(x), Math.round(y), 8 * unit, 2 * unit);
    context.fillRect(Math.round(x + 2 * unit), Math.round(y - 2 * unit), 4 * unit, 2 * unit);
    context.fillRect(Math.round(x + 6 * unit), Math.round(y - unit), 4 * unit, 2 * unit);
    context.globalAlpha = 1;
  }

  function drawHorizon(palette, time) {
    const parallaxX = Math.round(pointerX * 2);
    const horizonY = Math.round(height * .73 + Math.sin(time * .18) * 1.2);

    context.globalAlpha = .1;
    context.fillStyle = colorString(palette.horizon);
    context.beginPath();
    context.moveTo(-8, height);
    context.lineTo(-8, horizonY + 11);
    for (let x = -8; x <= width + 12; x += 12) {
      const ridge = Math.round(Math.sin((x + parallaxX) * .095) * 5 + Math.sin(x * .037) * 8);
      context.lineTo(x, horizonY + ridge);
    }
    context.lineTo(width + 12, height);
    context.closePath();
    context.fill();

    context.globalAlpha = .055;
    context.fillStyle = colorString(palette.ground);
    context.fillRect(0, Math.round(height * .84), width, Math.ceil(height * .16));

    context.globalAlpha = .075;
    context.fillStyle = colorString(palette.horizon);
    const skylineBase = Math.round(height * .82);
    for (let index = 0; index < 18; index += 1) {
      const buildingX = Math.round((index * width) / 17 + parallaxX * (index % 2 ? 1 : -1));
      const buildingWidth = 2 + (index * 7) % 5;
      const buildingHeight = 3 + (index * 11) % 13;
      context.fillRect(buildingX, skylineBase - buildingHeight, buildingWidth, buildingHeight);
    }
    context.globalAlpha = 1;
  }

  function drawRoute(palette) {
    const points = [
      [.04, .91], [.22, .86], [.43, .9], [.64, .84], [.82, .88], [.96, .82]
    ];
    const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = clamp(window.scrollY / documentHeight);

    context.save();
    context.globalAlpha = .17;
    context.strokeStyle = colorString(palette.route);
    context.lineWidth = 1;
    context.setLineDash([2, 3]);
    context.lineDashOffset = -Math.floor(elapsed * 2);
    context.beginPath();
    points.forEach(([x, y], index) => {
      const pointX = Math.round(x * width);
      const pointY = Math.round(y * height);
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    });
    context.stroke();

    points.forEach(([x, y]) => {
      context.fillStyle = colorString(palette.route);
      context.fillRect(Math.round(x * width) - 1, Math.round(y * height) - 1, 3, 3);
    });

    const scaled = progress * (points.length - 1);
    const pointIndex = Math.min(points.length - 2, Math.floor(scaled));
    const local = scaled - pointIndex;
    const from = points[pointIndex];
    const to = points[pointIndex + 1];
    const markerX = Math.round(mixNumber(from[0], to[0], local) * width);
    const markerY = Math.round(mixNumber(from[1], to[1], local) * height);
    context.globalAlpha = .62;
    context.fillStyle = colorString(palette.route);
    context.fillRect(markerX - 2, markerY - 2, 5, 5);
    context.fillStyle = colorString(palette.cloud);
    context.fillRect(markerX - 1, markerY - 1, 2, 2);
    context.restore();
  }

  function drawResearchMotif(alpha, palette) {
    if (alpha <= .01) return;
    const originX = Math.round(width * .87 + Math.sin(elapsed * .32) * 2);
    const originY = Math.round(height * .23);
    const nodes = [[0, 0], [-12, 10], [8, 17], [-18, 27]];

    context.save();
    context.globalAlpha = alpha * .18;
    context.strokeStyle = colorString(palette.route);
    context.setLineDash([1, 2]);
    context.beginPath();
    nodes.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(originX + x, originY + y);
      else context.lineTo(originX + x, originY + y);
    });
    context.stroke();
    nodes.forEach(([x, y], index) => {
      context.fillStyle = colorString(index % 2 ? palette.mote : palette.route);
      context.fillRect(originX + x - 1, originY + y - 1, 3, 3);
    });
    context.restore();
  }

  function drawSignalMotif(alpha, palette) {
    if (alpha <= .01) return;
    const x = Math.round(width * .12);
    const y = Math.round(height * .27);
    context.save();
    context.globalAlpha = alpha * .2;
    context.strokeStyle = colorString(palette.route);
    context.lineWidth = 1;
    for (let ring = 1; ring <= 3; ring += 1) {
      const pulse = (elapsed * 2 + ring * 4) % 10;
      context.beginPath();
      context.arc(x, y, ring * 4 + pulse, Math.PI * 1.15, Math.PI * 1.85);
      context.stroke();
    }
    context.fillStyle = colorString(palette.route);
    context.fillRect(x - 1, y - 1, 3, 3);
    context.restore();
  }

  function drawJourneyMotif(alpha, palette) {
    if (alpha <= .01) return;
    const x = Math.round(width * .88);
    const y = Math.round(height * .34 + Math.sin(elapsed * .3) * 2);
    context.save();
    context.globalAlpha = alpha * .18;
    context.fillStyle = colorString(palette.mote);
    context.fillRect(x - 10, y - 5, 20, 10);
    context.clearRect(x - 8, y - 3, 16, 6);
    context.fillStyle = colorString(palette.mote);
    context.fillRect(x - 1, y + 5, 2, 13);
    context.restore();
  }

  function draw(time) {
    if (!width || !height) return;
    pointerX += (pointerTargetX - pointerX) * .08;
    pointerY += (pointerTargetY - pointerY) * .08;

    const mood = currentMood();
    const from = worldPalettes[mood.fromKey];
    const to = worldPalettes[mood.toKey];
    const palette = {};
    Object.keys(from).forEach((key) => { palette[key] = mixColor(from[key], to[key], mood.amount); });

    context.globalAlpha = 1;
    context.fillStyle = colorString(palette.sky);
    context.fillRect(0, 0, width, height);

    const glowX = Math.round(width * (.78 + pointerX * .015));
    const glowY = Math.round(height * (.12 + pointerY * .01));
    context.globalAlpha = mood.fromKey === "journey" || mood.toKey === "journey" ? .08 : .16;
    context.fillStyle = colorString(palette.mote);
    context.fillRect(glowX - 6, glowY - 6, 13, 13);
    context.fillRect(glowX - 9, glowY - 3, 19, 7);
    context.globalAlpha = 1;

    clouds.forEach((cloud) => {
      const travel = (cloud.x * (width + 40) + elapsed * cloud.speed + pointerX * (cloud.layer + 1)) % (width + 40);
      drawCloud(travel - 20, cloud.y * height + pointerY * cloud.layer, cloud.size, palette.cloud, cloud.alpha);
    });

    drawHorizon(palette, time);

    motes.forEach((mote, index) => {
      const x = (mote.x * width + elapsed * mote.speed + Math.sin(elapsed * .45 + mote.phase) * mote.drift * 2 + width) % width;
      const verticalDirection = mood.fromKey === "journey" ? -1 : 1;
      const y = (mote.y * height + elapsed * mote.speed * .22 * verticalDirection + height) % height;
      const blink = .08 + Math.abs(Math.sin(elapsed * .65 + mote.phase)) * .16;
      context.globalAlpha = blink;
      context.fillStyle = colorString(index % 4 === 0 ? palette.route : palette.mote);
      context.fillRect(Math.round(x), Math.round(y), mote.size, mote.size);
    });
    context.globalAlpha = 1;

    const weights = { beijing: 0, research: 0, signal: 0, journey: 0, home: 0 };
    weights[mood.fromKey] += 1 - mood.amount;
    weights[mood.toKey] += mood.amount;
    drawResearchMotif(weights.research, palette);
    drawSignalMotif(weights.signal, palette);
    drawJourneyMotif(weights.journey, palette);
    drawRoute(palette);
  }

  function frame(now) {
    const delta = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (!motionState.paused && pageVisible) elapsed += delta / 1000;

    if (needsDraw || (!motionState.paused && pageVisible && now - lastDraw >= 90)) {
      draw(elapsed);
      lastDraw = now;
      needsDraw = false;
    }
    window.requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 100);
  });
  window.addEventListener("scroll", () => { needsDraw = true; }, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointerTargetX = event.clientX / Math.max(window.innerWidth, 1) - .5;
    pointerTargetY = event.clientY / Math.max(window.innerHeight, 1) - .5;
  }, { passive: true });
  window.addEventListener("motionchange", () => { needsDraw = true; });
  document.addEventListener("visibilitychange", () => {
    pageVisible = document.visibilityState !== "hidden";
    lastFrame = performance.now();
  });

  resize();
  draw(0);
  window.requestAnimationFrame(frame);
}

function setupSceneMotion() {
  const surfaces = [...document.querySelectorAll("[data-motion-scene]")];
  if (!surfaces.length) return;

  const instances = surfaces.map((surface, index) => {
    const canvas = surface.querySelector("[data-scene-motion]");
    const context = canvas?.getContext("2d");
    const random = createRandom(hashString(`${surface.dataset.motionScene}-${index}`));
    return {
      surface,
      canvas,
      context,
      visible: true,
      width: 0,
      height: 0,
      particles: Array.from({ length: 24 }, () => ({
        x: random(),
        y: random(),
        speed: .55 + random() * 1.2,
        phase: random() * Math.PI * 2,
        size: random() > .8 ? 2 : 1
      }))
    };
  }).filter((instance) => instance.canvas && instance.context);

  function resizeInstance(instance) {
    const bounds = instance.surface.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    const scale = window.innerWidth <= 600 ? 3 : 4;
    const width = Math.max(1, Math.ceil(bounds.width / scale));
    const height = Math.max(1, Math.ceil(bounds.height / scale));
    if (instance.canvas.width !== width || instance.canvas.height !== height) {
      instance.canvas.width = width;
      instance.canvas.height = height;
      instance.context.imageSmoothingEnabled = false;
      instance.width = width;
      instance.height = height;
    }
  }

  function drawCloud(context, width, y, time, color) {
    const x = Math.round((time * 1.2) % (width + 26)) - 24;
    context.fillStyle = color;
    context.fillRect(x, y, 18, 2);
    context.fillRect(x + 4, y - 2, 7, 2);
    context.fillRect(x + 12, y - 1, 9, 2);
  }

  function drawBeijing(instance, time) {
    const { context, width, height, particles } = instance;
    drawCloud(context, width, Math.round(height * .17), time, "rgba(255, 244, 211, .25)");
    particles.forEach((particle, index) => {
      const x = (particle.x * width + time * particle.speed * .9 + Math.sin(time + particle.phase) * 3) % width;
      const y = (particle.y * height + time * particle.speed * 1.8) % height;
      context.fillStyle = index % 3 === 0 ? "rgba(158, 79, 34, .72)" : "rgba(222, 163, 43, .72)";
      context.fillRect(Math.round(x), Math.round(y), particle.size + 1, particle.size);
    });
  }

  function drawSingapore(instance, time) {
    const { context, width, height, particles } = instance;
    drawCloud(context, width, Math.round(height * .13), time * .72, "rgba(248, 248, 221, .22)");
    particles.forEach((particle, index) => {
      const x = (particle.x * width + Math.sin(time * .55 + particle.phase) * 2 + width) % width;
      const y = (particle.y * height + time * particle.speed * .55) % height;
      context.fillStyle = index % 4 === 0 ? "rgba(244, 218, 104, .65)" : "rgba(220, 247, 220, .42)";
      context.fillRect(Math.round(x), Math.round(y), particle.size, particle.size + 1);
    });
  }

  function drawShenzhen(instance, time) {
    const { context, width, height, particles } = instance;
    particles.slice(0, 15).forEach((particle, index) => {
      const x = Math.round((.18 + particle.x * .68) * width);
      const y = Math.round((.2 + particle.y * .37) * height);
      const lit = Math.sin(time * (1.2 + particle.speed * .1) + particle.phase) > .22;
      if (!lit) return;
      context.fillStyle = index % 3 === 0 ? "rgba(255, 215, 108, .72)" : "rgba(176, 235, 224, .58)";
      context.fillRect(x, y, particle.size, particle.size);
    });
    particles.slice(15).forEach((particle) => {
      const x = Math.round((particle.x * width + time * particle.speed * 2) % width);
      const y = Math.round(height * (.73 + particle.y * .18));
      context.fillStyle = "rgba(214, 239, 224, .5)";
      context.fillRect(x, y, 4 + particle.size * 2, 1);
    });
    const boatX = Math.round((time * 2.4) % (width + 18)) - 12;
    const boatY = Math.round(height * .69);
    context.fillStyle = "rgba(30, 55, 57, .7)";
    context.fillRect(boatX, boatY, 8, 2);
    context.fillStyle = "rgba(240, 196, 91, .8)";
    context.fillRect(boatX + 4, boatY - 2, 1, 2);
  }

  function drawHangzhou(instance, time) {
    const { context, width, height, particles } = instance;
    particles.forEach((particle, index) => {
      if (index < 10) {
        const x = Math.round((particle.x * width + Math.sin(time * .7 + particle.phase) * 2 + width) % width);
        const y = Math.round((.28 + particle.y * .35) * height);
        const alpha = .25 + Math.abs(Math.sin(time * 1.4 + particle.phase)) * .55;
        context.fillStyle = `rgba(239, 210, 92, ${alpha})`;
        context.fillRect(x, y, particle.size, particle.size);
      } else {
        const x = Math.round((particle.x * width + time * particle.speed) % width);
        const y = Math.round(height * (.69 + particle.y * .2));
        context.fillStyle = "rgba(228, 239, 210, .4)";
        context.fillRect(x, y, 5 + particle.size * 2, 1);
      }
    });
  }

  function drawSuzhou(instance, time) {
    const { context, width, height, particles } = instance;
    particles.forEach((particle, index) => {
      const x = (particle.x * width + Math.sin(time * .5 + particle.phase) * 3 + width) % width;
      const y = (particle.y * height + time * particle.speed * 1.1) % height;
      context.fillStyle = index % 3 === 0 ? "rgba(236, 178, 174, .72)" : "rgba(250, 225, 207, .58)";
      context.fillRect(Math.round(x), Math.round(y), particle.size + 1, particle.size);
      if (index > 17) {
        const rippleY = Math.round(height * (.72 + particle.y * .18));
        context.fillStyle = "rgba(225, 240, 225, .34)";
        context.fillRect(Math.round((particle.x * width + time) % width), rippleY, 6, 1);
      }
    });
  }

  function drawInstance(instance, time) {
    resizeInstance(instance);
    if (!instance.width || !instance.height) return;
    const { context, width, height } = instance;
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "screen";

    const city = instance.surface.dataset.motionScene;
    if (city === "singapore") drawSingapore(instance, time);
    else if (city === "shenzhen") drawShenzhen(instance, time);
    else if (city === "hangzhou") drawHangzhou(instance, time);
    else if (city === "suzhou") drawSuzhou(instance, time);
    else drawBeijing(instance, time);

    context.globalCompositeOperation = "source-over";
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const instance = instances.find((candidate) => candidate.surface === entry.target);
        if (instance) {
          resizeInstance(instance);
          needsDraw = true;
        }
      });
    });
    instances.forEach((instance) => resizeObserver.observe(instance.surface));
  } else {
    window.addEventListener("resize", () => {
      instances.forEach(resizeInstance);
      needsDraw = true;
    });
  }

  if ("IntersectionObserver" in window) {
    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const instance = instances.find((candidate) => candidate.surface === entry.target);
        if (instance) instance.visible = entry.isIntersecting;
      });
    }, { rootMargin: "120px" });
    instances.forEach((instance) => visibilityObserver.observe(instance.surface));
  }

  let elapsed = 0;
  let lastFrame = performance.now();
  let lastDraw = 0;
  let needsDraw = true;
  function frame(now) {
    const delta = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (!motionState.paused && document.visibilityState !== "hidden") elapsed += delta / 1000;
    if (needsDraw || (!motionState.paused && now - lastDraw >= 50)) {
      instances.filter((instance) => instance.visible).forEach((instance) => drawInstance(instance, elapsed));
      lastDraw = now;
      needsDraw = false;
    }
    window.requestAnimationFrame(frame);
  }

  const sceneObserver = new MutationObserver(() => { needsDraw = true; });
  instances.forEach((instance) => {
    sceneObserver.observe(instance.surface, { attributes: true, attributeFilter: ["data-motion-scene"] });
  });
  window.addEventListener("motionchange", () => { needsDraw = true; });

  instances.forEach((instance) => {
    resizeInstance(instance);
    drawInstance(instance, 0);
  });
  window.requestAnimationFrame(frame);
}

function setupRevealMotion() {
  const revealGroups = [
    [".hero-copy", "reveal-left"],
    [".city-player", "reveal-right"],
    [".section-heading", ""],
    [".publication-image", "reveal-left"],
    [".publication-copy", "reveal-right"],
    [".talk-row", ""],
    [".journey-stage", "reveal-left"],
    [".journey-item", "reveal-right"],
    [".site-footer", ""]
  ];
  const elements = [];

  revealGroups.forEach(([selector, direction]) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.classList.add("motion-reveal");
      if (direction) element.classList.add(direction);
      element.style.setProperty("--reveal-delay", `${Math.min(index * 55, 165)}ms`);
      elements.push(element);
    });
  });

  document.documentElement.classList.add("motion-enhanced");
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: .08 });

  elements.forEach((element) => observer.observe(element));
}

document.getElementById("year").textContent = new Date().getFullYear();
setupMotionPreference();
setupCityPlayer();
setupJourney();
setupNavigation();
setupStarCounts();
preloadJourneyScenes();
setupWorldBackground();
setupSceneMotion();
setupRevealMotion();
