import { SlidersVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { TERMINAL_REGISTRY } from "~/lib/airport-data-loader";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";
import { POI } from "~/types/poi";
import { IndoorGeocoder } from "~/utils/indoor-geocoder";
import { Toggle } from "../ui/toggle";
import NavigationSettings from "./navigation-settings";
import SearchBar from "./search-bar";
import SuggestionsList from "./suggestions-list";
import { TopLocationsList } from "./top-location-list";
import topLocations from "~/mock/top-locations";

interface DiscoveryViewProps {
  indoorGeocoder: IndoorGeocoder;
  onSelectPOI: (poi: POI) => void;
  indoorMapLayer: IndoorMapLayer;
}

export default function DiscoveryView({
  indoorGeocoder,
  onSelectPOI,
  indoorMapLayer,
}: DiscoveryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<POI>>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { activeTerminal, setActiveTerminal, availableTerminals } =
    useAirportStore();
  const { currentFloor } = useFloorStore();

  const handleBackClick = () => {
    setIsSearching(false);
    setSearchQuery("");
  };

  useEffect(() => {
    const newSuggestions = indoorGeocoder.getAutocompleteResults(searchQuery);
    setSuggestions(newSuggestions);
  }, [searchQuery, indoorGeocoder]);

  function handleSuggestionClick(suggestion: POI) {
    setSearchQuery(suggestion.name);
    setIsSearching(false);
    onSelectPOI(suggestion);
  }

  function handleTopLocationsClick(topLocationName: string) {
    setSearchQuery(topLocationName);
    try {
      const poi = indoorGeocoder.indoorGeocodeInput(topLocationName);
      if (!poi) {
        console.error(`Location "${topLocationName}" not found`);
        return;
      }
      onSelectPOI(poi);
    } catch (error) {
      console.error("Failed to geocode location:", error);
    }
  }

  function handleTerminalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setActiveTerminal(id);
    indoorMapLayer.setTerminal(id, currentFloor);
  }

  return (
    <>
      {/* Search row */}
      <div className="relative flex items-center md:mb-3">
        <div className="relative grow">
          <SearchBar
            isSearching={isSearching}
            searchQuery={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Terminal selector — shown below search when not actively searching */}
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

      {/* Suggestions or top-locations grid */}
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
