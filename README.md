# Plan2Done

Plan2Done is a Daily Goal + Execution Journal. It helps compare what you planned against what actually happened, then turns those differences into daily and weekly insight.

## Stack

- Next.js frontend
- Node.js + Express API
- PostgreSQL
- Prisma ORM

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the API database:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

3. Update `DATABASE_URL`, then run:

   ```bash
   npm run prisma:migrate
   npm run seed
   npm run dev
   ```

The frontend runs on `http://localhost:3000` and the API runs on `http://localhost:4000`.
