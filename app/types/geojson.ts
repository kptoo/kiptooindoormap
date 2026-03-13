export interface IndoorFeatureProperties {
  /** Floor level as a number (1, 2, 3 …) or null for all-floor features */
  level_id: number | null;
  /** App feature type: "unit" | "corridor" | "connector" */
  feature_type: "unit" | "corridor" | "connector" | string;
  /** Human-readable name */
  name: string | null;
  /** Sub-category (e.g. "women", "cosmetics", "restaurant") */
  category: string | null;
  /** Terminal identifier (e.g. "T1", "T2", "Regional") */
  terminal_id: string | null;
  /** Terminal display label */
  terminal_label: string | null;
  /** Original dataset layer type (e.g. "gates", "shops") */
  layer_type: string | null;
  /** Original dataset feature_id string */
  feature_id: string | null;
  /** Gate number if applicable */
  gate_num: string | null;
  /** Optional fill colour override */
  fill: string | null;
  [key: string]: unknown;
}

export interface IndoorFeature extends GeoJSON.Feature {
  id: number;
  properties: IndoorFeatureProperties;
}

export interface IndoorMapGeoJSON extends GeoJSON.FeatureCollection {
  features: IndoorFeature[];
}
