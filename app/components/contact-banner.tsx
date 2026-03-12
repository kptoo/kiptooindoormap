import { Mail, MessageCircle } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

export default function ContactBanner() {
  return (
    <Alert
      aria-label="Contact information"
      className="inset-x-0 bottom-0 rounded-b-none border-t border-green-300 bg-green-50 px-4 py-2 dark:border-green-700 dark:bg-green-950"
    >
      <AlertDescription className="flex items-center justify-between text-xs text-green-800 dark:text-green-100">
        <span className="font-semibold">
          KiptooIndoorMap
          <span className="hidden sm:inline"> — Built by Kiptoo</span>
        </span>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-6 border-0 bg-green-200 px-2 text-xs text-green-900 hover:bg-green-300 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700"
          >
            <a href="mailto:winermmanuel@gmail.com">
              <Mail size={12} className="mr-1" />
              <span className="hidden sm:inline">Email</span>
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-6 border-0 bg-green-200 px-2 text-xs text-green-900 hover:bg-green-300 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700"
          >
            <a
              href="https://wa.me/254702743039"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={12} className="mr-1" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
