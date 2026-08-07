-- ---------------------------------------------------------------------------
-- ZYLO Express — content modules
--
-- Three things the Journal, Pages and Messages modules need that the schema
-- did not have.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------ page eyebrow

-- The small line above a page's title ("Client services", "Legal"). Every page
-- in `src/data/content.ts` carries one, and `content_pages` had nowhere to put
-- it — so migrating that copy into the database would have silently dropped a
-- visible piece of the design.
--
-- Defaulted rather than nullable: the storefront renders it unconditionally,
-- and a null there is a gap in the layout rather than an absent field.
alter table public.content_pages
  add column if not exists eyebrow text not null default '';

-- --------------------------------------------------------------- realtime

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'articles',          -- publish/schedule → admin list + /journal
    'content_pages',     -- copy edits → /help and /legal
    'contact_messages'   -- a new enquiry → the inbox badge, live
  ]
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', target
      );
    end if;
  end loop;
end
$$;

-- Deletes need the pre-image, for the same reason as migrations 8 and 10: the
-- SSE projection reads `slug` off an article and `status` off a message, and
-- under the default replica identity a delete carries only the primary key.
--
-- All three are low-write tables — an article is published a few times a week,
-- a page rarely, and a contact message is inserted once and updated once or
-- twice. The WAL cost is nothing like `product_variants` on the checkout path.
alter table public.articles         replica identity full;
alter table public.content_pages    replica identity full;
alter table public.contact_messages replica identity full;

-- ------------------------------------------------------- contact insert fix

-- The public contact form has to be able to write, and read nothing back.
--
-- `contact insertable ... for insert with check (true)` in migration 4 already
-- allows the insert, and nothing here needs to change for it to work. What is
-- worth recording is the trap next to it: asking PostgREST for the inserted
-- row back is a *read*, and the SELECT policy on this table is admin-only. A
-- caller that requests a representation gets a row-level security error on a
-- row that was, in fact, written — a failure report for a successful write.
--
-- This comment is the note for whoever adds the second caller.
comment on policy "contact insertable" on public.contact_messages is
  'Public write-only. Do not request a representation back (no .select() after '
  'insert, no Prefer: return=representation): the select policy is admin-only, '
  'so RETURNING is refused even though the insert succeeds. '
  'See src/app/actions/contact.ts.';

-- --------------------------------------------------------------- indexes

-- The admin inbox sorts newest-first across all statuses, which the existing
-- `(status, created_at desc)` index cannot serve when no status is selected.
create index if not exists contact_messages_recent_idx
  on public.contact_messages (created_at desc);

-- The Pages module lists by section and orders by position, including
-- unpublished rows — the partial index from migration 3 excludes those.
create index if not exists content_pages_admin_idx
  on public.content_pages (section, position);
