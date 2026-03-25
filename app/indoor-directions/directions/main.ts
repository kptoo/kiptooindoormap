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

/**
 * Haversine distance in kilometres between two [lng, lat] positions.
 */
function haversineKm(coord1: GeoJSON.Position, coord2: GeoJSON.Position): number {
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

/** Distance in metres */
function distMetres(a: GeoJSON.Position, b: GeoJSON.Position): number {
  return haversineKm(a, b) * 1000;
}

export interface RouteInfo {
  /** Total route length in metres */
  distanceMetres: number;
  /** Estimated walk time in minutes (assuming 80 m/min) */
  walkMinutes: number;
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

  private coordMapByLevel: Map<number, Map<CoordKey, Set<GeoJSON.Position[]>>> =
    new Map();

  private hasLoadedGraph = false;

  /** Populated after each successful route calculation */
  private lastRouteInfo: RouteInfo | null = null;

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

  /** Returns distance/time metadata from the last successful route, or null. */
  public getLastRouteInfo(): RouteInfo | null {
    return this.lastRouteInfo;
  }

  protected get snaplines() {
    return this.snappoints.length > 1
      ? this.buildSnaplines(
          this.waypointsCoordinates,
          this.snappointsCoordinates,
        )
      : [];
  }

  /**
   * Snap a waypoint coordinate onto the graph using edge-projection snapping.
   * Falls back to nearest-node if the pathfinder has no graph yet.
   */
  private snapCoordToGraph(coord: GeoJSON.Position): CoordKey {
    return this.pathFinder.snapPoint(coord, distMetres);
  }

  private updateSnapPoints() {
    this.snappoints = this._waypoints.map((waypoint) => {
      const snappedKey = this.snapCoordToGraph(waypoint.geometry.coordinates);
      const snappedCoord = snappedKey
        ? (JSON.parse(snappedKey) as [number, number])
        : (waypoint.geometry.coordinates as [number, number]);

      return this.buildPoint(snappedCoord, "SNAPPOINT");
    });
  }

  public loadMapData(
    corridors: GeoJSON.FeatureCollection,
    connectors?: GeoJSON.FeatureCollection,
  ) {
    const coordMapByLevel = new Map<
      number,
      Map<CoordKey, Set<GeoJSON.Position[]>>
    >();

    const graph = new Graph();

    this.coordMapByLevel = coordMapByLevel;

    // ── 1. Index corridor vertices & build graph edges ────────────────────────
    corridors.features.forEach((feature) => {
      if (feature.geometry.type !== "LineString") return;

      const p = (feature.properties ?? {}) as any;
      const level = parseLevel(p);
      const coordinates = feature.geometry.coordinates;

      // Index vertices per-level for connector snapping
      coordinates.forEach((coord) => {
        const key = JSON.stringify(coord);
        graph.addVertex(key, coord);

        if (level != null) {
          if (!coordMapByLevel.has(level))
            coordMapByLevel.set(level, new Map());
          const levelMap = coordMapByLevel.get(level)!;
          if (!levelMap.has(key)) levelMap.set(key, new Set());
          levelMap.get(key)!.add(coordinates);
        }
      });

      // Build edges for consecutive coordinate pairs
      for (let i = 0; i < coordinates.length - 1; i++) {
        const fromKey = JSON.stringify(coordinates[i]);
        const toKey = JSON.stringify(coordinates[i + 1]);
        const weight = distMetres(coordinates[i], coordinates[i + 1]);
        graph.addEdge(fromKey, toKey, weight);
      }
    });

    // ── 2. Stitch any disconnected corridor islands ───────────────────────────
    graph.stitchComponents(distMetres);

    // ── 3. Vertical connectors ────────────────────────────────────────────────
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

        // Find nearest corridor vertex on this level
        let nearest: GeoJSON.Position | null = null;
        let minDist = Infinity;
        levelMap.forEach((_, coordStr) => {
          const coord = JSON.parse(coordStr) as GeoJSON.Position;
          const d = distMetres(f.geometry.coordinates, coord);
          if (d < minDist) {
            minDist = d;
            nearest = coord;
          }
        });

        if (!nearest) continue;

        const snappedKey = JSON.stringify(nearest);
        const connectorKey = JSON.stringify(f.geometry.coordinates);

        graph.addVertex(connectorKey, f.geometry.coordinates);
        graph.addEdge(connectorKey, snappedKey, minDist);

        if (!connectorNodesByName.has(name))
          connectorNodesByName.set(name, []);
        connectorNodesByName
          .get(name)!
          .push({ level, nodeKey: connectorKey });
      }

      // Link same-name connectors across levels (stairs / lifts)
      for (const [, nodes] of connectorNodesByName) {
        nodes.sort((a, b) => a.level - b.level);

        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i];
          const b = nodes[i + 1];
          const floorsDelta = Math.abs(b.level - a.level);
          // Slight penalty per floor to prefer same-level routes when possible
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
    this.lastRouteInfo = null;

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
        const startCoord = this.snappoints[i].geometry
          .coordinates as GeoJSON.Position;
        const endCoord = this.snappoints[i + 1].geometry
          .coordinates as GeoJSON.Position;

        const startKey = JSON.stringify(startCoord);
        const endKey = JSON.stringify(endCoord);

        // ── Guarantee connectivity: if the two snap nodes ended up in
        //    different components (e.g. after virtual node injection),
        //    add a direct bridge edge before routing. ────────���─────────
        const graph = this.pathFinder.getGraph();
        const components = graph.getComponents();
        if (components.length > 1) {
          const startComp = components.find((c) => c.has(startKey));
          const endComp = components.find((c) => c.has(endKey));
          if (startComp && endComp && startComp !== endComp) {
            graph.addEdge(startKey, endKey, distMetres(startCoord, endCoord));
          }
        }

        const segmentVertices = this.pathFinder.dijkstraVertices(
          startKey,
          endKey,
        );

        if (segmentVertices.length === 0) {
          console.warn(
            "IndoorDirections: no path found between snap points",
            startKey,
            endKey,
          );
          this.routelines = [];
          this.draw();
          return;
        }

        const segmentRoute = segmentVertices.map(keyToCoord);

        if (i === 0) routes.push(...segmentRoute);
        else routes.push(...segmentRoute.slice(1));
      }

      this.fire(
        new IndoorDirectionsRoutingEvent("calculateroutesend", originalEvent),
      );

      this.routelines = [this.buildRouteLines(routes)];

      // ── Compute route metadata ──────────────────────────────────────
      let totalMetres = 0;
      for (let i = 0; i < routes.length - 1; i++) {
        totalMetres += distMetres(routes[i], routes[i + 1]);
      }
      this.lastRouteInfo = {
        distanceMetres: Math.round(totalMetres),
        walkMinutes: Math.max(1, Math.round(totalMetres / 80)),
      };
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
        this.map.getSource(
          this.configuration.sourceName,
        ) as maplibregl.GeoJSONSource
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
    this.lastRouteInfo = null;
  }
}
