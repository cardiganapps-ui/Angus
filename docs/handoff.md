# What Angus needs from a human

Everything in this repo that can be built, tested and applied without a
credential has been. What is left is a short list of things that are
*only* obtainable by someone with an account: five secrets, one design
asset, one decision, and two weeks of real use.

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
repository secret*, five times:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the pooler URI from 2.2, password filled in |
| `R2_ACCOUNT_ID` | same as §1.2 |
| `R2_ACCESS_KEY_ID` | same as §1.3 |
| `R2_SECRET_ACCESS_KEY` | same as §1.3 |
| `R2_BACKUP_BUCKET` | `angus-backups` |

**2.4 — Run it by hand once.** Actions → **Nightly backup** → *Run
workflow*. Don't wait for 09:10 UTC to find out it doesn't work. The log
prints the object key it wrote.

**2.5 — Then restore it.** A backup that has never been restored is a
hypothesis, and the plan's acceptance bar says *performed*, not
*configured*. Download the dump from R2 and:

    gunzip -c angus-YYYY-MM-DD.sql.gz | psql "<a scratch database>"

Any throwaway Postgres works — `docker run -e POSTGRES_PASSWORD=x -p
5432:5432 postgres:17` is enough. Then compare row counts per table
against production. Ping me with the dump and I'll do the diff.

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
