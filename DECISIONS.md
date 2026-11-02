# Decisions

Choices made while building, written down so whoever picks this up next knows why. Newest at the bottom.

## Repository and portability
- **Nothing account-specific in the code.** App URL, Supabase, Brevo, OpenRouter, reply domain and secrets all come from env vars (`.env.example` lists them). Company name, sender address, logo and so on live in the Settings page (database), not in code.
- **`scripts/check-portability.mjs` runs inside `npm run lint`.** It reads the current GitHub owner and repo name from `git remote get-url origin` and fails if either appears in any file. It also fails on URLs or email addresses on real domains (only placeholder and vendor domains are allowed) and on anything that looks like an API key. Extra words can be blocked with `PORTABILITY_FORBIDDEN=word1,word2`.
- **GitHub Actions only use secrets** (`APP_URL`, `CRON_SECRET`). No URLs live in the workflow files.

## AI model defaults
- `OPENROUTER_MODEL=openai/gpt-oss-120b:free` and `OPENROUTER_FALLBACK_MODEL=openrouter/free`. The OpenRouter API was not reachable from the build sandbox, so these were picked from public 2026 free-model lists. `openrouter/free` is OpenRouter's router that picks any available free model, which makes it a safe fallback when a specific free model is retired. Check https://openrouter.ai/models?max_price=0 during setup, and use the Settings page "Test AI connection" button to confirm.
- `OPENROUTER_DAILY_LIMIT=45` keeps us just under the ~50/day free allowance. When the limit is hit, drafts go to `needs_review` instead of failing silently.

## Scheduling (GitHub Actions free minutes)
- `send-approved` runs every 30 minutes (not every 10) to save free Actions minutes. The hourly `stage-emails` job also sends approved emails at the end of its run, so approved emails go out at least hourly during working hours and every 30 minutes otherwise.

## Database access
- **The server talks to Postgres directly (node-postgres + `DATABASE_URL`)** rather than through the Supabase REST API. That gives one SQL data layer, real transactions, and the atomic `claim_outbox_for_send` function. The database connection string is server-only, just like a service role key would be. Supabase is still the database and handles login (Supabase Auth).
- **RLS is on for every table**, with policies that allow only the `authenticated` role. The anon key used in the browser for login cannot read any table.
- **The demo database (`MOCK_DB=true`) is PGlite**, a real Postgres compiled to WebAssembly that runs inside Node. It runs the same migrations, so demo mode, tests and production share the same SQL. It is blocked in production: the server exits on start if `NODE_ENV=production` and `MOCK_DB=true`.
- **Migrations apply automatically on start-up** (`AUTO_MIGRATE=true`). They are tracked in `_app_migrations` and run under an advisory lock. This saves a non-technical person from running a migration tool. The SQL files in `supabase/migrations` are idempotent, so `supabase db push` and the SQL Editor also work. `lib/db/migrations.generated.ts` bundles them for serverless use; a test checks it stays in sync.
- **SSL to Supabase is encrypted but the chain is not verified** (`rejectUnauthorized: false`), because Supabase uses its own CA. This is the common setup for Vercel + Supabase.
- **Local Supabase (Docker) could not run in the build sandbox** (image pulls were blocked). Tests therefore use PGlite, plus a real PostgreSQL 16 for the concurrency tests (`TEST_DATABASE_URL`). `supabase/config.toml` and `seed.sql` are included for anyone with Docker.

## Next.js
- **Next.js 16 with Cache Components turned off.** Every screen is a signed-in dashboard showing live data, so classic dynamic rendering is simpler and avoids stale-data surprises.
- **`proxy.ts` (formerly middleware) protects every page.** Every server action also calls `requireUser()` itself, so security does not depend on the proxy alone.
- **System fonts, no Google Fonts.** Builds need no network and nothing loads from third parties.
- **shadcn/ui-style components are written by hand** in `components/ui`, on Radix primitives. The shadcn registry was not reachable from the build sandbox, and the result is identical in style.

