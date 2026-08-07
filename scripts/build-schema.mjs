/**
 * Concatenates supabase/migrations/*.sql into one paste-ready script.
 *
 * The Supabase SQL editor takes a single buffer, not a directory, and running
 * eight files by hand in the wrong order fails in ways that are tedious to
 * unpick — migration 2 needs the `currency_code` type from 1, migration 4's
 * policies need every table from 1–3, and migration 6 replaces a trigger
 * defined in 2. Filename order is dependency order, so this preserves it.
 *
 * Generated rather than hand-maintained: a checked-in copy that someone edits
 * instead of the migration is a schema that disagrees with itself, and the one
 * you would notice last is the one the SQL editor actually ran.
 *
 *   npm run schema              → supabase/schema.sql, every migration
 *   npm run schema -- --from 7  → supabase/schema-pending.sql, from #7 on
 *
 * NOTE: the output is a fallback, not the path. Migrations 16, 17 and 18 must
 * reach the database as three separate transactions — 16 adds `superadmin` to
 * an enum, and Postgres refuses any use of a new enum value in the transaction
 * that added it, including inside the function bodies in 17. `npm run db:push`
 * runs each file in its own transaction and is the supported route; this
 * concatenation exists for seeding a fresh database by hand.
 *
 * `--from` exists because a database is only empty once. After the first
 * apply, the full file is not merely redundant — it aborts on its own
 * duplicate-object guard, which is correct but unhelpful when what you
 * actually needed was the two migrations added since.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const fromArg = process.argv.indexOf("--from");
const from = fromArg === -1 ? 0 : Number(process.argv[fromArg + 1]);

if (fromArg !== -1 && (!Number.isInteger(from) || from < 1)) {
  console.error("--from takes a 1-based migration number, e.g. --from 7");
  process.exit(1);
}

const partial = fromArg !== -1;
const OUTPUT = join(
  process.cwd(),
  "supabase",
  partial ? "schema-pending.sql" : "schema.sql"
);

const all = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (!all.length) {
  console.error("No migrations found in supabase/migrations/.");
  process.exit(1);
}

if (from > all.length) {
  console.error(`--from ${from} but there are only ${all.length} migrations.`);
  process.exit(1);
}

const files = partial ? all.slice(from - 1) : all;

const rule = "-".repeat(75);

/**
 * Fail fast, and say why.
 *
 * Without this, re-running on a database that already has the schema stops on
 * `type "currency_code" already exists` a few hundred lines in — which reads
 * like a bug in the script rather than "you have already done this". Postgres
 * runs the SQL editor's buffer as one transaction, so an abort here rolls
 * everything back and leaves the database exactly as it was.
 */
const preflight = partial
  ? ""
  : `--
-- Refuse to run twice. Applying this over an existing schema would abort
-- partway through with a confusing duplicate-type error; this says the useful
-- thing instead. To apply only the migrations added since, use
-- \`npm run schema -- --from <n>\`. To start over deliberately, drop first:
--
--   drop schema public cascade;
--   create schema public;
--   grant usage on schema public to anon, authenticated, service_role;
--
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'products'
  ) then
    raise exception
      'ZYLO schema is already applied. Nothing was changed. See the note above.';
  end if;
end
$$;
`;

const header = partial
  ? `-- ${rule}
-- ZYLO Express — pending migrations, from #${from}
--
-- GENERATED FILE. Do not edit: run \`npm run schema -- --from ${from}\` after
-- changing anything in supabase/migrations/, which is the source of truth.
--
-- For a database that already has migrations 1–${from - 1}. Paste into the
-- Supabase SQL editor and run once. The editor runs the buffer as a single
-- transaction, so a failure anywhere rolls all of it back.
--
-- There is no already-applied guard on this file — it cannot know which of a
-- subset you have run. Running it twice will abort on the first duplicate
-- object, having changed nothing.
--
-- Contains ${files.length} migration${files.length === 1 ? "" : "s"}:
${files.map((name) => `--   ${name}`).join("\n")}
-- ${rule}
`
  : `-- ${rule}
-- ZYLO Express — complete database schema
--
-- GENERATED FILE. Do not edit: run \`npm run schema\` after changing anything
-- in supabase/migrations/, which is the source of truth.
--
-- Paste the whole file into the Supabase SQL editor and run it once, on a
-- fresh project. Sections are in dependency order and must stay that way.
--
-- Built from ${files.length} migrations:
${files.map((name) => `--   ${name}`).join("\n")}
-- ${rule}

${preflight}`;

const body = files
  .map((name) => {
    const sql = readFileSync(join(MIGRATIONS, name), "utf8").trimEnd();
    return `\n-- ${rule}\n-- ▓▓ ${name}\n-- ${rule}\n\n${sql}\n`;
  })
  .join("\n");

const footer = partial
  ? `
-- ${rule}
-- Done.
-- ${rule}
`
  : `
-- ${rule}
-- Done. Next:
--   1. npm run seed          — load the catalogue
--   2. Storage → media       — the seed writes image paths; upload the files
--   3. Auth → URL config     — add your SITE_URL to the redirect allow-list
-- ${rule}
`;

writeFileSync(OUTPUT, header + body + footer, "utf8");

const lines = (header + body + footer).split("\n").length;
const name = partial ? "schema-pending.sql" : "schema.sql";
console.log(
  `Wrote supabase/${name} — ${files.length} migration${
    files.length === 1 ? "" : "s"
  }, ${lines} lines.`
);
