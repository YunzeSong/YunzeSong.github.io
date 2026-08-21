const { siteConfig, cities } = window.siteLocation;

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
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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

setupCityPlayer();
