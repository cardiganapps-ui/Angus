# Angus

Mobile-first planner PWA for an artist: projects, contacts/leads, and a unified schedule (classes, expos, deadlines, meetings, personal).

## Stack

React 19 + Vite + TypeScript, no UI library, Cardigan's CSS design system (tokens, Liquid Glass chrome, sheets), `vite-plugin-pwa`. Supabase for auth + data (RLS per user), Vercel for hosting. See `CLAUDE.md` for the rules.

## Commands

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL + publishable key
npm run dev                  # local dev server
npm run build                # typecheck + production build
npm run lint                 # eslint
```

## Roadmap

- v1 (this): Projects, Contacts/Leads, Schedule — synced, installable on phone
- v2: Sales + payment plans, expenses + investments, expo budgeting
- v3: recurring classes, documents/photos
