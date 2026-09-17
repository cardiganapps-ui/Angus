# What Angus needs from a human

Everything in this repo that can be built, tested and applied without a
credential has been. What is left is a short list of things that are
*only* obtainable by someone with an account: one Resend key, one GitHub
token, one design asset, and two weeks of real use.

Each item below says **why it matters**, **how it's verified today**, and
**the exact steps**. They are independent — do them in any order.

**As of 2026-09-17 the app itself is healthy.** `main` is deployed, all
23 migrations are live, uploads answer their auth gate, and the suite is
604 green. See §2 for the backup — the one item that was urgent.

Last verified: 2026-09-17.

---

## 0 — ~~Decision: put the work on `main`~~ ✅ DONE

The work is on `main` and deployed. Verified 2026-09-17: `origin/main`
is at `ccd2985`, the latest Vercel production deployment is READY on
that same sha, and CI is green on it. The schema and the deployed client
are no longer out of step.

---

## 1 — ~~R2 credentials~~ ✅ DONE (one optional verification left)

**Status: cleared.** Re-verified 2026-09-17 — `/api/upload-url` and
`/api/file-url` both answer **401**, the JWT gate, where they answered
`503 storage_not_configured` before the env landed. Uploads are live.

The only thing left here is §1.7's end-to-end smoke, which needs the
throwaway account from §4; it is a nice-to-have, not a blocker.

The record of how it was cleared:

- ✅ **1.1** both buckets exist (`angus-documents`, `angus-backups`)
- ✅ **1.2 / 1.3** account id + keypair verified against the live API
- ✅ **1.4** CORS set on `angus-documents` — it had **no** CORS rule at
  all, so browser uploads would have failed even once the env was set
- ✅ the whole R2 leg proven end to end: presigned PUT → signed GET →
  bytes match → delete → 404
- ✅ **the `ContentLength` binding is now trusted.** The note below said
  it could not be, because it had never run. It has: replaying the same
  presigned URL with a body 500 bytes larger is refused with **403**. The
  capability is genuinely bounded.
- ✅ **1.5 / 1.6** all six server-only vars set on Production + Preview,
  and redeployed
- ⬜ **1.7** the deployed-route smoke (`npm run r2:smoke`) — blocked only
  on §4's throwaway account

The original diagnosis, kept because it is the only record of how long
this was broken:

    $ curl -s -X POST https://angus-xi.vercel.app/api/upload-url -d '{}'
    {"error":"Storage not configured","code":"storage_not_configured"}

All three routes answer 503 before they even look at auth, because
`isStorageConfigured()` (`api/_r2.ts:19`) requires `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and none are set on
Production or Preview. So **every file feature has always been dead
live**: piece photos, course material, tarea submissions, note
attachments, note covers. `CLAUDE.md` described this layer as working; it
describes the code, which is fine — it is the environment that is empty.

~~This also means the signed `ContentLength` change in commit `4b950bd`
cannot be trusted yet.~~ **Resolved 2026-09-16** — exercised directly
against the bucket: an honest-length PUT succeeds, the same URL with a
larger body is refused 403. `npm run r2:smoke` still adds value once 1.5
lands, because it drives the deployed routes and their JWT check rather
than the bucket alone.

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

**1.4 — CORS on `angus-documents`. ✅ DONE** — applied via the S3 API on
2026-09-16; the bucket previously had no CORS configuration at all. The
browser PUTs straight to R2, so without this the upload fails in the
browser even with valid credentials. The rule now in place:

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
| `SUPABASE_URL` | `https://xbpvqvlomrnuxydyqyqj.supabase.co` |
| `SUPABASE_ANON_KEY` | the publishable key |

