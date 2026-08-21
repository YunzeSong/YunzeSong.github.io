const { cities } = window.siteLocation;

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

function setupJourney() {
  const items = [...document.querySelectorAll("[data-journey-scene]")];
  const section = document.querySelector(".journey-section");
  const viewport = document.querySelector("[data-journey-viewport]");
  const list = document.querySelector(".journey-list");
  if (!items.length || !section || !viewport || !list) return null;

  let activeIndex = -1;
  let progress = 0;
  let shiftPoints = [];
  let resizeFrame = 0;

  function activate(index) {
    const nextIndex = clamp(Math.round(index), 0, items.length - 1);
    if (nextIndex === activeIndex) return;
    activeIndex = nextIndex;
    items.forEach((entry, entryIndex) => {
      const isActive = entryIndex === nextIndex;
      entry.classList.toggle("is-active", isActive);
      entry.toggleAttribute("aria-current", isActive);
    });
  }

  function calculateShiftPoints() {
    const viewportCenter = viewport.clientWidth / 2;
    shiftPoints = items.map((item) => viewportCenter - item.offsetLeft - item.offsetWidth / 2);
  }

  function render() {
    if (!shiftPoints.length) calculateShiftPoints();
    const lowerIndex = Math.floor(progress);
    const upperIndex = Math.min(items.length - 1, Math.ceil(progress));
    const localProgress = progress - lowerIndex;
    const lowerShift = shiftPoints[lowerIndex] || 0;
    const upperShift = shiftPoints[upperIndex] ?? lowerShift;
    const shift = lowerShift + (upperShift - lowerShift) * localProgress;

    list.style.setProperty("--journey-shift", `${Math.round(shift)}px`);
    section.style.setProperty("--journey-progress", String(items.length > 1 ? progress / (items.length - 1) : 1));
    activate(progress);
  }

  function setProgress(nextProgress) {
    progress = clamp(nextProgress, 0, items.length - 1);
    render();
  }

  function refresh() {
    calculateShiftPoints();
    render();
  }

  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(refresh);
  });

  activate(0);
  window.requestAnimationFrame(refresh);
  return {
    length: items.length,
    setProgress,
    setIndex: (index) => setProgress(index),
    refresh
  };
}

function setupPublicationPages() {
  const pages = [...document.querySelectorAll("[data-publication-page]")];
  if (!pages.length) return null;
  let activeIndex = -1;

  function setIndex(index) {
    const nextIndex = clamp(Math.round(index), 0, pages.length - 1);
    if (nextIndex === activeIndex) return;
    activeIndex = nextIndex;
    pages.forEach((page, pageIndex) => {
      page.classList.toggle("is-active", pageIndex === nextIndex);
    });
  }

  setIndex(0);
  return { length: pages.length, setIndex };
}

