import MiniSearch, { SearchResult } from "minisearch";
import { POI } from "~/types/poi";

interface POIProperties {
  id?: number;

  // loader-injected (and/or present in source data)
  name?: string | null;
  category?: string | null;
  gate_num?: string | null;
  layer_type?: string | null;
  terminal_id?: string | null;
  level_id?: number | null;

  // other optional fields that may exist
  type?: string | null;
  floor?: number | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  building_id?: string;
}

export interface POIFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: POIProperties;
}

function asNonEmptyString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/**
 * Build a stable, searchable name for terminal data.
 * Search MUST query `name`, so we derive `name` when the dataset doesn't provide it.
 */
function deriveName(props: POIProperties): string {
  const explicit = asNonEmptyString(props.name);
  if (explicit) return explicit;

  const gate = asNonEmptyString(props.gate_num);
  if (gate) return `Gate ${gate}`;

  const category = asNonEmptyString(props.category);
  if (category) return category;

  const layerType = asNonEmptyString(props.layer_type);
  if (layerType) return layerType;

  return "Unknown";
}

export class IndoorGeocoder {
  private miniSearch: MiniSearch;
  private cutoffThreshold: number;

  constructor(pois: POIFeature[], cutoffThreshold: number = 0.3) {
    this.cutoffThreshold = cutoffThreshold;

    this.miniSearch = new MiniSearch({
      // Search only `name`
      fields: ["name"],
      storeFields: [
        "name",
        "geometry",
        "id",
        "level_id",
        "terminal_id",
        "layer_type",
        "category",
      ],
    });

    const flattenPOIs = pois.map((feature: POIFeature, index: number) => {
      const props = feature.properties ?? ({} as POIProperties);

      const fallbackId =
        typeof (props as any).id === "number"
          ? (props as any).id
          : typeof feature.id === "number"
            ? feature.id
            : Number.isFinite(Number(feature.id))
              ? Number(feature.id)
              : index;

      const name = deriveName(props);

      return {
        ...props,
        id: fallbackId,
        name,
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
      level_id: (topResult as any).level_id ?? null,
      terminal_id: (topResult as any).terminal_id ?? null,
      layer_type: (topResult as any).layer_type ?? null,
      category: (topResult as any).category ?? null,
    };
  }

  public getAutocompleteResults(query: string, maxResults: number = 5): Array<POI> {
    if (!query) return [];

    const results = this.miniSearch.search(query, { prefix: true });
    if (results.length === 0) return [];

    const topScore = results[0].score;
    const cutoffIndex = this.getCutoffIndex(results, topScore);

    const relevantResults =
      cutoffIndex > 0 ? results.slice(0, cutoffIndex) : results.slice(0, 5);

    return relevantResults
      .map((result) => ({
        id: result.id,
        name: result.name,
        coordinates: (result as any).geometry.coordinates,
        level_id: (result as any).level_id ?? null,
        terminal_id: (result as any).terminal_id ?? null,
        layer_type: (result as any).layer_type ?? null,
        category: (result as any).category ?? null,
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
