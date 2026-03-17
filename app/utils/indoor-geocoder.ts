import MiniSearch, { SearchResult } from "minisearch";
import { POI } from "~/types/poi";

interface POIProperties {
  id?: number;

  name?: string | null;
  category?: string | null;
  gate_num?: string | null;
  layer_type?: string | null;
  terminal_id?: string | null;
  level_id?: number | null;

  type?: string | null;
  floor?: number | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  building_id?: string;
}

export interface POIFeature extends GeoJSON.Feature {
  properties: POIProperties;
}

function asNonEmptyString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

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

function extendBbox(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  coord: GeoJSON.Position,
) {
  const x = coord[0];
  const y = coord[1];
  if (x < bbox.minX) bbox.minX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y > bbox.maxY) bbox.maxY = y;
}

function getGeometryCenter(geometry: GeoJSON.Geometry): GeoJSON.Position {
  // For Point return itself; for everything else return bbox center (good enough for zooming)
  if (geometry.type === "Point") return geometry.coordinates as GeoJSON.Position;

  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const walkCoords = (coords: any) => {
    if (!coords) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      extendBbox(bbox, coords as GeoJSON.Position);
      return;
    }
    for (const c of coords) walkCoords(c);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkCoords((geometry as any).coordinates);

  if (!Number.isFinite(bbox.minX) || !Number.isFinite(bbox.minY)) {
    // fallback if geometry is weird
    return [0, 0];
  }

  return [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2];
}

export class IndoorGeocoder {
  private miniSearch: MiniSearch;
  private cutoffThreshold: number;

  constructor(pois: POIFeature[], cutoffThreshold: number = 0.3) {
    this.cutoffThreshold = cutoffThreshold;

    this.miniSearch = new MiniSearch({
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
    if (results.length === 0) throw new Error("No results found.");

    const topResult = results[0];
    const geometry = (topResult as any).geometry as GeoJSON.Geometry;

    return {
      id: topResult.id,
      name: topResult.name,
      coordinates: getGeometryCenter(geometry),
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
      .map((result) => {
        const geometry = (result as any).geometry as GeoJSON.Geometry;

        return {
          id: result.id,
          name: result.name,
          coordinates: getGeometryCenter(geometry),
          level_id: (result as any).level_id ?? null,
          terminal_id: (result as any).terminal_id ?? null,
          layer_type: (result as any).layer_type ?? null,
          category: (result as any).category ?? null,
        };
      })
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
