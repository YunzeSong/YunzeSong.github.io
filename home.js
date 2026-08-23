const { siteConfig, cities } = window.siteLocation;

function setupCityPlayer() {
  const player = document.querySelector("[data-city-player]");
  const image = document.querySelector("[data-current-city-image]");
  const coordinates = document.querySelector("[data-city-coordinates]");
  const caption = document.querySelector("[data-city-caption]");
  const motionSurface = player?.querySelector("[data-motion-scene]");
  const motionWorld = player?.querySelector("[data-scene-world]");

  if (!player || !image) return;

  const currentKey = siteConfig.currentCity in cities ? siteConfig.currentCity : "beijing";
  const city = cities[currentKey];
  if (coordinates) coordinates.textContent = city.coordinates;
  if (caption) caption.textContent = city.caption;
  if (motionSurface) motionSurface.dataset.motionScene = currentKey;
  const usesSceneEngine = currentKey === "beijing" && Boolean(motionSurface?.querySelector("[data-scene-canvas]"));
  if (!usesSceneEngine && image.getAttribute("src") !== city.src) image.src = city.src;
  image.alt = city.alt;

  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!usesSceneEngine && finePointer.matches && !reducedMotion.matches) {
    player.addEventListener("pointermove", (event) => {
      const bounds = player.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - .5) * -5;
      const y = ((event.clientY - bounds.top) / bounds.height - .5) * -4;
      motionWorld?.style.setProperty("--parallax-x", `${x}px`);
      motionWorld?.style.setProperty("--parallax-y", `${y}px`);
    });

    player.addEventListener("pointerleave", () => {
      motionWorld?.style.setProperty("--parallax-x", "0px");
      motionWorld?.style.setProperty("--parallax-y", "0px");
    });
  }
}

setupCityPlayer();
