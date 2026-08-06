import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { getAccountAddresses } from "@/lib/account";
import { AddressBook } from "@/components/account/address-book";

export const metadata: Metadata = {
  title: "Addresses",
  description: "Manage your delivery and billing addresses.",
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const addresses = await getAccountAddresses();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-light">Addresses</h2>
          <p className="mt-3 max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            Used at checkout and for arranging returns. Your default is
            pre-filled automatically.
          </p>
        </div>
      </div>

      {addresses.length === 0 ? (
        <div className="mt-8 border border-hairline px-8 py-16 text-center">
          <MapPin
            className="mx-auto size-7 text-champagne-dark"
            strokeWidth={1}
            aria-hidden="true"
          />
          <h3 className="mt-6 font-display text-xl font-light">
            No addresses saved
          </h3>
          <p className="mx-auto mt-3 max-w-sm text-sm font-light leading-relaxed text-muted-foreground">
            Add one now and checkout becomes a single step.
          </p>
          <div className="mt-8 flex justify-center">
            <AddressBook addresses={addresses} />
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <AddressBook addresses={addresses} />
        </div>
      )}
    </div>
  );
}
