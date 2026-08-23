// Change this one value when Yunze moves: beijing, singapore, shenzhen, hangzhou, or suzhou.
window.siteLocation = {
  siteConfig: {
    currentCity: "beijing",
    sceneContextEndpoint: "https://yunzesong-scene-context.yunzesong-scene-context.workers.dev/v1/scene-context"
  },
  cities: {
    beijing: {
      label: "Beijing",
      coordinates: "39.90 N / 116.41 E",
      src: "./assets/scenes/beijing/summer.webp",
      caption: "Currently in Beijing.",
      alt: "Pixel art of Beijing with a palace roof, the Forbidden City corner tower, its moat, and the distant CBD skyline"
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
  }
};
