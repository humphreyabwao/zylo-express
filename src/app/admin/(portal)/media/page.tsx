import { requireAdmin } from "@/lib/admin/guard";
import { listMedia } from "@/lib/admin/queries";
import { storageUrl } from "@/lib/storage";
import { PageHeader, Panel } from "@/components/admin/primitives";
import { ListToolbar } from "@/components/admin/toolbar";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { MediaLibrary } from "@/components/admin/media-library";

export const metadata = { title: "Media" };

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("media");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const assets = await listMedia({
    search: read("q"),
    usage: (read("usage") ?? "all") as "all" | "attached" | "orphan",
    sort: (read("sort") ?? "recent") as "recent" | "name" | "size",
  });

  /**
   * The bucket's public URL prefix, resolved here.
   *
   * `storageUrl()` reads `env.supabaseUrl`, which is deliberately not a
   * `NEXT_PUBLIC_` variable — see `next.config.ts`. Resolving an empty path
   * yields the prefix alone, which the client component appends object paths
   * to without the Supabase URL ever being inlined into the bundle.
   */
  const publicBase = storageUrl("__base__").replace("__base__", "");

  const attached = assets.filter((asset) => asset.usage).length;
  const orphans = assets.length - attached;

  return (
    <>
      <PageHeader
        title="Media"
        description={
          assets.length === 0
            ? "Catalogue and editorial imagery, stored in Supabase."
            : `${assets.length} files · ${attached} in use · ${orphans} unused`
        }
      >
        <RealtimeRefresh channel="media" />
      </PageHeader>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by filename or product…"
          filters={[
            {
              name: "usage",
              label: "Usage",
              options: [
                { value: "", label: "All files" },
                { value: "attached", label: "In use" },
                { value: "orphan", label: "Unused" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest" },
                { value: "name", label: "Name A–Z" },
                { value: "size", label: "Largest" },
              ],
            },
          ]}
        />

        <MediaLibrary assets={assets} publicBase={publicBase} />
      </Panel>
    </>
  );
}
