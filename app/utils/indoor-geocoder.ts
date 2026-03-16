import MiniSearch, { SearchResult } from "minisearch";
import { POI } from "~/types/poi";

interface POIProperties {
  id?: number;
  name?: string | null;

  // injected by loader:
  category?: string | null;
  level_id?: number | null;
  terminal_id?: string | null;
  layer_type?: string | null;
  gate_num?: string | null;

  // optional legacy/other:
  type?: string | null;
  floor?: number | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  building_id?: string;
}

export interface POIFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: POIProperties;
}

function normalizeToken(v: unknown): string {
  return String(v ?? "").trim();
}

function buildDisplayName(props: POIProperties): string {
  const explicit = normalizeToken(props.name);
  if (explicit) return explicit;

  // Gates commonly have gate_num but no explicit name in some datasets
  const gateNum = normalizeToken(props.gate_num);
  if (gateNum) return `Gate ${gateNum}`;

  // Otherwise fall back to something useful (category/layer_type)
  const category = normalizeToken(props.category);
  if (category) return category;

  const layerType = normalizeToken(props.layer_type);
  if (layerType) return layerType;

  return "Unknown";
}

function buildSearchText(props: POIProperties, displayName: string): string {
  // Include everything a user might type
  const parts = [
    displayName,
    props.name,
    props.category,
    props.layer_type,
    props.terminal_id,
    props.gate_num,
    props.level_id,
    props.floor,
    props.type,
  ].map(normalizeToken);

  // De-dupe + join
  return Array.from(new Set(parts.filter(Boolean))).join(" ");
}

/**
 * IndoorGeocoder encapsulates search functionality using MiniSearch.
 */
export class IndoorGeocoder {
  private miniSearch: MiniSearch;
  private cutoffThreshold: number;

  constructor(pois: POIFeature[], cutoffThreshold: number = 0.3) {
    this.cutoffThreshold = cutoffThreshold;

    this.miniSearch = new MiniSearch({
      // Search across both the visible name AND a combined text field
      fields: ["name", "searchText"],
      storeFields: ["name", "geometry", "id"],
      // MiniSearch defaults to idField: "id"
      searchOptions: {
        prefix: true, // makes typing feel like autocomplete
        fuzzy: 0.2, // tolerate minor typos
      },
    });

    const flattenPOIs = pois.map((feature: POIFeature, index: number) => {
      const props = feature.properties ?? ({} as POIProperties);

      // Ensure we always have an id for MiniSearch
      const fallbackId =
        typeof (props as any).id === "number"
          ? (props as any).id
          : typeof feature.id === "number"
            ? feature.id
            : Number.isFinite(Number(feature.id))
              ? Number(feature.id)
              : index;

      const displayName = buildDisplayName(props);
      const searchText = buildSearchText(props, displayName);

      return {
        ...props,
        id: fallbackId,
        name: displayName,
        searchText,
        geometry: feature.geometry,
      };
    });

    this.miniSearch.addAll(flattenPOIs);
  }

  public indoorGeocodeInput(input: string): POI {
    const results = this.miniSearch.search(input);
    if (results.length === 0) {
      throw new Error("No results found.");
    }
    const topResult = results[0];
    return {
      id: topResult.id,
      name: topResult.name,
      coordinates: topResult.geometry.coordinates,
    };
  }

  public getAutocompleteResults(query: string, maxResults: number = 5): Array<POI> {
    if (!query) return [];

    const results = this.miniSearch.search(query);
    if (results.length === 0) return [];

    const topScore = results[0].score;
    const cutoffIndex = this.getCutoffIndex(results, topScore);

    const relevantResults =
      cutoffIndex > 0 ? results.slice(0, cutoffIndex) : results.slice(0, 5);

    return relevantResults
      .map((result) => ({
        id: result.id,
        name: result.name,
        coordinates: result.geometry.coordinates,
      }))
      .slice(0, maxResults);
  }

  private getCutoffIndex(results: SearchResult[], topScore: number): number {
    return results.findIndex((result, index) => {
      if (index === 0) return false;
      const scoreDiff = topScore - result.score;
      return scoreDiff > topScore * this.cutoffThreshold;
    });
  }
}
