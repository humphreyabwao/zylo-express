import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { DEMO_ADDRESSES } from "@/data/account";
import { countryByCode } from "@/lib/validation";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Addresses",
  description: "Manage your delivery and billing addresses.",
  robots: { index: false, follow: false },
};

export default function AddressesPage() {
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-light">Addresses</h2>
          <p className="mt-3 text-sm font-light text-muted-foreground">
            Used at checkout and for arranging returns.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" strokeWidth={1.5} />
          Add
        </Button>
      </div>

      <ul className="mt-8 grid gap-6 sm:grid-cols-2">
        {DEMO_ADDRESSES.map((address) => {
          const country = countryByCode(address.country);

          return (
            <li key={address.id} className="flex flex-col border border-hairline p-6">
              <div className="flex items-start justify-between gap-4">
                <p className="eyebrow-sm text-foreground">{address.label}</p>
                {address.isDefault && (
                  <span className="eyebrow-sm text-champagne-dark">Default</span>
                )}
              </div>

              <address className="mt-5 flex-1 text-sm font-light not-italic leading-relaxed text-muted-foreground">
                <span className="block text-foreground">
                  {address.firstName} {address.lastName}
                </span>
                {address.company && <>{address.company}<br /></>}
                {address.line1}
                <br />
                {address.line2 && (
                  <>
                    {address.line2}
                    <br />
                  </>
                )}
                {address.city}, {address.region} {address.postalCode}
                <br />
                {country.name}
                <br />
                {address.phone}
              </address>

              <div className="mt-6 flex gap-4">
                <button
                  type="button"
                  className="link-draw eyebrow-sm text-foreground"
                >
                  Edit
                </button>
                {!address.isDefault && (
                  <>
                    <button
                      type="button"
                      className="link-draw eyebrow-sm text-muted-foreground hover:text-foreground"
                    >
                      Make default
                    </button>
                    <button
                      type="button"
                      className="link-draw eyebrow-sm text-destructive"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-xs font-light leading-relaxed text-muted-foreground">
        Address management writes to the Supabase `addresses` table in the next
        phase; the controls above are inert for now.
      </p>
    </div>
  );
}
