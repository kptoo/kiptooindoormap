import { Vertex, Edge } from "../types";

/** ~1.5 m snap tolerance — matches the HTML demo's SNAP constant */
const SNAP = 0.000015;

/**
 * Round a coordinate to the nearest SNAP grid bucket.
 * This ensures that points within ~1.5 m of each other share the same key,
 * eliminating floating-point mismatches between injected virtual nodes and
 * looked-up vertex keys.
 */
export function ptKey(lng: number, lat: number): string {
  const snappedLng = (Math.round(lng / SNAP) * SNAP).toFixed(8);
  const snappedLat = (Math.round(lat / SNAP) * SNAP).toFixed(8);
  return `${snappedLng},${snappedLat}`;
}

export function keyToPosition(key: Vertex): GeoJSON.Position {
  const [lng, lat] = key.split(",").map(Number);
  return [lng, lat];
}

export default class Graph {
  /** adjacency list: vertex key → edges */
  adjacencyList: Map<Vertex, Edge[]> = new Map();
  /** canonical [lng, lat] coords for each vertex key */
  nodeCoords: Map<Vertex, GeoJSON.Position> = new Map();

  addVertex(vertex: Vertex, coord?: GeoJSON.Position) {
    if (!this.adjacencyList.has(vertex)) {
      this.adjacencyList.set(vertex, []);
    }
    if (coord && !this.nodeCoords.has(vertex)) {
      this.nodeCoords.set(vertex, coord);
    }
  }

  /**
   * Add a node from raw [lng, lat] coordinates.
   * Always uses ptKey() so the returned key is grid-snapped.
   */
  addNode(lng: number, lat: number): Vertex {
    const k = ptKey(lng, lat);
    if (!this.adjacencyList.has(k)) {
      this.adjacencyList.set(k, []);
    }
    if (!this.nodeCoords.has(k)) {
      this.nodeCoords.set(k, [lng, lat]);
    }
    return k;
  }

  addEdge(from: Vertex, to: Vertex, weight: number) {
    if (from === to) return;
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

  getVertexs(): Vertex[] {
    return [...this.adjacencyList.keys()];
  }

  getEdges(vertex: Vertex): Edge[] {
    return this.adjacencyList.get(vertex) || [];
  }

  hasVertex(vertex: Vertex): boolean {
    return this.adjacencyList.has(vertex);
  }

  getCoord(vertex: Vertex): GeoJSON.Position | undefined {
    return this.nodeCoords.get(vertex);
  }

  /**
   * Find all connected components.
   * Returns an array of Sets, each containing the vertex keys in one component.
   */
  getComponents(): Set<Vertex>[] {
    const visited = new Set<Vertex>();
    const components: Set<Vertex>[] = [];

    for (const v of this.adjacencyList.keys()) {
      if (visited.has(v)) continue;

      const component = new Set<Vertex>();
      const stack: Vertex[] = [v];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);

        for (const edge of this.adjacencyList.get(current) || []) {
          if (!visited.has(edge.to)) stack.push(edge.to);
        }
      }

      components.push(component);
    }

    return components;
  }

  /**
   * Stitch all disconnected components into one by bridging each smaller
   * component to the nearest node already in the main (largest) component.
   */
  stitchComponents(
    distanceFn: (a: GeoJSON.Position, b: GeoJSON.Position) => number,
  ) {
    const components = this.getComponents();
    if (components.length <= 1) return;

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
        for (const k of small) mainSet.add(k);
      }
    }
  }
}
