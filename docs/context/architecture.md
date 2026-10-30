# Architecture — ConnectLocal

*(Summary of docs/TRD.docx — read the full TRD for detail beyond this)*

## Repo Structure

```
connecto/
├── docs/
│   ├── PRD.docx, TRD.docx, backend-schema-reference.pdf
│   └── context/            ← this folder
├── AGENTS.md
└── apps/
    ├── mobile/              Expo (React Native), TypeScript
    └── api/                 Node.js + Express + Mongoose
```

No `apps/web` yet — mobile-only decision, see `decisions.md`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Expo (React Native), TypeScript, React Navigation |
| Backend | Node.js + Express |
| Database | MongoDB Atlas (Mongoose ODM) |
| Realtime | Socket.io (single instance, no Redis adapter yet) |
| Auth | **Temporary dev-auth** — see `known-issues.md`. Real auth = Firebase (phone OTP + Google), not yet wired |
| Images | Cloudinary (upload wired; moderation add-on NOT enabled — paid, deferred) |
| Testing | Node scripts in `apps/api/scripts/*.js`, run via `npm run test:<module>` |

## Backend Modules (`apps/api/src/modules/`)

- `auth` — dev-login only right now (temporary)
- `profile` — create/get/patch profile, photo upload
- `discover` — Tier 1 + Tier 2 matching (Tier 3 not built)
- `connections` — request/accept/ignore/unmatch/block state machine
- `chat` — REST + Socket.io messaging
- `trust-safety` — reports, auto-hide, admin review endpoints

## Data Model (`apps/api/src/models/`)

- `User.js` — profile fields, `authId` (currently stores phone as placeholder), `skills`/`interests` (controlled vocabulary only), `status` enum, rate-limit counters
- `Connection.js` — sorted `(userA, userB)` pair, `status` enum (pending/accepted/ignored/unmatched/blocked), static helpers `sortedPair()` and `otherUserId()`
- `Message.js` — keyed by `connectionId`
- `Report.js` — `AUTO_HIDE_THRESHOLD = 3` static

Controlled vocabulary lives in `apps/api/src/config/vocabulary.js` — skills
and interests are NEVER free text, always validated against this list.

## API Base

`http://<LAN_IP>:4000/api` in dev. No production URL yet.

## Key Endpoints (see TRD Section 6 for full list)

- `POST /api/auth/dev-login` — temporary, phone-only, no OTP
- `POST /api/users`, `GET /api/users/me`, `PATCH /api/users/me`, `GET /api/users/:id`
- `POST /api/users/me/photo` — Cloudinary upload
- `GET /api/discover`
- `POST /api/connections`, `GET /api/connections?status=`, `PATCH /api/connections/:id`, `POST /api/connections/block`
- `GET/POST /api/connections/:id/messages` + Socket.io events (`thread:join`, `message:send`, `message:new`, `message:read`)
- `POST /api/reports`, `GET/PATCH /api/admin/reports/*` (protected by `x-admin-key` header — temporary)

## Mobile Screens (`apps/mobile/src/screens/`)

All 7 built: `LandingScreen`, `SignupScreen`, `CreateProfileScreen`,
`DiscoverScreen`, `ProfileViewScreen`, `ConnectionsScreen`, `ChatScreen`.
Navigation in `src/navigation/RootNavigator.tsx`. API client in
`src/api/client.ts` (or `src/services/api.ts` — verify exact filename in code).

## Design Reference

`document/oryqfruntend/design-*` folders contain Stitch-generated visual
references for each screen (renamed from `stitch_1..7`). Color palette:
warm terracotta/coral primary, deep teal secondary, cream background —
see `design-*/DESIGN.md` per screen for exact tokens.

## Full Spec

See `docs/TRD.docx` for complete API contracts, schema field types,
indexes, and non-functional requirements.
