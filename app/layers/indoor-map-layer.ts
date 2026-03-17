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

  updateData(newData: IndoorMapGeoJSON) {
    this.indoorMapData = newData;
    if (!this.map) return;
    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    if (source) source.setData(this.indoorMapData);
  }

  setFloorLevel(level: number) {
    if (!this.map || !this.indoorMapData) return;

    // When ALL terminals is active, show ALL levels too (no floor filtering).
    if (this.activeTerminal === "ALL") {
      const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
      source.setData(this.indoorMapData);
      return;
    }

    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;
    const features = this.indoorMapData.features.filter(
      (f: IndoorFeature) =>
        (f.properties.level_id === level || f.properties.level_id === null) &&
        f.properties.terminal_id === this.activeTerminal,
    );
    source.setData({ type: "FeatureCollection", features });
  }

  setTerminal(terminalId: string, currentFloor?: number) {
    this.activeTerminal = terminalId;
    if (!this.map || !this.indoorMapData) return;

    const source = this.map.getSource("indoor-map") as maplibregl.GeoJSONSource;

    // ALL terminals => show everything, ignore currentFloor
    if (terminalId === "ALL") {
      source.setData(this.indoorMapData);
      return;
    }

    const features = this.indoorMapData.features.filter((f: IndoorFeature) => {
      const terminalMatch = f.properties.terminal_id === terminalId;

      // If a specific floor is provided, filter; otherwise show all floors for this terminal
      const floorMatch =
        currentFloor === undefined ||
        f.properties.level_id === currentFloor ||
        f.properties.level_id === null;

      return terminalMatch && floorMatch;
    });

    source.setData({ type: "FeatureCollection", features });
  }

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

    const UNIT_HEIGHT = 4;
    const CONNECTOR_HEIGHT = 2;

    map.addSource("indoor-map", {
      type: "geojson",
      data: this.indoorMapData,
      generateId: false,
    });

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
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          colors.unit_hovered,
          [
            "interpolate",
            ["linear"],
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
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0,
          16,
          ["coalesce", ["get", "height"], UNIT_HEIGHT],
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
