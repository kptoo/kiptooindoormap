import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import { MapPin, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useDirections from "~/hooks/use-directions";
import { useIndoorGeocoder } from "~/hooks/use-indoor-geocder";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useMapStore from "~/stores/use-map-store";
import { POI } from "~/types/poi";
import poiMap from "~/utils/poi-map";
import { MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import DiscoveryView from "./discovery-view";
import LocationDetail from "./location-detail";
import NavigationView from "./navigation-view";

type UIMode = "discovery" | "detail" | "navigation";

interface DiscoveryPanelProps {
  indoorMapLayer: IndoorMapLayer;
}

export default function DiscoveryPanel({ indoorMapLayer }: DiscoveryPanelProps) {
  const map = useMapStore((state) => state.mapInstance);
  const [mode, setMode] = useState<UIMode>("discovery");
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const { indoorDirections } = useDirections(map);
  const { indoorGeocoder, poiFeatures } = useIndoorGeocoder();

  const navigateToPOI = useCallback(
    (coordinates: GeoJSON.Position) => {
      map?.flyTo({
        center: coordinates as [number, number],
        zoom: 20,
        duration: 1300,
      });
    },
    [map],
  );

  function handleSelectPOI(poi: POI) {
    setSelectedPOI(poi);
    setMode("detail");
    navigateToPOI(poi.coordinates);
  }

  function handleBackClick() {
    setMode("discovery");
    setSelectedPOI(null);
    indoorDirections?.clear();
  }

  function handleDirectionsClick() {
    if (!selectedPOI) return;
    setMode("navigation");
  }

  useEffect(() => {
    const handleMapClick = (
      event: MapMouseEvent & {
        features?: MapGeoJSONFeature[];
      },
    ) => {
      const { features } = event;
      if (!features?.length) return;

      const clickedFeature = features[0];
      const unitId = Number(clickedFeature.id);
      const relatedPOIs = poiMap.get(unitId);

      if (relatedPOIs && relatedPOIs[0]) {
        const firstPOI = relatedPOIs[0];

        const poi: POI = {
          id: firstPOI.properties?.id as number,
          name: firstPOI.properties?.name as string,
          coordinates: firstPOI.geometry.coordinates,
          level_id: (firstPOI.properties as any)?.level_id ?? null,
          terminal_id: (firstPOI.properties as any)?.terminal_id ?? null,
          layer_type: (firstPOI.properties as any)?.layer_type ?? null,
          category: (firstPOI.properties as any)?.category ?? null,
        };

        setSelectedPOI(poi);

        if (mode === "discovery" || mode === "detail") {
          navigateToPOI(poi.coordinates);
          if (mode === "discovery") {
            setMode("detail");
          }
        }
      }
    };

    map?.on("click", "indoor-map-extrusion", handleMapClick);
    return () => {
      map?.off("click", "indoor-map-extrusion", handleMapClick);
    };
  }, [map, mode, navigateToPOI, indoorDirections]);

  return (
    <Card className="absolute z-10 w-full rounded-xl shadow-lg md:absolute md:left-4 md:top-4 md:max-w-[23.5rem]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-5 w-5 text-blue-600" />
          Indoor Map
        </CardTitle>

        {mode !== "discovery" && (
          <button
            onClick={handleBackClick}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </CardHeader>

      <CardContent>
        {mode === "discovery" && (
          <DiscoveryView
            indoorGeocoder={indoorGeocoder}
            poiFeatures={poiFeatures}
            onSelectPOI={handleSelectPOI}
            indoorMapLayer={indoorMapLayer}
          />
        )}

        {mode === "detail" && selectedPOI && (
          <LocationDetail
            poi={selectedPOI}
            onBack={handleBackClick}
            onDirections={handleDirectionsClick}
          />
        )}

        {mode === "navigation" && (
          <NavigationView
            handleBackClick={handleBackClick}
            selectedPOI={selectedPOI}
            indoorGeocoder={indoorGeocoder}
            indoorDirections={indoorDirections}
          />
        )}
      </CardContent>
    </Card>
  );
}
