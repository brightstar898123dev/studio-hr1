# Start here: going live, step by step

This guide takes you from "I have the code" to "the app sends and reads recruiting emails", using **only free accounts**. You don't need to be technical; just follow the steps in order. It takes about 1-2 hours, most of it waiting for DNS.

Throughout this guide:

- `company.com` means **your** domain (the one your Zoho email uses).
- `hr@company.com` means **your** HR email address.
- `hr.company.com` is the web address the app will live at.
- `reply.company.com` is a new sub-domain that receives candidate replies.

Keep a note (in a password manager) of every key and password you create. **Never paste keys into emails, chats or code.**

**What you will set up:**

| Service | What it does | Free plan |
|---|---|---|
| Supabase | Stores your data and handles login | Free |
| GitHub | Holds the code and runs the timers | Free (private repo) |
| Vercel | Runs the website | Hobby (free) |
| Brevo | Sends emails and catches replies | 300 emails/day |
| OpenRouter | The AI that writes emails | Free models, about 50 requests/day |

---

## Step 1: Supabase (database and login)

1. Go to **supabase.com**, sign up, and click **New project**.
   - Name: anything, e.g. `hr-recruiting`.
   - **Database password**: click *Generate*, and **save it**.
   - Region: the one closest to you (e.g. *Mumbai* for India).
2. Wait about 2 minutes for the project to be ready.
3. **Copy three values** into your notes:
   - Click **Connect** (top of the page), choose **App Frameworks**, and copy the **URL** (`NEXT_PUBLIC_SUPABASE_URL`) and the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). They are also under *Project Settings -> API*.
   - Click **Connect** again and choose **Transaction pooler**. Copy the connection string (`DATABASE_URL`). Replace `[YOUR-PASSWORD]` in it with the database password from point 1.
4. **Create your login**: *Authentication -> Users -> Add user -> Create new user*. Enter your email and a strong password, and tick **Auto Confirm User**.
5. **Turn off public sign-ups** (important): *Authentication -> Sign In / Providers* (or *Settings*). Switch off **Allow new users to sign up**. Only the user you created can then exist.
6. **Database tables: nothing to do.** The app creates them automatically the first time it starts (step 3).
   - If you ever need to do it by hand: *SQL Editor -> New query*. Paste the contents of `supabase/migrations/20260101000001_schema.sql`, click **Run**, then do the same with `20260101000002_security_and_functions.sql`. Running them twice is safe.

## Step 2: GitHub (code and timers)

1. Sign up at **github.com** if you don't have an account.
2. Put the code in a **private** repository. Choose one way:
   - Someone gives you the existing repo: ask them to **transfer** it to you. See "Moving to a new account" at the end.
   - You have the code on your computer: install **GitHub Desktop**, then *File -> Add local repository*, choose the folder, and click **Publish repository**. Keep **"Keep this code private"** ticked.
3. **Make up a long random secret** for the timers (`CRON_SECRET`). For example, use a password manager to generate a 40-character password with letters and numbers only. Make one more for replies (`INBOUND_WEBHOOK_SECRET`).
4. In the repository on github.com: *Settings -> Secrets and variables -> Actions -> New repository secret*. Add two secrets:
   - `APP_URL`: `https://hr.company.com` (your future app address, no slash at the end).
   - `CRON_SECRET`: the secret from point 3.
5. Click the **Actions** tab. If GitHub asks, click **"I understand my workflows, go ahead and enable them"**.

> The timers run in UTC; the times in this guide are in IST. Outreach runs weekdays at 10:00, stage emails hourly from 09:00 to 18:00, sending every 30 minutes, and the digest at 19:00.
> **Free minutes:** private repos get 2,000 GitHub Actions minutes a month. These timers use about **1,800**. If GitHub warns you that you are close, edit `.github/workflows/cron-send-approved.yml` and change `*/30 * * * *` to `0 * * * *` (hourly). The hourly stage-emails job also sends approved emails during working hours.

## Step 3: Vercel (the website)

1. Sign up at **vercel.com** with your GitHub account (Hobby plan).
   > Vercel's Hobby plan is meant for personal, non-commercial projects. If your company uses this app for business, check Vercel's terms; the Pro plan may be needed.
