# Ledger AI API

NestJS + Prisma backend for the AI personal finance manager.

## Local setup

```bash
cd apps/api
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run start:dev
```

All business endpoints require:

```http
Authorization: Bearer <supabase_access_token>
```

`GET /health` is public.
