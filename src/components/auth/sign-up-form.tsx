"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { signUp } from "@/app/actions/auth";
import { signUpSchema, type SignUpValues } from "@/lib/validation";
import { cn } from "@/lib/utils";
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

const RULES = [
  { label: "At least 10 characters", test: (v: string) => v.length >= 10 },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
];

export function SignUpForm() {
  const [visible, setVisible] = React.useState(false);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      marketingOptIn: true,
      terms: false,
    },
  });

  const password = form.watch("password");

  /**
   * Posted to our own Server Action; Supabase is called from the server. The
   * profile row is created by a database trigger on auth.users, so a signup
   * can never half-succeed with an auth user and no profile behind it.
   */
  const onSubmit = async (values: SignUpValues) => {
    const formData = new FormData();
    formData.set("firstName", values.firstName);
    formData.set("lastName", values.lastName);
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    if (values.marketingOptIn) formData.set("marketingOptIn", "on");
    if (values.terms) formData.set("terms", "on");

    const result = await signUp({}, formData);

    if (result?.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        form.setError(field as keyof SignUpValues, { message });
      }
      return;
    }
    if (result?.error) {
      toast.error("Could not create your account", {
        description: result.error,
      });
      return;
    }
    if (result?.success) {
      toast.success("Almost there", { description: result.success });
      form.reset();
    }
  };

  return (
    <div className="space-y-7">
      {/* Same order as sign-in: Google first, then the full form for
          anyone who would rather not link an account. */}
      <GoogleButton label="Sign up with Google" />

      <AuthDivider />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-7"
          noValidate
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="given-name" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="family-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" />
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
                <FormLabel>Password</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
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

                {/* Live requirements, so the shopper is never guessing. */}
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {RULES.map((rule) => {
                    const met = rule.test(password ?? "");
                    return (
                      <li
                        key={rule.label}
                        className={cn(
                          "flex items-center gap-2 text-xs font-light transition-colors duration-400",
                          met ? "text-champagne-dark" : "text-muted-foreground"
                        )}
                      >
                        <Check
                          className={cn(
                            "size-3 shrink-0 transition-opacity duration-400",
                            met ? "opacity-100" : "opacity-25"
                          )}
                          strokeWidth={2}
                        />
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <FormField
              control={form.control}
              name="marketingOptIn"
              render={({ field }) => (
                <FormItem>
                  <label className="flex cursor-pointer items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                      />
                    </FormControl>
                    <span className="text-sm font-light leading-relaxed text-muted-foreground">
                      Write to me before each collection. No more than six times a
                      year.
                    </span>
                  </label>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem>
                  <label className="flex cursor-pointer items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                      />
                    </FormControl>
                    <span className="text-sm font-light leading-relaxed text-muted-foreground">
                      I accept the{" "}
                      <Link
                        href="/legal/terms"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        terms of sale
                      </Link>{" "}
                      and{" "}
                      <Link
                        href="/legal/privacy"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        privacy policy
                      </Link>
                      .
                    </span>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            block
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
