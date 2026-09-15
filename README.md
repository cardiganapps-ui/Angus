# Angus

Mobile-first planner PWA for an artist: projects, contacts/leads, and a unified schedule (classes, expos, deadlines, meetings, personal).

## Stack

React 19 + Vite + TypeScript, no UI library, Cardigan's CSS design system (tokens, Liquid Glass chrome, sheets), `vite-plugin-pwa`. Supabase for auth + data (RLS per user), Vercel for hosting. See `CLAUDE.md` for the rules.

## Commands

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL + publishable key
npm run dev                  # local dev server
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e -- <url>         # browser smoke test (E2E_EMAIL / E2E_PASS in .env.local)
```

Rules live in `CLAUDE.md`; recipes and the component catalog in `docs/playbook.md`.

## Roadmap

- v1 (this): Projects, Contacts/Leads, Schedule — synced, installable on phone
- v2: Sales + payment plans, expenses + investments, expo budgeting
- v3: recurring classes, documents/photos
