import type { Metadata } from "next";
import Link from "next/link";

import { DEMO_CLIENT } from "@/data/account";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your details, communication preferences and security.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl font-light">Settings</h2>

      <section className="mt-10">
        <h3 className="eyebrow-sm text-muted-foreground">Your details</h3>
        <dl className="mt-6 space-y-5">
          <Field label="Name">
            {DEMO_CLIENT.firstName} {DEMO_CLIENT.lastName}
          </Field>
          <Field label="Email">{DEMO_CLIENT.email}</Field>
          <Field label="Client since">
            {new Date(DEMO_CLIENT.memberSince).getFullYear()}
          </Field>
        </dl>
        <Button variant="outline" className="mt-8">
          Edit details
        </Button>
      </section>

      <Separator className="my-12" />

      <section>
        <h3 className="eyebrow-sm text-muted-foreground">Communication</h3>
        <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
          You receive collection previews and restock notices. Order
          confirmations and delivery updates are sent regardless of preference.
        </p>
        <Button variant="outline" className="mt-6">
          Manage preferences
        </Button>
      </section>

      <Separator className="my-12" />

      <section>
        <h3 className="eyebrow-sm text-muted-foreground">Security</h3>
        <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
          Change your password, review active sessions, or enable two-factor
          authentication.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/reset-password">Change password</Link>
          </Button>
          <Button variant="outline">Two-factor authentication</Button>
        </div>
      </section>

      <Separator className="my-12" />

      <section>
        <h3 className="eyebrow-sm text-destructive">Close account</h3>
        <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
          Closing your account removes your saved pieces and addresses. Order
          records are retained for the period required by law.
        </p>
        <Button variant="outline" className="mt-6 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
          Request account closure
        </Button>
      </section>

      <p className="mt-12 text-xs font-light leading-relaxed text-muted-foreground">
        These controls are wired to Supabase Auth and the `profiles` table in
        the next phase.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-hairline pb-4">
      <dt className="eyebrow-sm w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-sm font-light">{children}</dd>
    </div>
  );
}
