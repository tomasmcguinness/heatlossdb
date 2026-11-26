---
id: HLDB-23
title: 'Admin portal: list all surveys and open read-only'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-26T15:37:00Z'
updated_date: '2026-11-26T15:42:00Z'
labels: []
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Admins can't currently see the surveys people upload: uploads are anonymous and the only listing is per user. An admin (Clerk public metadata isAdmin: true) needs an Admin portal in the user menu that lists every uploaded survey and opens each in the read-only viewer used for shared homes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin portal appears in the user menu only for accounts with isAdmin true
- [x] #2 /admin lists every uploaded survey, including unowned ones
- [ ] #3 Each survey opens read-only at /admin/s/{id} with its owner's saved edits when there are any
- [x] #4 Admin API refuses signed-out (401) and non-admin (403) callers
- [x] #5 API and web tests cover the admin check and endpoints
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API: Admin.cs (IsAdmin from metadata claim, RequireAdmin filter); SurveyStore.AllAsync; HomeStore.NamesBySurveyAsync; /api/admin/surveys and /api/admin/surveys/{id}. 2. API tests AdminTests. 3. Web: isAdminMetadata + useAccount.isAdmin; Admin portal menu link; admin/admin.ts client; AdminPage list; AdminSurveyPage reusing SharedHomeView; App routes /admin and /admin/s/{id}. 4. dotnet test, npm test, npm run build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
API: Admin.cs (IsAdmin parses Clerk public metadata isAdmin === true from the session token metadata claim; RequireAdmin filter), GET /api/admin/surveys and /api/admin/surveys/{id} (owner's saved edits, or null edits when unsaved; scan via existing /api/surveys/{id}/scan/current). Web: isAdminMetadata + useAccount.isAdmin, Admin portal menu item, /admin list (AdminPage), /admin/s/{id} read-only viewer (AdminSurveyPage reusing exported SharedHomeView with a status prop). Verified: 13 new AdminTests + full API suite pass (against a separate Azurite with --skipApiVersionCheck, since the VS Azurite 3.29 rejects the SDK API version); vitest passes apart from pre-existing scan.test.ts (missing gitignored fixture); tsc/vite build and oxlint clean. Not yet verified in a browser: menu item and viewer rendering need a Clerk user with isAdmin set.
<!-- SECTION:NOTES:END -->
