import { useEffect, useState } from "react";
import IndoorMapLayer from "~/layers/indoor-map-layer";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";

interface FloorSelectorProps {
  indoorMapLayer: IndoorMapLayer;
}

export function FloorSelector({ indoorMapLayer }: FloorSelectorProps) {
  const { currentFloor, setCurrentFloor } = useFloorStore();
  const activeTerminal = useAirportStore((state) => state.activeTerminal);
  const [availableFloors, setAvailableFloors] = useState<number[]>([1]);

  useEffect(() => {
    indoorMapLayer.getAvailableFloors(activeTerminal).then((floors) => {
      setAvailableFloors(floors);
    });
  }, [indoorMapLayer, activeTerminal]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const floor = Number.parseInt(e.target.value);
    setCurrentFloor(floor);
    indoorMapLayer.setFloorLevel(floor);
  };

  return (
    <div className="absolute right-16 top-2 z-10">
      <select
        value={currentFloor}
        onChange={handleChange}
        className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:bg-gray-900 dark:text-white"
        aria-label="Select floor"
      >
        {availableFloors.map((floor) => (
          <option key={floor} value={floor}>
            Level {floor}
          </option>
        ))}
      </select>
    </div>
  );
}
