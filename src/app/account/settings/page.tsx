import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccountProfile } from "@/lib/account";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your details, communication preferences and security.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const profile = await getAccountProfile();
  if (!profile) redirect("/sign-in?expired=1&redirectTo=/account/settings");

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl font-light">Settings</h2>

      <section className="mt-10">
        <h3 className="eyebrow-sm text-muted-foreground">Your details</h3>
        <div className="mt-6">
          <ProfileForm profile={profile} />
        </div>
      </section>

      <Separator className="my-12" />

      <section>
        <h3 className="eyebrow-sm text-muted-foreground">Sign-in</h3>

        <dl className="mt-6 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-5">
            <dt className="text-sm font-light text-muted-foreground">
              Email address
            </dt>
            <dd className="text-sm font-normal">{profile.email}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-5">
            <dt className="text-sm font-light text-muted-foreground">
              Member since
            </dt>
            <dd className="text-sm font-normal">
              {formatDate(profile.memberSince, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-sm font-light leading-relaxed text-muted-foreground">
          Changing your password sends a secure link to your email address —
          your current password is never required, and the link expires after an
          hour.
        </p>

        <Button asChild variant="outline" className="mt-6">
          <Link href="/reset-password">Send a password reset link</Link>
        </Button>
      </section>

      <Separator className="my-12" />

      <section>
        <h3 className="eyebrow-sm text-muted-foreground">Your data</h3>
        <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
          You can request a copy of everything held against your account, or ask
          for it to be deleted. Deletion removes your profile, addresses and
          saved items; order records are retained where we are legally required
          to keep them.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/help/contact?subject=data-export">
              Request my data
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/help/contact?subject=account-deletion">
              Delete my account
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs font-light text-muted-foreground">
          Handled by a person rather than a button, so an accidental click
          cannot erase your history. See our{" "}
          <Link href="/legal/privacy" className="link-draw text-foreground">
            privacy notice
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
