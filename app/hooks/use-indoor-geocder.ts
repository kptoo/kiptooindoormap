import { useMemo } from "react";
import useAirportStore from "~/stores/airport-store";
import { IndoorGeocoder, POIFeature } from "~/utils/indoor-geocoder";

export function useIndoorGeocoder() {
  const airportData = useAirportStore((s) => s.airportData);

  const poiFeatures = useMemo(() => {
    if (!airportData) return [];

    // We want search to match what’s in the terminal datasets:
    // - gates are polygons (airportData.indoor_map)
    // - elevators/service points are points (airportData.pois)
    //
    // So we index BOTH collections.
    const pointFeatures = (airportData.pois?.features ?? []) as POIFeature[];
    const polygonFeatures = (airportData.indoor_map?.features ??
      []) as unknown as POIFeature[];

    return [...pointFeatures, ...polygonFeatures];
  }, [airportData]);

  const indoorGeocoder = useMemo(() => {
    return new IndoorGeocoder(poiFeatures);
  }, [poiFeatures]);

  return { indoorGeocoder, poiFeatures };
}
