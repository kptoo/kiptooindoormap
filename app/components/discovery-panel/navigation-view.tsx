import {
  Accessibility,
  ArrowLeft,
  ArrowUpDown,
  Dot,
  MapPin,
  Ruler,
  Timer,
} from "lucide-react";
import { LngLatBounds } from "maplibre-gl";
import { useEffect, useState } from "react";
import IndoorDirections from "~/indoor-directions/directions/main";
import useMapStore from "~/stores/use-map-store";
import { POI } from "~/types/poi";
import { IndoorGeocoder } from "~/utils/indoor-geocoder";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import SuggestionsList from "./suggestions-list";
import { Toggle } from "../ui/toggle";

interface NavigationViewProps {
  handleBackClick: () => void;
  selectedPOI: POI | null;
  indoorGeocoder: IndoorGeocoder;
  indoorDirections: IndoorDirections | null;
}

export default function NavigationView({
  handleBackClick,
  selectedPOI,
  indoorGeocoder,
  indoorDirections,
}: NavigationViewProps) {
  const [activeInput, setActiveInput] = useState<
    "departure" | "destination" | null
  >(null);
  const [departureLocation, setDepartureLocation] = useState("");
  const [destinationLocation, setDestinationLocation] = useState(
    selectedPOI?.name || "",
  );
  const [suggestions, setSuggestions] = useState<POI[]>([]);
  const [isAccessibleRoute, setIsAccessibleRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distanceMetres: number;
    walkMinutes: number;
    fromName: string;
    toName: string;
  } | null>(null);

  const map = useMapStore((state) => state.mapInstance);

  const activeQuery =
    activeInput === "departure" ? departureLocation : destinationLocation;

  useEffect(() => {
    if (!indoorGeocoder) return;
    if (activeInput && activeQuery) {
      setSuggestions(indoorGeocoder.getAutocompleteResults(activeQuery));
    } else {
      setSuggestions([]);
    }
  }, [activeInput, activeQuery, indoorGeocoder]);

  const handleSuggestionClick = (suggestion: POI) => {
    const newDeparture =
      activeInput === "departure" ? suggestion.name : departureLocation;
    const newDestination =
      activeInput === "destination" ? suggestion.name : destinationLocation;

    if (activeInput === "departure") setDepartureLocation(suggestion.name);
    else if (activeInput === "destination")
      setDestinationLocation(suggestion.name);

    setSuggestions([]);
    setActiveInput(null);
    handleRouting(newDeparture, newDestination);
  };

  function handleRouting(departureValue: string, destinationValue: string) {
    setRouteError(null);
    setRouteInfo(null);

    if (!departureValue || !destinationValue) return;
    if (!indoorGeocoder) return;

    if (!indoorDirections) {
      setRouteError("Navigation is not ready yet — please wait for the map to load.");
      return;
    }

    if (
      departureValue.trim().toLowerCase() ===
      destinationValue.trim().toLowerCase()
    ) {
      setRouteError("⚠️ Departure and destination are the same location.");
      return;
    }

    try {
      const departureGeo = indoorGeocoder.indoorGeocodeInput(departureValue);
      const destinationGeo = indoorGeocoder.indoorGeocodeInput(destinationValue);

      if (!departureGeo?.coordinates || !destinationGeo?.coordinates) {
        setRouteError(
          "⚠️ Could not find one or both locations. Try selecting from suggestions.",
        );
        return;
      }

      const departureCoord = departureGeo.coordinates as [number, number];
      const destinationCoord = destinationGeo.coordinates as [number, number];

      indoorDirections.setWaypoints([departureCoord, destinationCoord]);

      const routeGeometry =
        indoorDirections.routelinesCoordinates?.[0]?.[0]?.geometry;
      const coordinates = routeGeometry?.coordinates as
        | [number, number][]
        | undefined;

      if (!coordinates || coordinates.length < 2) {
        setRouteError(
          "❌ No route found — the locations may not be connected on this floor.",
        );
        return;
      }

      // Fit map to route — same as HTML demo's fitBounds with padding:60
      let bounds = new LngLatBounds(coordinates[0], coordinates[0]);
      for (const coord of coordinates) bounds = bounds.extend(coord);
      map?.fitBounds(bounds, { padding: 60, speed: 0.5 });

      // Show route info — mirrors HTML demo's status bar message
      const info = indoorDirections.getLastRouteInfo();
      if (info) {
        setRouteInfo({
          distanceMetres: info.distanceMetres,
          walkMinutes: info.walkMinutes,
          fromName: departureValue,
          toName: destinationValue,
        });
      }
    } catch (error) {
      console.error("Error during routing:", error);
      setRouteError(
        "An unexpected error occurred while calculating the route.",
      );
    }
  }

  function handleSwapLocations() {
    const prev = departureLocation;
    setDepartureLocation(destinationLocation);
    setDestinationLocation(prev);
    setRouteError(null);
    setRouteInfo(null);
  }

  function handleBack() {
    indoorDirections?.clear();
    setRouteError(null);
    setRouteInfo(null);
    handleBackClick();
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={handleBack}>
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>
        <Toggle
          variant="outline"
          pressed={isAccessibleRoute}
          size="icon"
          onClick={() => setIsAccessibleRoute(!isAccessibleRoute)}
          title="Toggle accessible route"
        >
          <Accessibility size={18} />
        </Toggle>
      </div>

      <div className="flex space-x-2">
        <div className="w-full space-y-4">
          {/* Departure input */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="flex h-full w-4 items-center justify-center">
                {/* Green origin dot — mirrors HTML demo's #00e676 marker */}
                <div className="size-3 rounded-full border-2 border-white bg-[#00e676] ring-4 ring-green-100 dark:ring-0" />
              </div>
              <div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 flex-col items-center">
                <Dot size={12} />
                <Dot size={12} />
                <Dot size={12} />
              </div>
            </div>
            <Input
              type="text"
              placeholder="Choose starting point"
              value={departureLocation}
              onChange={(e) => {
                setDepartureLocation(e.target.value);
                setRouteInfo(null);
                setRouteError(null);
              }}
              onFocus={() => setActiveInput("departure")}
              onBlur={() => setActiveInput(null)}
            />
          </div>

          {/* Destination input */}
          <div className="mb-2 flex items-center space-x-4">
            <div className="w-4">
              {/* Red destination pin — mirrors HTML demo's #e94560 marker */}
              <MapPin size={16} className="text-[#e94560]" />
            </div>
            <Input
              type="text"
              placeholder="Choose destination"
              value={destinationLocation}
              onChange={(e) => {
                setDestinationLocation(e.target.value);
                setRouteInfo(null);
                setRouteError(null);
              }}
              onFocus={() => setActiveInput("destination")}
              onBlur={() => setActiveInput(null)}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Button variant="ghost" size="icon" onClick={handleSwapLocations}>
            <ArrowUpDown size={18} />
          </Button>
        </div>
      </div>

      {/* Route info banner — mirrors HTML demo's status bar ✅ message */}
      {routeInfo && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 dark:border-orange-900 dark:bg-orange-950">
          <div className="flex items-center gap-4 text-sm font-medium text-orange-800 dark:text-orange-200">
            <span className="flex items-center gap-1">
              <Ruler size={13} />
              <strong>{routeInfo.distanceMetres} m</strong>
            </span>
            <span className="flex items-center gap-1">
              <Timer size={13} />
              ~<strong>{routeInfo.walkMinutes} min</strong> walk
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-orange-600 dark:text-orange-400">
            <span className="text-[#00e676]">●</span> {routeInfo.fromName}
            {" → "}
            <span className="text-[#e94560]">●</span> {routeInfo.toName}
          </p>
        </div>
      )}

      {/* Error banner */}
      {routeError && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {routeError}
        </div>
      )}

      {activeInput && activeQuery && (
        <>
          <div className="mt-4 h-px w-full bg-gray-300 dark:bg-gray-800" />
          <SuggestionsList
            suggestions={suggestions}
            searchQuery={activeQuery}
            onSuggestionClick={handleSuggestionClick}
          />
        </>
      )}
    </>
  );
}
