import { NavigationControl } from "maplibre-gl";
import { useEffect, useState } from "react";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useFloorStore from "~/stores/floor-store";
import useAirportStore from "~/stores/airport-store";
import useMapStore from "~/stores/use-map-store";

interface FloorUpDownControlProps {
  indoorMapLayer: IndoorMapLayer;
}

export function FloorUpDownControl({ indoorMapLayer }: FloorUpDownControlProps) {
  const map = useMapStore((state) => state.mapInstance);
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const activeTerminal = useAirportStore((state) => state.activeTerminal);
  const [maxFloor, setMaxFloor] = useState(6);
  const minFloor = 1;

  // Recalculate max floor whenever the active terminal changes
  useEffect(() => {
    indoorMapLayer.getAvailableFloors(activeTerminal).then((floors) => {
      if (floors.length > 0) setMaxFloor(Math.max(...floors));
    });
  }, [indoorMapLayer, activeTerminal]);

  useEffect(() => {
    const floorControl = new NavigationControl({
      showCompass: false,
      showZoom: false,
      visualizePitch: false,
    });

    map?.addControl(floorControl, "bottom-right");

    const upButton = document.createElement("button");
    upButton.className = "maplibregl-ctrl-icon maplibregl-ctrl-floor-up dark:text-black";
    upButton.title = "Go up one floor";
    upButton.innerHTML = "&#8593;";
    upButton.addEventListener("click", () => {
      const next = currentFloor + 1;
      if (next <= maxFloor) {
        setCurrentFloor(next);
        indoorMapLayer.setFloorLevel(next);
      }
    });

    const floorLabel = document.createElement("span");
    floorLabel.className = "text-xs font-bold px-1 dark:text-black";
    floorLabel.textContent = `L${currentFloor}`;

    const downButton = document.createElement("button");
    downButton.className = "maplibregl-ctrl-icon maplibregl-ctrl-floor-down dark:text-black";
    downButton.title = "Go down one floor";
    downButton.innerHTML = "&#8595;";
    downButton.addEventListener("click", () => {
      const next = currentFloor - 1;
      if (next >= minFloor) {
        setCurrentFloor(next);
        indoorMapLayer.setFloorLevel(next);
      }
    });

    floorControl._container.append(upButton);
    floorControl._container.append(floorLabel);
    floorControl._container.append(downButton);

    return () => {
      map?.removeControl(floorControl);
    };
  }, [map, currentFloor, setCurrentFloor, indoorMapLayer, maxFloor]);

  return null;
}
