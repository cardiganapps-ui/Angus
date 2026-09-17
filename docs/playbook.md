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
| `EmptyState` | Every "nothing here yet" surface, inside a `.card`. | `icon: IconName`, `title`, `body`, optional `actionLabel` + `onAction` (renders a `.btn .btn-primary .empty-state-action`). Body copy says what to do next; pass the action pair whenever the next step is one unambiguous create — reuse the handler the screen's FAB already calls. A filter-miss empty state ("Nada coincide") stays text-only. |
| `LoadingSkeleton` / `SkeletonCrossfade` | First paint while data loads. Route-aware layouts. Already wired in `App.tsx`; add a layout case when you add a tab. | `LoadingSkeleton { route? }`; `SkeletonCrossfade { showContent, route?, children }`. |
| `PullToRefresh` | Already wraps every signed-in screen; calls `refreshAll()` from `AppContext`. Don't add a second one. | `onRefresh`, `children`. |
| `Toast` via `useToast()` (`context/ToastContext.tsx`) | Confirmations and errors. Success after every save/delete; errors from rejected writes are automatic (`DataErrorToast`). | `showSuccess(msg)`, `showToast(msg, kind, opts)` with kind `"success" \| "error" \| "warning" \| "info"`. |
| `BottomTabs` | The floating glass tab pill. Add a tab by editing `TABS` there (+ `Route` in `hooks/useNavigation.ts`, + a case in `App.tsx::Screen`, + a skeleton layout). | Exports `TAB_ORDER` — the slide-direction source of truth. |
| `Icon` | All icons. Add a path to `PATHS` in `Icon.tsx`; never import an icon library. | `name`, `size?` (12/14/16/20/22/36), `strokeWidth?`. |
| `AccountSheet` | Topbar avatar → account, workspace switcher, sign out. | Wired in `App.tsx`. |
| `lib/haptics.ts` | `haptic.tap()` on selection, `haptic.success()` on save, `haptic.warn()` on delete. Pickers and tabs already fire it. | |
| `Drawer` | The left menu (phones: slides over the page; ≥1024px: a persistent rail via `rail`). Groups come from `GROUPS` inside it; a section hides when her `settings.practice` doesn't include it **unless it already has rows**. Add a route by adding an item there. | `route`, `navigate`, `onClose: (() => void) \| null` (null in rail mode), `rail?`. |
| `QuickAddFab` | Hoy's speed-dial FAB (sale / expense / event / piece / contact), ordered by `settings.quickActions`. | `onPick(action)`. |
| `ChipMultiSelect` | Several of a fixed set (practice, mediums, weekdays). Same look as `ChipSelect`. | `options: {value,label,color?}[]`, `value: T[]`, `onChange(next: T[])`, `ariaLabel`. |
| `SearchField` | The search box at the top of a list screen (Obra, Contactos). 16px input, clear button, `search` icon. | `value`, `onChange`, `placeholder`, `ariaLabel`. |
| `PeriodPicker` | Month / 3 months / year + chevrons, for any money screen that reports over a range. | `value: Period` (`{anchor, span}` from `utils/period.ts`), `onChange`, `ariaLabel?`. `periodRange(value)` → `{from, to, label}`. |
| `PlanBuilder` | The payment-plan editor shared by `SaleSheet` and `SaleDetailSheet`: deposit % + balance date, or N installments from a date at a frequency, with a live preview. | `terms: PaymentTerms`, `total`, `saleDate`, `draft: PlanDraft`, `onChange`. Rows come from `utils/plan.ts::planRows`. |
| `ProgressRing` | A ratio as a ring (monthly goal, budget). SVG, tokens only. | `ratio` (0..1), `size?`, `stroke?`, `color?`, `label` (a11y summary), `children` (center content). |
| `charts/BarChart` | Every bar chart (Hoy, Pronóstico, Reportes). One SVG: ≤ 18px rounded columns with a depth gradient, a 45° hatch for projected months, gridline values inline above their lines (columns are inset past the longest label), a soft band on the current / tapped month, grow-in animation, tap read-out, sr-only table. Built with the `dataviz` rules — load that skill before touching it. | `series: {key,label,color,negColor?}[]` (`negColor` for net charts), `columns: {key,label,title,values,projected?,current?}[]`, `height?`, `ariaLabel`, `signed?` (negative values allowed), `labelCurrent?` (single series: print the current column's value on its cap). |
| `MonthGrid` | The calendar month in Agenda → Mes: dots by event kind, today ring, chevrons. | `month` (any ISO date in it), `selected`, `events`, `onSelect(iso)`, `onMonthChange(iso)`. |
| `SettingsFieldSheet` | Editing one text/money value from a settings row. | `title`, `label`, `value`, `placeholder?`, `kind?: "text" \| "money"`, `help?`, `onSave(next)`, `onClose`. |
| `FeedbackSheet` | "Cuéntale a Diego" — a falla / idea / pregunta with a message, sent through `api/feedback.ts` (row in `feedback` + mail to the admin via Resend). Opened from anywhere signed in via `useSession().openFeedback()`: the drawer's Angus group, Ajustes → Ayuda, and the crash screen. What travels with it is the route, version, viewport, online flag and the last five local diagnostics — messages, never rows. | `route?`, `onClose`. Mounted once in `App.tsx` inside `AppProvider`. |
| `UpdateToast` | Mounted once in `App.tsx::Shell`. Shows "Hay una versión nueva · Actualizar" when the service worker has a waiting build; she chooses when to reload. | none |
| `ScheduleFields` | The "Horario" block (weekday chips + times + cadence + preview sentence) shared by `ClassGroupSheet` and `CourseSheet`. | `value: ScheduleValue`, `onChange`, `idPrefix`, `startDate`, `help?`. |
| `CourseSheet` / `CourseDetailSheet` | Create/edit a course she takes (schedule → series, cost → expense rule or one-off) / its tabs Resumen · Sesiones · Tareas · Notas · Material · Gastos. | `CourseSheet { course \| null, onClose, onDeleted? }`; `CourseDetailSheet { courseId, initialTab?, onClose }`. |
| `AssignmentSheet` + `AssignmentRow` | A tarea (course, due date/time, markdown description with task progress, status, linked piece, grade) / its list row with the 44px done checkbox and due chip. | `AssignmentSheet { assignment \| null, initialCourseId?, initialDueDate?, onClose, onDeleted? }`; `AssignmentRow { assignment, today, context?, onOpen, onToggle }`. |
| `NoteEditor` | The full-height writing surface (portal, own scroll, autosave 800 ms, versions, tags, links, attachments, cover, find, outline, templates, export .md / PDF). Open it from any row with `originRect` so it grows out of the tap. | `note`, `onClose`, `originRect?`. Everything inside lives in `components/notes/*` — compose, don't re-implement. |
| `QuickCaptureSheet` | Two-field capture (title + text) with "Abrir editor completo"; the FAB on Notas and the Hoy quick action use it. | `links?: NoteLinks`, `onClose`, `onSaved?(note, { openInEditor })`. |
| `NoteLinkChip` | The pill under the editor header that links a note to a course / session / tarea / piece; unlinked = Inbox. | `note`, `open`, `onOpen`, `onClose`, `onChange(links)`, `readOnly?`. |
| `TagFilterPills` | AND-filter by tag over a list of notes (counts included). | `tags`, `tagLinks`, `selectedIds`, `onToggle(id)`. |
| `DocumentList` + `DocumentViewer` | Rows of files/links (thumb by type, size, date) / the full-height viewer (image, PDF iframe, else "Descargar") with confirm-delete. | `DocumentList { documents, onOpen(doc), emptyBody }`; `DocumentViewer { doc, onClose, onDelete?(doc) }`. Links open in a new tab from the caller. |
| `UploadSheet` + `LinkSheet` | Pick files (drop zone on desktop, progress per file, HEIC and downscale handled) / add a URL. Both insert rows pre-linked to `links`. When storage isn't configured they show "Almacenamiento pendiente". | `UploadSheet { links: DocumentLinks, onClose, onUploaded?(count) }`; `LinkSheet { links, onClose }`. |
| `hooks/useDocuments` / `useNotes` / `useNoteAttachments` | The hooks behind those: `documentsFor(links)`, `upload`, `addLink`, `rename`, `remove` (R2 purge then row) / `createNote`, `sessionNote(event)`, `saveNote`, `restoreNote`, `togglePin`, `linkNote`, tags, `searchNotes` (FTS), `loadVersions`, `deleteNote(s)` / `upload`, `remove`, `useAttachmentSrc(noteId)` (cached signed URLs). | |

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

## 4. Recipe: add a screen

The bottom pill is fixed at three (Hoy · Agenda · Dinero — owner decision); a new screen is a **drawer route**:

`hooks/useNavigation.ts` (`Route` union + `ROUTES`; add it to `PARENT` if the back chevron should return to Dinero rather than Hoy) → `components/Drawer.tsx` (an item in the right `GROUPS` entry, with an `IconName`, optional `count`, and the `practice` value that gates it) → `App.tsx::Screen` case → `components/LoadingSkeleton.tsx` (a layout that mirrors the screen) → the screen file (`.page` → `.page-header` → sections). The topbar shows the back chevron and the screen fades in automatically because it isn't in `TAB_ROUTES`. Add the route to `scripts/e2e-smoke.mjs` so the smoke test visits it.

## 4b. Recipe: a recurring thing (rule → generated rows)

Angus never stores "this happens every month" as a flag on a row; it stores a **rule** and materializes concrete rows so every list, total and forecast reads plain rows.

1. The rule table (`recurring_rules`, `event_series`) holds cadence + bounds. The generated table gets a provenance column pair (`recurring_rule_id` + `period_key`, or `series_id` + `date`) and a **partial unique index** on it — that index is what makes two devices, a retry, or a double effect harmless.
2. A pure helper computes what's missing: `utils/materialize.ts::pendingMaterializations(rules, sales, expenses, today)` / `utils/series.ts::pendingOccurrences(series, events, today)`. Test it with the same inputs twice — the second call must return nothing.
3. `AppContext` runs it in an effect gated on `!loading && inflight === 0` (so it never races an insert that's still in flight) and inserts via `addMany` — a `23505` there means another client won; the store reloads instead of reverting.
4. Occurrences the user edits get `detached = true` (series) so regeneration leaves them; ones she deletes get `cancelled = true` so the row stays and blocks regeneration. Money rows are never regenerated after an amount change — a rule edit only affects future periods, and the sheet's help text says so.
5. Deleting a rule sets the FK to null on its rows (`on delete set null`) — history stays. Deleting a series cascades its occurrences, which is why `EventSheet` confirms with the count.

## 4c. Recipe: attach files to an entity

`documents` is one table for every attachment (course material, a tarea's entrega, a piece's photos, an event's files). To add files to a new entity: add the `xxx_id uuid references … on delete set null` column (+ index) to `documents`, the key to `DocumentLinks` in `hooks/useDocuments.ts` (`documentFolder` picks the R2 folder, `matchesLinks` filters), then in the sheet: `const { documentsFor, remove } = useDocuments()` → `<DocumentList documents={documentsFor({ xxxId })} onOpen=… />` + `<UploadSheet links={{ xxxId }} />` + `<DocumentViewer onDelete={remove} />`. Never write to R2 from `src/` directly — `lib/files.ts` is the only client that talks to `/api/*`, and the row is inserted only after the PUT succeeded.

## 4d. Recipe: link a note to an entity

Notes link through nullable FKs (`course_id`, `event_id`, `assignment_id`, `project_id`), all `on delete set null` — a note never disappears because its subject did. To make a new entity linkable: column + index in a migration, the key in `NoteLinks` (`hooks/useNotes.ts`), a case in `hooks/useNoteLinkLookup.ts::describeNoteLinks` and in `NoteLinkChip`'s picker, and the "Notas" list on the entity's detail = `notes.filter(n => n.xxxId === id)` + `createNote({ xxxId })`. One-tap notes from a session use `sessionNote(event)` (existing note or the *Apuntes de clase* template).

## 4e. Recipe: add a serverless route

`api/<name>.ts` (Vercel Node runtime, NodeNext — see `api/tsconfig.json`; `npm run typecheck` covers it). Copy `api/file-url.ts`: `applyCors` first (it answers the preflight), `isStorageConfigured()` → 503 with `{ code: "not_configured" }`, `getAuth(req)` (JWT → user + a client bound to that JWT), `parsePath(body.path)` (rejects anything outside `ws/<uuid>/…`), `isWorkspaceMember(ctx, workspaceId)` (selects the workspace through the caller's client — RLS decides), do one thing, return JSON. Secrets come from `process.env` only. The client calls it through `lib/api.ts::apiFetch(path, body)`, which adds the session token and maps 401/403/503/404 to `StorageError` codes so the UI can say "Almacenamiento pendiente" rather than fail silently. Add the route to `scripts/r2-smoke.mjs` if it touches R2.

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
- **Browser smoke:** `npm run e2e -- http://localhost:5173/` (or the live URL) with `E2E_EMAIL` / `E2E_PASS` set. It signs in, waits for the tab pill, visits the three tabs and the drawer routes, opens every "new" sheet, fails on any console/page error, and writes screenshots to `e2e-out/`. A brand-new account lands in onboarding first — the script skips it via "Saltar por ahora".
- **Storage leg:** the sandbox browser can't reach R2, so files are proven with `node --env-file=.env.local scripts/r2-smoke.mjs <deployment-url>` (sign in as a disposable account → upload-url → PUT → file-url → GET → delete). Run it after any change under `api/` or `lib/files.ts`, and once after the R2 env vars land in Vercel.
- **Notes:** after touching the editor, walk a note end to end (template → type → slash command → task toggle → tag → link → two edits → Historial shows versions → restore → Exportar PDF) on a disposable account; the DB check is `select version_no from note_versions where note_id = …`.
- **Sweeps:** before calling a phase done, capture every route at 360px light and 390px dark (a small Playwright script driven by a JSON list of `{name, w, h, dark, actions}` — see the pattern in `scripts/e2e-smoke.mjs`) and actually look at the PNGs. The two bugs that only show up this way are text that wraps where it shouldn't (topbar brand, row titles) and hex colors that don't flip.
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

## 7b. What the e2e harness actually covers

`npm run e2e -- <url>` (needs `E2E_EMAIL` / `E2E_PASS`) drives a real
browser against a real deployment. It does two different things:

**A no-throw sweep.** Signs in, skips onboarding, then visits all three
tabs and all eleven drawer routes, opening each screen's "new" sheet and
pressing Escape. It asserts nothing about content — its only failure
condition is a `pageerror` or a `console.error`. Cheap, and it catches
the class of bug where a screen explodes on an empty workspace.

**One write journey.** Creates a piece, edits its title, deletes it
through the two-tap confirm, then RELOADS and checks it stayed gone —
which is what distinguishes a real write from optimistic local state.
Until this existed the harness never submitted a single form, so
nothing covered create / edit / delete, validation, the optimistic
revert or the materializers: the parts most able to lose her data.

It cleans up after itself, but it does write to whatever account you
give it. **Use a disposable account, never the artist's.**

`.github/workflows/e2e.yml` runs it nightly — but it is gated on an
`E2E_ENABLED` repository variable and skips without it, so it is inert
until someone sets that plus the two secrets. A skipped check is not a
passing one.

Still not covered, and worth knowing: the notes editor, PDF export, CSV
export, file upload (that is `npm run r2:smoke`), workspace switching,
and anything offline.

## 8b. Backups and restore

The project is on Supabase's **free plan**: no point-in-time recovery, no
managed backups. The app is the only copy of her business memory, so
these two things are the whole disaster plan.

**Nightly, automatic** — `.github/workflows/backup.yml` runs
`scripts/backup-db.mjs` at 09:10 UTC (~03:10 CDMX), in two phases:

1. **The database.** `pg_dump` of the `public` + `auth` schemas, gzipped,
   to `r2://angus-backups/pg/`, pruned to 30 days.
2. **The files.** Every object in `angus-documents` copied server-side to
   `r2://angus-backups/files/<same key>` — the runner never touches the
   bytes. Objects already there with the same size and ETag are skipped,
   so a nightly run costs one list plus whatever she uploaded that day.
   Nothing under `files/` is ever pruned: a photo deleted in the app is
   precisely the object a restore is wanted for.

RPO is up to 24h, accepted deliberately.

Phase 2 exists because the dump alone is a trap. `documents` and
`note_attachments` rows are *pointers* into the documents bucket; a
restored database would faithfully preserve paths to photos that no
longer exist anywhere.

**No repository secrets.** The job proves itself with a GitHub OIDC
token (`permissions: id-token: write`) to the `backup-secrets` edge
function (`supabase/functions/backup-secrets/index.ts`), which verifies
the token against GitHub's JWKS, checks it was minted for
`cardiganapps-ui/Angus` by `.github/workflows/backup.yml`, and returns:

| Value | Where it comes from |
|---|---|
| `SUPABASE_DB_URL` | the password inside the edge runtime's own `SUPABASE_DB_URL`, rewritten to the **session pooler** host (runners have no IPv6 route to the direct host) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Supabase **Vault**, secrets `r2_account_id` / `r2_access_key_id` / `r2_secret_access_key` — the same pair the `api/` routes use; the token needs both buckets in its scope |
| `R2_BACKUP_BUCKET`, `R2_BUCKET_NAME` | Vault `r2_backup_bucket` / `r2_bucket_name`; default `angus-backups` / `angus-documents` |

`scripts/backup-credentials.mjs` does the asking and exports the values
into `$GITHUB_ENV`, masked. To rotate the R2 pair:

```sql
select vault.update_secret(id, '<new value>') from vault.secrets where name = 'r2_secret_access_key';
```

— no redeploy, the next run picks it up. If any of the three R2 names is
missing the broker answers `503` naming it and the job fails red; it
never uploads nothing and calls that success.

Every issuance and every outcome is a row in `ops.backup_events`
(migration 023); `public.backup_status()` returns the last
completed/failed timestamps to the admin account and `null` to anyone
else. That is the staleness signal — check it, not the Actions tab.

**Why the trust boundary is the same as repository secrets:** anyone who
can push a workflow to this repository could read repository secrets
from it; the broker grants exactly that set (any branch of this repo,
the backup workflow file, a schedule or manual event). A fork's OIDC
token carries the fork's name and is refused. GitHub also disables
scheduled workflows in a repository with no commits for 60 days — this
one is committed to often, but `backup_status()` is what would notice.

Three refusals are deliberate: a dump under 4 KiB is never uploaded (that
is `pg_dump` "succeeding" against nothing and overwriting good history),
the prune never deletes its way down to only today's copy, and the mirror
stops if the two bucket names are equal or if the source lists zero
objects while the backup already holds files (a renamed bucket, not an
emptied studio).

Run it by hand with `npm run backup` (needs those same vars in
`.env.local`; the broker only answers GitHub runners).

**Restore** — into a scratch database first, always. A backup that has
never been restored is a hypothesis, not a backup, and **no restore of
this project has ever been rehearsed** (`docs/handoff.md` §2.5). What
follows is derived from the flags the dump is actually taken with, not
from a run that happened: treat the first attempt as the rehearsal and
correct this section from what it does.

What the dump *is*: plain SQL, gzipped, `pg_dump --no-owner
--no-privileges --schema=public --schema=auth`. Note what is missing —
no `--clean`, no `--if-exists`, no custom format. Four consequences:

- It only ever CREATEs. Into a database that already holds those objects
  it fails on the first `CREATE TABLE`, so **the target must be empty**.
- `psql -f` on its own prints errors, carries on, and exits **0** — it
  cannot tell a restore from a pile of failures. `-v ON_ERROR_STOP=1` is
  what makes the exit code mean something. Never restore without it.
- `auth` is in the dump so her accounts and password hashes survive, but
  a Supabase project already owns an `auth` schema; loading this dump
  into a fresh project aborts on `auth.users`, and dropping Supabase's
  `auth` to make room takes GoTrue's grants with it (`--no-privileges`
  means the dump cannot put them back). Rehearse on plain Postgres;
  worst case in a real incident, restore `public` and recreate the two
  accounts by hand (§9).
- `--schema` also skipped anything those schemas depend on from outside
  them — extensions, roles. Expect the first run to stop on one of
  those. That is the rehearsal earning its keep, not a broken backup.

```bash
aws s3 cp s3://angus-backups/pg/angus-<stamp>.sql.gz . \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
gunzip angus-<stamp>.sql.gz

docker run --rm -d --name angus-restore -p 5433:5432 \
  -e POSTGRES_PASSWORD=x -e POSTGRES_DB=angus_restore postgres:17

psql "postgresql://postgres:x@localhost:5433/angus_restore" \
  -v ON_ERROR_STOP=1 -f angus-<stamp>.sql
echo "psql exit $?"   # 0 only if every statement applied
```

**Verify with exact counts, on both sides.** `pg_stat_user_tables.n_live_tup`
is an estimate and reads 0 on a freshly restored database until `analyze`,
so it cannot tell a full restore from an empty one. Run this against
production and against the restore, and diff the two outputs:

```sql
select table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', table_name),
                           false, true, '')))[1]::text::bigint as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

The restore is done when that diff is empty *and* `select count(*) from
auth.users` matches — not when `psql` finished.

**Restoring the files** is a copy in the other direction, keys unchanged:

```bash
aws s3 sync s3://angus-backups/files/ s3://angus-documents/ \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Every `r2_path` in the restored rows resolves again only after that sync.

**Her own copy** — Ajustes → Tus datos → **Descargar todo**
(`src/lib/exportAll.ts`) writes every workspace-scoped table as one JSON
file. It reads from the server, not from `AppContext`, because the stores
are capped and a backup of a subset is the most dangerous kind. It
records any table it could not read in `failed` and says so in the toast
rather than handing her a quiet partial.

It carries **rows, not bytes**: the `documents` / `note_attachments`
entries are metadata, and the photos themselves stay in R2. The file says
so in its own `contains` block and the UI says so in Spanish, because a
"copia completa" that quietly omits her photographs is worse than no
export at all. Bundling the bytes would need a zip writer; the nightly
mirror above is the file backup.

The CSVs in `lib/exportCsv.ts` are *reports* (a period, resolved names,
for an accountant), not backups. Don't confuse the two.

## 9. Gotchas (learned the hard way)

- Supabase rejects `@example.com` addresses; use real domains (plus-aliases are fine) for test accounts, then confirm via SQL: `update auth.users set email_confirmed_at = now() where email = '…';`
- PostgREST returns `numeric` as a string and `time` as `HH:MM:SS`. Normalize in `fromRow`.
- `button, a, select { min-height: 44px }` is global — a custom small button needs an explicit `min-height` (see `.topbar-avatar`).
- `text=Foo` in Playwright is a substring match: scope clicks (`nav >> text=Proyectos`) or you'll hit a KPI label.
- The Vercel MCP connector can read but not create projects; use the REST API with a **team-scoped** token (`VERCEL_TOKEN` in `.env.local`).
- Don't add `interactive-widget` to the viewport meta, don't stack two `backdrop-filter` surfaces, don't put `--cream*` on a page/sheet wrapper.
- Colors: rose (`--accent`) = interactive, teal = a state, never an action. Labels on an accent fill use `--accent-dark`, not `--accent`. Nothing in this palette is grey — don't add a hex, and don't `saturate()` a charcoal surface into one. Full rules in CLAUDE.md → Design system → Color semantics.
