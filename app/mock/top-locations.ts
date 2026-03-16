type TopLocation = {
  name: string;
  iconSrc: string;
  /** Tailwind classes used for the round button background/text */
  colors: string;
};

/**
 * Top “category” shortcuts (airport terminals).
 * These names MUST match the keys used in DiscoveryView.TOP_FILTER_BY_NAME.
 */
const topLocations: TopLocation[] = [
  {
    name: "Gates",
    iconSrc: "/icons/gate_departure_icon_215792.png",
    colors: "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
  },
  {
    name: "Check In",
    iconSrc: "/icons/Check In_43690.png",
    colors:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  {
    name: "Security",
    iconSrc: "/icons/Security_icon-icons.com_74703.png",
    colors: "bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-100",
  },
  {
    name: "ATM",
    iconSrc: "/icons/atm_109498.png",
    colors:
      "bg-purple-100 text-purple-700 dark:bg-purple-700 dark:text-purple-100",
  },
  {
    name: "Restrooms",
    // If you’d rather pick one gender-neutral icon later, swap this.
    iconSrc: "/icons/toilets_women_wc_icon_180371.png",
    colors: "bg-amber-100 text-amber-700 dark:bg-amber-700 dark:text-amber-100",
  },
  {
    name: "Food",
    iconSrc: "/icons/food-fork-kitchen-knife-meanns-restaurant_81404.png",
    colors: "bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-100",
  },
  {
    name: "Shops",
    iconSrc: "/icons/shop_retail_commerce_ecommerce_buy_cart_shopping_icon_260524.png",
    colors: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
  {
    name: "Elevators / Stairs",
    iconSrc: "/icons/elevator_icon_142819.png",
    colors: "bg-cyan-100 text-cyan-800 dark:bg-cyan-700 dark:text-cyan-100",
  },
];

export default topLocations;
export type { TopLocation };
