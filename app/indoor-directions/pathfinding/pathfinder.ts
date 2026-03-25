import { Vertex } from "../types";
import Graph, { ptKey, keyToPosition } from "./graph";

/**
 * Closest point on segment [p1, p2] to point p. All coords are [lng, lat].
 */
function closestPointOnSegment(
  p: GeoJSON.Position,
  p1: GeoJSON.Position,
  p2: GeoJSON.Position,
): GeoJSON.Position {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return p1;
  let t = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [p1[0] + t * dx, p1[1] + t * dy];
}

export default class Pathfinder {
  private graph: Graph;

  constructor(graph?: Graph) {
    this.graph = graph ?? new Graph();
  }

  /**
   * Snap an external [lng, lat] coordinate onto the graph.
   *
   * Mirrors the HTML demo's Graph.snapPoint() exactly:
   * 1. Find the nearest existing graph node.
   * 2. Project onto every edge segment to find the nearest foot-point.
   * 3. If the foot-point is >0.5 m closer, inject a virtual node using
   *    addNode() (which uses ptKey() grid-snapping) and connect it to
   *    both endpoints of the split edge.
   *
   * Returns a grid-snapped vertex key that is guaranteed to exist in the graph.
   */
  public snapPoint(
    coord: GeoJSON.Position,
    distanceFn: (a: GeoJSON.Position, b: GeoJSON.Position) => number,
  ): Vertex {
    const [lng, lat] = coord;
    const vertices = this.graph.getVertexs();

    // ── 1. Nearest existing node ────────────────────────────────────────────
    let bestNode: Vertex | null = null;
    let bestNodeDist = Infinity;

    for (const v of vertices) {
      const vc = this.graph.getCoord(v);
      if (!vc) continue;
      const d = distanceFn(coord, vc);
      if (d < bestNodeDist) {
        bestNodeDist = d;
        bestNode = v;
      }
    }

    // ── 2. Nearest projection onto any edge segment ─────────────────────────
    let bestProjCoord: GeoJSON.Position | null = null;
    let bestProjDist = Infinity;
    let bestEdge: [Vertex, Vertex] | null = null;
    const seen = new Set<string>();

    for (const v1 of vertices) {
      for (const edge of this.graph.getEdges(v1)) {
        const v2 = edge.to;
        const eid = v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`;
        if (seen.has(eid)) continue;
        seen.add(eid);

        const c1 = this.graph.getCoord(v1);
        const c2 = this.graph.getCoord(v2);
        if (!c1 || !c2) continue;

        const foot = closestPointOnSegment(coord, c1, c2);
        const d = distanceFn(coord, foot);
        if (d < bestProjDist) {
          bestProjDist = d;
          bestProjCoord = foot;
          bestEdge = [v1, v2];
        }
      }
    }

    // ── 3. Inject virtual node if projection is meaningfully closer ──────────
    if (bestProjCoord && bestEdge && bestProjDist < bestNodeDist - 0.5) {
      // addNode() uses ptKey() grid-snapping — the returned key is guaranteed
      // to exist in the graph after this call.
      const vk = this.graph.addNode(bestProjCoord[0], bestProjCoord[1]);

      // Split the edge: connect virtual node to both endpoints
      const c1 = this.graph.getCoord(bestEdge[0])!;
      const c2 = this.graph.getCoord(bestEdge[1])!;
      const vCoord = this.graph.getCoord(vk)!;
      this.graph.addEdge(vk, bestEdge[0], distanceFn(vCoord, c1));
      this.graph.addEdge(vk, bestEdge[1], distanceFn(vCoord, c2));

      return vk;
    }

    return bestNode!;
  }

  /**
   * Route between two vertex keys using Dijkstra's algorithm.
   * Returns the list of vertex keys along the shortest path,
   * or an empty array if no path exists.
   */
  public dijkstraVertices(start: Vertex, end: Vertex): Vertex[] {
    // Validate — throw only if the vertex truly doesn't exist
    if (!this.graph.hasVertex(start)) {
      throw new Error(`Vertex not found in navigation graph: ${start}`);
    }
    if (!this.graph.hasVertex(end)) {
      throw new Error(`Vertex not found in navigation graph: ${end}`);
    }

    const dist: Record<Vertex, number> = {};
    const previous: Record<Vertex, Vertex | null> = {};

    for (const v of this.graph.getVertexs()) {
      dist[v] = Infinity;
      previous[v] = null;
    }
    dist[start] = 0;

    // Simple priority queue: array of [cost, vertex]
    const heap: [number, Vertex][] = [[0, start]];
    const visited = new Set<Vertex>();

    while (heap.length > 0) {
      // Extract minimum cost entry
      let minIdx = 0;
      for (let i = 1; i < heap.length; i++) {
        if (heap[i][0] < heap[minIdx][0]) minIdx = i;
      }
      const [d, current] = heap[minIdx];
      heap.splice(minIdx, 1);

      if (visited.has(current)) continue;
      visited.add(current);
      if (current === end) break;

      for (const { to, weight } of this.graph.getEdges(current)) {
        if (visited.has(to)) continue;
        const alt = d + weight;
        if (alt < dist[to]) {
          dist[to] = alt;
          previous[to] = current;
          heap.push([alt, to]);
        }
      }
    }

    if (dist[end] === Infinity) return [];

    // Reconstruct path
    const path: Vertex[] = [];
    let current: Vertex | null = end;
    while (current !== null && current !== undefined) {
      path.unshift(current);
      current = previous[current] ?? null;
    }

    if (path[0] !== start) return [];
    return path;
  }

  /**
   * Backwards-compatible API: returns GeoJSON.Position[] instead of keys.
   */
  public dijkstra(
    start: Vertex | GeoJSON.Position,
    end: Vertex | GeoJSON.Position,
  ): GeoJSON.Position[] {
    const startKey = Array.isArray(start)
      ? ptKey(start[0], start[1])
      : (start as string);
    const endKey = Array.isArray(end)
      ? ptKey(end[0], end[1])
      : (end as string);
    const pathVertices = this.dijkstraVertices(startKey, endKey);
    return pathVertices.map(keyToPosition);
  }

  public setGraph(graph: Graph) {
    this.graph = graph;
  }

  public getGraph(): Graph {
    return this.graph;
  }
}
