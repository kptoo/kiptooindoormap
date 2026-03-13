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
        (this.activeTerminal === "ALL" || f.properties.terminal_id === this.activeTerminal),
    );
    source.setData({ type: "FeatureCollection", features });
  }

  // ── Terminal filtering ──────────────────────────────────────────────────────

  setTerminal(terminalId: string, currentFloor?: number) {
    this.activeTerminal = terminalId;
    if (!this.map || !this.indoorMapData) return;
    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    const features = this.indoorMapData.features.filter(
      (f: IndoorFeature) => {
        const terminalMatch = terminalId === "ALL" || f.properties.terminal_id === terminalId;
        const floorMatch =
          currentFloor === undefined ||
          f.properties.level_id === currentFloor ||
          f.properties.level_id === null;
        return terminalMatch && floorMatch;
      },
    );
    source.setData({ type: "FeatureCollection", features });
  }

  // ── Floor discovery ─────────────────────────────────────────────────────────

  async getAvailableFloors(terminalId?: string): Promise<number[]> {
    const floors = new Set<number>();
    this.indoorMapData.features.forEach((f) => {
      const lid = f.properties.level_id;
      if (lid !== null && !isNaN(lid as number)) {
        if (!terminalId || terminalId === "ALL" || f.properties.terminal_id === terminalId) {
          floors.add(lid as number);
        }
      }
    });
    const result = [...floors].sort((a, b) => a - b);
    if (!result.includes(1)) result.unshift(1); // airports typically start at level 1
    return result;
  }

  // ── Map setup ───────────────────────────────────────────────────────────────

  async onAdd(map: Map): Promise<void> {
    this.map = map;

    const lightColor = {
      unit:         "#f3e8d2",
      unit_hovered: "#e0c898",
      corridor:     "#d6d5d1",
      connector:    "#c8e6fa",
      outline:      "#a6a5a2",
    };

    const darkColor = {
      unit:         "#1f2937",
      unit_hovered: "#374151",
      corridor:     "#030712",
      connector:    "#1e3a5f",
      outline:      "#1f2937",
    };

    const colors = this.theme === "dark" ? darkColor : lightColor;

    map.addSource("indoor-map", {
      type: "geojson",
      data: this.indoorMapData,
      generateId: false, // IDs are pre-assigned by the loader
    });

    // Floor fill (all polygons)
    map.addLayer({
      id: "indoor-map-fill",
      type: "fill",
      source: "indoor-map",
      paint: {
        "fill-color": [
          "coalesce",
          ["get", "fill"],
          colors.corridor,
        ],
        "fill-opacity": 0.85,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    // Outline (all polygons)
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

    // 3-D extrusion for "unit" features (gates, shops, restrooms)
    map.addLayer({
      id: "indoor-map-extrusion",
      type: "fill-extrusion",
      source: "indoor-map",
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "feature_type"], "unit"]],
      paint: {
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          colors.unit_hovered,
          ["coalesce", ["get", "fill"], colors.unit],
        ],
        "fill-extrusion-height": 3,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.9,
      },
    });

    // Low-height extrusion for connector features (elevators, stairs)
    map.addLayer({
      id: "indoor-map-connector-extrusion",
      type: "fill-extrusion",
      source: "indoor-map",
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "feature_type"], "connector"]],
      paint: {
        "fill-extrusion-color": colors.connector,
        "fill-extrusion-height": 1,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.9,
      },
    });

    // Room name labels
    map.addLayer({
      id: "indoor-map-labels",
      type: "symbol",
      source: "indoor-map",
      minzoom: 17,
      filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "name"], null]],
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

    // ── Hover interaction ──
    map.on("mousemove", "indoor-map-extrusion", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (e.features && e.features.length > 0) {
        if (this.hoveredRoomId !== null) {
          map.setFeatureState({ source: "indoor-map", id: this.hoveredRoomId }, { hover: false });
        }
        this.hoveredRoomId = e.features[0].id as number;
        map.setFeatureState({ source: "indoor-map", id: this.hoveredRoomId }, { hover: true });
      }
    });

    map.on("mouseleave", "indoor-map-extrusion", () => {
      map.getCanvas().style.cursor = "";
      if (this.hoveredRoomId !== null) {
        map.setFeatureState({ source: "indoor-map", id: this.hoveredRoomId }, { hover: false });
        this.hoveredRoomId = null;
      }
    });
  }
}
