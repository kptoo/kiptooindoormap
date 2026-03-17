/**
 * Simplified POI type derived from GeoJSON Feature.
 *
 * While POIs are stored as GeoJSON Features for MapLibre layer rendering
 *
 * This flattened structure is used for:
 * - Geocoding operations (translating POI to coordinates) because MiniSearch requires flat objects
 * - Discovery panel state management
 *
 * Use this type instead of GeoJSON.Feature when working with search and UI components.
 */
export interface POI {
  id: number;
  name: string;
  coordinates: GeoJSON.Position;

  // derived from GeoJSON feature properties
  level_id?: number | null;
  terminal_id?: string | null;
  layer_type?: string | null;
  category?: string | null;
}
