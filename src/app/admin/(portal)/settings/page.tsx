import { requireAdmin } from "@/lib/admin/guard";
import { getStoreSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/primitives";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import {
  CurrencyPreview,
  CurrencySettingsForm,
  StorefrontSettingsForm,
} from "@/components/admin/settings-forms";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const identity = await requireAdmin();
  const settings = await getStoreSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Store-wide configuration. Changes reach open storefront tabs immediately."
      >
        <RealtimeRefresh channel="settings" label="settings" />
      </PageHeader>

      {/* Saving is gated on `elevated`, so a manager sees the forms, fills one
          in, and is refused on submit. Saying so up front is the difference
          between a permission model and a dead end. */}
      {!identity.canElevate && (
        <div className="mb-6 rounded-xl border border-champagne/40 bg-champagne/10 p-4">
          <p className="text-[0.8125rem] leading-relaxed text-champagne-dark">
            These settings move prices for every visitor at once, so saving them
            requires an administrator account. You can see the current
            configuration but not change it.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <CurrencySettingsForm config={settings.currency} />
          <StorefrontSettingsForm
            freeShippingThreshold={settings.freeShippingThreshold}
            announcements={settings.announcements}
            base={settings.currency.base}
          />
        </div>

        <CurrencyPreview config={settings.currency} />
      </div>
    </>
  );
}