2. **Add New -> Project**, pick your repository, and click **Import**. Vercel detects Next.js by itself.
3. Before clicking Deploy, open **Environment Variables** and add these (name = value):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://hr.company.com` |
   | `APP_TIMEZONE` | `Asia/Kolkata` |
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 |
   | `DATABASE_URL` | from step 1 (with your password in it) |
   | `ALLOWED_EMAILS` | your login email from step 1 |
   | `CRON_SECRET` | the same value as the GitHub secret |
   | `INBOUND_WEBHOOK_SECRET` | the second secret from step 2 |
   | `MOCK_EMAIL` | `true` for now (switch to `false` in step 6) |
   | `MOCK_AI` | `true` for now (switch to `false` in step 5) |
   | `MOCK_DB` | `false` |

   You will add `BREVO_API_KEY`, `REPLY_DOMAIN` and `OPENROUTER_*` in the next steps.
4. Click **Deploy**. When it finishes, open the `...vercel.app` address and sign in with your Supabase user. The app has now created its tables.
5. **Connect your address `hr.company.com`:**
   - In Vercel: *Project -> Settings -> Domains -> Add* `hr.company.com`.
   - In your domain's DNS (where you manage `company.com`, e.g. GoDaddy, Cloudflare or Zoho), add the record Vercel shows. It is usually:
     **Type** `CNAME`, **Name** `hr`, **Value** `cname.vercel-dns.com`.
   - Wait until Vercel shows "Valid Configuration" (minutes to a few hours).
6. In Supabase: *Authentication -> URL Configuration -> Site URL* = `https://hr.company.com`.
7. **Every time you change an environment variable in Vercel, redeploy**: *Deployments -> latest -> ... -> Redeploy*.

## Step 4: Brevo (sending emails and catching replies)

Zoho Mail's free plan cannot send through apps or read replies, so Brevo does both from your own address.

### 4a. Sign up and verify your domain

1. Sign up at **brevo.com** (free plan).
2. Go to *Senders, Domains & Dedicated IPs -> Domains -> Add a domain* and enter `company.com`. Choose to authenticate it yourself; Brevo shows the DNS records.
3. In your DNS, add exactly what Brevo shows:
   - **Brevo code**: a `TXT` record on `company.com` (`brevo-code:...`).
   - **DKIM**: the record(s) Brevo shows (usually `brevo1._domainkey` / `brevo2._domainkey`).
   - **DMARC**: if you don't have one, add a `TXT` record named `_dmarc` with value `v=DMARC1; p=none; rua=mailto:hr@company.com`.
   - **SPF: you may only have ONE SPF record.** You already have one for Zoho, like `v=spf1 include:zoho.in ~all` (or `zoho.com`). **Edit that record** to add Brevo, rather than creating a second one:
     `v=spf1 include:zoho.in include:spf.brevo.com ~all`
4. Click **Authenticate** in Brevo (DNS can take up to a few hours).
5. *Senders -> Add a sender*: name `HR Team` (or yours), email `hr@company.com`.

### 4b. API key

1. *SMTP & API -> API Keys -> Generate a new API key*. Copy it into Vercel as `BREVO_API_KEY`.
2. *Security -> Authorised IPs*: **deactivate the IP restriction**. Vercel's addresses change all the time, and with blocking on, Brevo refuses the app's emails.

### 4c. Replies (inbound parsing)

1. In your DNS, add two **MX** records for the sub-domain `reply` (so `reply.company.com`):

   | Type | Name | Value | Priority |
   |---|---|---|---|
   | MX | `reply` | `inbound1.sendinblue.com` | 10 |
   | MX | `reply` | `inbound2.sendinblue.com` | 20 |

   This does **not** touch your Zoho inbox; Zoho keeps `company.com`.
2. In Vercel, add `REPLY_DOMAIN` = `reply.company.com` and redeploy.
3. In the app: **Settings -> Sender -> Reply domain** = `reply.company.com`, then **Save**.
4. In the app: **Settings -> Brevo inbound webhook -> Connect replies to Brevo**. (First switch `MOCK_EMAIL` to `false` in Vercel and redeploy; see step 6.) This registers `https://hr.company.com/api/webhooks/brevo-inbound/<your secret>` with Brevo for you.

> **Check that inbound parsing works on your Brevo plan.** Brevo's free plan has supported it, but plans change. If "Connect replies to Brevo" shows an error about your plan, or test replies never arrive (step 6), see **"Fallback: replies through Gmail"** in Troubleshooting.

## Step 5: OpenRouter (the AI)

