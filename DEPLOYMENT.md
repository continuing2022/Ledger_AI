# Deployment Guide

This project deploys in this order:

1. Create Supabase project and PostgreSQL database.
2. Deploy the NestJS API from `apps/api`.
3. Configure Expo/EAS production environment variables.
4. Build and submit the iOS app with EAS.

## 1. Supabase

Create a Supabase project and copy:

- Project URL: `https://YOUR_PROJECT.supabase.co`
- Anon/public key
- Database connection string

Backend auth values:

```env
SUPABASE_JWKS_URL=https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://YOUR_PROJECT.supabase.co/auth/v1
```

Frontend auth values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 2. Backend API

The backend lives in `apps/api`.

Production build commands:

```bash
npm ci
npx prisma generate
npm run build
```

Production migration command:

```bash
npm run prisma:migrate:deploy
```

Production start command:

```bash
npm run start
```

Required backend environment variables are listed in `apps/api/.env.production.example`.
On Render, do not hard-code `PORT`; Render injects it automatically. The API binds to `0.0.0.0` so Render can route public traffic to the service.

After deploying, verify:

```bash
curl https://YOUR_API_DOMAIN/health
```

The mobile app API base URL must include the global API prefix:

```env
EXPO_PUBLIC_API_BASE_URL=https://YOUR_API_DOMAIN/api
```

## 3. EAS Environment

Install and log in:

```bash
npm install -g eas-cli
eas login
```

Create production environment variables:

```bash
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR_API_DOMAIN/api --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_SUPABASE_ANON_KEY --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_ENABLE_DEV_AUTH --value false --visibility plaintext
```

## 4. iOS App

Before the first production build, confirm `app.json` has a unique iOS bundle identifier:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.ledgerai.finance",
  "buildNumber": "1"
}
```

If Apple says the bundle identifier is taken, replace it with your own reverse-domain identifier.

Build:

```bash
npm run eas:build:ios
```

Submit the latest successful build:

```bash
npm run eas:submit:ios
```

Use EAS automatic Apple credential management unless you already have certificates and provisioning profiles.
