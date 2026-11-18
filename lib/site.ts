/**
 * Site-wide constants: one place for the name, the links and the navigation.
 */

export const SITE_NAME = "FinHub Tracker";
export const SITE_TAGLINE = "Student Finance Planning Web App";
export const SITE_URL = "https://finhubtracker-maudung.vercel.app";
export const REPOSITORY_URL = "https://github.com/dung037517-netizen/finhub-tracker";
export const MATHFORGE_URL = "https://mathforge-blush.vercel.app";

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Planner" },
  { href: "/funding", label: "College funding" },
  { href: "/lab", label: "Market lab" },
  { href: "/method", label: "Method" },
];
