import { CustomLayerInterface, Map } from "maplibre-gl";

export default class RoutingLayer implements CustomLayerInterface {
  id: string = "routing";
  type = "custom" as const;
  private routingData: GeoJSON.FeatureCollection;
  private theme: string;

  constructor(routingData: GeoJSON.FeatureCollection, theme: string = "light") {
    this.routingData = routingData;
    this.theme = theme;
  }

  render = () => {};

  updateData(newData: GeoJSON.FeatureCollection) {
    this.routingData = newData;
  }

  setFloorLevel(level: number, map: Map) {
    const source = map.getSource("routing") as maplibregl.GeoJSONSource;
    if (!source) return;
    const features = this.routingData.features.filter((f) => {
      const p = f.properties ?? {};
      const rawLevel = (p["level"] ?? p["Level"]) as string | null | undefined;
      const lid = rawLevel != null ? parseInt(String(rawLevel), 10) : null;
      return lid === level || lid === null;
    });
    source.setData({ type: "FeatureCollection", features });
  }

  onAdd(map: Map): void {
    const lineColor = this.theme === "dark" ? "#6b7280" : "#9ca3af";

    map.addSource("routing", {
      type: "geojson",
      data: this.routingData,
    });

    map.addLayer({
      id: "routing-lines",
      type: "line",
      source: "routing",
      minzoom: 15,
      paint: {
        "line-color": lineColor,
        "line-width": 2,
        "line-opacity": 0.6,
        "line-dasharray": [4, 2],
      },
    });
  }
}
