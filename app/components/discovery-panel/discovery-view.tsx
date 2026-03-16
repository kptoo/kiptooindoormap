import { SlidersVertical } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { TERMINAL_REGISTRY } from "~/lib/airport-data-loader";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";
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

  const { activeTerminal, setActiveTerminal, availableTerminals } =
    useAirportStore();
  const { currentFloor } = useFloorStore();

  const filteredTopSuggestions = useMemo(() => {
    if (!activeTopFilter) return [];

    const matches = poiFeatures.filter((f) => {
      const p = (f.properties ?? {}) as AirportPOIProperties;

      // Respect currently selected terminal/floor
      if (activeTerminal !== "ALL") {
        if (asString(p.terminal_id) !== activeTerminal) return false;
      }
      if (p.level_id != null && !Number.isNaN(p.level_id)) {
        if (p.level_id !== currentFloor) return false;
      } else {
        // If feature has no level_id, exclude in floor-specific filtering mode
        return false;
      }

      const layerType = normalize(p.layer_type);
      const category = normalize(p.category);
      const name = normalize(p.name);

      // Filter rules primarily by loader-injected layer_type + category.
      // Loader injects: layer_type, category, terminal_id, level_id. citecall_dGVYFmH79DyhOS4AJpwnA4Lu
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
          return layerType === "restrooms" || category.includes("women") || category.includes("men") || category.includes("family");
        case "food":
          return layerType === "food_beverage" || category.includes("restaurant") || category.includes("pub") || name.includes("cafe");
        case "shops":
          return layerType === "shops" || category.includes("gifts") || category.includes("cosmetics") || category.includes("clothing");
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

    // Convert to POI list (SuggestionsList expects POI[])
    return matches
      .map((f) => ({
        id: (f.properties as any)?.id ?? (f.id as number),
        name: (f.properties as any)?.name as string,
        coordinates: f.geometry.coordinates,
      }))
      .filter((p) => p.id != null && p.name)
      .slice(0, 50);
  }, [activeTopFilter, poiFeatures, activeTerminal, currentFloor]);

  const handleBackClick = () => {
    setIsSearching(false);
    setSearchQuery("");
    setActiveTopFilter(null);
  };

  useEffect(() => {
    // If a top filter is active, show filtered results (not autocomplete)
    if (activeTopFilter) {
      setSuggestions(filteredTopSuggestions);
      return;
    }

    // Normal autocomplete while typing
    const newSuggestions = indoorGeocoder.getAutocompleteResults(searchQuery);
    setSuggestions(newSuggestions);
  }, [searchQuery, indoorGeocoder, activeTopFilter, filteredTopSuggestions]);

  function handleSuggestionClick(suggestion: POI) {
    setSearchQuery(suggestion.name);
    setIsSearching(false);
    setActiveTopFilter(null);
    onSelectPOI(suggestion);
  }

  function handleTopLocationsClick(topLocationName: string) {
    const key = TOP_FILTER_BY_NAME[topLocationName];
    if (!key) return;

    setActiveTopFilter(key);
    setSearchQuery(topLocationName);
    setIsSearching(true);
  }

  function handleTerminalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setActiveTerminal(id);
    indoorMapLayer.setTerminal(id, currentFloor);
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
              setActiveTopFilter(null); // typing cancels top-filter mode
            }}
            onFocus={() => setIsSearching(true)}
            onBack={handleBackClick}
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
