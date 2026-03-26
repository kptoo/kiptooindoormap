import { useEffect, useRef, useState } from "react";
import { useTheme } from "remix-themes";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import RoutingLayer from "~/layers/routing-layer";
import useMapStore from "~/stores/use-map-store";
import useAirportStore from "~/stores/use-airport-store";
import useFloorStore from "~/stores/use-floor-store";
import useDirections from "~/hooks/use-directions";
import { loadAirportData } from "~/lib/airport-data-loader";
import type { IndoorMapGeoJSON } from "~/types/geojson";
import DiscoveryPanel from "./discovery-panel/discovery-panel";
import FloorSelector from "./floor-selector";
import FloorUpDownControl from "./floor-up-down-control";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapComponent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();

  const map = useMapStore((state) => state.mapInstance);
  const setMapInstance = useMapStore((state) => state.setMapInstance);

  const {
    setIsLoading,
    setAirportData,
    setAvailableTerminals,
    airportData,
  } = useAirportStore();

  const { currentFloor, setCurrentFloor } = useFloorStore();

  const { indoorDirections } = useDirections(map);

  // IndoorMapLayer is stateful — keep a stable ref
  const [indoorMapLayer] = useState(
    () =>
      new IndoorMapLayer(
        { type: "FeatureCollection", features: [] } as IndoorMapGeoJSON,
        theme as string,
      ),
  );

  const [routingLayer] = useState(
    () =>
      new RoutingLayer(
        { type: "FeatureCollection", features: [] },
        theme as string,
      ),
  );

  // ── Initialise map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map) return;

    const instance = new maplibregl.Map({
      container: mapContainer.current,
      style:
        theme === "dark"
          ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [-118.4085, 33.9425],
      zoom: 16,
      maxZoom: 22,
    });

    instance.on("load", () => {
      instance.addLayer(indoorMapLayer);
      instance.addLayer(routingLayer);
      setMapInstance(instance);
    });

    return () => {
      instance.remove();
      setMapInstance(null);
    };
  }, []);

  // ── Load airport data on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    setIsLoading(true);

    loadAirportData()
      .then((data) => {
        setAirportData(data);
        setAvailableTerminals(data.terminals);

        indoorMapLayer.updateData(data.indoor_map);
        routingLayer.updateData(data.routing);

        // Set initial floor to the first available floor
        if (data.floors.length > 0) {
          const initialFloor = data.floors.includes(3) ? 3 : data.floors[0];
          setCurrentFloor(initialFloor);
        }
      })
      .catch((e) => console.error("Failed to load airport data:", e))
      .finally(() => setIsLoading(false));
  }, [map]);

  // ── Build indoor routing graph from corridors + connectors ─────────────────
  //    Store the full dataset; actual per-level graph is built by setLevel().
  useEffect(() => {
    if (!indoorDirections) return;
    if (!airportData?.routing) return;

    try {
      // Pass vertical_circulation points as connectors (they are in pois)
      indoorDirections.loadMapData(
        airportData.routing,
        airportData.pois,
      );
    } catch (e) {
      console.error("Failed to load indoor routing graph:", e);
    }
  }, [indoorDirections, airportData?.routing]);

  // ── Rebuild graph when floor changes — mirrors HTML demo's level switch ────
  //    The HTML demo calls buildGraph(currentLevel) fresh on every level change.
  //    We do the same via indoorDirections.setLevel(currentFloor).
  useEffect(() => {
    if (!indoorDirections) return;
    if (currentFloor == null) return;

    indoorDirections.setLevel(currentFloor);
  }, [indoorDirections, currentFloor]);

  return (
    <div className="flex size-full flex-col">
      <DiscoveryPanel indoorMapLayer={indoorMapLayer} />

      <FloorSelector indoorMapLayer={indoorMapLayer} />
      <FloorUpDownControl indoorMapLayer={indoorMapLayer} />

      {process.env.NODE_ENV === "development" && (
        <div className="absolute bottom-32 left-2 z-10 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Airport Indoor Map — Dev Mode
        </div>
      )}

      <div ref={mapContainer} className="size-full" />
    </div>
  );
}
