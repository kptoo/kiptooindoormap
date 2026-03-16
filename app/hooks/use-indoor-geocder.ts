import { useMemo } from "react";
import useAirportStore from "~/stores/airport-store";
import { IndoorGeocoder, POIFeature } from "~/utils/indoor-geocoder";

export function useIndoorGeocoder() {
  const airportData = useAirportStore((s) => s.airportData);

  const poiFeatures = useMemo(() => {
    const features = airportData?.pois?.features ?? [];
    // Geocoder expects Point features; loader routes points into airportData.pois citecall_dGVYFmH79DyhOS4AJpwnA4Lu
    return features as POIFeature[];
  }, [airportData]);

  const indoorGeocoder = useMemo(() => {
    return new IndoorGeocoder(poiFeatures);
  }, [poiFeatures]);

  return { indoorGeocoder, poiFeatures };
}
