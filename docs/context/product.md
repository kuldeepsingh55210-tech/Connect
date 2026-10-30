# Product Knowledge — ConnectLocal

*(Summary of docs/PRD.docx — read the full PRD for detail beyond this)*

## What This Is

A platform that connects people with the **same skills or interests** who
live in the **same city**, so they can meet, collaborate, or build
relationships in real life. Chat only unlocks after **mutual opt-in**.

## What This Is NOT

- Not an AI-matching platform (no ML, no score — see `decisions.md`)
- Not a dating app (though "Dating" is one of 8 selectable intents)
- Not a swipe-card app
- Not a public social feed (no posts, no likes, no followers)

## Core Loop

```
Discover → Shared Skill/Interest → Mutual Connect → Chat → Real-world relationship/activity
```

## Target Users

18+ only. At signup, users pick one or more **intents**:
Friendship, Networking, Startup/Business, Sports, Gaming, Hobbies, Dating, Study.

## The 7 Screens (MVP Scope — all built)

1. Landing
2. Signup (name, DOB, gender, city)
3. Create Profile (photo, skills, interests, intent, about)
4. Discover (tiered matching feed)
5. Profile View (another user's profile)
6. Connections (Requests / Connected / Sent tabs)
7. Chat (1:1 text messaging)

## Matching Model (No AI, No Score — Tier-Based)

- **Tier 1**: same city AND ≥1 shared skill/interest (hard city filter)
- **Tier 2**: shared skill/interest, any other city
- **Tier 3**: second-degree network suggestions (via mutual connections) —
  **not yet built**, deferred until after Connections existed
- Within a tier: sort by shared-count desc, then last-active desc
  (never shown to the user as a visible score)

## Non-Negotiable Safety Rules

- 18+ age gate, enforced server-side before profile creation
- Mutual connect required before any chat is possible
- City-level location only — **never** distance-in-km or neighborhood name
- Report → 3 open reports auto-hides a user pending review
- Rate limits: 20 connect requests/day, 10 reports/day per user
- No exact phone/email exposed between users

## Launch Strategy (from PRD, not yet executed)

- Single city first (not pan-India), ~100 users, invite-curated for
  balanced gender ratio
- No monetization until core loop is validated
- Full metrics targets are in PRD Section 2

## Full Spec

See `docs/PRD.docx` for complete detail, launch metrics, and Phase 2 roadmap
(AI matching, events, communities, premium — all explicitly out of MVP scope).
