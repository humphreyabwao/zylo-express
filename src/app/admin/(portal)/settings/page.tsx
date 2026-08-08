import { requireAdmin } from "@/lib/admin/guard";
import { getStoreSettings } from "@/lib/settings";
import { getMaskedCredentials } from "@/lib/payments/credentials";
import { getMaskedEmailCredentials } from "@/lib/email/credentials";
import { PageHeader } from "@/components/admin/primitives";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { PaystackSettingsForm } from "@/components/admin/payment-settings";
import { EmailSettingsForm } from "@/components/admin/email-settings";
import {
  CurrencyPreview,
  CurrencySettingsForm,
  StorefrontSettingsForm,
} from "@/components/admin/settings-forms";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const identity = await requireAdmin("settings");

  // `getMaskedCredentials` is the only shape of this data allowed across the
  // boundary into a Client Component — hints, never keys. Passing the resolved
  // credentials instead would put a live secret key in the RSC payload, which
  // is sent to the browser.
  const [settings, paystack, email] = await Promise.all([
    getStoreSettings(),
    getMaskedCredentials("paystack"),
    getMaskedEmailCredentials(),
  ]);

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

        <div className="space-y-6">
          <CurrencyPreview config={settings.currency} />
          <PaystackSettingsForm
            credentials={paystack}
            canEdit={identity.unrestricted}
          />
          <EmailSettingsForm
            credentials={email}
            canEdit={identity.unrestricted}
            operatorEmail={identity.profile.email}
          />
        </div>
      </div>
    </>
  );
}
