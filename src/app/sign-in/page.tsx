import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Access your account, orders and saved pieces.",
  alternates: { canonical: "/sign-in" },
};

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Client account"
      title="Welcome back"
      description="Sign in to follow an order, revisit your saved pieces, or arrange a private appointment."
      image="/media/campaign/hero-tertiary.jpg"
      imageAlt="The winter campaign"
      quote={{
        text: "We would rather make one bag properly than five quickly.",
        attribution: "Hélène Marchand, Director of the Atelier",
      }}
      footer={
        <p>
          New to the maison?{" "}
          <Link href="/sign-up" className="link-draw text-foreground">
            Create an account
          </Link>
        </p>
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
