import { Info } from "lucide-react";

/**
 * Shown when the account is running on `auth.users` metadata because the
 * `profiles` table is not there yet.
 *
 * Sign-in works without the migrations; orders, addresses and saved items do
 * not, because they have no tables to read. Saying so plainly is better than
 * rendering permanently empty panels and letting the customer — or the person
 * setting this up — conclude something is broken.
 *
 * Deleting this component once the migrations are applied is safe: it only
 * renders when `profile.persisted` is false, which stops happening then.
 */
export function SetupNotice() {
  return (
    <aside
      role="status"
      className="flex gap-4 border border-amber-600/30 bg-amber-50/60 p-5 dark:bg-amber-950/20"
    >
      <Info
        className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-normal text-foreground">
          Database setup is incomplete
        </p>
        <p className="text-sm font-light leading-relaxed text-muted-foreground">
          You are signed in, and your name and email come from your login. Order
          history, addresses and saved items need the database tables, which
          have not been created yet — run the migrations in{" "}
          <code className="font-mono text-xs">supabase/migrations/</code>, then
          this notice disappears on its own.
        </p>
      </div>
    </aside>
  );
}