**✅ DONE 2026-09-16** — all six set on Production + Preview and
redeployed. Note the table used to list only the first four: `api/_r2.ts`
also reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` to verify the caller's
JWT, and `isStorageConfigured()` does not check them — so following the
old table would have flipped the routes from "storage not configured" to
a confusing auth failure instead of working. Verified by asking:
all three routes now answer `401 unauthorized` (the JWT gate) instead of
`503 storage_not_configured`.

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

## 2 — The nightly backup — one paste from done

**Status 2026-09-17: the mechanism is built, deployed and exercised on a
real runner. It needs exactly one thing from the owner: the R2 key
pair, pasted to the agent, which stores it in Supabase Vault.** No
GitHub settings, no dashboards.

What changed. The old design needed six repository secrets, and nothing
that maintains this project could set them: the agent sandbox is barred
from GitHub's secrets API by egress policy (`403` on
`/actions/secrets/public-key`; `/rulesets` answers `200`, so it is the
path, not the token) and cannot open a TCP connection to Postgres at all.
So the runner now **asks** for its credentials instead of carrying them:

1. `backup.yml` runs with `id-token: write` and mints a GitHub OIDC token.
2. `scripts/backup-credentials.mjs` presents it to the `backup-secrets`
   edge function (`supabase/functions/backup-secrets/index.ts`).
3. The function verifies the token against GitHub's JWKS, checks it was
   minted for `cardiganapps-ui/Angus` by `.github/workflows/backup.yml`,
   and returns the session-pooler connection string — the password comes
   from the edge runtime's own injected `SUPABASE_DB_URL`, so nobody ever
   had to look it up — plus the R2 pair and bucket names from **Vault**.
4. `backup-db.mjs` runs unchanged: `pg_dump` → gzip → R2, prune, mirror
   the documents bucket.
5. `restore-drill.mjs` then restores that dump into a throwaway Postgres
   on the runner and diffs row counts against production. **Every night
   is a rehearsal.**
6. The outcome is recorded in `ops.backup_events` (migration 023, applied);
   `public.backup_status()` reports it to the admin account only.

Trust boundary: identical to repository secrets — anyone who can push a
workflow here could read those too. A fork's token names the fork and
is refused. Details in `docs/playbook.md` §8b.

### What is left

**2.3 — The R2 pair, into Vault.** Vault currently holds
`PLACEHOLDER_UNTIL_OWNER_SUPPLIES` for `r2_account_id`,
`r2_access_key_id` and `r2_secret_access_key` (so the leg up to the
upload could be proven). Paste the three values to the agent — the same
ones you gave for the Vercel env on 2026-09-16 — and it runs:

```sql
select vault.update_secret(id, '<value>') from vault.secrets where name = 'r2_account_id';
-- and the other two
```

Then it triggers a run and reads the log. Done means: `✓ backup
complete`, `✓ restore drill passed`, and a `completed` row in
`ops.backup_events`.

**2.4 — Nothing else.** The buckets exist, CORS is set, the database
password is never needed by a human again.

## 3 — ~~Supabase Management PAT~~ — PAT supplied 2026-09-17; one item closed, one needs Resend

The owner supplied the PAT. Used it for:

- **Leaked-password protection: NOT AVAILABLE.** `PATCH
  /config/auth {"password_hibp_enabled": true}` answers **402** — "available
  on Pro Plans and up". The advisor WARN will stay until the org upgrades.
  Nothing to do on the free plan; it is a plan limit, not a to-do.
- Deleted the retired `env-probe` edge function (the MCP tooling cannot
  delete functions; the Management API can).

**Still open — custom SMTP.** Needs a **Resend API key** with a verified
sending domain (<https://resend.com/api-keys>, then *Domains*). Without a
verified domain Resend only delivers to the account's own address. With
the key in hand the agent sends the full smtp block in one PATCH
(`smtp_host smtp.resend.com`, `smtp_port 465`, `smtp_user resend`,
`smtp_pass <key>`, `smtp_admin_email`, `smtp_sender_name`) and verifies
with a real reset email. Until then password reset and magic link stay
on the built-in mailer at ~2/hour; sign-up is unaffected
(`mailer_autoconfirm: true`).

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

## 7 — ~~Apply migrations 021 and 022~~ ✅ DONE

**Both applied.** Verified live on 2026-09-17 by checking the resulting
objects, not by trusting that the statements returned:

```
select relrowsecurity from pg_class where relname='materializer_skips';  -- t
select count(*) from pg_policies where tablename='materializer_skips';   -- 1
select pg_get_indexdef('public.sales_session_contact_uidx'::regclass);
--   ... WHERE ((recurring_rule_id IS NULL) AND (period_key ~ '^[0-9a-fA-F]{8}-…'))
```

Also confirmed that `materializer_skips` is readable as the role that
actually queries it (`set local role authenticated` with Andrea's `sub`
in `request.jwt.claims`) — so the degraded state described below is over,
and the materializers run again.

The record of what each one fixes, kept because it is the only place it
is written down:

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

---

## 7a — ~~Apply migration 021~~ ✅ DONE (see §7)

**What it fixed.** `sales_session_contact_uidx` picked its rows with
`recurring_rule_id is null`, which is not a property of a row but of its
history: `on delete set null` means every sale a rule ever generated
fell into that predicate the moment the rule was deleted. Two monthly
rules can bill the same contact for the same period — a student enrolled
in two class groups gets one rule per group — and once the first rule is
deleted, deleting the second raised a duplicate-key error *from the
cascade*. The client reads 23505 as "already materialized", so the delete
that failed was the delete she was told worked. The index now matches the
session-id *shape* of `period_key` instead.

The database was nearly empty when this was written, so nothing was
broken by it yet; it was one enrollment away from being.

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
