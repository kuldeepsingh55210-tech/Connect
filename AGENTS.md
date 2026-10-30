# AGENTS.md — AI Coding Agent Entry Point

You are working on **ConnectLocal**, a hyperlocal skill/interest-based
people-discovery app (React Native/Expo mobile + Node.js/Express API +
MongoDB). This file tells you how to orient yourself before making any change.

## Read In This Order

1. `docs/context/product.md` — what this app is and isn't, core loop, rules
2. `docs/context/architecture.md` — tech stack, folder structure, data model
3. `docs/context/decisions.md` — settled decisions; do not silently reverse these
4. `docs/context/current-state.md` — what's built, what's deferred, what's next
5. `docs/context/known-issues.md` — temporary/unsafe code that must not ship as-is
6. `docs/PRD.docx` and `docs/TRD.docx` — full original specs, for deep detail
   beyond what the context files summarize

## Operating Protocol For Every Task

```
1. Read the relevant context file(s) above
2. Inspect the actual current code for the module you're touching —
   code is the source of truth for implementation reality, context
   files may lag behind slightly
3. If context and code conflict, flag it — do not silently pick one
4. Scope the task to ONE module/feature — do not expand scope
5. State your plan before writing code if the change touches more
   than one file
6. Implement
7. Test — write/run a test script proving the exact scenarios asked for
8. Report results with actual output, not just "done"
9. If you introduced a temporary/incomplete implementation, mark it
   clearly: "// TEMPORARY — <what's missing> — see TRD Section X"
10. Update docs/context/current-state.md if you completed or started
    a module tracked there
```

## Hard Rules — Do Not Violate

- Never expose `dob`, `gender`, or `authId` in any API response to another user.
- Never display precise location — city name only, never distance or neighborhood (TRD 7.4 / PRD 10.4).
- Never let two users chat without an `accepted` Connection between them.
- Never add a skill/interest tag outside `src/config/vocabulary.js`'s controlled list.
- Never modify `dob` or `gender` via the profile PATCH route once set.
- Never ship the current dev-auth (`POST /api/auth/dev-login`) to production — it has no real verification. See `known-issues.md`.
- Never add a new dependency if the existing stack already solves the problem.
- Never rewrite a working module "for cleanliness" without being asked.
- One module/feature per task. Do not bundle unrelated fixes together.

## When You Don't Know Something

Say `[UNKNOWN]` or ask, rather than inventing an answer. This project has
a real product spec (PRD) and technical spec (TRD) — check there first.