function setupNavigation() {
  const links = [...document.querySelectorAll(".section-nav a[href^='#']")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const listeners = new AbortController();
  let observer = null;

  if (!("IntersectionObserver" in window) || !sections.length) {
    return { destroy: () => listeners.abort() };
  }

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

  observer = new IntersectionObserver((entries) => {
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
  window.addEventListener("scroll", updatePageEnd, { passive: true, signal: listeners.signal });
  window.addEventListener("resize", updatePageEnd, { signal: listeners.signal });
  requestAnimationFrame(updatePageEnd);

  return {
    destroy() {
      observer?.disconnect();
      listeners.abort();
    }
  };
}

function setupAcademicDeck(journeyController, publicationController, options = {}) {
  const deck = document.querySelector(".academic-deck");
  const stage = document.querySelector(".academic-stage");
  const track = document.querySelector(".academic-scroll-track");
  const header = document.querySelector(".site-header");
  const panels = [...document.querySelectorAll("[data-scene-panel]")];
  const navigationLinks = [...document.querySelectorAll(".section-nav a[href^='#']")];

  if (!deck || !stage || !track || !panels.length || !journeyController || !publicationController) return null;

  const journeyLength = journeyController.length;
  const publicationLength = publicationController.length;
  const steps = [
    { scene: "top", journeyIndex: 0, publicationIndex: 0 },
    ...Array.from({ length: publicationLength }, (_, publicationIndex) => ({ scene: "publications", journeyIndex: 0, publicationIndex })),
    { scene: "talks", journeyIndex: 0, publicationIndex: publicationLength - 1 },
    ...Array.from({ length: journeyLength }, (_, journeyIndex) => ({ scene: "journey", journeyIndex, publicationIndex: publicationLength - 1 })),
    { scene: "contact", journeyIndex: journeyLength - 1, publicationIndex: publicationLength - 1 }
  ];
  const firstStepForScene = new Map();
  steps.forEach((step, index) => {
    if (!firstStepForScene.has(step.scene)) firstStepForScene.set(step.scene, index);
  });
  const panelsByName = new Map(panels.map((panel) => [panel.dataset.scenePanel, panel]));

  track.replaceChildren(...steps.map((step, index) => {
    const marker = document.createElement("div");
    marker.className = "academic-scroll-step";
    marker.dataset.stepIndex = String(index);
    marker.dataset.stepScene = step.scene;
    return marker;
  }));
  const markers = [...track.children];

  let stageHeight = 1;
  let deckStart = 0;
  let currentStep = 0;
  let requestedStep = 0;
  let displayedScene = "top";
  let transitionRunning = false;
  let scrollFrame = 0;
  let resizeFrame = 0;
  let ignoreScrollUntil = 0;
  let wheelDelta = 0;
  let wheelGestureActive = false;
  let wheelReleaseTimer = 0;
  let destroyed = false;
  const listeners = new AbortController();
  const pendingAnimationFinishes = new Set();

  const animationFinished = (element, fallback = 520) => {
    if (reducedMotion.matches) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      let fallbackTimer = 0;
      const finish = (event) => {
        if (event && event.target !== element) return;
        if (settled) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
        element.removeEventListener("animationend", finish);
        pendingAnimationFinishes.delete(finish);
        resolve();
      };
      pendingAnimationFinishes.add(finish);
      element.addEventListener("animationend", finish, { once: true });
      fallbackTimer = window.setTimeout(finish, fallback);
    });
  };

  function setNavigation(scene) {
    const hash = `#${scene}`;
    navigationLinks.forEach((link) => {
      link.classList.toggle("is-current", scene !== "top" && link.getAttribute("href") === hash);
    });
  }

  function setPanelImmediately(scene) {
    panels.forEach((panel) => {
      const isActive = panel.dataset.scenePanel === scene;
      panel.classList.toggle("is-active", isActive);
      panel.classList.remove("is-entering", "is-leaving");
      panel.toggleAttribute("aria-hidden", !isActive);
      panel.inert = !isActive;
    });
    displayedScene = scene;
    setNavigation(scene);
  }

  async function transitionToScene(scene, direction) {
    if (destroyed || scene === displayedScene || !panelsByName.has(scene)) return;
    const outgoing = panelsByName.get(displayedScene);
    const incoming = panelsByName.get(scene);
    stage.dataset.sceneDirection = direction;

    outgoing.classList.remove("is-active", "is-entering");
    outgoing.classList.add("is-leaving");
    await animationFinished(outgoing, 360);
    if (destroyed) return;
    outgoing.classList.remove("is-leaving");
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.inert = true;

    incoming.removeAttribute("aria-hidden");
    incoming.inert = false;
    incoming.classList.add("is-entering");
    await animationFinished(incoming, 470);
    if (destroyed) return;
    incoming.classList.remove("is-entering");
    incoming.classList.add("is-active");
    displayedScene = scene;
    setNavigation(scene);
    delete stage.dataset.sceneDirection;
  }

  async function flushRequestedStep() {
    if (destroyed || transitionRunning) return;
    transitionRunning = true;

    while (!destroyed && (currentStep !== requestedStep || steps[currentStep].scene !== displayedScene)) {
      const nextStep = requestedStep;
      const direction = nextStep >= currentStep ? "forward" : "backward";
      const nextScene = steps[nextStep].scene;
      await transitionToScene(nextScene, direction);
      currentStep = nextStep;
    }

    transitionRunning = false;
  }

  function requestStep(index) {
    if (destroyed) return;
    requestedStep = clamp(index, 0, steps.length - 1);
    flushRequestedStep();
  }

  function measure() {
    const headerHeight = header?.offsetHeight || 68;
    stageHeight = Math.max(520, window.innerHeight - headerHeight);
    document.documentElement.style.setProperty("--academic-header-height", `${headerHeight}px`);
    document.documentElement.style.setProperty("--academic-stage-height", `${stageHeight}px`);
    deckStart = deck.getBoundingClientRect().top + window.scrollY - headerHeight;
    journeyController.refresh();
  }

  function updateFromScroll() {
    scrollFrame = 0;
    if (destroyed || performance.now() < ignoreScrollUntil) return;
    const rawStep = clamp((window.scrollY - deckStart) / stageHeight, 0, steps.length - 1);
    const publicationsStart = firstStepForScene.get("publications");
    const journeyStart = firstStepForScene.get("journey");
    publicationController.setIndex(clamp(rawStep - publicationsStart, 0, publicationLength - 1));
    journeyController.setProgress(clamp(rawStep - journeyStart, 0, journeyLength - 1));
    requestStep(Math.round(rawStep));
  }

  function queueScrollUpdate() {
    if (destroyed || scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateFromScroll);
  }

  function scrollToStep(index, smooth = true) {
    const marker = markers[clamp(index, 0, markers.length - 1)];
    const headerHeight = header?.offsetHeight || 68;
    const top = marker.getBoundingClientRect().top + window.scrollY - headerHeight;
    if (smooth && !reducedMotion.matches) {
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }

    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo({ top, behavior: "auto" });
    window.requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    });
  }

  function jumpToStep(index) {
    if (destroyed) return;
    const targetIndex = clamp(Math.round(index), 0, steps.length - 1);
    const target = steps[targetIndex];
    ignoreScrollUntil = performance.now() + 1000;
    requestedStep = targetIndex;
    publicationController.setIndex(target.publicationIndex);
    journeyController.setIndex(target.journeyIndex);
    scrollToStep(targetIndex, false);
    flushRequestedStep();
  }

  function handleWheel(event) {
    if (destroyed || event.ctrlKey) return;
    event.preventDefault();

    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? stageHeight
        : 1;
    const delta = event.deltaY * multiplier;
    window.clearTimeout(wheelReleaseTimer);
    wheelReleaseTimer = window.setTimeout(() => {
      wheelDelta = 0;
      wheelGestureActive = false;
    }, 150);

    if (wheelGestureActive) return;
    wheelDelta += delta;
    if (Math.abs(wheelDelta) < 18) return;

    const direction = wheelDelta > 0 ? 1 : -1;
    wheelDelta = 0;
    wheelGestureActive = true;
    jumpToStep(requestedStep + direction);
  }

  function handleKeydown(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const tagName = event.target?.tagName;
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
    const forward = ["ArrowDown", "PageDown", " "];
    const backward = ["ArrowUp", "PageUp"];
    if (!forward.includes(event.key) && !backward.includes(event.key)) return;
    event.preventDefault();
    jumpToStep(requestedStep + (forward.includes(event.key) ? 1 : -1));
  }

  navigationLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const scene = link.getAttribute("href").slice(1);
      const index = firstStepForScene.get(scene);
      if (index === undefined) return;
      event.preventDefault();
      history.pushState(null, "", `#${scene}`);
      jumpToStep(index);
    }, { signal: listeners.signal });
  });

  window.addEventListener("scroll", queueScrollUpdate, { passive: true, signal: listeners.signal });
  window.addEventListener("wheel", handleWheel, { passive: false, signal: listeners.signal });
  window.addEventListener("keydown", handleKeydown, { signal: listeners.signal });
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      measure();
      updateFromScroll();
    });
  }, { signal: listeners.signal });

  document.documentElement.classList.add("scene-enhanced");
  measure();
  const requestedScene = options.initialScene || window.location.hash.slice(1);
  const initialIndex = firstStepForScene.get(requestedScene) ?? 0;
  const initialStep = steps[initialIndex];
  currentStep = initialIndex;
  requestedStep = initialIndex;
  publicationController.setIndex(initialStep.publicationIndex);
  journeyController.setIndex(initialStep.journeyIndex);
  setPanelImmediately(initialStep.scene);
  window.requestAnimationFrame(() => scrollToStep(initialIndex, false));
  window.addEventListener("load", () => scrollToStep(initialIndex, false), {
    once: true,
    signal: listeners.signal
  });

  return {
    getScene: () => steps[requestedStep]?.scene || displayedScene,
    destroy() {
      const targetScene = steps[requestedStep]?.scene || displayedScene;
      if (destroyed) return targetScene;
      destroyed = true;
      listeners.abort();
      window.cancelAnimationFrame(scrollFrame);
      window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(wheelReleaseTimer);
      pendingAnimationFinishes.forEach((finish) => finish());
      pendingAnimationFinishes.clear();
      document.documentElement.classList.remove("scene-enhanced");
      document.documentElement.style.removeProperty("--academic-header-height");
      document.documentElement.style.removeProperty("--academic-stage-height");
      stage.removeAttribute("data-scene-direction");
      track.replaceChildren();
      panels.forEach((panel) => {
        panel.classList.remove("is-active", "is-entering", "is-leaving");
        panel.removeAttribute("aria-hidden");
        panel.inert = false;
      });
      return targetScene;
    }
  };
}

