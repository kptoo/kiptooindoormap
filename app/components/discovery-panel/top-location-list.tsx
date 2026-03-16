import { Button } from "../ui/button";
import type { TopLocation } from "~/mock/top-locations";

interface TopLocationsListProps {
  locations: TopLocation[];
  onLocationClick: (name: string) => void;
}

export function TopLocationsList({
  locations,
  onLocationClick,
}: TopLocationsListProps) {
  return (
    <div className="hidden md:grid md:grid-cols-4 md:justify-items-center md:gap-1">
      {locations.map((location) => (
        <div className="flex flex-col items-center" key={location.name}>
          <Button
            className={`rounded-full shadow-sm ${location.colors} transition-shadow duration-200 hover:shadow-md`}
            variant="ghost"
            size="icon"
            title={location.name}
            onClick={() => onLocationClick(location.name)}
          >
            <img
              src={location.iconSrc}
              alt=""
              className="size-4 object-contain"
              aria-hidden="true"
            />
          </Button>
          <span className="mt-1 max-w-[80px] hyphens-auto break-words text-center text-xs text-gray-600 dark:text-gray-300">
            {location.name}
          </span>
        </div>
      ))}
    </div>
  );
}
