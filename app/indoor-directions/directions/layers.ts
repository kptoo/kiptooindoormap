import type { LayerSpecification, LineLayerSpecification } from "maplibre-gl";
import type { CircleLayerSpecification } from "@maplibre/maplibre-gl-style-spec";

// ─── Colours — matched to the HTML demo ────────────────��─────────────────────
export const colors = {
  // Route line: dashed orange — matches HTML demo's L.polyline color
  routeline: "#ff5722",
  routelineCasing: "#ff5722",

  // Origin marker: green — matches HTML demo's makeMarker '#00e676'
  waypointOrigin: "#00e676",
  waypointOriginHighlight: "#00c853",

  // Destination marker: red — matches HTML demo's makeMarker '#e94560'
  waypointDestination: "#e94560",
  waypointDestinationHighlight: "#c62828",

  // Snappoint: white fill with coloured casing (subtle)
  snappoint: "#ffffff",
  snappointCasing: "#ff5722",

  // Snapline (thin dashed line from waypoint to snap point)
  snapline: "#ff5722",

  // Alt routes (unused but kept for type safety)
  altRouteline: "#9e91be",
};

/**
 * Waypoint circle colour — green for ORIGIN, red for DESTINATION.
 * Mirrors the HTML demo's makeMarker() green/red logic.
 */
const waypointFillColor: NonNullable<
  CircleLayerSpecification["paint"]
>["circle-color"] = [
  "case",
  ["==", ["get", "category"], "ORIGIN"],
  colors.waypointOrigin,
  ["==", ["get", "category"], "DESTINATION"],
  colors.waypointDestination,
  // Intermediate waypoints: orange
  colors.routeline,
];

const waypointFillColorHighlight: NonNullable<
  CircleLayerSpecification["paint"]
>["circle-color"] = [
  "case",
  ["==", ["get", "category"], "ORIGIN"],
  colors.waypointOriginHighlight,
  ["==", ["get", "category"], "DESTINATION"],
  colors.waypointDestinationHighlight,
  colors.routeline,
];

const waypointColor: NonNullable<
  CircleLayerSpecification["paint"]
>["circle-color"] = [
  "case",
  ["boolean", ["get", "highlight"], false],
  waypointFillColorHighlight,
  waypointFillColor,
];

/**
 * Builds the MapLibre GL layers for indoor routing.
 * Route line style exactly matches the HTML demo:
 *   color: #ff5722, weight: 5, opacity: 0.9, dashArray: [10, 6]
 */
export default function layersFactory(
  pointsScalingFactor = 1,
  linesScalingFactor = 1,
  sourceName = "maplibre-gl-indoor-directions",
): LayerSpecification[] {
  // ── Route line width — scales with zoom, base ~5px (matches demo weight:5) ─
  const routeLineWidth: NonNullable<
    LineLayerSpecification["paint"]
  >["line-width"] = [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    14, 3 * linesScalingFactor,
    17, 5 * linesScalingFactor,
    20, 9 * linesScalingFactor,
  ];

  const routeCasingWidth: NonNullable<
    LineLayerSpecification["paint"]
  >["line-width"] = [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    14, 5 * linesScalingFactor,
    17, 8 * linesScalingFactor,
    20, 14 * linesScalingFactor,
  ];

  // ── Waypoint (origin/destination) circle sizes ───────────────────────────
  const waypointRadius: NonNullable<
    CircleLayerSpecification["paint"]
  >["circle-radius"] = [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    14, 6 * pointsScalingFactor,
    17, 8 * pointsScalingFactor,
    20, 12 * pointsScalingFactor,
  ];

  const waypointCasingRadius: NonNullable<
    CircleLayerSpecification["paint"]
  >["circle-radius"] = [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    14, 9 * pointsScalingFactor,
    17, 11 * pointsScalingFactor,
    20, 16 * pointsScalingFactor,
  ];

  // ── Snappoint (small dot on the corridor graph) ───────────────────────────
  const snappointRadius: NonNullable<
    CircleLayerSpecification["paint"]
  >["circle-radius"] = [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    14, 3 * pointsScalingFactor,
    17, 4 * pointsScalingFactor,
    20, 6 * pointsScalingFactor,
  ];

  return [
    // ── Snapline — thin dashed orange line from waypoint to snap point ────
    {
      id: `${sourceName}-snapline`,
      type: "line",
      source: sourceName,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.snapline,
        "line-dasharray": [3, 3],
        "line-opacity": 0.5,
        "line-width": 2,
      },
      filter: ["==", ["get", "type"], "SNAPLINE"],
    },

    // ── Alt route (background, unused but included) ───────────────────────
    {
      id: `${sourceName}-alt-routeline-casing`,
      type: "line",
      source: sourceName,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.altRouteline,
        "line-opacity": 0.4,
        "line-width": routeCasingWidth,
      },
      filter: ["==", ["get", "route"], "ALT"],
    },
    {
      id: `${sourceName}-alt-routeline`,
      type: "line",
      source: sourceName,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.altRouteline,
        "line-opacity": 0.7,
        "line-width": routeLineWidth,
      },
      filter: ["==", ["get", "route"], "ALT"],
    },

    // ── Selected route casing (wider, same colour, lower opacity) ─────────
    {
      id: `${sourceName}-routeline-casing`,
      type: "line",
      source: sourceName,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.routelineCasing,
        "line-opacity": 0.35,
        "line-width": routeCasingWidth,
      },
      filter: ["==", ["get", "route"], "SELECTED"],
    },

    // ── Selected route line — dashed orange, exact match to HTML demo ─────
    {
      id: `${sourceName}-routeline`,
      type: "line",
      source: sourceName,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": colors.routeline,
        // dashArray [10, 6] → matches HTML demo's dashArray:'10 6'
        "line-dasharray": [10, 6],
        "line-opacity": 0.9,
        "line-width": routeLineWidth,
      },
      filter: ["==", ["get", "route"], "SELECTED"],
    },

    // ── Snappoint casing ──────────────────────────────────────────────────
    {
      id: `${sourceName}-snappoint-casing`,
      type: "circle",
      source: sourceName,
      paint: {
        "circle-radius": snappointRadius,
        "circle-color": colors.snappointCasing,
        "circle-opacity": 0.5,
      },
      filter: ["==", ["get", "type"], "SNAPPOINT"],
    },
    // ── Snappoint fill (white dot) ────────────────────────────────────────
    {
      id: `${sourceName}-snappoint`,
      type: "circle",
      source: sourceName,
      paint: {
        "circle-radius": ["*", snappointRadius, 0.6],
        "circle-color": colors.snappoint,
      },
      filter: ["==", ["get", "type"], "SNAPPOINT"],
    },

    // ── Waypoint casing — white ring (matches HTML demo's color:'#fff') ───
    {
      id: `${sourceName}-waypoint-casing`,
      type: "circle",
      source: sourceName,
      paint: {
        "circle-radius": waypointCasingRadius,
        "circle-color": "#ffffff",
        "circle-opacity": 1,
      },
      filter: ["==", ["get", "type"], "WAYPOINT"],
    },

    // ── Waypoint fill — green (origin) / red (destination) ───────────────
    {
      id: `${sourceName}-waypoint`,
      type: "circle",
      source: sourceName,
      paint: {
        "circle-radius": waypointRadius,
        "circle-color": waypointColor,
        "circle-opacity": 1,
      },
      filter: ["==", ["get", "type"], "WAYPOINT"],
    },
  ] satisfies LayerSpecification[];
}
