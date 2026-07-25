# Camel971

Closed-wallet telesales shop with website checkout and dual Telegram bots.

## Stack

- Next.js 16 + React 19
- Prisma 7 + PostgreSQL
- Grammy (Telegram long-polling)

## Local setup

1. Copy env and fill tokens:

```bash
cp .env.example .env
```

Required vars: `DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_BOT_1_TOKEN`, `NEXT_PUBLIC_SITE_URL`.

2. Start Postgres (example with Docker):

```bash
docker run -d --name safari-postgres \
  -e POSTGRES_USER=safari_user \
  -e POSTGRES_PASSWORD=safari_pass \
  -e POSTGRES_DB=safari_db \
  -p 5434:5432 postgres:16-alpine
```

Then set:

```env
DATABASE_URL="postgresql://safari_user:safari_pass@127.0.0.1:5434/safari_db"
```

3. Push schema and seed:

```bash
npx prisma db push
npm run seed
```

Seeded logins:

| User     | Password    | Role            |
| -------- | ----------- | --------------- |
| admin    | admin123    | SUPERADMIN      |
| staff    | staff123    | STAFF           |
| customer | customer123 | CUSTOMER ($500) |

4. Run **one** process (for both web and bots):

```bash
npm run dev    # website + telegram bots (bots start automatically)
```

- Shop / dashboard: http://localhost:3000
- Admin panel: http://localhost:3000/control-panel-x7k9
- Telegram: open your bot and send `/start`

## Scripts

| Script                        | Purpose                         |
| ----------------------------- | ------------------------------- |
| `npm run dev`                 | Next.js website                 |
| `npm run bots`                | Telegram long-polling worker    |
| `npm run seed`                | Seed users, products, inventory |
| `npm run reset-db`            | Reset DB and recreate admin     |
| `npm run build` / `npm start` | Production web                  |

`render.yaml` defines:

- `safari-web` — website + admin + Telegram bots (all in one process)
- `safari-db` — Postgres

Set `TELEGRAM_BOT_1_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, and `NEXT_PUBLIC_SITE_URL` in the Render dashboard (`sync: false` vars).
