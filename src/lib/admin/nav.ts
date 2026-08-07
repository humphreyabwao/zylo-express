import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  Mail,
  Newspaper,
  Package,
  Radio,
  Receipt,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Warehouse,
} from "lucide-react";

/**
 * The admin module registry.
 *
 * One declaration drives the sidebar, the breadcrumb trail, the document title
 * and the command palette. Adding a module means adding an entry here and a
 * route — nothing else has to be kept in step, which is the whole point: a
 * sidebar hand-written in JSX drifts from the routes it points at within a
 * release or two.
 *
 * Type-only imports of icons keep this importable from Server Components; the
 * icons themselves are rendered client-side by the sidebar.
 */

export interface AdminModule {
  /** Route under /admin. The empty string is the overview itself. */
  segment: string;
  label: string;
  icon: LucideIcon;
  /** Shown under the label when the sidebar is expanded. */
  description: string;
  /**
   * Marks a module as not yet implemented. It still renders in the sidebar so
   * the shape of the finished portal is legible, but it is visibly pending
   * rather than silently broken — an operator should never click into a dead
   * page and wonder whether it failed to load.
   */
  pending?: boolean;
}

export interface AdminModuleGroup {
  label: string;
  modules: AdminModule[];
}

export const ADMIN_NAV: AdminModuleGroup[] = [
  {
    label: "Overview",
    modules: [
      {
        segment: "",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Trading summary and recent activity",
      },
    ],
  },
  {
    label: "Catalogue",
    modules: [
      {
        segment: "products",
        label: "Products",
        icon: Package,
        description: "Create, price and publish the catalogue",
      },
      {
        segment: "inventory",
        label: "Inventory",
        icon: Warehouse,
        description: "Stock levels across every variant",
      },
      {
        segment: "categories",
        label: "Categories",
        icon: Tags,
        description: "The primary navigation taxonomy",
      },
      {
        segment: "collections",
        label: "Collections",
        icon: Layers,
        description: "Curated groupings and campaigns",
      },
      {
        segment: "media",
        label: "Media",
        icon: ImageIcon,
        description: "Product photography and editorial plates",
      },
    ],
  },
  {
    label: "Commerce",
    modules: [
      {
        segment: "orders",
        label: "Orders",
        icon: Receipt,
        description: "Fulfilment, tracking and refunds",
      },
      {
        segment: "promotions",
        label: "Promotions",
        icon: BadgePercent,
        description: "Discount codes and their limits",
      },
      {
        segment: "customers",
        label: "Customers",
        icon: Users,
        description: "Accounts, orders and lifetime value",
      },
      {
        segment: "appointments",
        label: "Appointments",
        icon: CalendarDays,
        description: "Private appointment requests and the diary",
      },
    ],
  },
  {
    label: "Content",
    modules: [
      {
        segment: "journal",
        label: "Journal",
        icon: Newspaper,
        description: "Editorial articles and their scheduling",
      },
      {
        segment: "pages",
        label: "Pages",
        icon: FileText,
        description: "Help centre and legal copy",
      },
      {
        segment: "messages",
        label: "Messages",
        icon: Mail,
        description: "Contact enquiries and their status",
      },
      {
        segment: "subscribers",
        label: "Subscribers",
        icon: Radio,
        description: "The mailing list and its consent record",
      },
    ],
  },
  {
    label: "Administration",
    modules: [
      {
        segment: "staff",
        label: "Staff",
        icon: ShieldCheck,
        description: "Who can sign in and what they may do",
      },
      {
        segment: "settings",
        label: "Settings",
        icon: Settings,
        description: "Storefront configuration",
      },
    ],
  },
];

/** Flattened, for lookups that do not care about grouping. */
export const ADMIN_MODULES: AdminModule[] = ADMIN_NAV.flatMap(
  (group) => group.modules
);

export const ADMIN_ROOT = "/admin";

export function moduleHref(segment: string): string {
  return segment ? `${ADMIN_ROOT}/${segment}` : ADMIN_ROOT;
}

/**
 * The module owning a pathname.
 *
 * Matched longest-segment-first so `/admin/products/new` resolves to Products
 * rather than to the overview, whose empty segment is a prefix of everything.
 */
export function moduleForPath(pathname: string): AdminModule | undefined {
  const trimmed = pathname.replace(/\/+$/, "");
  if (trimmed === ADMIN_ROOT || trimmed === "") {
    return ADMIN_MODULES.find((m) => m.segment === "");
  }

  return [...ADMIN_MODULES]
    .filter((m) => m.segment)
    .sort((a, b) => b.segment.length - a.segment.length)
    .find(
      (m) =>
        trimmed === moduleHref(m.segment) ||
        trimmed.startsWith(`${moduleHref(m.segment)}/`)
    );
}
