---
id: HLDB-22
title: Shareable read-only link for a home's scan and room heat loss
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-20T07:03:00Z'
updated_date: '2026-11-20T07:15:00Z'
labels: []
dependencies: []
references:
  - Web/src/components/share/ShareDialog.tsx
  - Api/HeatLossDB.Api/Program.cs
type: feature
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owners want to share their scan online with a dedicated link. The only link today is the editor's /s/<surveyId>, which is not safe to hand out: it opens the full editor, several survey endpoints it uses (share, heat-pump, profile, tidy) accept changes without sign-in, it shows the scan as uploaded rather than the owner's saved edits (those are private to the owner's account), and it shows real room names regardless of the owner's room-name choice (HLDB-2). A shared home needs its own link that only reads a snapshot of what the owner chose to share.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sharing a home gives the owner a dedicated link, separate from the editor's /s/ link, shown in the Share dialog with a Copy button
- [ ] #2 The link's id is random and different from the survey id, so it cannot be used to reach the editor or change the survey
- [ ] #3 Anyone with the link, signed in or not, sees a read-only page with the floor plan and each room's details: floor area, heated or not, design temperature, reported heat loss and W/m², air changes and fabric
- [ ] #4 The page shows the owner's edits as they were when shared; sharing again updates what the link shows
- [ ] #5 Room names are replaced by Room 1, Room 2... unless the owner allowed room names; the full postcode, address and email are never included
- [ ] #6 An unknown or malformed link shows a not-found message rather than an error
- [ ] #7 API and web tests cover creating the share, reading it anonymously, room-name hiding and unknown links
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API: PUT /api/me/homes/{surveyId}/share-link (signed in). Needs the home shared (survey Share details) and saved by this user, and refuses anyone but the survey's owner. Snapshots the user's saved edits (room names removed unless shareRoomNames) and a copy of the survey's current floor plan into a 'shares' blob container under a new random 22-char share id. The id is kept on the survey row (ShareLinkId), so sharing again re-snapshots under the same link. Returns { id, url } with url /h/{id}.
2. API: GET /api/shared/{shareId} (name, sharedAt, edits) and GET /api/shared/{shareId}/scan, both anonymous, 404 for unknown or malformed ids.
3. Web: Share dialog saves the home to the account, then submits share details, then creates the link. Done shows the link with Copy and Update link; the link is remembered in the tab's share record.
4. Web: /h/{id} renders SharedHomePage outside the fabric store (the store autosaves to localStorage), using the pure editorFloors() with the canvases in a read-only mode: Overview and floor tabs, plus a room details panel (area, heated, design temp, heat loss, W/m2, air changes, fabric).
5. Tests: API tests for creating, re-sharing, anonymous reads, name stripping, owner and unknown links; web tests for the redaction-free page model and path parsing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
API done: SharedHomeStore (shares container, {id}/home.json + {id}/scan.json), SharedHomes.Snapshot strips rooms.*.name unless shareRoomNames, SharedHomes.Scan drops any embedded edits. PUT /api/me/homes/{surveyId}/share-link (owner only; 409 until share details given and home saved; ShareLinkId kept on the survey row so re-sharing keeps the link). GET /api/shared/{id} and /api/shared/{id}/scan anonymous, 404 for unknown/malformed. SharedHomeTests: 9 pass; full API suite 79/79. Run against Azurite 3.35 (npx, --skipApiVersionCheck, ports 11000-11002 via HEATLOSSDB_TEST_STORAGE): the Azurite on 10000 is 3.29 and rejects the SDK's API version, failing every API test.

Web done: share/sharedHome.ts (shareIdFromPath, createShareLink, loadSharedHome, sharedFloors built outside the fabric store since the store autosaves to localStorage, roomFacts, reportedTotals). SharedHomePage at /h/{id} (App routes before the editor app): Overview + floor tabs, read-only canvases (new readOnly prop on FloorCanvas/OverviewCanvas hides rename and the owner's Checked marks), room panel with area, heated, design temp, heat loss, W/m2, air changes, walls/loft/floor/windows ('This room' where the room differs). Share dialog: submitShare now saves to account, gives share details, then creates the link; done step shows the link with Copy and 'Update link with my latest changes' (or 'Get a link' for homes shared before links). tsc + oxlint clean; vitest 128 passed (scan.test.ts fails as before: missing fixtures/MergedRooms_8.json). Not yet verified in a browser: the connected Chrome couldn't reach this PC's localhost. A seeded share (merged_3.json) is served at http://localhost:5199/h/BrowserCheckShare00000 by the new API build on 5081 + test Azurite on 11000-11002.
<!-- SECTION:NOTES:END -->
