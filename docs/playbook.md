# Angus development playbook

How to add things to Angus without re-deriving patterns or drifting from the design system. `CLAUDE.md` holds the rules; this file holds the **recipes** and the **component catalog**. Read both before building.

The loop for every change: read the recipe → reuse the catalog → `npm run typecheck && npm run lint && npm test && npm run build` → verify in a browser (`npm run e2e` or a frames script) → commit on `main` → Vercel deploys → re-check the live URL.

---

## 1. Component catalog (reuse these — never rebuild them)

All in `src/components/` unless noted. Props are the real signatures.

| Component | Use it for | Props / notes |
|---|---|---|
| `Sheet` | Every modal. Bottom sheet with handle, title, X, body, sticky footer. Wires escape / focus trap / drag-to-dismiss / animated exit. | `title`, `onClose: (() => void) \| null` (null = can't close, e.g. while submitting), `children`, `footer?`, `closeRef?` (ref that receives the animated-close fn, for programmatic close). |
| `SheetActions` | The footer of every create/edit sheet: Guardar + optional Eliminar with an animated, height-stable confirm step. | `canSave`, `submitting`, `onSave`, `onDelete?`, `confirmText` ("¿Eliminar este proyecto?"). |
| `SegmentedControl` | 2–4 mutually exclusive options with short labels (status, view modes, auth tabs). Animated slider. | `items: {k, l}[]`, `value`, `onChange(k)`, `size?: "sm" \| "md"` (use `sm` inside sheets — `md` clips 4×Spanish labels on 360–390px), `ariaLabel?`, `style?`. |
| `ChipSelect` | 3–8 options that can wrap (contact type, lead stage, event kind). | `options: {value, label, color?}[]` (color → dot before label), `value`, `onChange`, `ariaLabel`. Generic over the value type. |
| `PickerField` + `PickerSheet` | Choosing an **entity** (a contact, a project) or any list > 8 items. Field looks like an input with a chevron; opens a stacked sheet with check marks and (when > 8) a search box. | `PickerField`: `title`, `options: {value,label}[]`, `value`, `onChange`, `placeholder?` ("Ninguno"). `PickerSheet` is used by it; you rarely need it directly. |
| `AnimatedNumber` | Any KPI / money figure. Counts up from the previous value; no "0" flash. | `value`, `format?`, `duration?`, `enabled?`. |
| `EmptyState` | Every "nothing here yet" surface, inside a `.card`. | `icon: IconName`, `title`, `body`. Body copy says what to do next. |
| `LoadingSkeleton` / `SkeletonCrossfade` | First paint while data loads. Route-aware layouts. Already wired in `App.tsx`; add a layout case when you add a tab. | `LoadingSkeleton { route? }`; `SkeletonCrossfade { showContent, route?, children }`. |
| `PullToRefresh` | Already wraps every signed-in screen; calls `refreshAll()` from `AppContext`. Don't add a second one. | `onRefresh`, `children`. |
| `Toast` via `useToast()` (`context/ToastContext.tsx`) | Confirmations and errors. Success after every save/delete; errors from rejected writes are automatic (`DataErrorToast`). | `showSuccess(msg)`, `showToast(msg, kind, opts)` with kind `"success" \| "error" \| "warning" \| "info"`. |
| `BottomTabs` | The floating glass tab pill. Add a tab by editing `TABS` there (+ `Route` in `hooks/useNavigation.ts`, + a case in `App.tsx::Screen`, + a skeleton layout). | Exports `TAB_ORDER` — the slide-direction source of truth. |
| `Icon` | All icons. Add a path to `PATHS` in `Icon.tsx`; never import an icon library. | `name`, `size?` (12/14/16/20/22/36), `strokeWidth?`. |
| `AccountSheet` | Topbar avatar → account, workspace switcher, sign out. | Wired in `App.tsx`. |
| `lib/haptics.ts` | `haptic.tap()` on selection, `haptic.success()` on save, `haptic.warn()` on delete. Pickers and tabs already fire it. | |

Money-specific classes live in `src/styles/money.css` (imported by `styles/index.css`): `.money-row-right`, `.money-submeta`, `.money-progress` + `.money-progress-fill`, `.money-stats` + `.money-stat-label` / `.money-stat-value`, `.money-panel` (blush `--cream-dark` info band inside a sheet), `.money-sheet-section` + `.money-sheet-section-title`, `.money-list` + `.money-list-empty`, `.cat-bar-row` (+ label / track / fill / value), `.money-summary`, `.money-section-total`, `.money-confirm`, `.btn-mini`.

CSS classes that pair with these (`src/styles/components.css`): `.page`, `.page-header` + `.eyebrow` + `.page-title`, `.section` + `.section-header` + `.section-title`, `.card`, `.row-item` (+ `.row-content` / `.row-title` / `.row-sub`, `.row-item--muted`, `.row-item--selected`), `.kpi-grid` + `.kpi-card` + `.kpi-label` + `.kpi-value`, `.badge badge-{teal,green,amber,purple,blue,red,gray}` (rose exists but is unclaimed — it reads as the accent; see CLAUDE.md → Color semantics), `.input-group` + `.input-label` + `.input` + `.input-help` + `.input-error-msg.is-visible`, `.form-row` (two inputs side by side), `.money-input-wrap` + `.money-input`, `.chip-row` + `.chip`, `.segmented`, `.fab`, `.list-entry-stagger` (+ `--stagger-i`), `.empty-state`, `.sk-bar` / `.sk-circle`.

Which picker? **≤ 4 short labels → `SegmentedControl`. 3–8 labels or labels with colors → `ChipSelect`. Entities or > 8 → `PickerField`. Dates/times → native `<input type="date|time">`. Never `<select>`.**

---

## 2. Recipe: add a new entity end-to-end (e.g. `sales`)

Touch these, in this order. Skipping one is how discrepancies start.

1. **`src/types.ts`** — the interface. Dates are ISO `YYYY-MM-DD` strings, times `HH:MM`, money `number | null`, links to other entities `xxxId: string | null`, always `id`, `createdAt`.
2. **`src/data/constants.ts`** — every enum as `{ value, label }[]` with Spanish labels (+ `color` if it drives a dot/badge). Add a `XXX_BADGE` map if rows show a status badge.
3. **`supabase/migrations/NNN_<name>.sql`** — copy the template in §5. Enum check constraints must list exactly the values in constants.
4. **Apply the migration** (Supabase MCP `apply_migration` with the same SQL, or the dashboard SQL editor) and commit the file in the same commit.
5. **`src/data/rows.ts`** — `XxxRow` (snake_case) + a `xxxStore: CloudStoreConfig<Xxx, XxxRow>` with `fromRow` / `toRow`. `toRow` maps only the keys present in the patch (see existing stores); numeric columns come back as strings from PostgREST — `Number()` them in `fromRow`; `time` columns come back as `HH:MM:SS` — slice to `HH:MM`.
6. **`src/context/AppContext.tsx`** — one more `useCloudStore(workspaceId, xxxStore)`, its `items/add/update/remove` on the context value, include it in `loading`, `error`, `clearError`, `refreshAll`.
7. **`src/lib/importLocal.ts`** — only if the entity can be created before sign-in (currently none new should).
8. **Sheet** `src/components/XxxSheet.tsx` — copy `ProjectSheet.tsx`: local `useState` per field, `canSave`, `SheetActions` footer, `haptic` + `showSuccess` on save/delete, `autoFocus` only when creating. Pickers per the rule above.
9. **Screen** (or a section of an existing one) — `.page` → `.page-header` → `.section` → `.card` → `.row-item.list-entry-stagger` rows → `.fab`. Empty state inside the card. Sort explicitly.
10. **Home** — if the entity changes a KPI, add it via `AnimatedNumber`.
11. **Money?** Derived numbers (balances, totals, P&L) go in `src/utils/<domain>.ts` as pure functions with a test in `src/utils/__tests__/` **before** the UI uses them (Prime Directive #4).
12. **Docs** — add the entity to `CLAUDE.md` "Domain model" and to §1 here if you added a reusable component.

## 3. Recipe: add a field to an existing entity

`types.ts` → migration (`alter table … add column …` + check constraint if enum) → apply → `rows.ts` (`Row` interface, `fromRow`, `toRow`) → the sheet (state + input/picker) → any row/badge that should show it → `constants.ts` if it's an enum → tests if money.

## 4. Recipe: add a tab / screen

`hooks/useNavigation.ts` (`Route` union + `readRoute`) → `components/BottomTabs.tsx` (`TABS` entry with an `IconName`) → `App.tsx::Screen` case → `components/LoadingSkeleton.tsx` (a layout that mirrors the screen) → the screen file. Slide direction comes from `TAB_ORDER` automatically.

## 5. Migration template (workspace-scoped, RLS via membership)

```sql
create table public.<table> (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, -- creator
  -- columns…
  status text not null default '<default>' check (status in ('a','b','c')),   -- mirror constants.ts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index <table>_workspace_idx on public.<table>(workspace_id);
create trigger trg_<table>_updated_at before update on public.<table>
  for each row execute function public.set_updated_at();
alter table public.<table> enable row level security;
create policy "workspace <table>" on public.<table> for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
```

`useCloudStore` filters by `workspace_id` and stamps it on inserts, so the client never sends it by hand. Unique invariants (idempotent generators, imports) get a `unique index` + a `23505`-tolerant insert path.

## 6. Motion cookbook

| Want | Do |
|---|---|
| Rows appearing | `className="row-item list-entry-stagger"` + `style={{ "--stagger-i": Math.min(i, 12) }}` |
| A number changing | `<AnimatedNumber value={n} />` |
| Screen enter on tab change | automatic (`SignedIn` in `App.tsx`) |
| A surface landing (sheet, FAB, card entering) | `--ease-spring` + `--dur-slow`; sheets are automatic |
| Small state change (chip, focus, hover) | `--ease-out` + `--dur-fast` |
| Two states swapping in place (e.g. confirm step) | keyed wrapper + `sheetActionsIn` (see `SheetActions`) — keep height stable |
| Press feedback on a custom tappable | add `.btn-tap` (buttons in `.btn` already have it) |
| Loading | skeleton mirroring the layout + `SkeletonCrossfade`; never a spinner or "Cargando…" |
| Success / destructive confirmation | `haptic.success()` / `haptic.warn()` + a toast |

Never write raw `cubic-bezier(...)` or `ms` literals — tokens only. Reduced motion is handled globally.

## 7. Verification loop

- **Unit:** `npm test` (vitest, `src/**/__tests__`). Money/date helpers must have tests.
- **Browser smoke:** `npm run e2e -- http://localhost:5173/` (or the live URL) with `E2E_EMAIL` / `E2E_PASS` set. It signs in, visits every tab, opens every "new" sheet, fails on any console/page error, and writes screenshots to `e2e-out/`.
  **There is no standing test account on purpose:** the admin is a member of every workspace, so any permanent test user would clutter the real workspace switcher forever. Create a disposable one with the SQL recipe in §9, run the test, then `delete from auth.users where email = '<throwaway>';` (workspaces and data cascade). Never point the smoke test at the owner's real account — it writes rows.
- **Motion:** capture frames at 60/140/260/600 ms after a tap (see the pattern in `scripts/e2e-smoke.mjs`; a `burst()` helper that screenshots at offsets). Judge the frames, not just the end state.
- **In a Claude Code sandbox:** headless Chromium is at `/opt/pw-browsers/chromium`, Playwright at `/opt/node22/lib/node_modules/playwright`; launch with `proxy: { server: process.env.HTTPS_PROXY }` + `args: ["--proxy-bypass-list=localhost;127.0.0.1"]`, run node with `NODE_USE_ENV_PROXY=1`, and relay `https://<ref>.supabase.co/**` through Node `fetch` via `page.route` (Chromium POSTs die on the intercepting proxy). `scripts/e2e-smoke.mjs` does all of this when `HTTPS_PROXY` is set.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, lint, test, build on every push/PR.

## 8. Accounts, workspaces, admin

- Every account gets its own workspace on sign-up (DB trigger `handle_new_user`). Data belongs to a workspace, not a user; `user_id` on rows is the creator.
- Membership roles: `owner`, `admin`, `member` in `workspace_members`. `is_workspace_member()` gates all data RLS; `is_workspace_admin()` gates membership/workspace edits.
- `ADMIN_EMAIL` (`src/config/admin.ts` ↔ `public.is_admin()` in migration 002) is implicitly a member of every workspace with full read/write, and sees the workspace switcher in the account sheet. Change both places together.
- The active workspace is remembered per account in `localStorage["angus.workspace.<uid>"]`; `AppProvider` is keyed on it so a switch remounts the stores.
- Email confirmation uses Supabase's built-in mailer, which is rate-limited to a handful of messages per hour **project-wide**. Hitting it makes sign-up fail outright (`over_email_send_rate_limit`) — no account is created. For more than two users, wire a custom SMTP (Resend) first, and/or turn confirmation off (`mailer_autoconfirm: true` via the Management API / dashboard → Authentication → Sign In / Providers → Email → Confirm email).
- **Creating a confirmed account without sending any email** — preferred path, the Auth Admin API with the secret key (GoTrue builds the row itself, so nothing can be subtly malformed). `handle_new_user` still fires and creates the workspace; deleting the user cascades it away.

  ```bash
  set -a; . .env.local; set +a
  API="https://xbpvqvlomrnuxydyqyqj.supabase.co"
  curl -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"…","password":"…","email_confirm":true}'
  # delete (cascades workspace + data):
  curl -X DELETE "$API/auth/v1/admin/users/<id>" \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
  ```
  Give each workspace a distinct name afterwards (`update public.workspaces set name = … where owner_id = …`) — the admin sees them all in one switcher. Careful in bash: `UID` is readonly, so capture the id into any other variable name.

  **Fallback if no secret key is available** — insert directly, then verify by actually signing in. `auth.identities.email` is a GENERATED column — never insert it.

  ```sql
  do $$
  declare uid uuid := gen_random_uuid();
  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      '<email>', extensions.crypt('<password>', extensions.gen_salt('bf')), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('email', '<email>', 'email_verified', true),
      now(), now(), false, false
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', '<email>', 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());
  end $$;
  ```

  Then prove it works (a row that looks right can still fail GoTrue's checks):
  `curl -X POST "https://<ref>.supabase.co/auth/v1/token?grant_type=password" -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{"email":"…","password":"…"}'` → expect HTTP 200 with an `access_token`. pgcrypto lives in the `extensions` schema, so qualify `crypt` / `gen_salt`.
- Changing a password needs no email: `supabase.auth.updateUser({ password })` on a live session — that's what `ChangePasswordSheet` (account sheet → Seguridad) uses. Password **reset** from the sign-in screen would need email, so it isn't offered yet.

## 9. Gotchas (learned the hard way)

- Supabase rejects `@example.com` addresses; use real domains (plus-aliases are fine) for test accounts, then confirm via SQL: `update auth.users set email_confirmed_at = now() where email = '…';`
- PostgREST returns `numeric` as a string and `time` as `HH:MM:SS`. Normalize in `fromRow`.
- `button, a, select { min-height: 44px }` is global — a custom small button needs an explicit `min-height` (see `.topbar-avatar`).
- `text=Foo` in Playwright is a substring match: scope clicks (`nav >> text=Proyectos`) or you'll hit a KPI label.
- The Vercel MCP connector can read but not create projects; use the REST API with a **team-scoped** token (`VERCEL_TOKEN` in `.env.local`).
- Don't add `interactive-widget` to the viewport meta, don't stack two `backdrop-filter` surfaces, don't put `--cream*` on a page/sheet wrapper.
- Colors: rose (`--accent`) = interactive, teal = a state, never an action. Labels on an accent fill use `--accent-dark`, not `--accent`. Nothing in this palette is grey — don't add a hex, and don't `saturate()` a charcoal surface into one. Full rules in CLAUDE.md → Design system → Color semantics.