## Checker and AI budget
- **The AI check is skipped while rule checks fail.** A rule failure already means a rewrite is needed, so asking the AI for a score would waste one of the ~50 free daily requests. A typical draft costs 2 requests (write + check); a draft that needs a rewrite costs 3-4.
- **If the AI checker itself errors, the draft goes straight to `needs_review`** rather than being rewritten blind.
- **The core safety rules are fixed in code** and added to every prompt, so HR can customise prompts freely without removing "no links / no invented facts / no sign-off".
- **The link rule checks the final rendered email** (HTML `href` and the plain-text version) against the resolved link. That proves the exact link reached the email.
- **Replies to an unclear ("other") message are always `needs_review`** and never auto-send, even if both checks pass.

## Replies (Brevo inbound)
- **The webhook answers fast, then works.** It stores the reply (deduplicated by Brevo's Uuid), handles bounces, auto-replies and unsubscribes, and returns 200. AI classification and drafting run just after the response via Next.js `after()`. Replies left unclassified (for example after a crash) are picked up by the hourly stage-emails job.
- **The payload parser is tolerant**: it accepts PascalCase or camelCase keys and a single object or `items[]`. The Brevo docs site was not reachable from the build sandbox, so the format follows Brevo's documented `items[]` structure. Check it with a real reply during setup (START_HERE step 6).
- **Matching:** sender email first (case-insensitive), then the 16-character reply token in the To address (`<token>@reply-domain`). That covers candidates who reply from a different address.
- **"Interested" drafts the interview invite straight away.** The invite already thanks them, so a separate reply is only drafted when their message also contains a question. That avoids two near-identical emails.
- **Auto-replies** (out-of-office) are stored but change nothing: no stage change and no reset of the follow-up timer. **Bounces** and **unsubscribe requests** go to the suppression list and cancel waiting drafts.
- **A real reply cancels any waiting follow-up** for that candidate.

## Scheduled jobs
- **Each cron call works for at most ~45 seconds** (Vercel Hobby functions stop at 60s) and answers `done: true/false`. `.github/scripts/call-cron.sh` calls again until done, up to 10 times, so a 20-candidate outreach batch with a slow free model still finishes.
- **Drafting stops when fewer than 4 AI requests are left today**, so the free limit is never overrun mid-draft.
- **An email HR rejected is not drafted again by the automation** (outreach and feedback: never; invite: until the candidate replies again; follow-up: until we email them again). HR can still use "Draft now" on the candidate page. System cancellations ("candidate replied", "bounced") don't count as rejections.
- **The digest is sent at most once a day** (`?force=1` sends it again). Its database queries also keep the free Supabase project from pausing.
- **The cron schedules live in `lib/cron/ist.ts`**, and a test checks that the workflow files use exactly those UTC times.

## Security and setup extras
- **`ALLOWED_EMAILS` locks the app to named accounts.** The Supabase anon key is public by design, so if sign-ups are ever re-enabled, a stranger could create an account. The allowlist (checked in the proxy, on every page and at login) blocks that. START_HERE also says to turn off sign-ups.
- **"Connect replies to Brevo" button.** Brevo's inbound webhook can only be created through its API. The Settings page calls it for the user, and won't create a duplicate.
- **`REPLY_TO_ADDRESS`** supports the documented Gmail fallback, in case Brevo inbound parsing isn't available on the user's plan.
- **Toasts are shown when the action returns**, not in an effect, because forms are re-mounted with fresh data after a save. Found by the E2E test.

## Free-tier notes
- **GitHub Actions:** private repos get 2,000 minutes a month and every job is billed as at least 1 minute. With send-approved every 30 minutes (as requested), the four schedules use about 1,800 minutes a month. START_HERE explains how to switch send-approved to hourly if needed.
- **Vercel Hobby** is for personal, non-commercial use under Vercel's terms. START_HERE mentions this so the company can decide whether Pro is needed.
