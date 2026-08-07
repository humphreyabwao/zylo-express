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
  const identity = await requireAdmin("settings");
  const settings = await getStoreSettings();

  return (
    <>
      <PageHeader
        title="Settings"
      >
        <RealtimeRefresh channel="settings" />
      </PageHeader>
      {!identity.canElevate && (
        <div className="mb-6 rounded-xl border border-champagne/40 bg-champagne/10 p-4">
          <p className="text-[0.8125rem] leading-relaxed text-champagne-dark">
            Saving requires an administrator account.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <CurrencySettingsForm
            config={settings.currency}
            ratesUpdatedAt={settings.ratesUpdatedAt}
            ratesSource={settings.ratesSource}
          />
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