1. Sign up at **openrouter.ai**. Go to *Keys -> Create Key* and copy it.
2. In Vercel add:
   - `OPENROUTER_API_KEY` = your key
   - `OPENROUTER_MODEL` = `openai/gpt-oss-120b:free`
   - `OPENROUTER_FALLBACK_MODEL` = `openrouter/free` (OpenRouter then picks any free model if the main one is busy)
   - `OPENROUTER_DAILY_LIMIT` = `45`
   - `MOCK_AI` = `false`
3. Redeploy, then in the app: **Settings -> Test AI connection**. You should see "AI works".
   - Free models change often. If the test says the model is not found, open **openrouter.ai/models**, filter by price **Free**, copy another model id ending in `:free`, put it in `OPENROUTER_MODEL`, and redeploy.

**The free tier allows about 50 AI requests a day.** One email uses 2 requests (write and check), or up to 4 if it needs a rewrite, so expect roughly 12-20 drafts a day. The Home page shows today's usage, and drafting pauses when the limit is reached.

**Switching to a paid model later:** add credit on OpenRouter (*Credits*). Then set `OPENROUTER_MODEL` to a paid model (an id without `:free`; pick one on openrouter.ai/models), raise `OPENROUTER_DAILY_LIMIT` (e.g. `500`), and redeploy. Even just adding some credit raises OpenRouter's daily limit for free models.

## Step 6: First test, with your own email address

Keep **automatic sending OFF** (Settings) for this whole test.

