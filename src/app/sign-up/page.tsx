import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Create an account for private previews, order tracking and boutique appointments.",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Join the maison"
      title="Create your account"
      description="Private previews before each collection, restock notices for the pieces that sell out, and an invitation to the seasonal presentation."
      image="/media/campaign/feature-tall.jpg"
      imageAlt="Fine jewellery campaign"
      quote={{
        text: "The hallmark tells you the fineness. Weight tells you the method.",
        attribution: "Priya Raghunathan, Head of Fine Jewellery",
      }}
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className="link-draw text-foreground">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
