# CLAUDE.md

Guidance for Claude Code when working in this repository. Angus is a sibling product to Cardigan (`cardiganapps-ui/cardigan`) and inherits its engineering standards and design system **verbatim** — when this file is silent, Cardigan's `CLAUDE.md` is the tie-breaker.

**Before building anything, read `docs/playbook.md`** — the component catalog (what to reuse) and the step-by-step recipes (new entity, new field, new tab, migration template, motion cookbook, verification loop). This file is the *rules*; the playbook is the *how*. If you find yourself writing a picker, a sheet footer, a skeleton, or a list row from scratch, stop — it exists.

# ⚠️ PRIME DIRECTIVE — HER DATA IS IRREPLACEABLE

Angus is one artist's business memory: every commission, contact, sale, class, and expo she has ever tracked. There is no "re-sync from the source of truth" — the app **is** the source of truth. Losing or corrupting a row is the worst thing this codebase can do.

1. **Never lose a write.** Every mutation is optimistic **and** reversible: capture the prior state, apply locally, send to Supabase, and restore the prior state + surface an error if the server rejects it (`hooks/useCloudStore.ts` is the only place this pattern lives — extend it, don't fork it). Never leave a half-applied update.
2. **Never destroy without confirmation.** Deleting a project, contact, event, or (later) a sale/payment requires an explicit confirm step in the UI. Cascades (`on delete cascade` / `set null`) are declared in the schema on purpose — read `supabase/migrations/` before adding a foreign key.
3. **Idempotent inserts.** Any code path that can run twice (auto-generated recurring rows, imports, retries) must be safe against duplicates: use a unique index and handle Postgres `23505` by skipping, never by crashing. `lib/importLocal.ts` (one-time localStorage → cloud import) is the reference: it filters seed rows and clears local keys only after a successful insert.
4. **Money is pure and tested.** When the finance modules land (sales, payment plans, expenses, investments), every derived number (balance owed, plan progress, monthly P&L) comes from a pure helper in `src/utils/` with a vitest test beside it. Denormalized counters are recomputed from raw rows, never incremented in place.
5. **RLS on every table**, `auth.uid() = user_id`, no exceptions. The anon key is public by design; RLS is the security boundary. Service-role keys never appear under `src/`.

If you are about to touch `hooks/useCloudStore.ts`, `context/AppContext.tsx`, `data/rows.ts`, `lib/importLocal.ts`, or anything under `supabase/`, re-read this section first.

---

# Angus

Mobile-first PWA — a life & business planner for a working artist. **Spanish UI.** TypeScript (`strict: true`, `allowJs: false`), React 19 + Vite 6, custom CSS design tokens (no UI library), Supabase (Postgres + Auth + RLS), Vercel hosting.

Users: each person has their own account and their own **workspace**; data belongs to a workspace, not a user. The artist owns hers; the admin account (`ADMIN_EMAIL` in `src/config/admin.ts`, mirrored by `public.is_admin()`) is implicitly a member of every workspace with full read/write and switches between them from the account sheet (topbar avatar). Roles `owner | admin | member` live in `workspace_members` for future collaborators.

## Commands

```bash
npm run dev        # Vite dev server
npm run typecheck  # tsc -b
npm run lint       # eslint
npm test           # vitest (src/**/__tests__)
npm run build      # tsc -b && vite build
npm run e2e -- <url>   # browser smoke test (needs E2E_EMAIL / E2E_PASS; see docs/playbook.md §7)
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on every push and PR.

Env: copy `.env.example` → `.env.local` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Both are browser-safe.

## Product experience standard — what "top tier" means here

These are not aspirations; they are acceptance criteria for every screen.

- **First paint looks like the destination.** Long fetches render a skeleton that mirrors the final layout (`.sk-bar` / `.sk-circle`). Never ship a bare "Cargando…" string.
- **Every tap answers in under 100 ms.** Optimistic updates for all mutations; press feedback on every tappable (`.btn` scales to 0.95 on `:active`, inline tappables get `.btn-tap`). If a write fails, the UI reverts and says so — it never silently swallows.
- **One gesture vocabulary.** Sheets slide up from the bottom and dismiss via handle-drag, overlay tap, Escape, or the OS back gesture. There are no centered lightbox modals. Screens are reached through the bottom tab pill; detail flows open as sheets, not new routes.
- **No dead ends.** Every empty state (`.empty-state`) tells her what the screen is for and offers the next action. Every error state offers a retry.
- **Reads at a glance.** KPI numbers use tabular numerals. Status is carried by color semantics (below), never by color alone — always pair with a label.
- **Works on a phone in a studio.** 44×44 hit targets, 16px minimum input font (no iOS zoom-on-focus), safe-area aware, keyboard never hides the primary button, dark mode automatic, `prefers-reduced-motion` respected, tolerant of a flaky connection (optimistic UI + error toast, never a frozen spinner).
- **Feels alive, not busy.** Motion uses the tokens (`--ease-spring` for surfaces landing, `--ease-out` for everything else, `--dur-*` durations). No animation that doesn't communicate a state change.
- **Spanish, warm, specific.** Copy speaks to *her* ("Tu día", "Sin proyectos todavía — agrega una pieza…"), never generic ("No data"). Money is MXN via `toLocaleString`.

If a change makes the app feel less like this, it's a regression even if the feature works.

## Architecture

- `src/main.tsx` → `App.tsx`. `App` owns auth gating (`hooks/useAuth.ts` → `screens/AuthScreen.tsx`), loads the account's workspaces (`hooks/useWorkspaces.ts`, active one remembered per account), and mounts `context/AppContext.tsx` **keyed on the active workspace id** so a switch remounts the stores. `SignedIn` wraps the screen in `PullToRefresh` → slide-animated wrapper (direction from `BottomTabs.TAB_ORDER`) → `SkeletonCrossfade`.
- **Data flow — one context.** `AppContext` composes three `useCloudStore(workspaceId, …)` instances (projects, contacts, events) and exposes typed `items` + `add/update/remove` per entity, plus `loading`, `error`, `refreshAll`. Screens consume via `useApp()`. Row ↔ entity mapping (snake_case ↔ camelCase) lives only in `data/rows.ts`.
- `hooks/useCloudStore.ts` — generic optimistic CRUD over one Supabase table, filtered by `workspace_id` and stamping it on inserts (see Prime Directive #1).
- `components/AccountSheet.tsx` — account identity, workspace switcher, sign out. `config/admin.ts` — `ADMIN_EMAIL`.
- `lib/supabase.ts` — the single client instance. `lib/importLocal.ts` — one-shot migration of pre-login localStorage data.
- **Routing** is hash-based (`hooks/useNavigation.ts`): `home | projects | contacts | schedule`. Sheets are component state, not routes.
- `screens/` — one file per tab (`Home`, `Projects`, `Contacts`, `Schedule`) plus `AuthScreen`. `components/` — sheets (`ProjectSheet`, `ContactSheet`, `EventSheet` over the shared `Sheet` + `SheetActions`), pickers (`SegmentedControl`, `ChipSelect`, `PickerField`/`PickerSheet` — **never a native `<select>`**), chrome (`BottomTabs`, `PullToRefresh`, `Toast`), primitives (`Icon`, `EmptyState`, `AnimatedNumber`, `LoadingSkeleton`). Full catalog with props in `docs/playbook.md` §1.
- `data/constants.ts` — enums with Spanish labels + semantic colors. **Every enum here is mirrored by a check constraint in `supabase/migrations/`** — change both, in the same commit.
- `types.ts` — the domain model. Dates are ISO `YYYY-MM-DD` strings; times are `HH:MM`. Format for display only via `utils/dates.ts`.
- `styles/` — split by concern (`fonts`, `base`, `components`, `responsive`, `dark`), aggregated by `index.css`. Keep files narrow.

## Domain model (v1)

- **Project** — a piece, commission, or series: `status` (idea / in_progress / on_hold / completed), medium, start/due dates, price, optional linked contact (the client or gallery).
- **Contact** — `relationship` (lead / client / gallery / supplier / collaborator / other). Leads carry a `leadStage` (new / contacted / negotiating / won / lost) and a `followUpDate`; the Home KPI "Seguimientos" counts leads whose follow-up is today or overdue.
- **ScheduleEvent** — one unified calendar: `kind` (class / expo / meeting / deadline / personal / other), date, optional times/location, optional links to a project and a contact.

Roadmap (in order): sales + payment plans → expenses + investments → expo budgeting → recurring classes → documents/photos (R2, mirroring Cardigan's `api/_r2.ts` pattern).

## Database & security

- `supabase/migrations/NNN_*.sql` are the canonical schema; apply them in order and commit the file in the same commit as the apply. Every data table: `id uuid`, `workspace_id uuid` (not null, FK → `workspaces`), `user_id uuid default auth.uid()` (creator), `created_at`, `updated_at` (trigger `set_updated_at`), and one RLS policy for all verbs: `using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))`. Template in `docs/playbook.md` §5.
- `workspaces` / `workspace_members` (migration 002): `is_workspace_member()` and `is_workspace_admin()` are `security definer` so data policies can consult membership without recursion; `is_admin()` short-circuits both. `handle_new_user` (trigger on `auth.users`) creates each new account's workspace.
- Client-generated ids (`utils/id.ts` → `crypto.randomUUID()`) are inserted as-is so optimistic rows and server rows share an id.
- Auth: email + password and magic link (Supabase Auth). No social providers in v1. Confirmation email goes through Supabase's built-in mailer (rate-limited to a few per hour) — move to Resend SMTP before inviting anyone beyond the two of you.

## Conventions

- **Spanish** for all user-visible text. **MXN** currency. Conventional commits (`feat:`, `fix:`, `refactor:`, `style:`, `chore:`).
- **Inline styles** for one-offs; a class in `styles/components.css` the moment something is reused.
- **Page background is `var(--white)`, never `var(--cream)`.** `--cream` is an accent for inline information bands inside white cards and alternate-state buttons only.
- No comments explaining *what*; only a short line when the *why* is non-obvious.

### Design system (identical to Cardigan — read before building any new screen)

Angus uses Cardigan's design system unchanged: same tokens, same class vocabulary, same chrome. When something looks "off" it's because a screen invented values instead of following these patterns.

- **Typography.** `--font-d` (Nunito) is the *display* face — screen titles, card headers, sheet titles, KPI numbers, button labels. `--font` (Nunito Sans) is body. Sizes come from `--text-xs` 11 / `--text-sm` 12 / `--text-md` 14 (body) / `--text-lg` 16 / `--text-xl` 20 / `--text-2xl` 24. Eyebrows: uppercase, `--text-eyebrow` (10px, never scaled), `letter-spacing: 0.06–0.07em`, weight 700, `--charcoal-md` or `--charcoal-xl`. Display headlines weight 800, `letter-spacing: -0.2 to -0.3px`. Fonts are self-hosted (`public/fonts/`, `styles/fonts.css`) — no Google Fonts `<link>`.
- **Color semantics — pick by meaning.** Teal = primary / interactive / active (FAB, active tab, links, in-progress). `--teal-pale` = active row / focus backing; `--teal-dark` = labels on teal-pale. `--charcoal` body, `--charcoal-md` secondary, `--charcoal-lt` tertiary, `--charcoal-xl` meta + eyebrows. Reserved: red = destructive / overdue / deadline / lost; green = completed / won / success; amber = pending / on-hold / negotiating / warnings; purple = personal / idea; blue = class / virtual; rose = lead lane; gray = other/neutral. Use the `--*-bg` companions for tinted panels — never hand-picked rgba.
- **Spacing rhythm.** Card inner padding 14–16px; sheet body 20px h / 20–24px v; rows 12–14px v / 16px h; stack gaps 12 (tight) / 14 (form rows) / 16 (default) / 20–24 (sections). Hit targets ≥ 44×44. `.input-group` already stacks with `margin-bottom: 14px`.
- **Borders, radii, elevation.** `--radius-sm` 8 inputs/chips; `--radius` 12 bands; `--radius-lg` 16 cards + sheets; `--radius-pill` buttons/chips/segments. `--border-lt` dividers, `--border` emphasized. `--shadow-sm` resting cards, `--shadow` lifted, `--shadow-lg` sheets/overlays. **Buttons are pill-shaped, full stop.**
- **Buttons.** `.btn` family only: `.btn-primary` (charcoal fill, primary CTA), `.btn-secondary`, `.btn-ghost`, `.btn-danger`. Disabled = `opacity: 0.55 + cursor: not-allowed`. Active scales 0.95 with `--ease-spring`. Inline tappables get `.btn-tap`.
- **Sheets are the canonical modal.** `.sheet-overlay` > `.sheet-panel` > `.sheet-handle` > `.sheet-header` (`.sheet-title` + `.sheet-close`) > body > sticky footer with `border-top: 1px solid var(--border-lt)`. Wire `useEscape` + `useFocusTrap` + `useSheetDrag`, and gate `safeClose = submitting ? null : onClose` so nothing can dismiss mid-submit. `components/Sheet.tsx` already does all of this — compose it, don't re-implement it.
- **Inputs.** `.input-group` > `.input-label` + `.input`. Hints beneath as `.input-error-msg` (reserved min-height, toggled with `.is-visible`) or `.input-help`. Date/time inputs are native `<input type="date|time">`. Font-size ≥ 16px. Don't add `interactive-widget` to the viewport meta.
- **Cards & rows.** `.card` (white / radius-lg / border-lt / overflow-hidden) before inventing a wrapper. `.row-item` for lists (12px gap, 13/16 padding, min-height 62, `--teal-mist` active). `.kpi-card` for numbers: tabular-nums, eyebrow over a 20–22px display number.
- **Empty states.** `.empty-state` + `.empty-state-icon` (44×44 `--cream-dark` circle, 20px icon) + `.empty-state-title` (font-d 800 `--text-lg`) + `.empty-state-body` (13px `--charcoal-md`, max-width 320).
- **Loading.** Skeleton mirroring the final layout, built from `.sk-bar` / `.sk-circle`; paused under reduced motion automatically.
- **Icons.** `components/Icon.tsx`, `currentColor`, sizes 12 / 14 / 16 / 20 (default) / 22 / 36. Standalone icons sit in a 44×44 hit target.
- **Motion.** `--ease-out` default; `--ease-spring` for surfaces landing (sheets, FAB); `--ease-in-out` cross-fades. `--dur-fast` 150 / `--dur-base` 250 / `--dur-slow` 400 / `--dur-slower` 600. No raw cubic-beziers.
- **Safe areas.** Consume `--sat / --sab / --sal / --sar` only — never raw `env()`. Sticky top bars: `padding-top: calc(var(--sat) + 14px)`. Scroll containers reserve `padding-bottom: max(16px, var(--sab))`. `.shell` (fixed, `overflow: clip`) + scrolling `.page` is the layout; every full-viewport surface owns its own scroll container.
- **Scroll surfaces bounce.** `.scroll-bounce` on any non-`.page` scroll container (sheet bodies, auth screen).
- **Dark mode is automatic IF you use tokens.** `dark.css` only flips `--*` variables. Hex literals and inline rgba shadows don't flip — always `--shadow-*`, `--*-bg`, etc.
- **Tabular numerals wherever money or counts are shown.**
- **Liquid Glass is tokenized.** The floating bottom tab pill, FAB, topbar, and toasts consume `--glass-*` tokens / `.glass-chrome|bar|panel|tinted`. Never stack two backdrop-filter surfaces; glass is for floating chrome only — cards and sheet panels stay opaque.
- **Drawing outside the lines.** A genuinely new pattern (chart, calendar grid, gallery) ships as a named class in `components.css` or a screen-scoped CSS file, never as an inline-style snowflake.

## Ops

- **GitHub:** `cardiganapps-ui/Angus`, default branch `main`. Vercel auto-deploys `main`.
- **Supabase / Vercel identifiers:** see the "Live infrastructure" block below once provisioned. Keep `VITE_SUPABASE_*` in Vercel Production + Preview; env changes take effect on the next deploy.
- Prefer one-off `.mjs` scripts run with `node --env-file=.env.local` for live-data chores; delete them when done.

### Live infrastructure

- **Supabase project `angus`** — ref `xbpvqvlomrnuxydyqyqj`, region `us-east-1`, org "Cardigan" (`gmawxcuqdkwculayfbaf`). URL `https://xbpvqvlomrnuxydyqyqj.supabase.co`. Use the publishable key (`sb_publishable_…`) for `VITE_SUPABASE_ANON_KEY`. Manage via the Supabase MCP tools (`apply_migration`, `execute_sql`) or the dashboard. It occupies the org's second free slot — `cardigan-staging` was paused on 2026-09-15 to make room; unpause it from the dashboard if you need staging back (and upgrade the org first).
- **Auth config** — email confirmation is ON with Supabase's built-in mailer (fine for two users; it's rate-limited to a few emails/hour). Magic links use the same mailer. Move to a custom SMTP (Resend, like Cardigan) before opening sign-ups to anyone else. To confirm an account by hand (e.g. built-in mail didn't arrive): `update auth.users set email_confirmed_at = now() where email = '…';`.
- **Vercel** — project `angus` (`prj_WNZKRtR1omX8ivbcyGVIRxmyoKmi`) on team `cardiganapps-4938's projects` (`team_0rR9OfIKmnJ8xFDrOXUkHcT3`), linked to `cardiganapps-ui/Angus` (repoId `1370699321`), production branch `main`, auto-deploys on push. **Live at `https://angus-xi.vercel.app`.** Env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set on Production + Preview (type `plain`, so they read back). Token lives in `.env.local` as `VERCEL_TOKEN` — it must be **team-scoped** (a personal-scope token sees zero projects and every team call 403s). Manual redeploy: `POST /v13/deployments` with `{"name":"angus","project":"prj_…","target":"production","gitSource":{"type":"github","repoId":1370699321,"ref":"main","sha":"<origin/main>"}}`. The Vercel MCP connector in these sessions can read but can't create projects — use the REST API with the token.
- **Testing against live auth from a sandbox:** headless Chromium can't POST to supabase.co through the intercepting proxy (`ERR_TOO_MANY_RETRIES`); relay `https://<ref>.supabase.co/**` through `page.route` + Node `fetch` with `NODE_USE_ENV_PROXY=1`, and launch with `--proxy-bypass-list=localhost;127.0.0.1` so the dev server stays local.
