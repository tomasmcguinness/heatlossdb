---
id: HLDB-13
title: Download, account Save and My homes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-13T11:56:00Z'
updated_date: '2026-11-14T07:51:00Z'
labels: []
dependencies: []
type: feature
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The editor's Save only downloaded a file, so edits lived in the browser or in files the user had to keep. Users want Save to keep their edits with their account (sign-in required, so only they can see them), Download to keep the old one-file export, and a list of homes they've saved to come back to. The API had no auth yet (a follow-up from HLDB-8), so it now verifies Clerk session tokens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Download in the split button's menu saves one file with the scan and edits that reopens with them
- [ ] #2 Save stores the edits against the signed-in user; signed out, it opens Clerk sign-in and saves once signed in
- [ ] #3 Saving a scan opened from a file uploads it first and the address becomes /s/{id}
- [ ] #4 Opening a survey while signed in as its saver loads the saved edits
- [ ] #5 My homes in the account menu lists the user's saved homes, each opening its survey
- [x] #6 Saved homes are private: other users get 404s and an empty list; requests without a valid Clerk token get 401
- [x] #7 API tests cover the new endpoints; web build, lint and tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
See C:/Users/Tomas/.claude/plans/floorplan-rendering-is-terrible-quirky-mitten.md: JwtBearer for Clerk tokens; HomeStore (homes table + edits blobs); GET/PUT /api/me/homes[/{id}]; web authFetch + TokenBridge; share/homes.ts; ScanActions Save/Download; App loads saved edits; MyHomesPage at /homes; UserButton link.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
API: JwtBearer validates Clerk session tokens (HeatLossDB:ClerkIssuer; azp checked against ClerkAuthorizedParties; no issuer = every /api/me call is 401). HomeStore keeps a 'homes' table row per user+survey and the edits as a blob in 'edits' under sha256(userId)/{surveyId}.json. GET /api/me/homes, GET/PUT /api/me/homes/{surveyId}. 11 new API tests (SavedHomeTests) via an X-Test-User auth scheme; all 47 API tests pass against Azurite. Web: api.ts authFetch + TokenBridge; share/homes.ts; ScanActions Save (account) as main, Download in menu; useSavedEdits in App; /homes MyHomesPage; 'My homes' in the UserButton menu. tsc, oxlint, vite build pass; vitest passes except scan.test.ts (missing gitignored fixture). Not yet tried in a browser: needs ClerkIssuer set and the API restarted.

Added at the user's request: surveys rows get an OwnerId column (Clerk user id). PUT /api/me/homes/{id} (Save) claims it for the first saver via an ETag-conditional merge (SurveyStore.ClaimAsync); later saves by anyone leave it unchanged. Uploads stay anonymous, so OwnerId is empty until someone saves. Tests: AnUploadHasNoOwnerUntilSomeoneSavesIt, SavingAgainDoesNotChangeTheOwner (50/50 API tests pass).
<!-- SECTION:NOTES:END -->
