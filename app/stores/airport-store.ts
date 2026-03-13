import { create } from "zustand";
import type { LoadedAirportData } from "~/lib/airport-data-loader";

interface AirportStore {
  /** Whether data is currently being fetched */
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;

  /** Loaded airport data (null until first load completes) */
  airportData: LoadedAirportData | null;
  setAirportData: (data: LoadedAirportData) => void;

  /** Currently active terminal ID ("ALL" means show everything) */
  activeTerminal: string;
  setActiveTerminal: (id: string) => void;

  /** Available terminal IDs derived from loaded data */
  availableTerminals: string[];
  setAvailableTerminals: (terminals: string[]) => void;
}

const useAirportStore = create<AirportStore>((set) => ({
  isLoading: true,
  setIsLoading: (v) => set({ isLoading: v }),

  airportData: null,
  setAirportData: (data) => set({ airportData: data }),

  activeTerminal: "ALL",
  setActiveTerminal: (id) => set({ activeTerminal: id }),

  availableTerminals: [],
  setAvailableTerminals: (terminals) => set({ availableTerminals: terminals }),
}));

export default useAirportStore;
