"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MailCheck } from "lucide-react";

import { requestPasswordReset } from "@/app/actions/auth";
import {
  resetRequestSchema,
  type ResetRequestValues,
} from "@/lib/validation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const form = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ResetRequestValues) => {
    const formData = new FormData();
    formData.set("email", values.email);

    const result = await requestPasswordReset({}, formData);

    if (result?.fieldErrors?.email) {
      form.setError("email", { message: result.fieldErrors.email });
      return;
    }

    // Acknowledged either way. The action deliberately does not reveal whether
    // the address is registered, and neither does this screen.
    setSentTo(values.email);
  };

  if (sentTo) {
    return (
      <div className="space-y-5">
        <MailCheck className="size-6 text-champagne-dark" strokeWidth={1} />
        <p className="font-display text-2xl font-light">Check your inbox</p>
        <p className="text-sm font-light leading-relaxed text-muted-foreground">
          If an account exists for{" "}
          <span className="text-foreground">{sentTo}</span>, a link to set a new
          password is on its way. It expires in one hour.
        </p>
        <Button variant="outline" onClick={() => setSentTo(null)}>
          Use a different address
        </Button>
      </div>
    );
  }

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

        <Button
          type="submit"
          size="lg"
          block
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </Form>
  );
}
