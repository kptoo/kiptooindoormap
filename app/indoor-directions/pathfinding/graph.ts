import { Vertex, Edge } from "../types";

export default class Graph {
  adjacencyList: Map<Vertex, Edge[]> = new Map();
  // Stores actual [lng, lat] coordinates keyed by vertex string
  nodeCoords: Map<Vertex, GeoJSON.Position> = new Map();

  addVertex(vertex: Vertex, coord?: GeoJSON.Position) {
    if (!this.adjacencyList.has(vertex)) {
      this.adjacencyList.set(vertex, []);
    }
    if (coord && !this.nodeCoords.has(vertex)) {
      this.nodeCoords.set(vertex, coord);
    }
  }

  addEdge(from: Vertex, to: Vertex, weight: number) {
    this.addVertex(from);
    this.addVertex(to);

    // Avoid duplicate edges
    const fromEdges = this.adjacencyList.get(from)!;
    if (!fromEdges.some((e) => e.to === to)) {
      fromEdges.push({ to, weight });
    }

    const toEdges = this.adjacencyList.get(to)!;
    if (!toEdges.some((e) => e.to === from)) {
      toEdges.push({ to: from, weight });
    }
  }

  getVertexs() {
    return [...this.adjacencyList.keys()];
  }

  getEdges(vertex: Vertex): Edge[] {
    return this.adjacencyList.get(vertex) || [];
  }

  hasVertex(vertex: Vertex) {
    return this.adjacencyList.has(vertex);
  }

  getCoord(vertex: Vertex): GeoJSON.Position | undefined {
    return this.nodeCoords.get(vertex);
  }

  /**
   * Find all connected components.
   * Returns an array of Sets, each containing the vertex keys of one component.
   */
  getComponents(): Set<Vertex>[] {
    const visited = new Set<Vertex>();
    const components: Set<Vertex>[] = [];

    for (const v of this.adjacencyList.keys()) {
      if (visited.has(v)) continue;

      const component = new Set<Vertex>();
      const queue: Vertex[] = [v];

      while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);

        for (const edge of this.adjacencyList.get(current) || []) {
          if (!visited.has(edge.to)) {
            queue.push(edge.to);
          }
        }
      }

      components.push(component);
    }

    return components;
  }

  /**
   * Stitch all disconnected components together by bridging each small
   * component to the nearest node in the already-stitched (main) component.
   * Uses nodeCoords for distance calculation.
   */
  stitchComponents(distanceFn: (a: GeoJSON.Position, b: GeoJSON.Position) => number) {
    const components = this.getComponents();
    if (components.length <= 1) return;

    // Sort largest component first
    components.sort((a, b) => b.size - a.size);

    const mainSet = components[0];

    for (let i = 1; i < components.length; i++) {
      const small = components[i];
      let bestCost = Infinity;
      let bestSmallKey: Vertex | null = null;
      let bestMainKey: Vertex | null = null;

      for (const sk of small) {
        const sc = this.nodeCoords.get(sk);
        if (!sc) continue;

        for (const mk of mainSet) {
          const mc = this.nodeCoords.get(mk);
          if (!mc) continue;

          const d = distanceFn(sc, mc);
          if (d < bestCost) {
            bestCost = d;
            bestSmallKey = sk;
            bestMainKey = mk;
          }
        }
      }

      if (bestSmallKey && bestMainKey) {
        this.addEdge(bestSmallKey, bestMainKey, bestCost);
        // Absorb small into main for subsequent iterations
        for (const k of small) mainSet.add(k);
      }
    }
  }
}