function getClosestAcademicScene() {
  const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
  const panels = [...document.querySelectorAll("[data-scene-panel]")];
  let closestScene = window.location.hash.slice(1) || "top";
  let bestDistance = Number.POSITIVE_INFINITY;

  panels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    const distance = Math.abs(rect.top - headerHeight);
    if (distance >= bestDistance) return;
    bestDistance = distance;
    closestScene = panel.dataset.scenePanel;
  });

  return closestScene;
}

function setupAcademicExperience(journeyController, publicationController) {
  const desktopScene = window.matchMedia("(min-width: 1024px) and (min-height: 700px) and (hover: hover)");
  let deckController = null;
  let navigationController = null;
  let revealController = null;
  let initialized = false;
  let switchFrame = 0;

  const startFlowLayout = (sceneToKeep = null) => {
    const previousScene = deckController?.destroy() || sceneToKeep;
    deckController = null;
    navigationController?.destroy();
    revealController?.destroy();
    navigationController = setupNavigation();
    revealController = setupRevealMotion();

    if (previousScene) {
      window.requestAnimationFrame(() => {
        document.getElementById(previousScene)?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  };

  const startDeckLayout = () => {
    const currentScene = initialized
      ? getClosestAcademicScene()
      : window.location.hash.slice(1) || "top";
    navigationController?.destroy();
    revealController?.destroy();
    navigationController = null;
    revealController = null;
    deckController?.destroy();
    deckController = setupAcademicDeck(journeyController, publicationController, { initialScene: currentScene });
  };

  const syncLayout = () => {
    window.cancelAnimationFrame(switchFrame);
    switchFrame = window.requestAnimationFrame(() => {
      if (desktopScene.matches) {
        if (!deckController) startDeckLayout();
      } else if (deckController || !initialized) {
        startFlowLayout();
      }
      initialized = true;
    });
  };

  if (typeof desktopScene.addEventListener === "function") {
    desktopScene.addEventListener("change", syncLayout);
  } else if (typeof desktopScene.addListener === "function") {
    desktopScene.addListener(syncLayout);
  }
  syncLayout();
}

function setupPublicationMetrics() {
  const numberFormatter = new Intl.NumberFormat("en-US");
  const repositories = [...document.querySelectorAll("[data-repo]")];
  const papers = [...document.querySelectorAll("[data-scholar-paper]")];
  const refreshInterval = 10 * 60 * 1000;
  let lastRefresh = 0;
  let refreshInProgress = false;

  const setLoading = (element) => {
    element.classList.remove("is-live", "is-unavailable");
    element.classList.add("is-loading");
    element.setAttribute("aria-busy", "true");
  };

  const setLiveValue = (element, outputSelector, value, source, sourceUpdatedAt = null) => {
    const output = element.querySelector(outputSelector);
    if (!output || !Number.isFinite(value)) throw new TypeError(`Invalid ${source} metric`);
    output.textContent = numberFormatter.format(value);
    element.classList.remove("is-loading", "is-unavailable");
    element.classList.add("is-live");
    element.removeAttribute("aria-busy");
    const updatedAt = sourceUpdatedAt
      ? new Date(sourceUpdatedAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
      : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    element.title = `${source} · updated ${updatedAt}`;
  };

  const setUnavailable = (element, outputSelector, source) => {
    const output = element.querySelector(outputSelector);
    if (output) output.textContent = "—";
    element.classList.remove("is-loading", "is-live");
    element.classList.add("is-unavailable");
    element.removeAttribute("aria-busy");
    element.title = `${source} live data is temporarily unavailable`;
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...options.headers
      }
    });
    if (!response.ok) throw new Error(`Metric request failed with ${response.status}`);
    return response.json();
  };

  const refreshRepository = async (element) => {
    setLoading(element);
    try {
      const repository = await fetchJson(`https://api.github.com/repos/${element.dataset.repo}?_=${Date.now()}`, {
        headers: { Accept: "application/vnd.github+json" }
      });
      setLiveValue(element, "[data-star-count]", repository.stargazers_count, "GitHub");
    } catch {
      setUnavailable(element, "[data-star-count]", "GitHub");
    }
  };

  const refreshScholarPapers = async () => {
    papers.forEach(setLoading);
    try {
      const scholarData = await fetchJson(`./assets/scholar-metrics.json?_=${Date.now()}`);
      papers.forEach((element) => {
        const paper = scholarData.papers?.[element.dataset.scholarPaper];
        setLiveValue(element, "[data-citation-count]", paper?.citations, "Google Scholar", scholarData.updatedAt);
      });
    } catch {
      papers.forEach((element) => setUnavailable(element, "[data-citation-count]", "Google Scholar"));
    }
  };

  const refreshAll = async () => {
    if (refreshInProgress || document.hidden) return;
    refreshInProgress = true;
    await Promise.all([
      ...repositories.map(refreshRepository),
      refreshScholarPapers()
    ]);
    lastRefresh = Date.now();
    refreshInProgress = false;
  };

  refreshAll();
  window.setInterval(refreshAll, refreshInterval);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastRefresh >= refreshInterval) refreshAll();
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

const rlWorldPalette = {
  paper: [245, 240, 229],
  paperAlt: [237, 232, 220],
  ink: [29, 40, 36],
  grid: [102, 118, 109],
  wall: [39, 90, 74],
  agent: [23, 55, 47],
  trail: [109, 143, 161],
  reward: [214, 168, 77],
  hazard: [167, 70, 57],
  light: [255, 250, 236]
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function colorString(color, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
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
  if (!canvas || !context) return;

  let columns = 19;
  let rows = 14;
  let start = { x: 2, y: 11 };
  let goal = { x: 16, y: 2 };
  const actions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];
  let wallCells = [];
  let hazardCells = [];
  let checkpointCells = [];
  let walls = new Set();
  let hazards = new Set();
  let checkpointBits = new Map();
  const qValues = new Map();
  const random = createRandom(97277);

  let pixelSize = 4;
  let width = 1;
  let height = 1;
  let cellSize = 12;
  let originX = 0;
  let originY = 0;
  let elapsed = 0;
  let lastFrame = performance.now();
  let lastDraw = 0;
  let needsDraw = true;
  let pageVisible = document.visibilityState !== "hidden";
  let pointerCanvasX = -1;
  let pointerCanvasY = -1;
  let hoveredCell = null;
  let agent = { ...start };
  let checkpointMask = 0;
  let lastAction = 1;
  let trail = [{ ...start }];
  let episode = 1;
  let successes = 0;
  let episodeSteps = 0;
  let nextStepAt = .6;
  let pendingReset = false;
  let statusMessage = "";
  let statusUntil = 0;

  function buildWorld(nextColumns, nextRows) {
    columns = nextColumns;
    rows = nextRows;
    start = { x: 2, y: rows - 3 };
    goal = { x: columns - 3, y: 2 };

    const wallKeys = new Set();
    const addWall = (x, y) => {
      const cell = { x, y };
      const inside = x > 0 && x < columns - 1 && y >= 0 && y < rows;
      if (!inside || isGoal(cell) || (x === start.x && y === start.y)) return;
      wallKeys.add(`${x},${y}`);
    };
    const addVertical = (x, fromY, toY) => {
      for (let y = fromY; y <= toY; y += 1) addWall(x, y);
    };
    const addHorizontal = (y, fromX, toX) => {
      for (let x = fromX; x <= toX; x += 1) addWall(x, y);
    };

    const firstX = Math.round(columns * .22);
    const secondX = Math.round(columns * .38);
    const thirdX = Math.round(columns * .69);
    const fourthX = Math.round(columns * .86);
    addVertical(firstX, 0, Math.floor(rows * .28));
    addVertical(firstX, Math.ceil(rows * .62), rows - 3);
    addHorizontal(Math.round(rows * .27), Math.round(columns * .37), Math.round(columns * .58));
    addVertical(secondX, Math.round(rows * .54), rows - 1);
    addHorizontal(Math.round(rows * .49), Math.round(columns * .52), Math.round(columns * .81));
    addVertical(thirdX, 0, Math.floor(rows * .3));
    addVertical(fourthX, Math.round(rows * .64), rows - 2);
    addHorizontal(Math.round(rows * .76), Math.round(columns * .53), Math.round(columns * .68));

    wallCells = [...wallKeys].map((key) => key.split(",").map(Number));
    walls = new Set(wallKeys);

    const checkpointCandidates = [
      [Math.round(columns * .3), rows - 5],
      [Math.round(columns * .48), Math.round(rows * .43)],
      [Math.round(columns * .76), Math.round(rows * .36)]
    ];
    checkpointCells = checkpointCandidates.filter(([x, y], index, entries) => {
      const key = `${x},${y}`;
      const cell = { x, y };
      return !walls.has(key)
        && !isGoal(cell)
        && !(x === start.x && y === start.y)
        && entries.findIndex(([entryX, entryY]) => entryX === x && entryY === y) === index;
    });
    checkpointBits = new Map(checkpointCells.map(([x, y], index) => [`${x},${y}`, 1 << index]));

    const hazardCandidates = [
      [Math.round(columns * .14), Math.round(rows * .34)],
      [Math.round(columns * .52), Math.round(rows * .6)],
      [Math.round(columns * .74), Math.round(rows * .68)]
    ];
    hazardCells = hazardCandidates.filter(([x, y]) => {
      const cell = { x, y };
      const key = cellKey(cell);
      return !walls.has(key)
        && !checkpointBits.has(key)
        && !isGoal(cell)
        && !(x === start.x && y === start.y);
    });
    hazards = new Set(hazardCells.map(([x, y]) => `${x},${y}`));

    qValues.clear();
    agent = { ...start };
    checkpointMask = 0;
    trail = [{ ...start }];
    episode = 1;
    successes = 0;
    episodeSteps = 0;
    pendingReset = false;
    statusMessage = "";
    nextStepAt = elapsed + .5;
    pretrain();
  }

  function cellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function valuesFor(cell, mask = checkpointMask) {
    const key = `${cellKey(cell)}|${mask}`;
    if (!qValues.has(key)) qValues.set(key, [0, 0, 0, 0]);
    return qValues.get(key);
  }

  function isGoal(cell) {
    return cell.x === goal.x && cell.y === goal.y;
  }

  function pageProgress() {
    const documentHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    return clamp(window.scrollY / documentHeight);
  }

  function explorationRate() {
    const learnedRate = .08 + .3 * Math.exp(-(episode - 1) * .075);
    return clamp(learnedRate - pageProgress() * .045, .04, .38);
  }

  function transition(cell, actionIndex, mask) {
    const direction = actions[actionIndex];
    const candidate = { x: cell.x + direction.x, y: cell.y + direction.y };
    const outside = candidate.x <= 0 || candidate.x >= columns - 1 || candidate.y < 0 || candidate.y >= rows;
    if (outside || walls.has(cellKey(candidate))) {
      return { next: { ...cell }, reward: -.22, done: false, checkpointMask: mask, checkpointBit: 0 };
    }
    if (hazards.has(cellKey(candidate))) {
      return { next: candidate, reward: -1, done: true, checkpointMask: mask, checkpointBit: 0 };
    }
    if (isGoal(candidate)) {
      return { next: candidate, reward: 1, done: true, checkpointMask: mask, checkpointBit: 0 };
    }
    const checkpointBit = checkpointBits.get(cellKey(candidate)) || 0;
    const collectedNow = checkpointBit && !(mask & checkpointBit);
    return {
      next: candidate,
      reward: collectedNow ? .2 : -.018,
      done: false,
      checkpointMask: mask | checkpointBit,
      checkpointBit: collectedNow ? checkpointBit : 0
    };
  }

  function chooseAction(cell, exploration, mask) {
    if (random() < exploration) return Math.floor(random() * actions.length);
    const values = valuesFor(cell, mask);
    const bestValue = Math.max(...values);
    const bestActions = values
      .map((value, index) => ({ value, index }))
      .filter((entry) => Math.abs(entry.value - bestValue) < .0001);
    return bestActions[Math.floor(random() * bestActions.length)].index;
  }

  function learn(cell, exploration, mask = checkpointMask) {
    const actionIndex = chooseAction(cell, exploration, mask);
    const result = transition(cell, actionIndex, mask);
    const values = valuesFor(cell, mask);
    const nextBest = result.done ? 0 : Math.max(...valuesFor(result.next, result.checkpointMask));
    const target = result.reward + .93 * nextBest;
    values[actionIndex] += .32 * (target - values[actionIndex]);
    return { ...result, actionIndex };
  }

  function pretrain() {
    for (let trainingEpisode = 0; trainingEpisode < 960; trainingEpisode += 1) {
      let state = { ...start };
      let trainingCheckpointMask = 0;
      const exploration = Math.max(.06, .84 * Math.exp(-trainingEpisode / 185));
      for (let step = 0; step < 210; step += 1) {
        const result = learn(state, exploration, trainingCheckpointMask);
        state = result.next;
        trainingCheckpointMask = result.checkpointMask;
        if (result.done) break;
      }
    }
  }

  function updateHoveredCell() {
    const x = Math.floor((pointerCanvasX - originX) / cellSize);
    const y = Math.floor((pointerCanvasY - originY) / cellSize);
    const inWorld = x >= 0 && x < columns && y >= 0 && y < rows;
    hoveredCell = inWorld && !walls.has(`${x},${y}`) ? { x, y } : null;
  }

  function resize() {
    pixelSize = window.innerWidth <= 600 ? 4 : 5;
    width = Math.max(1, Math.ceil(window.innerWidth / pixelSize));
    height = Math.max(1, Math.ceil(window.innerHeight / pixelSize));
    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingEnabled = false;
    const nextColumns = window.innerWidth <= 600
      ? clamp(Math.ceil(width / 13) + 2, 9, 13)
      : window.innerWidth <= 940
        ? 15
        : clamp(Math.ceil(width / 16) + 1, 19, 21);
    const nextCellSize = Math.max(8, Math.ceil(width / (nextColumns - 1)));
    const nextRows = Math.max(10, Math.ceil(height / nextCellSize) + 1);
    const worldChanged = nextColumns !== columns || nextRows !== rows;
    cellSize = nextCellSize;
    originX = -Math.floor(cellSize * 1.5);
    originY = -Math.floor(cellSize / 2);
    if (worldChanged || !wallCells.length) buildWorld(nextColumns, nextRows);
    updateHoveredCell();
    needsDraw = true;
  }

  function cellCenter(cell) {
    return {
      x: originX + cell.x * cellSize + Math.floor(cellSize / 2),
      y: originY + cell.y * cellSize + Math.floor(cellSize / 2)
    };
  }

  function drawArrow(centerX, centerY, actionIndex, alpha, color = rlWorldPalette.wall) {
    const direction = actions[actionIndex];
    const endX = centerX + direction.x * 3;
    const endY = centerY + direction.y * 3;
    context.globalAlpha = alpha;
    context.fillStyle = colorString(color);
    if (direction.x === 0) {
      context.fillRect(centerX, Math.min(centerY, endY), 1, Math.abs(endY - centerY) + 1);
      context.fillRect(endX - 1, endY + (direction.y > 0 ? -1 : 1), 3, 1);
    } else {
      context.fillRect(Math.min(centerX, endX), centerY, Math.abs(endX - centerX) + 1, 1);
      context.fillRect(endX + (direction.x > 0 ? -1 : 1), endY - 1, 1, 3);
    }
    context.globalAlpha = 1;
  }

  function drawGrid() {
    context.fillStyle = colorString(rlWorldPalette.paper);
    context.fillRect(0, 0, width, height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if ((x + y) % 2 === 0) {
          context.globalAlpha = .06;
          context.fillStyle = colorString(rlWorldPalette.paperAlt);
          context.fillRect(originX + x * cellSize + 1, originY + y * cellSize + 1, cellSize - 1, cellSize - 1);
        }
      }
    }

    context.globalAlpha = .065;
    context.strokeStyle = colorString(rlWorldPalette.grid);
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= columns; x += 1) {
      const lineX = originX + x * cellSize + .5;
      context.moveTo(lineX, originY);
      context.lineTo(lineX, originY + rows * cellSize);
    }
    for (let y = 0; y <= rows; y += 1) {
      const lineY = originY + y * cellSize + .5;
      context.moveTo(originX, lineY);
      context.lineTo(originX + columns * cellSize, lineY);
    }
    context.stroke();

    context.globalAlpha = 1;
  }

  function drawWalls() {
    wallCells.forEach(([x, y], index) => {
      const left = originX + x * cellSize;
      const top = originY + y * cellSize;
      context.globalAlpha = .055;
      context.fillStyle = colorString(rlWorldPalette.wall);
      context.fillRect(left + 2, top + 2, cellSize - 3, cellSize - 3);
      context.globalAlpha = .1;
      context.fillRect(left + 2, top + 2, cellSize - 3, 1);
      context.fillRect(left + 2, top + cellSize - 2, cellSize - 3, 1);
      if (index % 2 === 0) context.fillRect(left + Math.floor(cellSize / 2), top + 3, 1, cellSize - 5);
    });
    context.globalAlpha = 1;
  }

  function drawPolicy() {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const cell = { x, y };
        if (walls.has(cellKey(cell)) || hazards.has(cellKey(cell)) || isGoal(cell)) continue;
        if ((x + y * 2) % 3 !== 0) continue;
        const values = valuesFor(cell);
        const bestAction = values.indexOf(Math.max(...values));
        const center = cellCenter(cell);
        drawArrow(center.x, center.y, bestAction, .03);
      }
    }

    if (!hoveredCell) return;
    const center = cellCenter(hoveredCell);
    const values = valuesFor(hoveredCell);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = Math.max(maximum - minimum, .001);
    context.globalAlpha = .11;
    context.fillStyle = colorString(rlWorldPalette.trail);
    context.fillRect(
      originX + hoveredCell.x * cellSize + 1,
      originY + hoveredCell.y * cellSize + 1,
      cellSize - 1,
      cellSize - 1
    );
    values.forEach((value, actionIndex) => {
      const strength = (value - minimum) / range;
      const isBest = actionIndex === values.indexOf(maximum);
      drawArrow(center.x, center.y, actionIndex, .18 + strength * .48, isBest ? rlWorldPalette.wall : rlWorldPalette.trail);
    });
    context.globalAlpha = 1;
  }

  function drawHazards(time) {
    const pulse = .16 + Math.floor(time * 3) % 2 * .07;
    hazardCells.forEach(([x, y]) => {
      const center = cellCenter({ x, y });
      context.globalAlpha = pulse;
      context.fillStyle = colorString(rlWorldPalette.hazard);
      context.fillRect(center.x - 3, center.y - 1, 7, 2);
      context.fillRect(center.x - 1, center.y - 3, 2, 7);
      context.fillRect(center.x - 2, center.y - 2, 1, 1);
      context.fillRect(center.x + 2, center.y - 2, 1, 1);
      context.fillRect(center.x - 2, center.y + 2, 1, 1);
      context.fillRect(center.x + 2, center.y + 2, 1, 1);
    });
    context.globalAlpha = 1;
  }

  function drawCheckpoints(time) {
    const pulse = .34 + Math.floor(time * 4) % 2 * .12;
    checkpointCells.forEach(([x, y]) => {
      const bit = checkpointBits.get(`${x},${y}`) || 0;
      if (checkpointMask & bit) return;
      const center = cellCenter({ x, y });
      context.globalAlpha = pulse;
      context.fillStyle = colorString(rlWorldPalette.reward);
      context.fillRect(center.x, center.y - 3, 1, 1);
      context.fillRect(center.x - 1, center.y - 2, 3, 1);
      context.fillRect(center.x - 2, center.y - 1, 5, 3);
      context.fillRect(center.x - 1, center.y + 2, 3, 1);
      context.fillRect(center.x, center.y + 3, 1, 1);
      context.globalAlpha = .78;
      context.fillStyle = colorString(rlWorldPalette.light);
      context.fillRect(center.x, center.y, 1, 1);
    });
    context.globalAlpha = 1;
  }

  function drawGoal(time) {
    const center = cellCenter(goal);
    const ring = 7 + Math.floor(time * 2) % 3;
    context.globalAlpha = .1;
    context.strokeStyle = colorString(rlWorldPalette.reward);
    context.strokeRect(center.x - ring, center.y - ring, ring * 2, ring * 2);
    context.globalAlpha = .64;
    context.fillStyle = colorString(rlWorldPalette.reward);
    context.fillRect(center.x - 3, center.y - 5, 7, 11);
    context.fillRect(center.x - 6, center.y - 2, 13, 5);
    context.globalAlpha = .9;
    context.fillStyle = colorString(rlWorldPalette.light);
    context.fillRect(center.x - 1, center.y - 1, 3, 3);
    context.globalAlpha = 1;
  }

  function drawTrail() {
    trail.forEach((cell, index) => {
      const center = cellCenter(cell);
      context.globalAlpha = cell.rewarded ? .32 : .02 + index / Math.max(1, trail.length) * .12;
      context.fillStyle = colorString(cell.rewarded ? rlWorldPalette.reward : rlWorldPalette.trail);
      context.fillRect(center.x - 1, center.y - 1, 3, 3);
    });
    context.globalAlpha = 1;
  }

  function drawAgent(time) {
    const center = cellCenter(agent);
    const footOffset = Math.floor(time * 5) % 2;
    context.globalAlpha = .74;
    context.fillStyle = colorString(rlWorldPalette.agent);
    context.fillRect(center.x - 3, center.y - 3, 7, 6);
    context.fillRect(center.x - 2, center.y - 5, 5, 2);
    context.fillRect(center.x - 4, center.y - 1, 1, 3);
    context.fillRect(center.x + 4, center.y - 1, 1, 3);
    context.fillRect(center.x - 2, center.y + 3, 2, 2 + footOffset);
    context.fillRect(center.x + 2, center.y + 3, 2, 3 - footOffset);
    context.globalAlpha = .95;
    context.fillStyle = colorString(rlWorldPalette.reward);
    context.fillRect(center.x - 2, center.y - 2, 1, 1);
    context.fillRect(center.x + 2, center.y - 2, 1, 1);
    context.globalAlpha = .62;
    context.fillStyle = colorString(rlWorldPalette.light);
    const direction = actions[lastAction];
    context.fillRect(center.x + direction.x * 4, center.y + direction.y * 4, 1, 1);
    context.globalAlpha = 1;

    if (statusMessage && time < statusUntil) {
      context.globalAlpha = .64;
      context.fillStyle = colorString(statusMessage.startsWith("+") ? rlWorldPalette.reward : rlWorldPalette.hazard);
      context.font = '5px "Courier New", monospace';
      context.fillText(statusMessage, center.x - 7, center.y - 12);
      context.globalAlpha = 1;
    }
  }

  function draw(time) {
    if (!width || !height) return;
    drawGrid();
    drawPolicy();
    drawWalls();
    drawHazards(time);
    drawCheckpoints(time);
    drawTrail();
    drawGoal(time);
    drawAgent(time);
  }

  function resetEpisode() {
    agent = { ...start };
    checkpointMask = 0;
    trail = [{ ...start }];
    episodeSteps = 0;
    pendingReset = false;
    statusMessage = "";
  }

  function stepWorld(time) {
    if (time < nextStepAt) return;
    if (pendingReset) {
      resetEpisode();
      nextStepAt = time + .36;
      needsDraw = true;
      return;
    }

    const result = learn(agent, explorationRate(), checkpointMask);
    agent = result.next;
    checkpointMask = result.checkpointMask;
    lastAction = result.actionIndex;
    episodeSteps += 1;
    trail.push({ ...agent, rewarded: Boolean(result.checkpointBit) });
    if (trail.length > 20) trail.shift();

    if (result.done && result.reward > 0) {
      successes += 1;
      episode += 1;
      statusMessage = "+1 REWARD";
      statusUntil = time + 1;
      pendingReset = true;
      nextStepAt = time + 1.1;
    } else if (result.done) {
      episode += 1;
      statusMessage = "-1 RESET";
      statusUntil = time + .75;
      pendingReset = true;
      nextStepAt = time + .82;
    } else if (result.checkpointBit) {
      statusMessage = "+0.2";
      statusUntil = time + .65;
      nextStepAt = time + .34;
    } else if (episodeSteps >= 110) {
      episode += 1;
      statusMessage = "TIMEOUT";
      statusUntil = time + .65;
      pendingReset = true;
      nextStepAt = time + .72;
    } else {
      nextStepAt = time + .27;
    }
    needsDraw = true;
  }

  function frame(now) {
    const delta = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (!motionState.paused && pageVisible) {
      elapsed += delta / 1000;
      stepWorld(elapsed);
    }

    if (needsDraw || (!motionState.paused && pageVisible && now - lastDraw >= 110)) {
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
    pointerCanvasX = event.clientX / pixelSize;
    pointerCanvasY = event.clientY / pixelSize;
    updateHoveredCell();
    needsDraw = true;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    hoveredCell = null;
    needsDraw = true;
  });
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
  let observer = null;

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
    return {
      destroy() {
        document.documentElement.classList.remove("motion-enhanced");
        elements.forEach((element) => {
          element.classList.remove("motion-reveal", "reveal-left", "reveal-right", "is-visible");
          element.style.removeProperty("--reveal-delay");
        });
      }
    };
  }

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: .08 });

  elements.forEach((element) => observer.observe(element));
  return {
    destroy() {
      observer?.disconnect();
      document.documentElement.classList.remove("motion-enhanced");
      elements.forEach((element) => {
        element.classList.remove("motion-reveal", "reveal-left", "reveal-right", "is-visible");
        element.style.removeProperty("--reveal-delay");
      });
    }
  };
}

document.getElementById("year").textContent = new Date().getFullYear();
setupMotionPreference();
const journeyController = setupJourney();
const publicationController = setupPublicationPages();
setupAcademicExperience(journeyController, publicationController);
setupPublicationMetrics();
preloadJourneyScenes();
setupWorldBackground();
setupSceneMotion();
