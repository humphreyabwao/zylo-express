"use client";

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { signInSchema, type SignInValues } from "@/lib/validation";
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

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", remember: true },
  });

  // Replaced by `supabase.auth.signInWithPassword` in the backend phase.
  const onSubmit = async (values: SignInValues) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    toast("Authentication is not connected yet", {
      description: `Supabase Auth is wired in the next phase — ${values.email} was validated client-side.`,
    });
  };

  return (
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
  );
}
