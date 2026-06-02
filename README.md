# AI Finance

AI personal bookkeeping app scaffold.

## Stack

- Expo
- React Native
- React Native Web
- TypeScript

## Scripts

```bash
npm run start
npm run web
npm run android
npm run ios
npm run typecheck
npm run api:dev
npm run api:build
```

## Local Environment

Copy `.env.example` to `.env` when environment-specific values are needed.
Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for password login.
The old local demo bypass is off by default; only set `EXPO_PUBLIC_ENABLE_DEV_AUTH=true` together with backend `DEV_AUTH_ENABLED=true` when you intentionally want a development-only demo user.

## Backend

The NestJS API lives in `apps/api`.

```bash
cd apps/api
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run start:dev
```

The API uses PostgreSQL through Prisma. Configure `DATABASE_URL` before running migrations.
Business endpoints require a Supabase bearer token unless `DEV_AUTH_ENABLED=true` is explicitly set for local development.
