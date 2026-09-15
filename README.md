# Angus

Mobile-first planner PWA for an artist: projects, contacts/leads, and a unified schedule (classes, expos, deadlines, meetings, personal).

## Stack

React 19 + Vite + TypeScript, no UI library, custom CSS design tokens, `vite-plugin-pwa`. Data is local-only for now (localStorage) — Supabase sync for cross-device access is planned next.

## Commands

```bash
npm install
npm run dev       # local dev server
npm run build     # production build
npm run lint       # eslint
```

## Roadmap

- v1 (this): Projects, Contacts/Leads, Schedule — local-only, installable on phone
- v2: Supabase backend (auth + sync across devices)
- v3: Sales, payment plans, expenses, investments, expo budgeting
