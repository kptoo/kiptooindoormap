/**
 * Airport Data Loader
 * Fetches and transforms GeoJSON data from kptoo/indoor-map-data into the
 * structure expected by the IndoorMapLayer and POIsLayer.
 *
 * Data source: https://github.com/kptoo/indoor-map-data
 */

import type { IndoorMapGeoJSON } from "~/types/geojson";

// ─── Terminal Registry ─────────────────────────────────────────────────────────

export const TERMINAL_REGISTRY = [
  { folder: "Terminal_1",        prefix: "T1",  id: "T1",       label: "Terminal 1"        },
  { folder: "Terminal_2",        prefix: "T2",  id: "T2",       label: "Terminal 2"        },
  { folder: "Terminal_3",        prefix: "T3",  id: "T3",       label: "Terminal 3"        },
  { folder: "Terminal_4",        prefix: "T4",  id: "T4",       label: "Terminal 4"        },
  { folder: "Terminal_6",        prefix: "T6",  id: "T6",       label: "Terminal 6"        },
  { folder: "Terminal_7",        prefix: "T7",  id: "T7",       label: "Terminal 7"        },
  { folder: "Terminal_8",        prefix: "T8",  id: "T8",       label: "Terminal 8"        },
  { folder: "Terminal_B",        prefix: "TB",  id: "TB",       label: "Terminal B"        },
  { folder: "Terminal_Regional", prefix: "Reg", id: "Regional", label: "Regional Terminal" },
  { folder: "Terminal_Wgates",   prefix: "W",   id: "Wgates",   label: "West Gates"        },
] as const;

export type TerminalId = typeof TERMINAL_REGISTRY[number]["id"];

// Add building footprints as a polygon layer we load
export const POLYGON_LAYER_TYPES = [
  "building",
  "gates",
  "restrooms",
  "shops",
  "food_beverage",
  "services",
  "service",
] as const;

export const LINE_LAYER_TYPES = [
  "corridors",
  "Connect",
] as const;

export const POINT_LAYER_TYPES = [
  "vertical_circulation",
  "service",
] as const;

type PolygonLayerType = typeof POLYGON_LAYER_TYPES[number];
type LineLayerType    = typeof LINE_LAYER_TYPES[number];
type AllLayerType     = PolygonLayerType | LineLayerType | "vertical_circulation";

// ─── feature_type injection map ───────────────────────────────────────────────

// building is not a routable/interactive unit; render as corridor-ish fill
const FEATURE_TYPE_MAP: Record<AllLayerType, string> = {
  building:             "building",
  gates:                "unit",
  restrooms:            "unit",
  shops:                "unit",
  food_beverage:        "unit",
  services:             "unit",
  service:              "unit",
  corridors:            "corridor",
  Connect:              "corridor",
  vertical_circulation: "connector",
};

// Sub-category field per layer type
const CATEGORY_FIELD: Partial<Record<AllLayerType, string>> = {
  restrooms:    "type",
  service:      "type",
  services:     "type",
  shops:        "shop_type",
  food_beverage:"fb_type",
};

// Fill colours per feature_type (used as a hint for the layer renderer)
const FILL_COLOR_MAP: Record<string, string> = {
  building:  "#d6d5d1",
  unit:      "#f3e8d2",
  connector: "#c8e6fa",
  corridor:  "#d6d5d1",
};

// ─── CRS / reprojection helpers ───────────────────────────────────────────────

function isEPSG3857(geojson: GeoJSON.FeatureCollection): boolean {
  const crs = (geojson as { crs?: { properties?: { name?: string } } }).crs;
  return crs?.properties?.name?.includes("3857") === true;
}

function reprojectCoord(c: number[]): number[] {
  const lon = (c[0] / 20037508.34) * 180;
  const lat =
    (Math.atan(Math.exp((c[1] / 20037508.34) * Math.PI)) * 360) / Math.PI - 90;
  return [lon, lat];
}

function reprojectGeometry(g: GeoJSON.Geometry): GeoJSON.Geometry {
  switch (g.type) {
    case "Point":
      return { ...g, coordinates: reprojectCoord(g.coordinates as any) };
    case "MultiPoint":
    case "LineString":
      return { ...g, coordinates: (g.coordinates as any).map(reprojectCoord) };
    case "MultiLineString":
    case "Polygon":
      return {
        ...g,
        coordinates: (g.coordinates as any).map((r: any) =>
          r.map(reprojectCoord),
        ),
      };
    case "MultiPolygon":
      return {
        ...g,
        coordinates: (g.coordinates as any).map((p: any) =>
          p.map((r: any) => r.map(reprojectCoord)),
        ),
      };
    default:
      return g;
  }
}

// ─── Feature transformer ───────────────────────────────────────────────────────

let globalId = 1;

