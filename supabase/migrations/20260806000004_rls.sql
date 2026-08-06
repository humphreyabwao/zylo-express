-- ---------------------------------------------------------------------------
-- ZYLO Express — Row Level Security
--
-- RLS is the real security boundary, not key secrecy. Every table is enabled;
-- a table with RLS on and no policy denies everything, which is the correct
-- default for anything added later and forgotten about here.
--
-- Two roles matter:
--   anon / authenticated  → the publishable key. Constrained by these policies.
--   service_role          → the secret key. BYPASSES all of this by design,
--                           which is why it never leaves the server.
--
-- Catalogue writes are admin-only. That is the seam the admin dashboard will
-- authenticate through later; nothing else needs to change to enable it.
-- ---------------------------------------------------------------------------

alter table public.countries              enable row level security;
alter table public.categories             enable row level security;
alter table public.collections            enable row level security;
alter table public.products               enable row level security;
alter table public.product_collections    enable row level security;
alter table public.product_images         enable row level security;
alter table public.product_options        enable row level security;
alter table public.product_option_values  enable row level security;
alter table public.product_variants       enable row level security;
alter table public.profiles               enable row level security;
alter table public.addresses              enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.wishlist_items         enable row level security;
alter table public.promotions             enable row level security;
alter table public.reviews                enable row level security;
alter table public.articles               enable row level security;
alter table public.content_pages          enable row level security;
alter table public.site_settings          enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages       enable row level security;

-- ============================================================== catalogue ==
-- Readable by anyone; writable only by staff.

create policy "countries readable" on public.countries
  for select using (is_active);
create policy "countries admin writes" on public.countries
  for all using (public.is_admin()) with check (public.is_admin());

create policy "categories readable" on public.categories
  for select using (is_active);
create policy "categories admin writes" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "collections readable" on public.collections
  for select using (is_active);
create policy "collections admin writes" on public.collections
  for all using (public.is_admin()) with check (public.is_admin());

create policy "products readable" on public.products
  for select using (is_active);
create policy "products admin writes" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- Child tables inherit the parent product's visibility rather than restating
-- it, so an unpublished product cannot leak through its images or variants.
create policy "product images readable" on public.product_images
  for select using (exists (
    select 1 from public.products p where p.id = product_id and p.is_active
  ));
create policy "product images admin writes" on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product collections readable" on public.product_collections
  for select using (exists (
    select 1 from public.products p where p.id = product_id and p.is_active
  ));
create policy "product collections admin writes" on public.product_collections
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product options readable" on public.product_options
  for select using (exists (
    select 1 from public.products p where p.id = product_id and p.is_active
  ));
create policy "product options admin writes" on public.product_options
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product option values readable" on public.product_option_values
  for select using (exists (
    select 1
      from public.product_options o
      join public.products p on p.id = o.product_id
     where o.id = option_id and p.is_active
  ));
create policy "product option values admin writes" on public.product_option_values
  for all using (public.is_admin()) with check (public.is_admin());

create policy "product variants readable" on public.product_variants
  for select using (exists (
    select 1 from public.products p where p.id = product_id and p.is_active
  ));
create policy "product variants admin writes" on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================== identity ==

create policy "profiles readable by owner" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- Role is deliberately excluded from what a user may change: the WITH CHECK
-- re-reads the stored role and requires it to match, so a customer cannot
-- promote themselves to admin by updating their own row.
create policy "profiles updatable by owner" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

create policy "profiles admin writes" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================= addresses ==

create policy "addresses owned" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================================================================ orders ==
-- Read-only to the customer. Orders are created server-side through the
-- Edge Function, which validates prices against the catalogue — a client that
-- could INSERT here could name its own total.

create policy "orders readable by owner" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

create policy "orders admin writes" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy "order items readable by owner" on public.order_items
  for select using (exists (
    select 1 from public.orders o
     where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
  ));

create policy "order items admin writes" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================== wishlist ==

create policy "wishlist owned" on public.wishlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ promotions ==
-- Codes are validated server-side. Listing every active promotion to the
-- client would hand out unadvertised discounts, so there is no read policy
-- for regular users at all.

create policy "promotions admin only" on public.promotions
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================== reviews ==

create policy "approved reviews readable" on public.reviews
  for select using (is_approved or auth.uid() = user_id or public.is_admin());

-- Authenticated users may submit, but never pre-approved and never as someone
-- else: is_approved must be false on insert and user_id must be themselves.
create policy "reviews insertable by author" on public.reviews
  for insert to authenticated
  with check (auth.uid() = user_id and is_approved = false);

create policy "reviews admin writes" on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================== content ==

create policy "articles readable" on public.articles
  for select using (is_published);
create policy "articles admin writes" on public.articles
  for all using (public.is_admin()) with check (public.is_admin());

create policy "content pages readable" on public.content_pages
  for select using (is_published);
create policy "content pages admin writes" on public.content_pages
  for all using (public.is_admin()) with check (public.is_admin());

create policy "site settings readable" on public.site_settings
  for select using (true);
create policy "site settings admin writes" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================== capture ==
-- Write-only from the public's side. Anyone may subscribe or send a message;
-- nobody but staff may read the list back, so these tables can't be scraped
-- into a mailing list.

create policy "newsletter insertable" on public.newsletter_subscribers
  for insert with check (true);
create policy "newsletter admin reads" on public.newsletter_subscribers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "contact insertable" on public.contact_messages
  for insert with check (true);
create policy "contact admin reads" on public.contact_messages
  for all using (public.is_admin()) with check (public.is_admin());
