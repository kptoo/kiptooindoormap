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

/**
 * Extract a level number from a feature's properties.
 * Checks level_id (set by airport-data-loader), level, and Level.
 */
function parseLevel(
  p: Record<string, any> | null | undefined,
): number | null {
  if (!p) return null;
  // airport-data-loader normalises to level_id
  const raw = p.level_id ?? p.level ?? p.Level;
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

  /** The full routing feature collection (all levels) — stored so we can
   *  rebuild the graph when the floor changes */
  private allRoutingFeatures: GeoJSON.FeatureCollection | null = null;
  /** The full vertical-circulation points (all levels) */
  private allConnectorFeatures: GeoJSON.FeatureCollection | null = null;

  private hasLoadedGraph = false;
  private currentLevel: number | null = null;
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

  // ── Snap waypoints ────────────────────────────────────────────────────────

  private updateSnapPoints() {
    const graph = this.pathFinder.getGraph();

    this.snappoints = this._waypoints.map((waypoint) => {
      const [lng, lat] = waypoint.geometry.coordinates;
      const snappedKey = graph.snapPoint(lng, lat);
      const snappedCoord = snappedKey
        ? (keyToPosition(snappedKey) as [number, number])
        : ([lng, lat] as [number, number]);
      return this.buildPoint(snappedCoord, "SNAPPOINT");
    });
  }

  // ── Store all data for level-based rebuilding ─────────────────────────────

  /**
   * Store the full routing + connector datasets. Call this once on app load.
   * Then call setLevel(level) to build the graph for a specific floor.
   *
   * This mirrors the HTML demo's pattern: buildGraph(level) is called fresh
   * each time the user switches floors.
   *
   * @param routing   All corridor + Connect line features (all levels mixed)
   * @param connectors Optional vertical_circulation point features
   */
  public loadMapData(
    routing: GeoJSON.FeatureCollection,
    connectors?: GeoJSON.FeatureCollection,
  ) {
    this.allRoutingFeatures = routing;
    this.allConnectorFeatures = connectors ?? null;

    // If we already know the level, build immediately.
    // Otherwise wait for setLevel() to be called.
    if (this.currentLevel !== null) {
      this._buildGraphForLevel(this.currentLevel);
    }
  }

  /**
   * Set (or change) the current floor level and rebuild the routing graph
   * using only features on that level — exactly like the HTML demo's
   * buildGraph(level) which is called on every level switch.
   */
  public setLevel(level: number) {
    if (this.currentLevel === level && this.hasLoadedGraph) return;
    this.currentLevel = level;

    if (this.allRoutingFeatures) {
      this._buildGraphForLevel(level);
      // If there are active waypoints, re-snap and re-route on the new floor
      if (this._waypoints.length >= 2) {
        this.updateSnapPoints();
        const evt = new IndoorDirectionsWaypointEvent("setwaypoints", undefined);
        this.calculateDirections(evt);
      }
    }
  }

  /**
   * Build the routing graph for a specific level.
   *
   * This is a direct TypeScript port of the HTML demo's buildGraph(level):
   *
   *   function buildGraph(level) {
   *     const g = new Graph();
   *     ['corridors','connect'].forEach(src => {
   *       (allData[src]?.features||[]).forEach(f => {
   *         const p = f.properties||{};
   *         if (String(p.Level||p.level||'3') !== level) return;  // ← KEY FILTER
   *         ...add nodes + edges...
   *       });
   *     });
   *     g.stitchComponents();
   *     return g;
   *   }
   */
  private _buildGraphForLevel(level: number) {
    const graph = new Graph();
    const levelStr = String(level);

    // ── 1. Corridor + Connect features — ONLY for the requested level ─────────
    //    This is the critical filter that the HTML demo applies.
    //    Without it, edges from other floors pollute the graph and cause the
    //    router to produce paths that "jump" off the visible corridor network.
    const routing = this.allRoutingFeatures;
    if (!routing) return;

    routing.features.forEach((feature) => {
      const p = (feature.properties ?? {}) as any;

      // Normalise level to string for comparison — same as HTML demo's
      // String(p.Level||p.level||'3') !== level
      const featureLevelRaw =
        p.level_id ?? p.Level ?? p.level ?? null;
      const featureLevelStr =
        featureLevelRaw !== null && featureLevelRaw !== undefined
          ? String(Number.parseInt(String(featureLevelRaw), 10))
          : null;

      // ★ Skip features that don't belong to the current level ★
      if (featureLevelStr !== levelStr) return;

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
        }
      });
    });

    if (Object.keys(graph.nodes).length === 0) {
      console.warn(
        `IndoorDirections: no corridor features found for level ${level}`,
      );
      // Don't mark as loaded so we don't route on an empty graph
      return;
    }

    // ── 2. Stitch disconnected corridor islands — same as HTML demo ──────────
    graph.stitchComponents();

    // ── 3. Vertical connectors — same logic as before ─────────────────────────
    if (this.allConnectorFeatures?.features?.length) {
      const connectorNodesByName = new Map<
        string,
        Array<{ level: number; nodeKey: string }>
      >();

      // Build per-level corridor node index for nearest-node snapping
      const coordMapByLevel = new Map<number, Map<string, GeoJSON.Position>>();
      routing.features.forEach((feature) => {
        const p = (feature.properties ?? {}) as any;
        const fl = parseLevel(p);
        if (fl == null) return;
        const geom = feature.geometry;
        const lines: GeoJSON.Position[][] =
          geom.type === "LineString"
            ? [geom.coordinates]
            : geom.type === "MultiLineString"
              ? geom.coordinates
              : [];
        lines.forEach((coords) => {
          coords.forEach((coord) => {
            const k = ptKey(coord[0], coord[1]);
            if (!coordMapByLevel.has(fl)) coordMapByLevel.set(fl, new Map());
            coordMapByLevel.get(fl)!.set(k, coord as GeoJSON.Position);
          });
        });
      });

      for (const f of this.allConnectorFeatures.features) {
        if (f.geometry.type !== "Point") continue;
        const props = (f.properties ?? {}) as any;
        const name = normalizeName(props.name);
        const fl = parseLevel(props);
        if (!name || fl == null) continue;

        const levelMap = coordMapByLevel.get(fl);
        if (!levelMap || levelMap.size === 0) continue;

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

        // Only link to graph if snapped key actually exists (same level)
        if (graph.nodes[snappedKey]) {
          graph.addEdge(connectorKey, snappedKey, minDist);
          if (!connectorNodesByName.has(name))
            connectorNodesByName.set(name, []);
          connectorNodesByName
            .get(name)!
            .push({ level: fl, nodeKey: connectorKey });
        }
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

  // ── Public routing API ────────────────────────────────────────────────────

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

      const startKey = ptKey(startCoord[0], startCoord[1]);
      const endKey = ptKey(endCoord[0], endCoord[1]);

      // Post-snap connectivity bridge — same as HTML demo
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
