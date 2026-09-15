# Plan2Done

**Plan2Done is a daily goal + execution journal.** Instead of another to-do app, it centers on the gap between what you *planned* and what *actually happened* — then turns that difference into daily scores, weekly reviews, and long-term productivity insight.

Each day moves through three stages:

1. **Morning → Plan** — set goals with priority, expected time, and why the day matters.
2. **During the day → Execute** — update status, log actual time, capture unplanned work, note blockers, build a timeline.
3. **End of day → Reflect** — close the day with a guided reflection and get an auto-generated summary.

## Features

- **Multi-tenant accounts** — email/password auth (bcrypt + JWT), fully isolated per-user data
- **Interactive daily dashboard** — live progress %, composite daily score, editable "why today matters"
- **Goals** — priorities (🔴🟠🟡🟢), expected vs actual time, planned vs actual outcome, blockers, **subtasks**
- **Planned vs Actual** — the core comparison, per goal and per day
- **Daily score** — weighted blend of completion, priority focus, estimation accuracy, and reflection
- **Goal carry-forward** — move unfinished goals to another day *with a reason* (blocked, too large, etc.)
- **Unplanned work & timeline** — see why planned work slipped; planned/unplanned/actual totals
- **Daily Closure** — a guided end-of-day report that locks the day (still editable later)
- **Reality Check** — "you planned 7 goals but historically finish ~2/day"
- **Analytics** — weekly review, estimation-accuracy ("you underestimate by ~35%"), long-term averages, blocker breakdown, most-productive weekdays
- **Searchable history** — find past goals and outcomes; browse any day
- **Streaks** — a light planning streak, not heavy gamification
- **AI layer** — works offline with a heuristic engine; auto-upgrades to real Claude when an API key is present (daily summary, evening free-text → structured entries, "plan my tomorrow")

## Stack

- **Web:** Next.js (App Router, React 19) — `apps/web`
- **API:** Node.js + Express — `apps/api`
- **Database:** PostgreSQL (works great with [Neon](https://neon.tech))
- **ORM:** Prisma
- **Monorepo:** npm workspaces

## Quick start

### 1. Install

```bash
npm install --ignore-scripts
```

> `--ignore-scripts` avoids a Prisma auto-install loop in this workspace layout. The Prisma CLI is a root dev-dependency so client generation runs from the repo root.

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env`:

- `DATABASE_URL` — your Postgres connection string (pooled URL on Neon).
- `DIRECT_URL` — a **non-pooled** connection (Neon: the same host without `-pooler`). Prisma uses it for migrations.
- `JWT_SECRET` — set a strong random value (required for production).
- `ANTHROPIC_API_KEY` *(optional)* — enables real Claude AI features. Without it, the app uses a built-in heuristic engine.

### 3. Generate the client, migrate, seed

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

### 4. Run both apps

```bash
npm run dev
```

- Web → http://localhost:3000
- API → http://localhost:4000 (`/health` reports whether AI is enabled)

**Demo login:** `demo@plan2done.local` / `demopass123`

## Project structure

```
apps/
  api/                     Express + Prisma API
    prisma/
      schema.prisma        Data model + migrations
      seed.ts              Idempotent demo data
    src/
      lib/
        auth.ts            bcrypt/JWT + requireAuth middleware
        ai.ts              Heuristic + optional Claude AI
        scores.ts          Daily-score & narrative logic
      routes/
        auth.ts            register / login / logout / me
        dailyPlans.ts      Plans, goals, subtasks, carry-forward, closure, AI
        analytics.ts       Weekly / overview / estimation / streak
      prisma.ts            Prisma client with cold-start retry
      server.ts            App entry
  web/                     Next.js app
    app/
      lib/                 API client, auth context, types, usePlan hook
      components/          AppShell, GoalItem, ClosureDialog
      (login|register)/    Auth pages
      page.tsx             Dashboard (Today)
      history/, day/[date]/, analytics/
```

## Scripts (run from repo root)

| Script | What it does |
| --- | --- |
| `npm run dev` | Run web + API together |
| `npm run build` | Build both apps |
| `npm run prisma:generate` | Generate the Prisma client |
| `npm run prisma:migrate` | Create/apply a migration (uses `DIRECT_URL`) |
| `npm run seed` | Seed the demo account |

## Notes

- **Neon cold starts:** serverless computes suspend after inactivity, so the first query can fail while the pooler wakes the compute. This is handled with a longer connect timeout, a boot warm-up, and automatic retry of transient connection errors.
- **AI is optional and free by default.** Set `ANTHROPIC_API_KEY` only when you want the LLM-powered summaries and parsing.
