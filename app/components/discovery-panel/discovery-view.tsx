import { SlidersVertical } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import { TERMINAL_REGISTRY } from "~/lib/airport-data-loader";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";
import useMapStore from "~/stores/use-map-store";
import { POI } from "~/types/poi";
import { IndoorGeocoder, POIFeature } from "~/utils/indoor-geocoder";
import { Toggle } from "../ui/toggle";
import NavigationSettings from "./navigation-settings";
import SearchBar from "./search-bar";
import SuggestionsList from "./suggestions-list";
import { TopLocationsList } from "./top-location-list";
import topLocations from "~/mock/top-locations";

type TopFilterKey =
  | "gates"
  | "check_in"
  | "security"
  | "atm"
  | "restrooms"
  | "food"
  | "shops"
  | "vertical";

const TOP_FILTER_BY_NAME: Record<string, TopFilterKey> = {
  Gates: "gates",
  "Check In": "check_in",
  Security: "security",
  ATM: "atm",
  Restrooms: "restrooms",
  Food: "food",
  Shops: "shops",
  "Elevators / Stairs": "vertical",
};

function normalize(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function asString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

interface AirportPOIProperties {
  name?: string | null;
  category?: string | null;
  level_id?: number | null;
  terminal_id?: string | null;
  layer_type?: string | null;
}

interface DiscoveryViewProps {
  indoorGeocoder: IndoorGeocoder;
  poiFeatures: POIFeature[];
  onSelectPOI: (poi: POI) => void;
  indoorMapLayer: IndoorMapLayer;
}

function geometryToBounds(geometry: GeoJSON.Geometry): LngLatBounds | null {
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const walk = (coords: any) => {
    if (!coords) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0];
      const y = coords[1];
      if (x < bbox.minX) bbox.minX = x;
      if (y < bbox.minY) bbox.minY = y;
      if (x > bbox.maxX) bbox.maxX = x;
      if (y > bbox.maxY) bbox.maxY = y;
      return;
    }
    for (const c of coords) walk(c);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walk((geometry as any).coordinates);

  if (!Number.isFinite(bbox.minX) || !Number.isFinite(bbox.minY)) return null;
  return new LngLatBounds([bbox.minX, bbox.minY], [bbox.maxX, bbox.maxY]);
}

