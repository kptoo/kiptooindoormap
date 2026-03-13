import MaplibreInspect from "@maplibre/maplibre-gl-inspect";
import "@maplibre/maplibre-gl-inspect/dist/maplibre-gl-inspect.css";
import maplibregl, { FullscreenControl, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Theme, useTheme } from "remix-themes";
import config from "~/config";
import { loadAirportData } from "~/lib/airport-data-loader";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import RoutingLayer from "~/layers/routing-layer";
import POIsLayer from "~/layers/pois-layer";
import { IndoorMapGeoJSON } from "~/types/geojson";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";
import useMapStore from "~/stores/use-map-store";
import OIMLogo from "../controls/oim-logo";
import ContactBanner from "./contact-banner";
import DiscoveryPanel from "./discovery-panel/discovery-panel";
import { FloorSelector } from "./floor-selector";
import { FloorUpDownControl } from "./floor-up-down-control";
import { TerminalSelector } from "./terminal-selector";
import "~/maplibre.css";

export default function MapComponent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [theme] = useTheme();

  const setMapInstance = useMapStore((state) => state.setMapInstance);
  const { setIsLoading, setAirportData, setAvailableTerminals } = useAirportStore();
  const { setCurrentFloor } = useFloorStore();

  // IndoorMapLayer is stateful — keep a stable ref
  const [indoorMapLayer] = useState(
    () => new IndoorMapLayer({ type: "FeatureCollection", features: [] } as IndoorMapGeoJSON, theme as string),
  );
  const [routingLayer] = useState(
    () => new RoutingLayer({ type: "FeatureCollection", features: [] }, theme as string),
  );

  // ── Load airport data on mount ────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    loadAirportData() // loads ALL terminals by default
      .then((data) => {
        setAirportData(data);
        setAvailableTerminals(data.terminals);
        // Default to the lowest available floor
        const defaultFloor = data.floors[0] ?? 1;
        setCurrentFloor(defaultFloor);
        indoorMapLayer.updateData(data.indoor_map);
        routingLayer.updateData(data.routing);
        // Apply the default floor filter after data is set
        indoorMapLayer.setFloorLevel(defaultFloor);
      })
      .catch((err) => console.error("Failed to load airport data:", err))
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Initialise MapLibre ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      ...config.mapConfig,
      style: config.mapStyles[theme as Theme],
      container: mapContainer.current,
    });
    setMapInstance(map);

    map.on("load", () => {
      try {
        map.addLayer(indoorMapLayer);
        map.addLayer(routingLayer);
        map.addLayer(new POIsLayer({ type: "FeatureCollection", features: [] }, theme as string));
      } catch (error) {
        console.error("Failed to initialise map layers:", error);
      }
    });

    map.addControl(new NavigationControl(), "bottom-right");
    map.addControl(new FullscreenControl(), "bottom-right");

    if (process.env.NODE_ENV === "development") {
      map.addControl(
        new MaplibreInspect({
          popup: new maplibregl.Popup({ closeOnClick: false }),
          blockHoverPopupOnClick: true,
        }),
        "bottom-right",
      );
    }

    map.addControl(new OIMLogo());

    return () => {
      map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]); // re-init map when theme changes

  return (
    <div className="flex size-full flex-col">
      <DiscoveryPanel />

      {/* Terminal selector — always visible */}
      <TerminalSelector indoorMapLayer={indoorMapLayer} />

      {/* Floor controls — always visible (not dev-only any more) */}
      <FloorSelector indoorMapLayer={indoorMapLayer} />
      <FloorUpDownControl indoorMapLayer={indoorMapLayer} />

      {process.env.NODE_ENV === "development" && (
        <div className="absolute bottom-32 left-2 z-10 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Airport Indoor Map — Dev Mode
        </div>
      )}

      <div ref={mapContainer} className="size-full" />
      <ContactBanner />
    </div>
  );
}
