# HR Recruiting Automation

A web app for one HR person that writes, checks and sends recruiting emails, reads candidate replies, and moves candidates through the hiring stages. Every email is checked by fixed rules and by a second AI pass before it reaches the Outbox, and nothing is sent without approval unless auto-send is on.

**Going live (non-technical guide): see [`START_HERE.md`](START_HERE.md).** Design choices are in [`DECISIONS.md`](DECISIONS.md).

## Stack

- **Next.js 16** (App Router, React 19, TypeScript strict) with **Tailwind CSS v4** and shadcn/ui-style components on Radix. Deployed on **Vercel** (Hobby).
- **Supabase**: Postgres (with Row Level Security on every table) and Supabase Auth (email and password). The server talks to Postgres directly through `DATABASE_URL`.
- **Brevo**: sending (`POST /v3/smtp/email`) and inbound parsing for replies (a webhook).
- **OpenRouter**: LLM calls (OpenAI-compatible), free models by default.
- **GitHub Actions**: the scheduled jobs call protected API routes.
- **Vitest** (unit and integration) and **Playwright** (end-to-end, mock mode).

## Architecture

```mermaid
flowchart LR
  subgraph GitHub["GitHub Actions (cron, UTC)"]
    W1[outreach<br/>weekdays 10:00 IST]
    W2[stage-emails<br/>hourly 09-18 IST]
    W3[send-approved<br/>every 30 min]
    W4[daily-digest<br/>19:00 IST]
  end

  subgraph Vercel["Next.js app on Vercel"]
    UI[Dashboard pages<br/>Server Components + Server Actions]
    CRON[/api/cron/*<br/>Bearer CRON_SECRET/]
    HOOK[/api/webhooks/brevo-inbound/:secret/]
    LIB[lib/: drafting, checker,<br/>sender, inbound, automation]
  end

  DB[(Supabase Postgres<br/>RLS on every table)]
  AUTH[Supabase Auth]
  AI[OpenRouter<br/>free model + fallback]
  BREVO[Brevo API]
  CAND((Candidate inbox))
  HR((HR: Zoho inbox))

  W1 & W2 & W3 & W4 -->|POST + Bearer| CRON
  UI --> LIB
  CRON --> LIB
  HOOK --> LIB
  LIB --> DB
  UI --> AUTH
  LIB -->|draft, classify, check| AI
  LIB -->|send| BREVO
  BREVO --> CAND
  BREVO -->|digest| HR
  CAND -->|reply to token at reply domain<br/>MX -> Brevo inbound| BREVO
  BREVO -->|parsed JSON| HOOK
```

### How an email is made

1. **Prompt resolution**: job override, else HR's global prompt, else the built-in default. The fixed core rules are always added on top (`lib/prompts`).
2. **Context**: JD, job facts, candidate, the last messages, company settings and tone (`lib/prompts/resolve.ts`).
3. **AI writes** `{subject, body}` as JSON. Invalid JSON gets one retry, then the draft goes to `needs_review` (`lib/ai`).
4. **Render** into the template: job template, else global template, else the built-in responsive HTML. A plain-text version is always made too. Links are inserted by the system only (`lib/email`).
5. **Checker**: deterministic rules, then the AI score. On failure there is one rewrite with the issues; if it still fails it goes to `needs_review` (`lib/checker`).
6. **Outbox**: HR approves (or auto-send approves drafts that passed both checks).
7. **Sender**: an atomic claim (`approved -> sending`), the daily cap, a suppression check, and a rule re-check if the email was edited (`lib/sender`).

Replies arrive at `/api/webhooks/brevo-inbound/<secret>`. The handler stores them (deduplicated), handles bounces, auto-replies and unsubscribes, has the AI classify the rest, moves the stage, and drafts the right reply (`lib/inbound`).

## Run it locally (no accounts needed)

Requirements: Node 20.9+ (22 recommended).

```bash
npm install
cp .env.example .env.local
# In .env.local set:
#   MOCK_DB=true  MOCK_EMAIL=true  MOCK_AI=true
#   MOCK_ADMIN_PASSWORD=<anything>   CRON_SECRET=<anything>   INBOUND_WEBHOOK_SECRET=<anything>
npm run dev
```

Open http://localhost:3000 and sign in with `MOCK_ADMIN_EMAIL` / `MOCK_ADMIN_PASSWORD`.

- `MOCK_DB=true` uses **PGlite** (real Postgres in WebAssembly) saved in `.data/pglite`, with the same migrations as production. Set `MOCK_DB_DIR=memory` to start empty each time. The server **refuses to start** with `MOCK_DB=true` in production.
- `MOCK_EMAIL=true` stores emails in `mail_log` and shows them as sent, but nothing leaves the app.
- `MOCK_AI=true` gives predictable answers that pass the checker.