1. In Vercel set `MOCK_EMAIL` = `false` and redeploy.
2. **Settings**: fill in your company name, logo link (optional), brand colour, sender name, sender email `hr@company.com`, reply domain, signature and "Daily digest goes to". Click **Save settings**.
3. **Settings -> Send test email to myself.** Check it arrives in your inbox (and not in spam) and looks right.
4. **Settings -> Connect replies to Brevo** (if you haven't yet).
5. **Jobs -> New job**: add a test job with a short description and your Flowmingo link, then click **Test link**.
6. **Candidates -> Add candidate**: use **your personal email** (e.g. a Gmail) and the test job.
7. Open that candidate and click **Draft** (First outreach). Go to **Outbox**, read the email, then **Approve -> Send now**.
8. From your personal inbox, **reply** "Yes, I'm interested". Within a minute or two:
   - The candidate's stage becomes **Interested**.
   - An **Interview invite** draft with your Flowmingo link appears in the Outbox.
   - If nothing happens, see "Replies don't arrive" below.
9. Approve and send the invite, then check the button opens your Flowmingo link.
10. In GitHub -> **Actions**, open "Daily digest" -> **Run workflow**. You should receive the summary email.

When everything works, delete the test candidate and job. You can then turn on **Send automatically** in Settings if you want: only emails that pass every check are sent without you.

## Step 7: Daily use

- **Add jobs**: description, facts, and the **Flowmingo link** (each job has its own). Use **Test link** to check it.
- **Add candidates**: one by one, or **Import CSV** from a spreadsheet (first row = column names).
- **The app works on a timer**: first emails go out at 10:00 on weekdays; invites, follow-ups and feedback are drafted every hour from 09:00 to 18:00.
- **Approve the Outbox** (the number next to *Outbox* in the menu):
  - **Needs approval**: read and approve (or select several and approve together).
  - **Needs review**: the checker found a problem. Open it, read the issues, edit, then **Re-check** or **Approve anyway**.
  - **Link missing**: add a Flowmingo link to the job or candidate, then click **Re-check**.
- **After an interview**: open the candidate, write your notes in **HR notes**, optionally set a **Decision**, and click **Mark interviewed**. A feedback email is drafted within the hour. It states a decision only if you set one.
- **Read the evening digest** at 19:00: what's waiting, replies, problems, and AI usage.
- **Pause** a candidate (or a job) to stop all automatic emails for them.

## Step 8: Troubleshooting

**Emails land in spam**
- In Brevo, check the domain shows **Authenticated** (Brevo code, DKIM) and DMARC exists.
- Make sure there is only **one** SPF record, and it includes both Zoho and Brevo.
- Send fewer emails per day at first: lower "Daily send limit" to 20-30 for the first two weeks.
- Avoid words like "urgent", lots of capitals or exclamation marks in your custom prompts.

**Replies don't arrive (webhook not firing)**
- Check the MX records for `reply.company.com` (search "MX lookup" online) point to `inbound1.sendinblue.com` / `inbound2.sendinblue.com`.
- In the app, click **Settings -> Connect replies to Brevo** again. It tells you if the webhook already exists.
- **Activity Log -> Problems only** shows invalid or failed webhook calls.
- Check that `NEXT_PUBLIC_APP_URL` is your real `https://` address, and that you redeployed after changing it.

**AI limit reached**
- The Home page shows "AI requests today". At the limit, drafting waits until tomorrow, and drafts made in the meantime go to *Needs review* with an explanation.
- Lower "Outreach batch size" in Settings, or add OpenRouter credit (step 5).

**"Test AI connection" fails**
- "401": the key is wrong. Create a new key and update Vercel.
- "model not found": pick another free model (step 5).
- "429" / busy: free models are sometimes overloaded; the fallback model and retries usually handle it. Try again later.

**Brevo errors ("unauthorised", "IP not allowed", "sender not valid")**
- Check `BREVO_API_KEY` in Vercel. Turn off the **Authorised IPs** restriction (step 4b). Make sure the sender address is added and the domain authenticated.

**Supabase paused**
- Free Supabase projects pause after about a week without activity. The daily digest keeps the project active. If it was paused, open the Supabase dashboard and click **Restore**, then check GitHub -> Actions that the workflows are running.

**Scheduled jobs don't run**
- GitHub -> **Actions**: check the workflows are enabled and look at the latest run. "Missing repository secrets" means `APP_URL` / `CRON_SECRET` are missing. "HTTP 401" means `CRON_SECRET` in GitHub and Vercel differ.
- GitHub may delay scheduled runs by a few minutes at busy times. That's normal.

**The app shows "not fully set up"**
- **Settings -> System status** lists what's missing in plain English.

**Fallback: replies through Gmail (if Brevo inbound is not available on your plan)**
1. Create a free Gmail address just for replies.
2. In the app's **Settings**, leave "Reply domain" empty. In Vercel, remove `REPLY_DOMAIN` and set `REPLY_TO_ADDRESS` to that Gmail address, then redeploy. Candidates' replies now go to the Gmail inbox.
3. A developer adds a small scheduled job (a GitHub Action every 15 minutes) that reads new Gmail messages with the Gmail API (free) and posts them to the same webhook, `/api/webhooks/brevo-inbound/<secret>`, in the same JSON format. The app then works exactly the same. Without the reply token, replies are matched by the sender's email address.

---

## Moving to a new account

The code has **no usernames, repository names, domains or keys inside it**. Everything comes from settings, so it can move to another GitHub account (or company) safely.

1. **Move the code**, one of two ways:
   - **Transfer** (keeps history and issues): on GitHub, *repository -> Settings -> General -> Danger Zone -> Transfer ownership*, and enter the new account or organisation. The new owner accepts.
   - **Push a copy**: create a new empty **private** repository on the new account and push the code to it (GitHub Desktop: *Repository -> Repository settings -> Remote*, change the URL to the new repository, then *Push*).
2. **Add the GitHub secrets again** on the new repository (*Settings -> Secrets and variables -> Actions*): `APP_URL` and `CRON_SECRET`. Secrets never move with a transfer. Then open **Actions** and enable the workflows.
3. **Vercel on the new account**: import the new repository (step 3), add all environment variables again, deploy, and move the domain `hr.company.com` to the new project (*Settings -> Domains*). Remove the domain from the old project first.
4. **Supabase on the new account**, one of two ways:
   - **Transfer the project**: *Project Settings -> General -> Transfer project* to the new organisation. Nothing else changes.
   - **Fresh project**: create a new one (step 1), put its URL, anon key and `DATABASE_URL` into Vercel, and create the login user. The app creates the tables on first start. To keep old data, export it from the old project first (*Database -> Backups*, or ask a developer to `pg_dump` and restore).
5. **Brevo and OpenRouter**: the existing accounts keep working. If you also move these, create new API keys on the new accounts, update `BREVO_API_KEY` / `OPENROUTER_API_KEY` in Vercel, redeploy, and click **Settings -> Connect replies to Brevo** again. If the app address changed, that last step is needed too.
6. **Check**: sign in, go to **Settings -> System status**, run **Send test email to myself** and **Test AI connection**, then run one GitHub workflow by hand.

Before handing the code over, a developer can run `npm run lint`. It includes a check that fails if any account name, repository name, real domain or secret has slipped into the code.
