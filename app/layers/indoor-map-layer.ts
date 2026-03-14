import { CustomLayerInterface, Map } from "maplibre-gl";
import { IndoorFeature, IndoorMapGeoJSON } from "~/types/geojson";

export default class IndoorMapLayer implements CustomLayerInterface {
  id: string = "indoor-map";
  type = "custom" as const;
  private map: Map | null = null;
  private indoorMapData: IndoorMapGeoJSON;
  private theme: string;
  private hoveredRoomId: number | null = null;

  /** "ALL" means show all terminals */
  private activeTerminal: string = "ALL";

  constructor(indoorMapData: IndoorMapGeoJSON, theme: string = "light") {
    this.indoorMapData = indoorMapData;
    this.theme = theme;
  }

  render = () => {
    // Rendering is handled by maplibre's internal renderer for GeoJSON sources
  };

  // ── Data updates ────────────────────────────────────────────────────────────

  updateData(newData: IndoorMapGeoJSON) {
    this.indoorMapData = newData;
    if (!this.map) return;
    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    if (source) source.setData(this.indoorMapData);
  }

  // ── Floor filtering ─────────────────────────────────────────────────────────

  setFloorLevel(level: number) {
    if (!this.map || !this.indoorMapData) return;
    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    const features = this.indoorMapData.features.filter(
      (f: IndoorFeature) =>
        (f.properties.level_id === level || f.properties.level_id === null) &&
        (this.activeTerminal === "ALL" ||
          f.properties.terminal_id === this.activeTerminal),
    );
    source.setData({ type: "FeatureCollection", features });
  }

  // ── Terminal filtering ──────────────────────────────────────────────────────

  setTerminal(terminalId: string, currentFloor?: number) {
    this.activeTerminal = terminalId;
    if (!this.map || !this.indoorMapData) return;
    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    const features = this.indoorMapData.features.filter((f: IndoorFeature) => {
      const terminalMatch =
        terminalId === "ALL" || f.properties.terminal_id === terminalId;
      const floorMatch =
        currentFloor === undefined ||
        f.properties.level_id === currentFloor ||
        f.properties.level_id === null;
      return terminalMatch && floorMatch;
    });
    source.setData({ type: "FeatureCollection", features });
  }

  // ── Floor discovery ─────────────────────────────────────────────────────────

  async getAvailableFloors(terminalId?: string): Promise<number[]> {
    const floors = new Set<number>();
    this.indoorMapData.features.forEach((f) => {
      const lid = f.properties.level_id;
      if (lid !== null && !isNaN(lid as number)) {
        if (
          !terminalId ||
          terminalId === "ALL" ||
          f.properties.terminal_id === terminalId
        ) {
          floors.add(lid as number);
        }
      }
    });
    const result = [...floors].sort((a, b) => a - b);
    if (!result.includes(1)) result.unshift(1);
    return result;
  }

  // ── Map setup ───────────────────────────────────────────────────────────────

