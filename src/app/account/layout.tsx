import { redirect } from "next/navigation";

import { getAccountProfile } from "@/lib/account";
import { formatDate } from "@/lib/utils";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { AccountNav } from "@/components/account/account-nav";

/**
 * The account shell.
 *
 * `proxy.ts` already redirects signed-out visitors, but this checks again:
 * proxy runs on navigation, and a layout can also be reached through a client
 * transition or a cached RSC payload.
 *
 * The `expired` flag is what stops that second check becoming a redirect loop.
 * Proxy bounces signed-in users away from /sign-in; if proxy and this layout
 * ever disagreed about the session — a token that refreshes in proxy but not
 * here, say — the two would ping-pong forever, which a browser renders as its
 * own bare error page. `expired=1` tells proxy to leave this one alone.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getAccountProfile();
  if (!profile) redirect("/sign-in?expired=1&redirectTo=/account");

  return (
    <>
      <section className="border-b border-hairline bg-surface">
        <div className="container-shell py-10 lg:py-14">
          <Breadcrumbs
            crumbs={[{ label: "Home", href: "/" }, { label: "My Account" }]}
          />

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              {/* Initials rather than an avatar upload: there is no photo to
                  show yet, and a placeholder silhouette says less than a name. */}
              <span
                aria-hidden="true"
                className="grid size-16 shrink-0 place-items-center rounded-full border border-hairline bg-background font-display text-xl font-light tracking-wide text-champagne-dark lg:size-20 lg:text-2xl"
              >
                {profile.initials}
              </span>

              <div className="min-w-0">
                <p className="eyebrow-sm text-muted-foreground">
                  Member since{" "}
                  {formatDate(profile.memberSince, {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <h1 className="mt-2 truncate font-display text-3xl font-light leading-[1.1] lg:text-4xl">
                  {profile.displayName}
                </h1>
                <p className="mt-1.5 truncate text-sm font-light text-muted-foreground">
                  {profile.email}
                </p>
              </div>
            </div>

            {profile.role !== "customer" && (
              <span className="self-start rounded-full border border-champagne-dark/40 px-3.5 py-1.5 eyebrow-sm text-champagne-dark sm:self-auto">
                {profile.role === "admin" ? "Administrator" : "Staff"}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="container-shell py-10 lg:py-14">
        {/* `[&>*]:min-w-0` on both items, not just the panel.

            A grid item floors at min-content, and the nav's row of tabs is
            about 700px laid end to end. The content column already carried
            min-w-0, but the nav did not — so the shared track sized to the
            tabs, the panel stretched to match, and every account screen ran
            two-and-a-bit viewports wide on a phone. */}
        <div className="grid gap-x-12 gap-y-8 [&>*]:min-w-0 lg:grid-cols-[14rem_1fr] xl:gap-x-16">
          <AccountNav />
          <div>{children}</div>
        </div>
      </section>
    </>
  );
}
