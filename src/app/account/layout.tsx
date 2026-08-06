import { DEMO_CLIENT } from "@/data/account";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { AccountNav } from "@/components/account/account-nav";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="border-b border-hairline bg-surface">
        <div className="container-shell py-12 lg:py-16">
          <Breadcrumbs
            crumbs={[{ label: "Home", href: "/" }, { label: "My Account" }]}
          />

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow-sm text-champagne-dark">
                {DEMO_CLIENT.tier}
              </p>
              <h1 className="mt-4 font-display text-4xl font-light leading-[1.06] lg:text-5xl">
                {DEMO_CLIENT.firstName} {DEMO_CLIENT.lastName}
              </h1>
              <p className="mt-3 text-sm font-light text-muted-foreground">
                {DEMO_CLIENT.email}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="eyebrow-sm text-muted-foreground">Your advisor</p>
              <p className="mt-2.5 font-display text-lg font-light">
                {DEMO_CLIENT.advisor.name}
              </p>
              <p className="mt-1 text-sm font-light text-muted-foreground">
                {DEMO_CLIENT.advisor.boutique}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-shell py-12 lg:py-16">
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[15rem_1fr] xl:gap-x-20">
          <AccountNav />
          <div className="min-w-0">{children}</div>
        </div>
      </section>
    </>
  );
}
