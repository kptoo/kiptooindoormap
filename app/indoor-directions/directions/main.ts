import Graph, { ptKey, keyToPosition, distMetres } from "../pathfinding/graph";
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

function parseLevel(
  p: Record<string, any> | null | undefined,
): number | null {
  if (!p) return null;
  const raw = p.level ?? p.Level ?? p.level_id;
  if (raw === null || raw === undefined || raw === "null") return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export interface RouteInfo {
  distanceMetres: number;
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

  /** Per-level vertex index for connector snapping */
  private coordMapByLevel: Map<number, Map<CoordKey, GeoJSON.Position>> =
    new Map();

  private hasLoadedGraph = false;
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
      data: { type: "FeatureCollection", features: [] },
    });
    this.configuration.layers.forEach((layer) => {
      this.map.addLayer(layer);
    });
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  protected get waypointsCoordinates(): [number, number][] {
    return this._waypoints.map((wp) => [
      wp.geometry.coordinates[0],
      wp.geometry.coordinates[1],
    ]);
  }

  protected get snappointsCoordinates(): [number, number][] {
    return this.snappoints.map((sp) => [
      sp.geometry.coordinates[0],
      sp.geometry.coordinates[1],
    ]);
  }

  public get routelinesCoordinates() {
    return this.routelines;
  }

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

  // ── Snap waypoints to graph — calls graph.snapPoint() same as HTML demo ──

  private updateSnapPoints() {
    const graph = this.pathFinder.getGraph();

    this.snappoints = this._waypoints.map((waypoint) => {
      const [lng, lat] = waypoint.geometry.coordinates;
      // graph.snapPoint() is a direct port of the HTML demo's g.snapPoint()
      const snappedKey = graph.snapPoint(lng, lat);
      const snappedCoord = snappedKey
        ? (keyToPosition(snappedKey) as [number, number])
        : ([lng, lat] as [number, number]);
      return this.buildPoint(snappedCoord, "SNAPPOINT");
    });
  }

  // ── Build graph — mirrors HTML demo's buildGraph() exactly ───────────────

  public loadMapData(
    corridors: GeoJSON.FeatureCollection,
    connectors?: GeoJSON.FeatureCollection,
  ) {
    const graph = new Graph();
    const coordMapByLevel = new Map<number, Map<CoordKey, GeoJSON.Position>>();
    this.coordMapByLevel = coordMapByLevel;

    // ── 1. Corridors: add nodes + edges (mirrors HTML demo's buildGraph) ────
    //    Handles both LineString and MultiLineString, exactly as the demo does.
    const corridorSources = [corridors];
    // connectors lines (if any are LineStrings) are also treated as walkable
    const allLineSources: GeoJSON.FeatureCollection[] = [corridors];

    allLineSources.forEach((fc) => {
      fc.features.forEach((feature) => {
        const p = (feature.properties ?? {}) as any;
        const level = parseLevel(p);
        const geom = feature.geometry;

        const lines: GeoJSON.Position[][] =
          geom.type === "LineString"
            ? [geom.coordinates]
            : geom.type === "MultiLineString"
              ? geom.coordinates
              : [];

        lines.forEach((coords) => {
          for (let i = 0; i < coords.length - 1; i++) {
            const k1 = graph.addNode(coords[i][0], coords[i][1]);
            const k2 = graph.addNode(coords[i + 1][0], coords[i + 1][1]);
            if (k1 !== k2) graph.addEdge(k1, k2);

            // Index by level for connector snapping
            if (level != null) {
              if (!coordMapByLevel.has(level))
                coordMapByLevel.set(level, new Map());
              const lm = coordMapByLevel.get(level)!;
              lm.set(k1, graph.nodes[k1]);
              lm.set(k2, graph.nodes[k2]);
            }
          }
        });
      });
    });

    // ── 2. Stitch disconnected corridor islands — same as HTML demo ──────────
    graph.stitchComponents();

    // ── 3. Vertical connectors (stairs / lifts) ───────────────────────────────
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

        // Snap connector to nearest corridor vertex on the same level
        let nearest: GeoJSON.Position | null = null;
        let minDist = Infinity;
        levelMap.forEach((coord) => {
          const d = distMetres(
            f.geometry.coordinates as GeoJSON.Position,
            coord,
          );
          if (d < minDist) {
            minDist = d;
            nearest = coord;
          }
        });
        if (!nearest) continue;

        const snappedKey = ptKey(
          (nearest as GeoJSON.Position)[0],
          (nearest as GeoJSON.Position)[1],
        );
        const connectorKey = graph.addNode(
          (f.geometry.coordinates as GeoJSON.Position)[0],
          (f.geometry.coordinates as GeoJSON.Position)[1],
        );

        graph.addEdge(connectorKey, snappedKey, minDist);

        if (!connectorNodesByName.has(name))
          connectorNodesByName.set(name, []);
        connectorNodesByName
          .get(name)!
          .push({ level, nodeKey: connectorKey });
      }

      // Link same-name connectors across floors
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

  // ── Public API ────────────────────────────────────────────────────────────

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
    this.lastRouteInfo = null;

    if (!this.hasLoadedGraph || this.snappoints.length < 2) {
      this.routelines = [];
      this.draw();
      return;
    }

    this.fire(
      new IndoorDirectionsRoutingEvent("calculateroutesstart", originalEvent),
    );

    const routes: GeoJSON.Position[] = [];
    const graph = this.pathFinder.getGraph();

    for (let i = 0; i < this.snappoints.length - 1; i++) {
      const startCoord = this.snappoints[i].geometry
        .coordinates as GeoJSON.Position;
      const endCoord = this.snappoints[i + 1].geometry
        .coordinates as GeoJSON.Position;

      // Always look up by ptKey — same grid-snapping as addNode/snapPoint
      const startKey = ptKey(startCoord[0], startCoord[1]);
      const endKey = ptKey(endCoord[0], endCoord[1]);

      // ── Post-snap connectivity bridge — exact same logic as HTML demo ─────
      // If snap injected isolated virtual nodes, bridge them into the main graph.
      const compsAfterSnap = graph.getComponents();
      if (compsAfterSnap.length > 1) {
        const fromComp = compsAfterSnap.find((c) => c.has(startKey));
        const toComp = compsAfterSnap.find((c) => c.has(endKey));
        if (fromComp && toComp && fromComp !== toComp) {
          graph.addEdge(startKey, endKey, 0);
        }
      }

      const segmentKeys = this.pathFinder.dijkstraVertices(startKey, endKey);

      if (segmentKeys.length === 0) {
        console.warn("IndoorDirections: no path found", startKey, "→", endKey);
        this.routelines = [];
        this.draw();
        return;
      }

      const segmentCoords = segmentKeys.map(keyToPosition);
      if (i === 0) routes.push(...segmentCoords);
      else routes.push(...segmentCoords.slice(1));
    }

    this.fire(
      new IndoorDirectionsRoutingEvent("calculateroutesend", originalEvent),
    );

    this.routelines = [this.buildRouteLines(routes)];

    // ── Route metadata ───────────────────────────────────────────────────────
    let totalMetres = 0;
    for (let i = 0; i < routes.length - 1; i++) {
      totalMetres += distMetres(routes[i], routes[i + 1]);
    }
    this.lastRouteInfo = {
      distanceMetres: Math.round(totalMetres),
      walkMinutes: Math.max(1, Math.round(totalMetres / 80)),
    };

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
      let category: string | undefined;
      if (index === 0) category = "ORIGIN";
      else if (index === this._waypoints.length - 1) category = "DESTINATION";

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
