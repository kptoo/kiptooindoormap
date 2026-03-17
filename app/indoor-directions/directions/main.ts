import Graph from "../pathfinding/graph";
import PathFinder from "../pathfinding/pathfinder";
import { MapLibreGlDirectionsConfiguration } from "../types";
import {
  IndoorDirectionsEvented,
  IndoorDirectionsRoutingEvent,
  IndoorDirectionsWaypointEvent,
} from "./events";
import {
  buildConfiguration,
  buildPoint,
  buildRouteLines,
  buildSnaplines,
} from "./utils";

type CoordKey = string;

function normalizeName(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseLevel(p: Record<string, any> | null | undefined): number | null {
  if (!p) return null;
  const raw = p.level ?? p.Level ?? p.level_id;
  if (raw === null || raw === undefined || raw === "null") return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function keyToCoord(key: string): GeoJSON.Position {
  return JSON.parse(key) as GeoJSON.Position;
}

export default class IndoorDirections extends IndoorDirectionsEvented {
  protected declare readonly map: maplibregl.Map;
  private readonly pathFinder: PathFinder;

  protected readonly configuration: MapLibreGlDirectionsConfiguration;

  protected buildPoint = buildPoint;
  protected buildSnaplines = buildSnaplines;
  protected buildRouteLines = buildRouteLines;

  protected _waypoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
  protected snappoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
  protected routelines: GeoJSON.Feature<GeoJSON.LineString>[][] = [];

  private coordMap: Map<CoordKey, Set<GeoJSON.Position[]>> = new Map();
  private coordMapByLevel: Map<number, Map<CoordKey, Set<GeoJSON.Position[]>>> =
    new Map();

  private hasLoadedGraph = false;

  constructor(
    map: maplibregl.Map,
    configuration?: Partial<MapLibreGlDirectionsConfiguration>,
  ) {
    super(map);
    this.map = map;

    this.configuration = buildConfiguration(configuration);
    this.pathFinder = new PathFinder();

    this.init();
  }

  protected init() {
    this.map.addSource(this.configuration.sourceName, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });

    this.configuration.layers.forEach((layer) => {
      this.map.addLayer(layer);
    });
  }

  protected get waypointsCoordinates(): [number, number][] {
    return this._waypoints.map((waypoint) => {
      return [
        waypoint.geometry.coordinates[0],
        waypoint.geometry.coordinates[1],
      ];
    });
  }

  protected get snappointsCoordinates(): [number, number][] {
    return this.snappoints.map((snappoint) => {
      return [
        snappoint.geometry.coordinates[0],
        snappoint.geometry.coordinates[1],
      ];
    });
  }

  public get routelinesCoordinates() {
    return this.routelines;
  }

  protected get snaplines() {
    return this.snappoints.length > 1
      ? this.buildSnaplines(
          this.waypointsCoordinates,
          this.snappointsCoordinates,
        )
      : [];
  }

  private calculateDistance(coord1: GeoJSON.Position, coord2: GeoJSON.Position) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private findNearestGraphPoint(
    point: GeoJSON.Position,
    coordMap: Map<CoordKey, Set<GeoJSON.Position[]>>,
  ): GeoJSON.Position | null {
    let nearest: GeoJSON.Position | null = null;
    let minDistance = Infinity;

    coordMap.forEach((_, coordStr) => {
      const coord = JSON.parse(coordStr);
      const distance = this.calculateDistance(point, coord);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = coord;
      }
    });

    return nearest;
  }

  private updateSnapPoints() {
    this.snappoints = this._waypoints.map((waypoint) => {
      const nearest = this.findNearestGraphPoint(
        waypoint.geometry.coordinates,
        this.coordMap,
      );

      // If we cannot snap, keep original waypoint (routing will likely fail, but won't crash UI)
      const snapped =
        nearest != null ? (nearest as [number, number]) : (waypoint.geometry.coordinates as [number, number]);

      return this.buildPoint(snapped, "SNAPPOINT");
    });
  }

  public loadMapData(
    corridors: GeoJSON.FeatureCollection,
    connectors?: GeoJSON.FeatureCollection,
  ) {
    const coordMap = new Map<CoordKey, Set<GeoJSON.Position[]>>();
    const coordMapByLevel = new Map<
      number,
      Map<CoordKey, Set<GeoJSON.Position[]>>
    >();
    const graph = new Graph();

    this.coordMap = coordMap;
    this.coordMapByLevel = coordMapByLevel;

    // index corridor vertices
    corridors.features.forEach((feature) => {
      if (feature.geometry.type !== "LineString") return;

      const p = (feature.properties ?? {}) as any;
      const level = parseLevel(p);
      const coordinates = feature.geometry.coordinates;

      coordinates.forEach((coord) => {
        const key = JSON.stringify(coord);

        if (!coordMap.has(key)) coordMap.set(key, new Set());
        coordMap.get(key)!.add(coordinates);

        if (level != null) {
          if (!coordMapByLevel.has(level)) coordMapByLevel.set(level, new Map());
          const levelMap = coordMapByLevel.get(level)!;
          if (!levelMap.has(key)) levelMap.set(key, new Set());
          levelMap.get(key)!.add(coordinates);
        }
      });
    });

    // corridor edges
    corridors.features.forEach((feature) => {
      if (feature.geometry.type !== "LineString") return;

      const coordinates = feature.geometry.coordinates;

      for (let i = 0; i < coordinates.length - 1; i++) {
        const from = JSON.stringify(coordinates[i]);
        const to = JSON.stringify(coordinates[i + 1]);
        const weight = this.calculateDistance(coordinates[i], coordinates[i + 1]);

        graph.addEdge(from, to, weight);

        const fromOverlaps = coordMap.get(from);
        if (fromOverlaps && fromOverlaps.size > 1) {
          fromOverlaps.forEach((otherCoords) => {
            if (otherCoords == coordinates) {
              const idx = otherCoords.findIndex(
                (c) => JSON.stringify(c) === from,
              );
              if (idx !== -1) {
                if (idx > 0) graph.addEdge(from, JSON.stringify(otherCoords[idx - 1]), weight);
                if (idx < otherCoords.length - 1) graph.addEdge(from, JSON.stringify(otherCoords[idx + 1]), weight);
              }
            }
          });
        }
      }
    });

    // vertical connectors -> snap to nearest corridor vertex on same level, then connect same-name across levels
    const connectorNodesByName = new Map<
      string,
      Array<{ level: number; nodeKey: string }>
    >();

    if (connectors?.features?.length) {
      for (const f of connectors.features) {
        if (f.geometry.type !== "Point") continue;

        const props = (f.properties ?? {}) as any;
        const name = normalizeName(props.name);
        const level = parseLevel(props);
        if (!name || level == null) continue;

        const levelMap = coordMapByLevel.get(level);
        if (!levelMap || levelMap.size === 0) continue;

        const snapped = this.findNearestGraphPoint(
          f.geometry.coordinates,
          levelMap,
        );
        if (!snapped) continue;

        const snappedKey = JSON.stringify(snapped);
        const connectorKey = JSON.stringify(f.geometry.coordinates);

        const snapWeight = this.calculateDistance(f.geometry.coordinates, snapped);
        graph.addEdge(connectorKey, snappedKey, snapWeight);

        if (!connectorNodesByName.has(name)) connectorNodesByName.set(name, []);
        connectorNodesByName.get(name)!.push({ level, nodeKey: connectorKey });
      }

      for (const [, nodes] of connectorNodesByName) {
        nodes.sort((a, b) => a.level - b.level);

        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i];
          const b = nodes[i + 1];

          const floorsDelta = Math.abs(b.level - a.level);
          const verticalWeight = 0.02 + floorsDelta * 0.02;
          graph.addEdge(a.nodeKey, b.nodeKey, verticalWeight);
        }
      }
    }

    this.pathFinder.setGraph(graph);
    this.hasLoadedGraph = true;
  }

  public setWaypoints(waypoints: [number, number][]) {
    this._waypoints = waypoints.map((coord) => buildPoint(coord, "WAYPOINT"));
    this.assignWaypointsCategories();

    const waypointEvent = new IndoorDirectionsWaypointEvent(
      "setwaypoints",
      undefined,
    );

    this.updateSnapPoints();

    this.fire(waypointEvent);
    this.draw();

    try {
      this.calculateDirections(waypointEvent);
    } catch (error) {
      console.error(error);
    }
  }

  protected calculateDirections(originalEvent: IndoorDirectionsWaypointEvent) {
    const routes: GeoJSON.Position[] = [];

    if (!this.hasLoadedGraph) {
      this.routelines = [];
      this.draw();
      return;
    }

    if (this.snappoints.length >= 2) {
      this.fire(
        new IndoorDirectionsRoutingEvent("calculateroutesstart", originalEvent),
      );

      for (let i = 0; i < this.snappoints.length - 1; i++) {
        const startCoord = this.snappoints[i].geometry.coordinates as GeoJSON.Position;
        const endCoord = this.snappoints[i + 1].geometry.coordinates as GeoJSON.Position;

        const startKey = JSON.stringify(startCoord);
        const endKey = JSON.stringify(endCoord);

        // Route by graph vertices (keys) to avoid "Vertex not found" from non-vertex coords
        const segmentVertices = this.pathFinder.dijkstraVertices(startKey, endKey);
        const segmentRoute = segmentVertices.map(keyToCoord);

        if (i === 0) routes.push(...segmentRoute);
        else routes.push(...segmentRoute.slice(1));
      }

      this.fire(
        new IndoorDirectionsRoutingEvent("calculateroutesend", originalEvent),
      );

      this.routelines = [this.buildRouteLines(routes)];
    } else {
      this.routelines = [];
    }

    this.draw();
  }

  protected draw() {
    const features = [
      ...this._waypoints,
      ...this.snappoints,
      ...this.snaplines,
      ...this.routelines.flat(),
    ];

    const geoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    if (this.map.getSource(this.configuration.sourceName)) {
      (
        this.map.getSource(this.configuration.sourceName) as maplibregl.GeoJSONSource
      ).setData(geoJson);
    }
  }

  protected assignWaypointsCategories() {
    this._waypoints.forEach((waypoint, index) => {
      let category;
      if (index === 0) category = "ORIGIN";
      else if (index === this._waypoints.length - 1) category = "DESTINATION";
      else category = undefined;

      if (waypoint.properties) {
        (waypoint.properties as any).index = index;
        (waypoint.properties as any).category = category;
      }
    });
  }

  clear() {
    this.setWaypoints([]);
    this.routelines = [];
  }
}
