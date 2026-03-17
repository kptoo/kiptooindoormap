import { Link, Navigation2, QrCode, Share2, X } from "lucide-react";
import { POI } from "~/types/poi";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface LocationDetailProps {
  poi: POI;
  onBack: () => void;
  onDirections: () => void;
}

export default function LocationDetail({
  poi,
  onBack,
  onDirections,
}: LocationDetailProps) {
  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{poi.name}</h2>
          {/* TODO: add floor to poi properties and use it here */}
          <p className="text-xs text-gray-600 dark:text-gray-400">1st Floor</p>
        </div>

        <div className="flex space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Share2 size={16} />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              {/* TODO: add logic */}
              <DropdownMenuItem onClick={() => console.log("TODO: QR Code")}>
                <QrCode className="mr-2 size-4" />
                <span>QR Code</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => console.log("TODO: Copy Link")}>
                <Link className="mr-2 size-4" />
                <span>Copy Link</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            onClick={onBack}
            size="icon"
            className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      <Button
        className="w-full rounded-full"
        onClick={onDirections}
        variant="primary"
      >
        <Navigation2 className="mr-2" size={18} />
        Directions
      </Button>
    </div>
  );
}
