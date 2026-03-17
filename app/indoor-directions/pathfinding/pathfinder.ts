import { Vertex } from "../types";
import Graph from "./graph";

export default class Pathfinder {
  private graph: Graph;
  //TODO: private options;

  constructor(graph?: Graph) {
    this.graph = graph ?? new Graph();
  }

  /**
   * Route between two graph vertices (string keys).
   * Returns a list of vertex keys (each key is JSON.stringify([lng,lat])).
   */
  public dijkstraVertices(start: Vertex, end: Vertex): Vertex[] {
    start = this.validateVertex(start);
    end = this.validateVertex(end);

    const distances: Record<Vertex, number> = {};
    const previous: Record<Vertex, Vertex | null> = {};
    const queue: Vertex[] = this.graph.getVertexs();

    this.graph.getVertexs().forEach((v) => {
      distances[v] = Infinity;
      previous[v] = null;
    });
    distances[start] = 0;

    while (queue.length > 0) {
      const current = queue.sort((a, b) => distances[a] - distances[b]).shift()!;
      if (current === end) break;

      this.graph.getEdges(current).forEach(({ to, weight }) => {
        const alt = distances[current] + weight;
        if (alt < distances[to]) {
          distances[to] = alt;
          previous[to] = current;
        }
      });
    }

    const path: Vertex[] = [];
    let current: Vertex | null = end;
    while (current) {
      path.unshift(current);
      current = previous[current];
    }

    return path;
  }

  /**
   * Backwards compatible API: accepts Vertex or GeoJSON.Position, returns coordinates.
   *
   * IMPORTANT: if you pass a GeoJSON.Position that is not an existing vertex,
   * this will still throw. IndoorDirections should prefer dijkstraVertices().
   */
  public dijkstra(
    start: Vertex | GeoJSON.Position,
    end: Vertex | GeoJSON.Position,
  ): GeoJSON.Position[] {
    const startKey = JSON.stringify(start);
    const endKey = JSON.stringify(end);

    const pathVertices = this.dijkstraVertices(startKey, endKey);
    return pathVertices.map((coord) => JSON.parse(coord));
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
}
