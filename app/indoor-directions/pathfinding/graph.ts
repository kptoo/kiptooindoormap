import { Vertex, Edge } from "../types";

// ─── Geometry helpers (exact port from HTML demo) ────────────────────────────

/** ~1.5 m snap tolerance — identical to the HTML demo's SNAP constant */
const SNAP = 0.000015;

/**
 * Grid-snapped vertex key. Rounds lng/lat to the nearest SNAP bucket so that
 * coordinates within ~1.5 m of each other always produce the same string key.
 * This is the ONLY way keys are generated throughout the routing engine.
 */
export function ptKey(lng: number, lat: number): string {
  const snappedLng = (Math.round(lng / SNAP) * SNAP).toFixed(8);
  const snappedLat = (Math.round(lat / SNAP) * SNAP).toFixed(8);
  return `${snappedLng},${snappedLat}`;
}

/** Parse a ptKey back to [lng, lat] */
export function keyToPosition(key: string): GeoJSON.Position {
  const [lng, lat] = key.split(",").map(Number);
  return [lng, lat];
}

/**
 * Euclidean distance in metres — identical to the HTML demo's dist().
 * Uses a flat-Earth approximation which is accurate enough for indoor scale.
 */
export function distMetres(
  a: GeoJSON.Position,
  b: GeoJSON.Position,
): number {
  const dx =
    (a[0] - b[0]) *
    Math.cos(((a[1] + b[1]) * 0.5 * Math.PI) / 180) *
    111320;
  const dy = (a[1] - b[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Closest point on segment [p1, p2] to point p — identical to HTML demo. */
export function closestPointOnSegment(
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

// ─── Graph class — exact port of the HTML demo's Graph class ─────────────────

export default class Graph {
  /** key → [lng, lat]  (plain object, same as demo's this.nodes) */
  nodes: Record<Vertex, GeoJSON.Position> = {};
  /** key → [{key, cost}]  (plain object, same as demo's this.adj) */
  adj: Record<Vertex, Array<{ key: Vertex; cost: number }>> = {};

  /**
   * Add a node using ptKey() grid-snapping.
   * Returns the canonical key (same as HTML demo's addNode).
   */
  addNode(lng: number, lat: number): Vertex {
    const k = ptKey(lng, lat);
    if (!this.nodes[k]) this.nodes[k] = [lng, lat];
    if (!this.adj[k]) this.adj[k] = [];
    return k;
  }

  /**
   * Add a bidirectional edge. Cost = distMetres(nodes[k1], nodes[k2]) + extraCost.
   * Deduplicates edges (same as HTML demo).
   */
  addEdge(k1: Vertex, k2: Vertex, extraCost = 0): void {
    if (k1 === k2) return;
    if (!this.nodes[k1] || !this.nodes[k2]) return;
    const cost = distMetres(this.nodes[k1], this.nodes[k2]) + extraCost;
    if (cost === 0) return;
    if (!this.adj[k1].some((e) => e.key === k2))
      this.adj[k1].push({ key: k2, cost });
    if (!this.adj[k2].some((e) => e.key === k1))
      this.adj[k2].push({ key: k1, cost });
  }

  // ── Compatibility shims used by main.ts / pathfinder.ts ──────────────────

  addVertex(vertex: Vertex) {
    if (!this.adj[vertex]) this.adj[vertex] = [];
  }

  hasVertex(vertex: Vertex): boolean {
    return vertex in this.nodes;
  }

  getVertexs(): Vertex[] {
    return Object.keys(this.nodes);
  }

  getEdges(vertex: Vertex): Edge[] {
    return (this.adj[vertex] || []).map((e) => ({ to: e.key, weight: e.cost }));
  }

  getCoord(vertex: Vertex): GeoJSON.Position | undefined {
    return this.nodes[vertex];
  }

  // ── Component detection + stitching (exact port from HTML demo) ──────────

  /** Returns an array of Sets, each containing the keys of one component. */
  getComponents(): Set<Vertex>[] {
    const visited = new Set<Vertex>();
    const comps: Set<Vertex>[] = [];

    for (const k of Object.keys(this.nodes)) {
      if (visited.has(k)) continue;
      const comp = new Set<Vertex>();
      const queue: Vertex[] = [k];
      while (queue.length) {
        const cur = queue.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        comp.add(cur);
        (this.adj[cur] || []).forEach((e) => {
          if (!visited.has(e.key)) queue.push(e.key);
        });
      }
      comps.push(comp);
    }

    return comps;
  }

  /**
   * Bridge all disconnected components into one — exact port of HTML demo's
   * stitchComponents(). Sorts largest-first, then connects each smaller
   * component to the nearest node already in the main set.
   */
  stitchComponents(): void {
    const comps = this.getComponents();
    if (comps.length <= 1) return;

    comps.sort((a, b) => b.size - a.size);
    const mainSet = comps[0];

    for (let i = 1; i < comps.length; i++) {
      const small = comps[i];
      let bestCost = Infinity;
      let bestSK: Vertex | null = null;
      let bestMK: Vertex | null = null;

      for (const sk of small) {
        const sc = this.nodes[sk];
        for (const mk of mainSet) {
          const c = distMetres(sc, this.nodes[mk]);
          if (c < bestCost) {
            bestCost = c;
            bestSK = sk;
            bestMK = mk;
          }
        }
      }

      if (bestSK && bestMK) {
        this.addEdge(bestSK, bestMK, 0);
        small.forEach((k) => mainSet.add(k));
      }
    }
  }

  /**
   * Snap an external [lng, lat] onto the graph — exact port of HTML demo's
   * Graph.snapPoint().
   *
   * 1. Find nearest existing node.
   * 2. Project onto every edge to find closest foot-point.
   * 3. If foot-point is >0.5 m closer, inject a virtual node (via addNode,
   *    which uses ptKey()) and connect it to both edge endpoints.
   *
   * Returns the grid-snapped key that now exists in the graph.
   */
  snapPoint(lng: number, lat: number): Vertex {
    const pt: GeoJSON.Position = [lng, lat];

    // 1. Nearest node
    let bestNode: Vertex | null = null;
    let bestNodeDist = Infinity;
    for (const [k, coord] of Object.entries(this.nodes)) {
      const d = distMetres(pt, coord);
      if (d < bestNodeDist) {
        bestNodeDist = d;
        bestNode = k;
      }
    }

    // 2. Nearest edge projection
    let bestProj: GeoJSON.Position | null = null;
    let bestProjDist = Infinity;
    const seen = new Set<string>();

    for (const [k1, neighbors] of Object.entries(this.adj)) {
      for (const { key: k2 } of neighbors) {
        const eid = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        if (seen.has(eid)) continue;
        seen.add(eid);
        const foot = closestPointOnSegment(pt, this.nodes[k1], this.nodes[k2]);
        const d = distMetres(pt, foot);
        if (d < bestProjDist) {
          bestProjDist = d;
          bestProj = foot;
        }
      }
    }

    // 3. Inject virtual node if projection is meaningfully closer
    if (bestProj && bestProjDist < bestNodeDist - 0.5) {
      const vk = this.addNode(bestProj[0], bestProj[1]);

      // Find which edge(s) the foot-point lies on and split them
      seen.clear();
      for (const [k1, neighbors] of Object.entries(this.adj)) {
        for (const { key: k2 } of neighbors) {
          const eid = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
          if (seen.has(eid)) continue;
          seen.add(eid);
          const foot = closestPointOnSegment(
            pt,
            this.nodes[k1],
            this.nodes[k2],
          );
          if (distMetres(foot, bestProj) < 0.1) {
            this.addEdge(vk, k1);
            this.addEdge(vk, k2);
          }
        }
      }

      return vk;
    }

    return bestNode!;
  }
}
