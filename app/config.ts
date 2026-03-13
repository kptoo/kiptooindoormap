const isMobile =
  typeof globalThis === "undefined" ? false : globalThis.innerWidth < 640;

const config = {
  geoCodingApi: "https://nominatim.openstreetmap.org",
  routingApi: "https://router.project-osrm.org/route/v1",
  mapConfig: {
    // LAX Airport area (Los Angeles International Airport)
    center: [-118.4085, 33.9425],
    zoom: isMobile ? 15 : 16.5,
    bearing: 0,
    pitch: 40,
    maxBounds: [
      [-118.440, 33.920],
      [-118.380, 33.965],
    ],
  } as maplibregl.MapOptions,
  mapStyles: {
    light: "https://tiles.openfreemap.org/styles/bright",
    dark: "https://tiles.openfreemap.org/styles/liberty",
  },
};

export default config;
