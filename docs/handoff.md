# What Angus needs from a human

Everything in this repo that can be built, tested and applied without a
credential has been. What is left is a short list of things that are
*only* obtainable by someone with an account: five secrets, one design
asset, one decision, one migration, three settings nobody but the repo
owner can change, and two weeks of real use.

Each item below says **why it matters**, **how it's verified today**, and
**the exact steps**. They are independent — do them in any order — except
§0, which the rest depends on.

Last verified: 2026-09-16.

---

## 0 — Decision: put the work on `main`

**Status:** `claude/elite-product-review-hrek6t` is 17 commits ahead of
`main`, 0 behind. CI green on every one.

**Why it matters more than it sounds.** Migrations 016–020 are *already
applied to the live database*, but `main` — which is what Vercel serves —
predates all of them. The schema and the deployed client are out of step
right now. Nothing is broken by it (verified: sign-in healthy, admin
still reaches both workspaces), but two things are odd until it merges:

- Signup is closed at the database (migration 017) while the deployed
  screen still shows "Crear cuenta" with no invite field, so a stranger
  gets a refusal with no explanation. The branch fixes the copy.
- `is_admin()` reads `platform_admins` (migration 018) while the deployed
  client still compares an email string. Harmless — the SQL side is what
  gates data — but only one of them is the real rule.

**Steps**

    git checkout main
    git merge --ff-only claude/elite-product-review-hrek6t
    git push origin main

Vercel auto-deploys `main`. Then confirm at
`https://angus-xi.vercel.app`: sign in, and check Ajustes → Tus datos
shows both **Descargar todo** and **Diagnóstico**.

**Do not** merge if you want any stage re-litigated first — this is 17
commits of behaviour change across money, reads, writes and auth. Every
commit message states what it changed and what it did *not*.

---

## 1 — R2 credentials (uploads have never worked)

**Status: broken in production, today.** Verified by asking it:

    $ curl -s -X POST https://angus-xi.vercel.app/api/upload-url -d '{}'
    {"error":"Storage not configured","code":"storage_not_configured"}

All three routes answer 503 before they even look at auth, because
`isStorageConfigured()` (`api/_r2.ts:19`) requires `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and none are set on
Production or Preview. So **every file feature has always been dead
live**: piece photos, course material, tarea submissions, note
attachments, note covers. `CLAUDE.md` described this layer as working; it
describes the code, which is fine — it is the environment that is empty.

This also means the signed `ContentLength` change in migration-era commit
`4b950bd` **cannot be trusted yet**. `ContentType` used to be the only
signed header; it now signs the length too, and a mismatch between what
the signature promises and what the browser sends breaks every upload.
`npm run r2:smoke` proves that leg end to end. It has never run.

### Steps

**1.1 — Bucket.** Cloudflare dashboard → **R2** → *Create bucket* →
name it exactly `angus-documents`. If it already exists, skip.

**1.2 — Account ID.** Same R2 page, right-hand sidebar, **Account ID**.
A 32-character hex string. This is `R2_ACCOUNT_ID`.

**1.3 — API token.** R2 → **Manage R2 API Tokens** → *Create API token*:

- Permissions: **Object Read & Write**
- Specify bucket: `angus-documents` *and* `angus-backups` (§2 needs the
  same pair; one token for both is fine and simpler to rotate)
- TTL: no expiry

Copy the **Access Key ID** and **Secret Access Key** it shows once.
These are `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.

**1.4 — CORS on `angus-documents`.** The browser PUTs straight to R2,
so without this the upload fails in the browser even with valid
credentials. Bucket → **Settings** → **CORS policy** → *Edit*:

