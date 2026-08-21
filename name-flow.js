(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const tokenDuration = 170;
  const resampleExtra = 390;
  const timing = {
    cycle: 9500,
    prefillEnd: 280,
    decodeEnd: 280 + tokenDuration * 9 + resampleExtra,
    confirmEnd: 2450,
    holdEnd: 8900
  };
  const resamplePattern = [3, 6, 0, 7, 4, 8, 2, 5, 1];
  const candidateMap = {
    Y: ["Y", "V", "7"],
    u: ["u", "v", "n"],
    n: ["n", "m", "r"],
    z: ["z", "2", "x"],
    e: ["e", "c", "a"],
    S: ["S", "5", "Z"],
    o: ["o", "0", "a"],
    g: ["g", "q", "9"]
  };
  const wrapperStates = [
    "is-prefilling",
    "is-decoding",
    "is-confirming",
    "is-holding",
    "is-resetting"
  ];
  const tokenStates = [
    "is-future",
    "is-sampling",
    "is-resampling",
    "is-choosing",
    "is-locked"
  ];

  function setWrapperState(instance, state) {
    if (instance.state === state) return;
    instance.wrapper.classList.remove(...wrapperStates);
    instance.wrapper.classList.add(`is-${state}`);
    instance.state = state;
  }

  function setTokenState(token, state) {
    if (token.state === state) return;
    token.element.classList.remove(...tokenStates);
    token.element.classList.add(`is-${state}`);
    token.state = state;
  }

  function rotatedCandidates(token, tick, cycleIndex) {
    const choices = candidateMap[token.target] || [token.target, "?", "+"];
    const offset = (tick + token.index + cycleIndex) % choices.length;
    return choices.map((_, index) => choices[(index + offset) % choices.length]);
  }

  function putTargetInCenter(candidates, target) {
    const alternatives = candidates.filter((candidate) => candidate !== target);
    return [alternatives[0], target, alternatives[1]];
  }

  function putAlternativeInCenter(candidates, target, cycleIndex) {
    const alternatives = candidates.filter((candidate) => candidate !== target);
    const selected = alternatives[cycleIndex % alternatives.length];
    const remaining = candidates.filter((candidate) => candidate !== selected);
    return [remaining[0], selected, remaining[1]];
  }

  function setCandidateText(token, values) {
    token.candidates.forEach((candidate, index) => {
      if (candidate.textContent !== values[index]) candidate.textContent = values[index];
    });
  }

  function updateCandidateText(instance, activeIndex, activePhase, cycleIndex, now) {
    const tick = Math.floor(now / 96);
    if (
      instance.candidateTick === tick &&
      instance.activeIndex === activeIndex &&
      instance.activePhase === activePhase
    ) return;

    instance.candidateTick = tick;
    instance.activeIndex = activeIndex;
    instance.activePhase = activePhase;
    instance.tokens.forEach((token, index) => {
      if (token.state === "locked") return;
      let values = rotatedCandidates(token, tick, cycleIndex);
      if (index === activeIndex && activePhase === "choosing") {
        values = putTargetInCenter(values, token.target);
      } else if (index === activeIndex && activePhase === "resampling") {
        values = putAlternativeInCenter(values, token.target, cycleIndex);
      }
      setCandidateText(token, values);
    });
  }

  function locateActiveToken(elapsed, resampleIndex) {
    let remaining = elapsed - timing.prefillEnd;
    for (let index = 0; index < 9; index += 1) {
      const duration = tokenDuration + (index === resampleIndex ? resampleExtra : 0);
      if (remaining < duration) {
        return { index, phase: Math.max(0, remaining / duration) };
      }
      remaining -= duration;
    }
    return null;
  }

  function showPrefill(instance, cycleIndex, now) {
    instance.tokens.forEach((token) => setTokenState(token, "future"));
    updateCandidateText(instance, -1, "prefill", cycleIndex, now);
  }

  function showDecode(instance, active, resampleIndex, cycleIndex, now) {
    instance.tokens.forEach((token, index) => {
      if (index < active.index) {
        setTokenState(token, "locked");
        return;
      }
      if (index > active.index) {
        setTokenState(token, "future");
        return;
      }

      if (index === resampleIndex && active.phase >= .24 && active.phase < .72) {
        setTokenState(token, "resampling");
      } else if (active.phase >= .76) {
        setTokenState(token, "choosing");
      } else {
        setTokenState(token, "sampling");
      }
    });

    const activeState = instance.tokens[active.index].state;
    const activePhase = activeState === "resampling" ? "resampling" :
      activeState === "choosing" ? "choosing" : "sampling";
    updateCandidateText(instance, active.index, activePhase, cycleIndex, now);
  }

  function showLocked(instance) {
    instance.tokens.forEach((token) => setTokenState(token, "locked"));
  }

  function measureCharacters(label, target) {
    const textNode = label.firstChild;
    const labelRect = label.getBoundingClientRect();
    const measurements = [];
    for (let index = 0; index < target.length; index += 1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + 1);
      const rect = range.getBoundingClientRect();
      measurements.push({
        left: rect.left - labelRect.left,
        width: Math.max(rect.width, 1)
      });
      range.detach();
    }
    return measurements;
  }

  function layoutInstance(instance) {
    const measurements = measureCharacters(instance.label, instance.target);
    instance.tokens.forEach((token) => {
      const measurement = measurements[token.characterIndex];
      token.element.style.setProperty("--token-left", `${measurement.left}px`);
      token.element.style.setProperty("--token-width", `${measurement.width}px`);
    });
  }

  function createInstance(label) {
    const target = label.textContent.trim();
    const textNode = label.firstChild;
    if (!target || !textNode || textNode.nodeType !== Node.TEXT_NODE) return null;

    const wrapper = document.createElement("span");
    const display = document.createElement("span");
    wrapper.className = "name-flow is-active is-prefilling";
    display.className = "name-flow-display";
    display.setAttribute("aria-hidden", "true");
    label.classList.add("name-flow-label");
    label.parentNode.insertBefore(wrapper, label);
    wrapper.append(label, display);

    const measurements = measureCharacters(label, target);
    const tokens = [];
    [...target].forEach((character, characterIndex) => {
      if (character === " ") return;
      const measurement = measurements[characterIndex];
      const element = document.createElement("span");
      const choice = document.createElement("span");
      const candidateTop = document.createElement("span");
      const candidateCenter = document.createElement("span");
      const candidateBottom = document.createElement("span");
      element.className = "name-flow-token is-future";
      choice.className = "name-flow-choice";
      candidateTop.className = "name-flow-candidate candidate-top";
      candidateCenter.className = "name-flow-candidate candidate-center";
      candidateBottom.className = "name-flow-candidate candidate-bottom";
      element.style.setProperty("--token-left", `${measurement.left}px`);
      element.style.setProperty("--token-width", `${measurement.width}px`);
      choice.textContent = character;
      element.append(choice, candidateTop, candidateCenter, candidateBottom);
      display.append(element);
      tokens.push({
        element,
        choice,
        candidates: [candidateTop, candidateCenter, candidateBottom],
        target: character,
        characterIndex,
        index: tokens.length,
        state: "future"
      });
    });

    return {
      wrapper,
      label,
      target,
      tokens,
      state: "prefilling",
      startTime: performance.now(),
      lastFrame: 0,
      candidateTick: -1,
      activeIndex: -2,
      activePhase: ""
    };
  }

  function update(instance, now) {
    if (now - instance.lastFrame < 30) return;
    instance.lastFrame = now;
    const totalElapsed = now - instance.startTime;
    const cycleIndex = Math.floor(totalElapsed / timing.cycle);
    const elapsed = totalElapsed % timing.cycle;
    const resampleIndex = resamplePattern[cycleIndex % resamplePattern.length];

    if (elapsed < timing.prefillEnd) {
      setWrapperState(instance, "prefilling");
      showPrefill(instance, cycleIndex, now);
      return;
    }
    if (elapsed < timing.decodeEnd) {
      setWrapperState(instance, "decoding");
      const active = locateActiveToken(elapsed, resampleIndex);
      if (active) showDecode(instance, active, resampleIndex, cycleIndex, now);
      return;
    }
    if (elapsed < timing.confirmEnd) {
      setWrapperState(instance, "confirming");
      showLocked(instance);
      return;
    }
    if (elapsed < timing.holdEnd) {
      setWrapperState(instance, "holding");
      showLocked(instance);
      return;
    }
    setWrapperState(instance, "resetting");
    showLocked(instance);
  }

  async function initialise() {
    if (document.fonts?.ready) await document.fonts.ready;
    const instances = [...document.querySelectorAll(".wordmark > span")]
      .map(createInstance)
      .filter(Boolean);
    if (!instances.length) return;

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => {
        instances.forEach(layoutInstance);
      });
      instances.forEach((instance) => resizeObserver.observe(instance.label));
      instances[0].resizeObserver = resizeObserver;
    }

    function frame(now) {
      if (!document.hidden) instances.forEach((instance) => update(instance, now));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  initialise();
})();
