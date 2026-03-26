import { Vertex } from "../types";
import Graph, { ptKey, keyToPosition } from "./graph";

export default class Pathfinder {
  private graph: Graph;

  constructor(graph?: Graph) {
    this.graph = graph ?? new Graph();
  }

  /**
   * Route between two vertex keys — direct port of the HTML demo's dijkstra().
   *
   * Uses the same plain-object dist2/prev/pq pattern. Returns [] if no path
   * (never throws on missing vertices after snapping).
   */
  public dijkstraVertices(start: Vertex, end: Vertex): Vertex[] {
    if (!this.graph.hasVertex(start) || !this.graph.hasVertex(end)) {
      console.warn(
        "IndoorDirections: vertex not in graph after snapping",
        start,
        end,
      );
      return [];
    }

    const dist2: Record<Vertex, number> = { [start]: 0 };
    const prev: Record<Vertex, Vertex | undefined> = {};
    const visited = new Set<Vertex>();
    // min-heap via sorted array — same as HTML demo (fine for indoor graph size)
    const pq: [number, Vertex][] = [[0, start]];

    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift()!;
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === end) break;

      for (const { key: v, cost } of this.graph.adj[u] || []) {
        if (visited.has(v)) continue;
        const nd = d + cost;
        if (dist2[v] === undefined || nd < dist2[v]) {
          dist2[v] = nd;
          prev[v] = u;
          pq.push([nd, v]);
        }
      }
    }

    if (dist2[end] === undefined) return [];

    // Reconstruct path
    const path: Vertex[] = [];
    let cur: Vertex | undefined = end;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = prev[cur];
    }

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
      ? ptKey((start as number[])[0], (start as number[])[1])
      : (start as string);
    const endKey = Array.isArray(end)
      ? ptKey((end as number[])[0], (end as number[])[1])
      : (end as string);
    return this.dijkstraVertices(startKey, endKey).map(keyToPosition);
  }

  public setGraph(graph: Graph) {
    this.graph = graph;
  }

  public getGraph(): Graph {
    return this.graph;
  }
}