```json
[
  {
    "AllowedOrigins": [
      "https://angus-xi.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Preview deployments have per-deployment hostnames, so uploads work on
production and localhost but not on a preview URL unless you add it.
That is an accepted limit, not an oversight.

**1.5 — Vercel env.** Project `angus` → **Settings** → **Environment
Variables**. Add four, each ticked for **Production** *and* **Preview**:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | from 1.2 |
| `R2_ACCESS_KEY_ID` | from 1.3 |
| `R2_SECRET_ACCESS_KEY` | from 1.3 |
| `R2_BUCKET_NAME` | `angus-documents` |

**None of these may be prefixed `VITE_`.** Vite inlines anything with
that prefix into the browser bundle, which would hand every visitor
read/write/delete on the whole bucket. `npm run build` fails on it
(`scripts/check-bundle-secrets.mjs`), but don't rely on the net.

**1.6 — Redeploy.** Env changes only take effect on the next deploy.
Vercel → Deployments → latest production → ⋯ → **Redeploy**.

**1.7 — Verify.** This is the part that matters:

    curl -s -X POST https://angus-xi.vercel.app/api/upload-url -d '{}'
    # expect 401 {"error":"Unauthorized"} — NOT 503. A 401 means it got
    # past the env check and is asking for a token, which is correct.

Then the full leg — upload-url → PUT → file-url → GET → delete, against
the real deployment. It signs in as a disposable account, so it needs
the one from §4 (or any throwaway) in `.env.local` alongside the
Supabase vars:

    API_BASE=https://angus-xi.vercel.app npm run r2:smoke

**Until that passes, treat uploads as unverified**, because of the
signed-length change above. I can run this myself the moment §4's
account exists and the R2 keys are in `.env.local` — you don't have to.

---

## 2 — The nightly backup (there is no backup right now)

**Status: the Prime Directive is uninsured.** Free plan, so no PITR and
no managed backups. `.github/workflows/backup.yml` and
`scripts/backup-db.mjs` are written, linted and committed — and have
never run, because they have no secrets.

The workflow is deliberately *not* gated behind an enable flag the way
`e2e.yml` is: once it's on `main` it will fail red every night until
these exist, because a backup that skips itself quietly is exactly how
data dies. The first red run is the reminder. Never silence the job.

### Steps

**2.1 — Backup bucket.** Cloudflare → R2 → *Create bucket* →
`angus-backups`. Separate from `angus-documents` on purpose: different
retention, and a compromise of one is not both.

**2.2 — Database connection string.** Supabase dashboard → project
`angus` → **Connect** (top bar) → **Session pooler** → copy the URI.

> Take the **Session pooler** (port 5432), not "Direct connection".
> Direct connections are IPv6-only on this plan and GitHub Actions
> runners have no IPv6 route, so a direct URI fails with a connection
> timeout that looks like a credential problem and isn't. Do not take
> the Transaction pooler (port 6543) either — `pg_dump` needs session
> state.

Replace `[YOUR-PASSWORD]` in the URI with the database password
(Settings → Database → *Reset database password* if it isn't to hand —
resetting it breaks nothing else, nothing stores it).

**2.3 — Repository secrets.** GitHub → `cardiganapps-ui/Angus` →
**Settings** → **Secrets and variables** → **Actions** → *New
repository secret*, six times:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the pooler URI from 2.2, password filled in |
| `R2_ACCOUNT_ID` | same as §1.2 |
| `R2_ACCESS_KEY_ID` | same as §1.3 |
| `R2_SECRET_ACCESS_KEY` | same as §1.3 |
| `R2_BACKUP_BUCKET` | `angus-backups` |
| `R2_BUCKET_NAME` | `angus-documents` — the job mirrors its objects into the backup bucket under `files/` |

**2.4 — Run it by hand once.** Actions → **Nightly backup** → *Run
workflow*. Don't wait for 09:10 UTC to find out it doesn't work. The log
prints the object key it wrote, then `copied … / skipped … / of …` for
the documents mirror (all zeros until §1 is done and she has uploaded
something).

**2.5 — Then restore it.** A backup that has never been restored is a
hypothesis, and the acceptance bar says *performed*, not *configured*.

    npm run restore:drill

That is the whole step. `scripts/restore-drill.mjs` pulls the newest
dump out of R2, starts a throwaway Postgres 17 in Docker, restores with
`-v ON_ERROR_STOP=1`, and diffs exact per-table row counts against
production — including `auth.users`, because losing it means nobody can
sign in to reach whatever else restored. It prints PASS or FAIL and
exits accordingly. It only ever *reads* production (one count query).

Needs `.env.local` to hold the same values you just put in the repo
secrets, plus Docker running. `TARGET_DB_URL=…` restores somewhere else
instead of spawning a container; `KEEP_CONTAINER=1` leaves it up to poke
at.

Why it cannot simply run against a spare Supabase project: the dump
includes `--schema=auth`, and loading that into a live Supabase aborts —
dropping its `auth` schema takes GoTrue's grants with it, which
`--no-privileges` cannot put back. Vanilla Postgres has no such
attachment, which is why the drill uses it.

`-v ON_ERROR_STOP=1` is the load-bearing flag: plain `psql -f` prints
every error, keeps going, and still exits 0 — a restore that "worked".
The sharp edges are in `docs/playbook.md` §8b.

---

## 3 — Supabase Management PAT (two settings I can't reach)

**Status:** the security advisor is clean except for one WARN I cannot
clear from here, and one thing that has been on the to-do list since the
project started.

- **Leaked-password protection is off.** Passwords are checked against
  nothing, with an 8-character minimum, on an account that can read
  every workspace.
- **No custom SMTP.** The built-in mailer is capped at ~2 emails/hour and
  cannot be raised — the API rejects the field outright without SMTP
  configured. Password reset and magic link are therefore unreliable
  today. `mailer_autoconfirm: true` keeps *signup* off that quota, which
  is why signup works at all.

### Steps

**3.1** — <https://supabase.com/dashboard/account/tokens> → *Generate
new token* → name it `angus-config`. Copy it (starts `sbp_`).

**3.2** — Put it in `.env.local` as `SUPABASE_PAT=sbp_…`. It is
gitignored. **Never** as a `VITE_` var.

**3.3** — For SMTP, also create a Resend API key
(<https://resend.com/api-keys>) and verify a sending domain, the same way
Cardigan does. Without a verified domain Resend will only send to your
own address.

Then tell me, and I'll PATCH both settings. One warning for whoever does
it instead: send the **entire** smtp block in one request
(`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`,
`smtp_sender_name`) — a partial PATCH resets the siblings you left out.
And verify by sending a real reset email, not by reading the config
back; config reads are eventually consistent.

---

## 4 — Turn the e2e journey on (optional, cheap)

`scripts/e2e-smoke.mjs` now drives a real browser through a full
create → edit → delete on a piece and reloads to prove the writes
reached Postgres rather than only local state.
`.github/workflows/e2e.yml` runs it nightly — but it is gated on a
repository *variable* and skips silently without it. A skipped check is
not a passing one.

It needs a **disposable account, never Andrea's**: the journey writes and
deletes rows.

### Steps

**4.1** — Say the word and I'll create the account: it needs a row in
`allowed_signups` and then a signup, both of which I can do. Nothing for
you here except approving it.

**4.2** — GitHub → Settings → Secrets and variables → Actions:

- **Variables** tab → *New variable*: `E2E_ENABLED` = `true`
- **Secrets** tab: `E2E_EMAIL` and `E2E_PASS` for that account

**4.3** — Actions → **E2E** → *Run workflow*. Screenshots upload as an
artifact either way, which is most of the value when it fails.

---

## 5 — Two small assets, and one optional string

**5.1 — A maskable app icon.** `public/icon-512.png` is edge-to-edge, so
declaring it `maskable` got its edges cropped by Android's launcher mask.
The maskable entry is removed rather than left wrong. To restore it,
export a 512×512 PNG with the mark inside the centre **80%** (≈51px
padding all round) as `public/icon-512-maskable.png` and I'll wire it
into the manifest.

**5.2 — `VITE_INVITE_CODE` (optional).** A shared string that gates the
"Crear cuenta" form. Unset means no code is asked for, which is the
current state and is *not* a hole — the boundary is the database trigger
(migration 017), verified live:

    POST /auth/v1/signup → 500, no row created
    POST /auth/v1/otp    → 500, no row created

both with the public anon key. The code only saves a stranger from
filling in a form that was always going to be refused. Add it on Vercel
(Production + Preview) if you want that; skip it otherwise.

---

## 6 — The pilot (only Andrea can do this)

This is the one item no amount of engineering substitutes for, and it is
the hard gate in the plan.

**The production database holds no real data.** `projects`, `contacts`,
`events`, `notes`, `courses`, `attendance` and `payments` are empty;
`sales` has one row. Every "verified by hand" claim in the commit log was
verified against fixtures that were then deleted. So the verification
loop has only ever validated the demo, never the use — and several of the
fixes in this branch (bounded reads, the refund line, the period-key
families) are about failures that only appear at real volume over real
time.

**What to ask her for:** two weeks of actual work in it. Her pieces, her
contacts, her commissions, the expenses she tracks elsewhere. Target ≥10
pieces, ≥1 sale with a payment plan, ≥1 class with attendance taken, ≥1
course.

**What comes back:** Ajustes → **Diagnóstico** → *Enviar a Diego*. It
puts a report on her clipboard: what errored with the real messages,
per-table row counts against their caps, which screens she opened and
which she never did. It never leaves her device on its own — no service,
no telemetry, nothing transmitted until she taps that button.

**And the question only she can answer:** do the numbers match her own
records? Por cobrar, the monthly net, what a client owes. If they don't,
that is the most valuable bug report this project can receive.

Stages 3–7 were implemented against my ranking of what matters. The
pilot is what re-ranks them against hers.

---

## 7 — Apply migrations 021 and 022 (written, committed, NOT applied)

**Two files, both unapplied. Apply 021 first, then 022** — they are
independent, but keeping the numbers in order keeps the ledger honest.

### 022 — `materializer_skips`

**What it fixes.** Deleting a rule-generated sale or expense did not
work. The materializers compute what is MISSING and insert it, so a row
she deleted became missing and came straight back; from her side the app
simply refused to let her delete September's rent. The new table records
"this rule, this period, leave it alone", and `utils/materialize.ts` is
its only reader.

**Why a table and not a `voided` column on sales/expenses.** Every money
derivation in `src/utils/` would have had to learn to filter that column,
and the one that got missed would report a wrong total in silence. Under
the Prime Directive a wrong number is worse than the bug being fixed.
Nothing derives from `materializer_skips`; nothing sums it.

**Apply it** in the Supabase SQL editor, then verify the table is really
there and really protected — not that the statement returned:

```sql
select relrowsecurity from pg_class where relname = 'materializer_skips';
-- expect: t
select count(*) from pg_policies where tablename = 'materializer_skips';
-- expect: 1
```

**Until it is applied** the client will get a PostgREST error on every
read of that table, which surfaces as a persistent "no se pudo cargar"
warning and — because the skip store is inside the `canDiff` gate — stops
the materializers running at all. That is the safe direction (nothing is
generated wrongly), but it does mean the app is degraded until you run
it. Apply it in the same sitting as the deploy.

---

## 7a — Apply migration 021 (written, committed, NOT applied)

**Status:** every migration up to 020 is live. `021_session_tuition_index.sql`
is the first one in this repo that exists only as a file. It was written
deliberately without applying it — read the header before you run it; it
is forty lines of why.

**What it fixes.** `sales_session_contact_uidx` picks its rows with
`recurring_rule_id is null`, which is not a property of a row but of its
history: `on delete set null` means every sale a rule ever generated
falls into that predicate the moment the rule is deleted. Two monthly
rules can bill the same contact for the same period — a student enrolled
in two class groups gets one rule per group — and once the first rule is
deleted, deleting the second raises a duplicate-key error *from the
cascade*. The client reads 23505 as "already materialized", so the delete
that failed is the delete she is told worked. The migration matches the
session-id *shape* of `period_key` instead.

Today's database is nearly empty, so nothing is currently broken by it;
it is one enrollment away from being.

### Steps

**7.1** — Supabase dashboard → project `angus` → **SQL Editor** → paste
`supabase/migrations/021_session_tuition_index.sql` → *Run*. It drops and
recreates one index inside a transaction; the new predicate is a strict
subset of the old one, so there is no data to clean up first and nothing
to do if it is run twice.

**7.2 — Verify the definition changed**, not that the statement returned:

```sql
select pg_get_indexdef('public.sales_session_contact_uidx'::regclass);
```

The result must contain `period_key ~ '^[0-9a-fA-F]{8}-…'`. If it still
reads `WHERE ((recurring_rule_id IS NULL) AND (period_key IS NOT NULL))`,
the old index is still there and nothing happened.

---

## 8 — Protect `main` (nothing gates production today)

**Status:** `git log --merges` returns **zero** across all 53 commits.
Every change this project has ever made reached `main` as a direct push,
which means the `pull_request` trigger in `.github/workflows/ci.yml` has
never once fired. CI has been running *after* the fact, on pushes.

**Half of this is now fixed in the repo and needs nothing from you.**
`vercel.json` sets `buildCommand` to `npm run lint && npm test && npm run
build`, so the checks run *inside* the deploy: a commit that breaks lint
or the suite fails the Vercel build, the build is never promoted, and the
previous deployment stays live serving her data. Builds get roughly a
minute longer. That is the price of the last gate before users.

It does **not** stop a broken commit landing on `main` — only you can do
that, and it is a GitHub setting, not a file.

> Why not a Vercel `ignoreCommand`: the Ignored Build Step runs before
> the install step, so it cannot run the suite, and reading GitHub's
> check status from there needs a token this project does not hold plus a
> wait for a run that has usually not started yet. Exit code 0 means
> *skip the build*. A gate that answers "skip" whenever it cannot tell
> would quietly stop deploying anything at all — the failure mode is
> silent and total, which is exactly the wrong shape for this app.

### Steps

**8.1** — GitHub → `cardiganapps-ui/Angus` → **Settings** → **Rules** →
**Rulesets** → *New ruleset* → *New branch ruleset*.

- Name: `main`
- Enforcement status: **Active**
- Target branches → *Add target* → **Include default branch**
- Rules to tick:
  - **Restrict deletions**
  - **Block force pushes**
  - **Require a pull request before merging** → *Required approvals:* **0**
    (this is a two-person project; the point is the check, not a reviewer)
  - **Require status checks to pass** → *Add checks* → **`check`** — the
    job id in `ci.yml`, which is what shows up on a PR — and tick
    **Require branches to be up to date before merging**
- **Bypass list: leave it empty.** Adding yourself as a bypass actor
  turns this straight back into what it replaced.

**8.2 — What changes for the agents.** Nothing about how the work is
done: they already branch as `claude/**`, and `ci.yml` already runs on
both the branch push and the PR. Only the last step changes — open a pull
request instead of `git push origin main`, and merge it once `check` is
green. §0 above becomes "open a PR from that branch and merge it" rather
than `git merge --ff-only`.

**8.3 — Verify by trying to break it.** From a scratch branch, push one
commit that deliberately fails a test and open a PR. The merge button
must be blocked. Then `git push origin main` directly and confirm GitHub
refuses it. A protection rule nobody has tried to violate is a claim, not
a control.

---

## 9 — Turn the CSP on (it is shipping in report-only mode)

**Status:** the production origin shipped with **no security headers at
all** — `vercel.json` was three lines and set only `regions`. It now
sends HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Cross-Origin-Opener-Policy`, a `Permissions-Policy`
denying the device APIs this app never touches, and an enforced
`Content-Security-Policy: frame-ancestors 'none'`. Those are
uncontroversial and are on.

The **full** content policy ships as
`Content-Security-Policy-Report-Only`, deliberately. A CSP that breaks
image loading or uploads is far worse here than no CSP — her photos are
the part of this app that cannot be re-created — and the policy was
written from reading `src/lib/files.ts`, `src/lib/api.ts` and
`src/lib/supabase.ts` rather than from a deployment. Report-only means
the browser reports what it *would* have blocked and blocks nothing, so
one real deployment tells us whether it is right.

**One violation is already known and is a genuine decision, not a
mistake to fix:** `heic2any`'s bundled libheif builds its binding
functions with `new Function`, which `script-src 'self'` forbids. It is
caught — `maybeConvertHeic` falls back to the original file — so an
iPhone HEIC would still upload, just untranscoded, and then fail to
render in most browsers. The alternatives are to accept that, or to add
`'unsafe-eval'` and give back most of what the policy was for. Decide
with the real console in front of you.

### Steps

**9.1** — Deploy, open <https://angus-xi.vercel.app> in Chrome with the
console open, and use the parts that talk to another origin: sign in,
open a piece and add a photo, open the photo, export a note to PDF, load
a note with an inline attachment. Every violation logs as
`[Report Only] Refused to …` and names the directive and the URL it
would have blocked.

**9.2** — Once §4's e2e account exists, `npm run e2e` does this for you:
the harness already collects console errors, so a CSP violation fails the
run instead of waiting for someone to notice.

**9.3** — Widen only what the console actually named. The origins the app
needs are `*.supabase.co` (REST + auth + realtime) and
`*.r2.cloudflarestorage.com` (the browser PUTs bytes straight there and
loads signed GETs back as images); everything else is same-origin,
including the self-hosted fonts.

**9.4** — When the console is clean, or the remainder is accepted, move
the value: copy the `Content-Security-Policy-Report-Only` string into the
`Content-Security-Policy` entry — replacing `frame-ancestors 'none'`,
which it already contains — and delete the report-only entry. Redeploy
and walk the same list again, because this time it bites.

---

## 10 — The repository is public

Not a task, a fact worth knowing before the next item goes in: GitHub
reports `cardiganapps-ui/Angus` as **public**. `CLAUDE.md` and this file
are tracked, so the Supabase project ref, the Vercel project and team
ids, the admin address and **Andrea's email address** are world-readable
today. No credential is exposed — `.env.local` is gitignored and the
build fails on a secret in the bundle (§ `scripts/check-bundle-secrets.mjs`) —
and the anon key is public by design, so nothing here is an incident.

If that is deliberate, nothing to do. If it is not: Settings → General →
Danger Zone → *Change visibility* → Private, and note that branch
protection rulesets (§8) stay available on a private repo only on a paid
plan — so do §8 first and check it still applies afterwards.

---

## What is still mine to do

Not blocked on anything above; listed so the boundary is honest.

- **66 fire-and-forget write sites across 15 files.** `void save()`
  followed by an unconditional success toast. The *data* is safe — the
  store reverts a rejected write correctly — but the feedback can lie.
  The seven worst (including "Pago registrado" over a rejected insert)
  are fixed. The rest cluster in multi-row orchestration — EventSheet
  (16), CourseSheet (14), ClassGroupSheet (8) — where each needs a
  decision about what a partial failure should roll back. That is design
  work per case, not a sweep, and a careless pass would break save flows
  across every calendar and class screen.
- **Text scaling to 200%.** The in-app control now reaches 1.45×, up from
  1.10×. 2× needs the layout to survive it and it currently would not:
  `html` and `.shell` both clip overflow rather than scrolling it, so
  text that outgrows its container at 2× would be unreachable — a worse
  failure than not offering the step.
- **The `SECURITY DEFINER` advisor WARN on five functions.** Left
  deliberately; `supabase/migrations/020_restore_function_grants.sql`
  explains why at length, including the outage that taught it. The lint
  is not actionable for an RLS policy helper: the role that needs
  `EXECUTE` is the role the lint wants it revoked from. The real fix is
  moving the helpers to an unexposed schema and qualifying all 22
  policies — a schema-wide change to a live database holding
  irreplaceable data, for a thin exposure. Worth doing on purpose one
  day; not worth doing in passing.
