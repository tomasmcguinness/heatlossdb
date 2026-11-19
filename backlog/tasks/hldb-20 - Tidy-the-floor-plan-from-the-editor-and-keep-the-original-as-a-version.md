---
id: HLDB-20
title: Tidy the floor plan from the editor and keep the original as a version
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T15:58:00Z'
updated_date: '2026-11-19T16:14:00Z'
labels:
  - backend
  - frontend
  - scan
dependencies:
  - HLDB-19
type: feature
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
HLDB-19 added server-side tidying, but nothing on the website runs it and the website always opens the raw upload. Owners need to run the tidy themselves, look at the result, and only make it their floor plan if they're happy with it. The tidier is new and tuned on one house, so the original scan must always stay available as a version they can return to. The tidier changes element ids (merged and inferred walls), so edits have to be carried across deliberately when the plan changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The editor's actions menu has a Floor plan item that runs the tidy on a survey and previews the tidied plan beside the current one, with the summary and the changes that need checking
- [x] #2 Use tidied plan makes the tidy the survey's current floor plan; Keep current plan changes nothing
- [x] #3 The original upload is never changed and is always listed as a version; the owner can switch back to it and back to the tidy
- [x] #4 Opening a survey link opens its current floor plan; re-tidying doesn't change the current plan until it is accepted again
- [x] #5 Switching plans keeps Home fabric, room settings and the settings of elements that still exist; storey alignment from another plan isn't applied
- [x] #6 Once a survey has an owner, only they can change its current floor plan
- [x] #7 API and website tests cover versions, accepting, switching back, ownership and carrying edits across
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
API: CurrentScan/TidiedAcceptedAt/TidierVersion on SurveyEntity; {id}.accepted.json snapshot; GET scan/current (X-Floorplan-Version), GET versions, POST tidy/accept, PUT versions/current, owner-only once owned. Web: loadSurvey opens scan/current; importFabric applies alignment only for the same scan hash; switchScan carries edits; homeKey (survey:id or first hash) keys the page, saved-edits reload and share status so they survive a plan switch; scan/versions.ts; editorFloors/boundsOf split out of the editor; FloorPlanDialog from the actions menu (versions list, tidy preview with Current/Tidied toggle and storey tabs, summary, changes to check, Use tidied plan / Keep current plan).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
API: tidy/accept copies the latest preview to {id}.accepted.json, so PUT versions/current {tidied} restores the accepted tidy, not a newer unaccepted preview (split from the planned single PUT after spotting that). Owner check shared by both mutating endpoints. Test harness: HEATLOSSDB_TEST_STORAGE overrides the Azurite connection string (this machine's 10000/10002 are taken by the AWS toolkit and VS DevHub). Web: homeKey added because the page, saved-edits reload and share status were keyed by scan hash, which changes on switching plans (accepting dropped the user back to What next, and signed-in users would have had saved edits re-imported over the carried edits).

Verified: dotnet test HeatLossDB.sln -c Release against Azurite on 20000/20002: ScanTidy 19/19, Api 70/70 (11 new in FloorplanVersionTests). Web: tsc -b, oxlint clean; vitest 93 passed (scan.test.ts fails on the missing MergedRooms_8.json fixture, as before). Browser (second API on 5081 + Vite on 5174, merged_3.json): renamed a room, Floor plan > Tidy showed 59 walls -> 55 · 32 changes · 6 to check · every room closed with both plans drawn; Use tidied plan stayed in the editor with the rename kept; reload opened the tidied plan; versions list showed both; Use this on Original switched back; GET /scan byte-identical to the upload.

Found, not fixed (tidier, HLDB-19 follow-up): the tidier rotates/moves top-level walls and floors but leaves rooms[] (each room's own surfaces, which the website uses for room shapes and window/door assignment) untouched. On merged_3.json the tidied plan draws rotated walls over unrotated rooms, and windows assigned to rooms drop from 16 to 9. Accepting a tidy is reversible, but the tidied plan isn't usable until the tidier transforms rooms[] too.
<!-- SECTION:NOTES:END -->
