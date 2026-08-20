const year = document.querySelector("[data-year]");
const postcard = document.querySelector("[data-postcard]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

if (year) year.textContent = new Date().getFullYear();

if (postcard && finePointer.matches && !reducedMotion.matches) {
  postcard.addEventListener("pointermove", (event) => {
    const bounds = postcard.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    postcard.style.setProperty("--rotate-x", `${y * -2.2}deg`);
    postcard.style.setProperty("--rotate-y", `${x * 2.8}deg`);
  });

  postcard.addEventListener("pointerleave", () => {
    postcard.style.setProperty("--rotate-x", "0deg");
    postcard.style.setProperty("--rotate-y", "0deg");
  });
}
