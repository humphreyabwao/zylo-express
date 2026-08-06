import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Request a link to set a new password.",
  robots: { index: false, follow: true },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Set a new password"
      description="Enter the address on your account and we will send a link to choose a new password."
      image="/media/editorial/a-study-in-black.jpg"
      imageAlt="A study in black"
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/sign-in" className="link-draw text-foreground">
            Back to sign in
          </Link>
        </p>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
