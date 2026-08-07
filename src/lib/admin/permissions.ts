import { ADMIN_MODULES } from "@/lib/admin/nav";
import type { UserRoleDb } from "@/lib/supabase/types";

/**
 * Module permissions.
 *
 * Type-only imports and pure functions, so this is safe in Client Components —
 * the staff form needs the module list to render checkboxes.
 *
 * ## The model
 *
 *   superadmin   every module, always. Cannot be restricted.
 *   admin        the modules in `permissions`, plus elevated actions in them.
 *   staff        the modules in `permissions`.
 *   customer     nothing.
 *
 * A permission is a *module segment* — `products`, `inventory` — matching
 * `ADMIN_NAV`. Not an action verb. Read-versus-write is already carried by the
 * role: `elevated` gates the destructive and privilege-changing operations
 * inside a module, and that distinction is orthogonal to which modules you
 * have at all.
 *
 * ## Why the dashboard is not a permission
 *
 * `/admin` itself has no segment and is always reachable. Somebody who can
 * sign in has to land somewhere, and a portal that redirects its own operators
 * to a 403 on login is worse than one whose overview shows four figures they
 * could also infer from the modules they do have.
 */

/** Every grantable module. The dashboard is excluded — see above. */
export const GRANTABLE_MODULES = ADMIN_MODULES.filter(
  (module) => module.segment !== ""
);

export type ModuleSegment = string;

/** Roles that may enter the portal at all. */
export const PORTAL_ROLES: UserRoleDb[] = ["staff", "admin", "superadmin"];

/**
 * Roles permitted to perform destructive or privilege-changing operations
 * *within* the modules they hold.
 */
export const ELEVATED_ROLES: UserRoleDb[] = ["admin", "superadmin"];

/** Roles that reach every module regardless of `permissions`. */
export const UNRESTRICTED_ROLES: UserRoleDb[] = ["superadmin"];

export function isUnrestricted(role: UserRoleDb): boolean {
  return UNRESTRICTED_ROLES.includes(role);
}

/**
 * Whether a role and permission list reach a module.
 *
 * The single place this question is answered. Every guard, the sidebar and the
 * staff form all call it, so there is one definition to change rather than
 * four that drift.
 */
export function canAccessModule(
  role: UserRoleDb,
  permissions: readonly string[] | null | undefined,
  segment: ModuleSegment
): boolean {
  if (!PORTAL_ROLES.includes(role)) return false;
  if (isUnrestricted(role)) return true;

  // The overview has no segment and belongs to everyone who can sign in.
  if (segment === "") return true;

  return (permissions ?? []).includes(segment);
}

/** The modules an identity may reach, in navigation order. */
export function permittedModules(
  role: UserRoleDb,
  permissions: readonly string[] | null | undefined
) {
  return ADMIN_MODULES.filter((module) =>
    canAccessModule(role, permissions, module.segment)
  );
}

/**
 * The module a pathname belongs to.
 *
 * Longest segment first, so `/admin/products/new` resolves to `products`
 * rather than to the overview — whose empty segment prefixes everything.
 */
export function segmentForPath(pathname: string): ModuleSegment {
  const trimmed = pathname.replace(/\/+$/, "").replace(/^\/admin\/?/, "");
  if (!trimmed) return "";

  const match = [...GRANTABLE_MODULES]
    .sort((a, b) => b.segment.length - a.segment.length)
    .find(
      (module) =>
        trimmed === module.segment || trimmed.startsWith(`${module.segment}/`)
    );

  return match?.segment ?? "";
}

/**
 * Sensible starting permissions when creating an account.
 *
 * Not "everything" — an account created without a thought should be able to do
 * the least, not the most. These are the screens a new member of counter staff
 * needs on their first day; anything beyond is a decision somebody makes.
 */
export const DEFAULT_STAFF_MODULES: ModuleSegment[] = [
  "products",
  "inventory",
  "orders",
  "pos",
  "sales",
];
