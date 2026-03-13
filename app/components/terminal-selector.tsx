import { TERMINAL_REGISTRY } from "~/lib/airport-data-loader";
import useAirportStore from "~/stores/airport-store";
import useFloorStore from "~/stores/floor-store";
import IndoorMapLayer from "~/layers/indoor-map-layer";

interface TerminalSelectorProps {
  indoorMapLayer: IndoorMapLayer;
}

export function TerminalSelector({ indoorMapLayer }: TerminalSelectorProps) {
  const { activeTerminal, setActiveTerminal, availableTerminals } = useAirportStore();
  const { currentFloor } = useFloorStore();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setActiveTerminal(id);
    indoorMapLayer.setTerminal(id, currentFloor);
  };

  return (
    <div className="absolute left-2 top-2 z-10">
      <select
        value={activeTerminal}
        onChange={handleChange}
        className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none dark:bg-gray-900 dark:text-white"
        aria-label="Select terminal"
      >
        <option value="ALL">All Terminals</option>
        {TERMINAL_REGISTRY.filter((t) => availableTerminals.includes(t.id)).map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