  async onAdd(map: Map): Promise<void> {
    this.map = map;

    const lightColor = {
      unit: "#f3e8d2",
      unit_hovered: "#e0c898",
      corridor: "#d6d5d1",
      connector: "#c8e6fa",
      outline: "#a6a5a2",
    };

    const darkColor = {
      unit: "#1f2937",
      unit_hovered: "#374151",
      corridor: "#030712",
      connector: "#1e3a5f",
      outline: "#1f2937",
    };

    const colors = this.theme === "dark" ? darkColor : lightColor;

    // ── Tile3dLayer-equivalent height constants for indoor features ──
    // Mirrors tile-3d-layer.ts: height animates from 0 at zoom 15 → full at zoom 16,
    // using the same interpolate/linear/zoom expression pattern.
    const UNIT_HEIGHT = 4;       // gates, shops, restrooms — equivalent to a low building storey
    const CONNECTOR_HEIGHT = 2;  // stairs, elevators — shorter than rooms

    map.addSource("indoor-map", {
      type: "geojson",
      data: this.indoorMapData,
      generateId: false, // IDs are pre-assigned by the loader
    });

    // ── Floor fill (all polygons) ────────────────────────────────────────────
    map.addLayer({
      id: "indoor-map-fill",
      type: "fill",
      source: "indoor-map",
      paint: {
        "fill-color": ["coalesce", ["get", "fill"], colors.corridor],
        "fill-opacity": 0.85,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    // ── Outline (all polygons) ───────────────────────────────────────────────
    map.addLayer({
      id: "indoor-map-fill-outline",
      type: "line",
      source: "indoor-map",
      paint: {
        "line-color": colors.outline,
        "line-width": 1,
        "line-opacity": 0.8,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    // ── 3-D extrusion for "unit" features (gates, shops, restrooms) ──────────
    // Uses the exact same zoom-interpolated height + color-by-height technique
    // as tile-3d-layer.ts ("3d-buildings"):
    //   • fill-extrusion-color  → interpolated by render height (0→lightgray, mid→royalblue, tall→lightblue)
    //   • fill-extrusion-height → interpolated by zoom (0 at z15 → full height at z16), animates in on zoom
    //   • fill-extrusion-base   → 0 below z16, render_min_height at z16+ (indoor: always 0)
    map.addLayer({
      id: "indoor-map-extrusion",
      type: "fill-extrusion",
      source: "indoor-map",
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "feature_type"], "unit"],
      ],
      paint: {
        // Color interpolated by height — mirrors tile-3d-layer colour ramp
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          colors.unit_hovered,
          [
            "interpolate",
            ["linear"],
            // Use the GeoJSON `height` property if present, else fall back to UNIT_HEIGHT
            ["coalesce", ["get", "height"], UNIT_HEIGHT],
            0,
            "lightgray",
            3,
            ["coalesce", ["get", "fill"], colors.unit],
            6,
            "royalblue",
            12,
            "lightblue",
          ],
        ],
        // Height animates from 0 at zoom 15 → full height at zoom 16
        // Mirrors: fill-extrusion-height in tile-3d-layer.ts
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          ["coalesce", ["get", "height"], UNIT_HEIGHT],
        ],
        // Base always 0 for indoor (single-storey extrusion from ground)
        // Mirrors: fill-extrusion-base in tile-3d-layer.ts (0 below z16)
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          0,
        ],
        "fill-extrusion-opacity": 0.9,
      },
    });

    // ── Low-height extrusion for connector features (elevators, stairs) ──────
    // Same zoom-animated pattern, at half the unit height
    map.addLayer({
      id: "indoor-map-connector-extrusion",
      type: "fill-extrusion",
      source: "indoor-map",
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["get", "feature_type"], "connector"],
      ],
      paint: {
        "fill-extrusion-color": colors.connector,
        // Zoom-animated height — same pattern as tile-3d-layer.ts
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          ["coalesce", ["get", "height"], CONNECTOR_HEIGHT],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          0,
        ],
        "fill-extrusion-opacity": 0.9,
      },
    });

    // ── Room name labels ──────────────��──────────────────────────────────────
    map.addLayer({
      id: "indoor-map-labels",
      type: "symbol",
      source: "indoor-map",
      minzoom: 17,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["!=", ["get", "name"], null],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-max-width": 10,
        "text-anchor": "center",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": this.theme === "dark" ? "#ffffff" : "#333333",
        "text-halo-color": this.theme === "dark" ? "#000000" : "#ffffff",
        "text-halo-width": 1.5,
      },
    });

    // ── Hover interaction ────────────────────────────────────────────────────
    map.on("mousemove", "indoor-map-extrusion", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (e.features && e.features.length > 0) {
        if (this.hoveredRoomId !== null) {
          map.setFeatureState(
            { source: "indoor-map", id: this.hoveredRoomId },
            { hover: false },
          );
        }
        this.hoveredRoomId = e.features[0].id as number;
        map.setFeatureState(
          { source: "indoor-map", id: this.hoveredRoomId },
          { hover: true },
        );
      }
    });

    map.on("mouseleave", "indoor-map-extrusion", () => {
      map.getCanvas().style.cursor = "";
      if (this.hoveredRoomId !== null) {
        map.setFeatureState(
          { source: "indoor-map", id: this.hoveredRoomId },
          { hover: false },
        );
        this.hoveredRoomId = null;
      }
    });
  }
}
