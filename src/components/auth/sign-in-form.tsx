"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { signIn } from "@/app/actions/auth";
import { signInSchema, type SignInValues } from "@/lib/validation";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const [visible, setVisible] = React.useState(false);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/account";

  // The auth callback and the OAuth action both report failures by bouncing
  // back here with `?error=`. Until this existed the message was dropped and a
  // failed Google round trip looked like nothing had happened at all.
  const error = searchParams.get("error");
  React.useEffect(() => {
    if (error) toast.error("Could not sign in", { description: error });
  }, [error]);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", remember: true },
  });

  /**
   * Credentials go to our own Server Action, which talks to Supabase from the
   * server and sets an httpOnly session cookie. Nothing about the Supabase
   * project — not even the publishable key — reaches this bundle.
   *
   * On success the action redirects, so this promise never resolves; only the
   * failure path returns.
   */
  const onSubmit = async (values: SignInValues) => {
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    if (values.remember) formData.set("remember", "on");
    formData.set("redirectTo", redirectTo);

    const result = await signIn({}, formData);

    if (result?.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        form.setError(field as keyof SignInValues, { message });
      }
      return;
    }
    if (result?.error) {
      toast.error("Could not sign in", { description: result.error });
    }
  };

  return (
    <div className="space-y-7">
      {/* Google first: for a returning customer it is one tap, where the form
          below is two fields and a password manager. */}
      <GoogleButton redirectTo={redirectTo} label="Sign in with Google" />

      <AuthDivider />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-7"
          noValidate
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-baseline justify-between gap-4">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/reset-password"
                    className="link-draw eyebrow-sm text-muted-foreground hover:text-foreground"
                  >
                    Forgotten?
                  </Link>
                </div>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      type={visible ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-10"
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "Hide password" : "Show password"}
                    className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-muted-foreground transition-colors duration-400 hover:text-foreground"
                  >
                    {visible ? (
                      <EyeOff className="size-4" strokeWidth={1.25} />
                    ) : (
                      <Eye className="size-4" strokeWidth={1.25} />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="remember"
            render={({ field }) => (
              <FormItem>
                <label className="flex cursor-pointer items-center gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <span className="text-sm font-light text-muted-foreground">
                    Keep me signed in
                  </span>
                </label>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            block
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          </form>
      </Form>
    </div>
  );
}