Trigger the scheduled jobs by hand:

```bash
curl -X POST http://localhost:3000/api/cron/outreach      -H "Authorization: Bearer $CRON_SECRET"
curl -X POST http://localhost:3000/api/cron/stage-emails  -H "Authorization: Bearer $CRON_SECRET"
curl -X POST http://localhost:3000/api/cron/send-approved -H "Authorization: Bearer $CRON_SECRET"
curl -X POST "http://localhost:3000/api/cron/daily-digest?force=1" -H "Authorization: Bearer $CRON_SECRET"
```

### With local Supabase (Docker)

```bash
npx supabase start           # prints the URL, anon key and DB URL
# .env.local: MOCK_DB=false, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#             DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run dev                  # migrations apply automatically; login admin@example.com / password123 (supabase/seed.sql)
```

## Tests

| Command | What it does |
|---|---|
| `npm run lint` | ESLint, plus `scripts/check-portability.mjs` (no account names, real domains or secrets in the repo) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest: unit and integration tests on an in-memory Postgres (PGlite) |
| `TEST_DATABASE_URL=postgresql://... npm test` | Also runs `tests/db` against a real Postgres (20 concurrent claims send once, daily cap, RLS). **Wipes that database's `public` schema.** |
| `npm run test:e2e` | Playwright: the full flow in mock mode, plus auth/secret checks and an accessibility scan |
| `npm run build` | Production build |

## Environment variables

All are documented in [`.env.example`](.env.example), and a test fails if the code reads one that is not listed.

| Variable | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | links in emails/digest, webhook URL | e.g. `https://hr.company.com` |
| `APP_TIMEZONE` | "today" for limits and digest | default `Asia/Kolkata` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | login | Supabase -> Project Settings -> API |
| `DATABASE_URL` | all data | Supabase -> Connect -> Transaction pooler (port 6543). Server only |
| `ALLOWED_EMAILS` | login lock | comma-separated emails allowed to use the app |
| `AUTO_MIGRATE` | start-up | `true` applies `supabase/migrations` automatically |
| `CRON_SECRET` | scheduled jobs | must equal the GitHub secret `CRON_SECRET` |
| `INBOUND_WEBHOOK_SECRET` | reply webhook | part of the webhook URL |
| `BREVO_API_KEY` | sending | Brevo -> SMTP & API -> API keys |
| `REPLY_DOMAIN` | Reply-To address | Settings page value wins when filled |
| `REPLY_TO_ADDRESS` | Gmail fallback only | fixed Reply-To when no reply domain is set |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `OPENROUTER_DAILY_LIMIT` | AI | defaults: `openai/gpt-oss-120b:free`, `openrouter/free`, 45 |
| `MOCK_EMAIL`, `MOCK_AI`, `MOCK_DB`, `MOCK_DB_DIR`, `MOCK_ADMIN_EMAIL`, `MOCK_ADMIN_PASSWORD` | local/testing | never `MOCK_DB=true` in production |
| `TEST_DATABASE_URL` | tests only | throwaway Postgres |

## Project layout

```
app/(app)/            dashboard pages (home, jobs, candidates, outbox, email-formats, prompts, documents, settings, activity)
app/api/cron/*        scheduled jobs (Bearer CRON_SECRET)
app/api/webhooks/     Brevo inbound webhook
lib/ai                OpenRouter client, mock, JSON parsing, usage limits
lib/checker           rule checks + check/rewrite flow
lib/drafting          builds and stores drafts (link resolution, auto-send rule)
lib/email             template engine, built-in HTML template, validation, rendering, sanitising
lib/inbound           webhook parsing, bounce/auto-reply/unsubscribe detection, classification
lib/sender            idempotent sending with the daily cap
lib/automation        stage rules for the scheduled jobs
lib/digest            daily summary
lib/db                Postgres (pg) / PGlite client + migration runner
supabase/migrations   SQL schema, RLS, functions
.github/workflows     cron workflows + CI
tests/                unit, db integration and e2e tests
```

## Scheduled jobs

| Workflow | UTC cron | IST | Route |
|---|---|---|---|
| `cron-outreach.yml` | `30 4 * * 1-5` | 10:00 Mon-Fri | `/api/cron/outreach` |
| `cron-stage-emails.yml` | `30 3-12 * * *` | hourly 09:00-18:00 | `/api/cron/stage-emails` (also sends approved emails) |
| `cron-send-approved.yml` | `*/30 * * * *` | every 30 min | `/api/cron/send-approved` |
| `cron-daily-digest.yml` | `30 13 * * *` | 19:00 | `/api/cron/daily-digest` |

Each route works for at most ~45 s and answers `{"done": true|false}`. `.github/scripts/call-cron.sh` calls again until it's done. All routes are safe to re-run.