function transformFeature(
  raw: GeoJSON.Feature,
  terminalId: string,
  terminalLabel: string,
  layerType: AllLayerType,
  needsReproject: boolean,
): GeoJSON.Feature {
  const p = raw.properties ?? {};
  const rawLevel = (p["level"] ?? p["Level"]) as string | null | undefined;
  const level_id =
    rawLevel != null && rawLevel !== "null" ? parseInt(String(rawLevel), 10) : null;

  const feature_type = FEATURE_TYPE_MAP[layerType] ?? "unit";
  const categoryField = CATEGORY_FIELD[layerType];
  const category = categoryField
    ? ((p[categoryField] as string | null) ?? null)
    : null;

  return {
    type: "Feature",
    id: globalId++,
    properties: {
      feature_type,
      level_id,

      name: (p["name"] as string | null) ?? null,
      alt_name: null,
      category,
      restriction: null,
      accessibility: null,
      display_point: null,
      show: true,
      area: 0,

      fill: FILL_COLOR_MAP[feature_type] ?? null,

      terminal_id: terminalId,
      terminal_label: terminalLabel,
      layer_type: layerType,
      feature_id: (p["feature_id"] as string | null) ?? null,
      gate_num: (p["gate_num"] as string | null) ?? null,
    },
    geometry: needsReproject ? reprojectGeometry(raw.geometry!) : raw.geometry!,
  };
}

// ─── Geometry type helpers ────────────────────────────────────────────────────

function isPointGeometry(f: GeoJSON.Feature): boolean {
  return f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint";
}

function isLineGeometry(f: GeoJSON.Feature): boolean {
  return (
    f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString"
  );
}

function isPolygonGeometry(f: GeoJSON.Feature): boolean {
  return f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon";
}

// ─── Loader output type ───────────────────────────────────────────────────────

export interface LoadedAirportData {
  /** Polygon features for IndoorMapLayer (gates, shops, restrooms, services) */
  indoor_map: IndoorMapGeoJSON;
  /** Building footprints per terminal (used for fitting bounds) */
  buildings: GeoJSON.FeatureCollection;
  /** Point features for POIsLayer (elevators, stairs, escalators, service points) */
  pois: GeoJSON.FeatureCollection;
  /** Line features for RoutingLayer (corridors / Connect) */
  routing: GeoJSON.FeatureCollection;
  /** All distinct terminal IDs found in the loaded data */
  terminals: string[];
  /** All distinct floor levels found in the loaded data (sorted ascending) */
  floors: number[];
}

// ─── Main export ───────────────────────────────────────────────────────────────

const DATA_BASE_URL =
  "https://raw.githubusercontent.com/kptoo/indoor-map-data/main";

export async function loadAirportData(
  terminalFilter?: string[],
): Promise<LoadedAirportData> {
  globalId = 1;

  const polygonFeatures: GeoJSON.Feature[] = [];
  const buildingFeatures: GeoJSON.Feature[] = [];
  const pointFeatures: GeoJSON.Feature[] = [];
  const lineFeatures: GeoJSON.Feature[] = [];

  const detectedTerminals = new Set<string>();
  const detectedFloors = new Set<number>();

  const allLayerTypes: AllLayerType[] = [
    ...POLYGON_LAYER_TYPES,
    ...LINE_LAYER_TYPES,
    "vertical_circulation",
  ];

  const terminalsToLoad = TERMINAL_REGISTRY.filter(
    (t) => !terminalFilter || terminalFilter.includes(t.id),
  );

  await Promise.all(
    terminalsToLoad.map(async (terminal) => {
      await Promise.all(
        allLayerTypes.map(async (layerType) => {
          const url = `${DATA_BASE_URL}/${terminal.folder}/${terminal.prefix}_${layerType}.geojson`;
          try {
            const res = await fetch(url);
            if (!res.ok) return;

            const geojson = (await res.json()) as GeoJSON.FeatureCollection;
            if (!geojson?.features?.length) return;

            const needsReproject = isEPSG3857(geojson);

            geojson.features.forEach((raw) => {
              const transformed = transformFeature(
                raw,
                terminal.id,
                terminal.label,
                layerType,
                needsReproject,
              );

              const lid = transformed.properties?.level_id as number | null;
              if (lid != null && !isNaN(lid)) detectedFloors.add(lid);
              detectedTerminals.add(terminal.id);

              if (isPolygonGeometry(transformed)) {
                if (layerType === "building") {
                  buildingFeatures.push(transformed);
                } else {
                  polygonFeatures.push(transformed);
                }
              } else if (isPointGeometry(transformed)) {
                pointFeatures.push(transformed);
              } else if (isLineGeometry(transformed)) {
                lineFeatures.push(transformed);
              }
            });
          } catch {
            // ignore missing layers
          }
        }),
      );
    }),
  );

  return {
    indoor_map: {
      type: "FeatureCollection",
      features: polygonFeatures,
    } as IndoorMapGeoJSON,
    buildings: {
      type: "FeatureCollection",
      features: buildingFeatures,
    },
    pois: {
      type: "FeatureCollection",
      features: pointFeatures,
    },
    routing: {
      type: "FeatureCollection",
      features: lineFeatures,
    },
    terminals: [...detectedTerminals].sort(),
    floors: [...detectedFloors].sort((a, b) => a - b),
  };
}