export default function DiscoveryView({
  indoorGeocoder,
  poiFeatures,
  onSelectPOI,
  indoorMapLayer,
}: DiscoveryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<POI>>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTopFilter, setActiveTopFilter] = useState<TopFilterKey | null>(
    null,
  );

  const map = useMapStore((s) => s.mapInstance);

  const {
    activeTerminal,
    setActiveTerminal,
    availableTerminals,
    airportData,
  } = useAirportStore();

  const { currentFloor } = useFloorStore();

  const filteredTopSuggestions = useMemo(() => {
    if (!activeTopFilter) return [];

    const matches = poiFeatures.filter((f) => {
      const p = (f.properties ?? {}) as AirportPOIProperties;

      if (activeTerminal !== "ALL") {
        if (asString(p.terminal_id) !== activeTerminal) return false;
      }
      if (p.level_id != null && !Number.isNaN(p.level_id)) {
        if (p.level_id !== currentFloor) return false;
      } else {
        return false;
      }

      const layerType = normalize(p.layer_type);
      const category = normalize(p.category);
      const name = normalize(p.name);

      switch (activeTopFilter) {
        case "gates":
          return layerType === "gates" || name.includes("gate");
        case "check_in":
          return category.includes("check") || name.includes("check in");
        case "security":
          return category.includes("security") || name.includes("security");
        case "atm":
          return category === "atm" || name.includes("atm");
        case "restrooms":
          return (
            layerType === "restrooms" ||
            category.includes("women") ||
            category.includes("men") ||
            category.includes("family")
          );
        case "food":
          return (
            layerType === "food_beverage" ||
            category.includes("restaurant") ||
            category.includes("pub") ||
            name.includes("cafe")
          );
        case "shops":
          return (
            layerType === "shops" ||
            category.includes("gifts") ||
            category.includes("cosmetics") ||
            category.includes("clothing")
          );
        case "vertical":
          return (
            layerType === "vertical_circulation" ||
            category.includes("elevator") ||
            category.includes("stairs") ||
            category.includes("escalator") ||
            name.includes("elevator") ||
            name.includes("stairs") ||
            name.includes("escalator")
          );
        default:
          return false;
      }
    });

    return matches
      .map((f) => {
        const props = (f.properties ?? {}) as AirportPOIProperties;

        return {
          id: (f.properties as any)?.id ?? (f.id as number),
          name: (f.properties as any)?.name as string,
          coordinates: (f.geometry as any).coordinates,
          level_id: props.level_id ?? null,
          terminal_id: props.terminal_id ?? null,
          layer_type: props.layer_type ?? null,
          category: props.category ?? null,
        } as POI;
      })
      .filter((p) => p.id != null && p.name)
      .slice(0, 50);
  }, [activeTopFilter, poiFeatures, activeTerminal, currentFloor]);

  const handleBackClick = () => {
    setIsSearching(false);
    setSearchQuery("");
    setActiveTopFilter(null);
  };

  useEffect(() => {
    if (activeTopFilter) {
      setSuggestions(filteredTopSuggestions);
      return;
    }

    const newSuggestions = indoorGeocoder.getAutocompleteResults(searchQuery);
    setSuggestions(newSuggestions);
  }, [searchQuery, indoorGeocoder, activeTopFilter, filteredTopSuggestions]);

  function handleSuggestionClick(suggestion: POI) {
    if (!suggestion) return;
    setSearchQuery(suggestion.name);
    setIsSearching(false);
    setActiveTopFilter(null);
    onSelectPOI(suggestion);
  }

  function handleSubmit() {
    if (!suggestions || suggestions.length === 0) return;
    const first = suggestions[0];
    if (!first) return;
    handleSuggestionClick(first);
  }

  function handleTopLocationsClick(topLocationName: string) {
    const key = TOP_FILTER_BY_NAME[topLocationName];
    if (!key) return;

    setActiveTopFilter(key);
    setSearchQuery(topLocationName);
    setIsSearching(true);
  }

  function fitToBuildings(terminalId: string) {
    const buildings = airportData?.buildings?.features ?? [];
    if (!map || buildings.length === 0) return;

    const filtered =
      terminalId === "ALL"
        ? buildings
        : buildings.filter(
            (f) => (f.properties as any)?.terminal_id === terminalId,
          );

    let bounds: LngLatBounds | null = null;

    for (const f of filtered) {
      if (!f.geometry) continue;
      const b = geometryToBounds(f.geometry as GeoJSON.Geometry);
      if (!b) continue;
      bounds = bounds ? bounds.extend(b.getSouthWest()).extend(b.getNorthEast()) : b;
    }

    if (!bounds) return;

    map.fitBounds(bounds, {
      padding: 120,
      duration: 900,
    });
  }

  function handleTerminalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setActiveTerminal(id);

    // Show ALL terminals + ALL levels by default
    if (id === "ALL") {
      indoorMapLayer.setTerminal("ALL"); // no floor filter
      fitToBuildings("ALL");
      return;
    }

    // Specific terminal: show that terminal, all its levels, and fit to its building footprint
    indoorMapLayer.setTerminal(id); // no floor filter => all levels visible
    fitToBuildings(id);
  }

  return (
    <>
      <div className="relative flex items-center md:mb-3">
        <div className="relative grow">
          <SearchBar
            isSearching={isSearching}
            searchQuery={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(true);
              setActiveTopFilter(null);
            }}
            onFocus={() => setIsSearching(true)}
            onBack={handleBackClick}
            onSubmit={handleSubmit}
          />
        </div>

        {!isSearching && (
          <Toggle
            variant="outline"
            size="icon"
            pressed={isSettingsOpen}
            onPressedChange={setIsSettingsOpen}
            className="ml-2 rounded-full"
          >
            <SlidersVertical size={16} />
          </Toggle>
        )}
      </div>

      {!isSearching && (
        <div className="mb-4 md:mb-6">
          <select
            value={activeTerminal}
            onChange={handleTerminalChange}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:bg-gray-900 dark:text-white"
            aria-label="Select terminal"
          >
            <option value="ALL">All Terminals</option>
            {TERMINAL_REGISTRY.filter((t) =>
              availableTerminals.includes(t.id),
            ).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {isSearching ? (
        <SuggestionsList
          suggestions={suggestions}
          searchQuery={searchQuery}
          onSuggestionClick={handleSuggestionClick}
        />
      ) : (
        <TopLocationsList
          locations={topLocations}
          onLocationClick={handleTopLocationsClick}
        />
      )}

      {isSettingsOpen && <NavigationSettings />}
    </>
  );
}
