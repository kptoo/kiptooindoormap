import type { MetaFunction } from "@remix-run/node";
import MapComponent from "~/components/map-component";
import { Analytics } from "@vercel/analytics/remix";

export const meta: MetaFunction = () => {
  return [
    { title: "KiptooIndoorMap" },
    {
      name: "description",
      content:
        "KiptooIndoorMap is an indoor navigation solution that helps people navigate large indoor spaces like malls, airports, hospitals, and universities. Explore and navigate with ease.",
    },
  ];
};

export default function Index() {
  return (
    <div className="flex h-svh items-center justify-center">
      <Analytics />
      <MapComponent />
    </div>
  );
}
