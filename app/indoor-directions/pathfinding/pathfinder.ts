import { Vertex } from "../types";
import Graph from "./graph";

/**
 * Closest point on segment [p1, p2] to point p.
 * All coordinates are [lng, lat].
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
   * Snap an external [lng, lat] point onto the graph.
   *
   * Strategy (from the HTML demo):
   * 1. Find nearest existing graph node.
   * 2. Also project onto every edge segment to find the nearest foot-point.
   * 3. If the foot-point is measurably closer, inject a virtual node there
   *    and connect it to the two endpoints of that edge.
   *
   * Returns the vertex key to use as the routing start/end.
   */
  public snapPoint(
    coord: GeoJSON.Position,
    distanceFn: (a: GeoJSON.Position, b: GeoJSON.Position) => number,
  ): Vertex {
    const vertices = this.graph.getVertexs();

    // 1. Nearest existing node
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

    // 2. Nearest projection onto any edge segment
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

    // 3. Inject virtual node if projection is meaningfully closer (> 0.5 m)
    if (bestProjCoord && bestEdge && bestProjDist < bestNodeDist - 0.5) {
      const vk = JSON.stringify(bestProjCoord);
      this.graph.addVertex(vk, bestProjCoord);
      this.graph.addEdge(vk, bestEdge[0], distanceFn(bestProjCoord, this.graph.getCoord(bestEdge[0])!));
      this.graph.addEdge(vk, bestEdge[1], distanceFn(bestProjCoord, this.graph.getCoord(bestEdge[1])!));
      return vk;
    }

    return bestNode!;
  }

  /**
   * Route between two graph vertex keys using Dijkstra's algorithm.
   * Uses a proper priority queue (binary min-heap) for performance.
   * Returns a list of vertex keys along the shortest path.
   */
  public dijkstraVertices(start: Vertex, end: Vertex): Vertex[] {
    start = this.validateVertex(start);
    end = this.validateVertex(end);

    const distances: Record<Vertex, number> = {};
    const previous: Record<Vertex, Vertex | null> = {};

    for (const v of this.graph.getVertexs()) {
      distances[v] = Infinity;
      previous[v] = null;
    }
    distances[start] = 0;

    // Min-heap: [cost, vertex]
    const heap: [number, Vertex][] = [[0, start]];
    const visited = new Set<Vertex>();

    while (heap.length > 0) {
      // Extract minimum
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
        if (alt < distances[to]) {
          distances[to] = alt;
          previous[to] = current;
          heap.push([alt, to]);
        }
      }
    }

    // Reconstruct path
    const path: Vertex[] = [];
    let current: Vertex | null = end;
    while (current !== null && current !== undefined) {
      path.unshift(current);
      current = previous[current] ?? null;
    }

    // If path doesn't actually reach start, return empty
    if (path.length === 0 || path[0] !== start) return [];

    return path;
  }

  /**
   * Backwards-compatible API: returns GeoJSON.Position[] instead of vertex keys.
   */
  public dijkstra(
    start: Vertex | GeoJSON.Position,
    end: Vertex | GeoJSON.Position,
  ): GeoJSON.Position[] {
    const startKey = JSON.stringify(start);
    const endKey = JSON.stringify(end);
    const pathVertices = this.dijkstraVertices(startKey, endKey);
    return pathVertices.map((v) => JSON.parse(v));
  }

  private validateVertex(position: Vertex): Vertex {
    if (this.graph.hasVertex(position)) {
      return position;
    } else {
      throw new Error(`Vertex not found in navigation graph: ${position}`);
    }
  }

  public setGraph(graph: Graph) {
    this.graph = graph;
  }

  public getGraph(): Graph {
    return this.graph;
  }
}
