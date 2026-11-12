---
id: HLDB-8
title: Top-right sign in / sign up with Clerk magic links
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T17:44:00Z'
updated_date: '2026-11-12T17:45:00Z'
labels: []
milestone: m-0
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Clerk (@clerk/react) to the website: a Sign in button at the top right (topbar and editor header) opens Clerk's sign-in-or-up modal using email magic links; signed in shows Clerk's UserButton. Share dialog's Account step and API auth are follow-ups. Plan: C:/Users/Tomas/.claude/plans/how-will-the-matching-mellow-backus.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Sign in button shows at the top right of the topbar and the editor header when Clerk is configured
- [ ] #2 Sign in opens Clerk's modal; a magic link signs the user in or up
- [ ] #3 Signed in, the button becomes Clerk's UserButton with sign out
- [ ] #4 Without VITE_CLERK_PUBLISHABLE_KEY the site works as before and the button is hidden
- [x] #5 tsc, lint, tests and build pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added @clerk/react 6.18.3 (pinned; @clerk/clerk-react is deprecated, latest 6.18.6 was a day old). src/auth.ts reads VITE_CLERK_PUBLISHABLE_KEY and holds appearance variables mapped to the CSS tokens; main.tsx wraps App in ClerkProvider only when the key is set. AccountButton (Show signed-out -> SignInButton modal; signed-in -> UserButton) sits at the end of the topbar and of editor-status. .env.example documents the key. Verified: tsc, oxlint, vitest (scan.test.ts fixture still missing), vite build with and without a key. Not verified in a browser. Appearance uses CSS var() values: check the modal's colours in light and dark mode. Clerk dashboard setup needed: email address required, sign-in via email verification link only (no password or code), allowed origins incl. localhost:5179, Tomass-Mac-Studio.local:5179 and the azurewebsites URL.
<!-- SECTION:NOTES:END -->
