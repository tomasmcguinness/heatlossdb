---
id: HLDB-19
title: Tidy a scan's floor plan on the server when asked
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T15:01:00Z'
updated_date: '2026-11-19T16:54:00Z'
labels:
  - backend
  - scan
dependencies: []
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LiDAR scans stitched by RoomStitch come out wonky: each storey sits at an arbitrary angle, partitions appear as two parallel faces with a gap, fitted wardrobes leave voids, the perimeter has holes, upper floors overhang the floor below and some rooms don't have a closed boundary. Prototyped in Python against a real two-storey scan (merged_3.json) and agreed to run it server side in the API, triggered by a button rather than on upload. The raw scan must stay exactly as uploaded; the tidied version is derived and can be regenerated whenever the rules improve. Changes the user should confirm (inferred walls, stacking moves over 5 cm, faces left unaligned, rooms still open) are flagged for review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/surveys/{id}/tidy tidies the stored scan and returns a summary and a change log; 404 for an unknown survey
- [x] #2 The uploaded scan is never modified; the tidied scan is stored separately and served by GET /api/surveys/{id}/scan/tidied (404 until tidied)
- [x] #3 Tidying always starts from the raw scan, so running it twice gives the same geometry
- [x] #4 The tidied scan keeps the CapturedStructure format and every field the tidier doesn't change
- [x] #5 On merged_3.json every room has a closed boundary, upper perimeter faces sit on the walls below within 5 mm, the doubled partition between the left bedrooms is one wall, and the front bedroom's wardrobe void is part of the room
- [x] #6 Each change records the walls involved, the distance in mm and whether it needs review
- [x] #7 Tests cover the tidy rules without needing Azurite
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New class library Api/HeatLossDB.ScanTidy (net10.0, no package dependencies): wraps the CapturedStructure JSON in place (JsonNode) so untouched fields pass through; steps as passes run in order: orient (rotate storey, snap within 8°), perimeter (straighten faces, fill holes whose ends are both loose), storey stack (align upper storey, stack faces within 30 cm, pin them), interior (merge lines, collapse partition pairs into one wall with thickness, join corners), fitted storage (absorb 0.4–0.75 m voids, keep as storage object), room closure (flood-fill from room labels, extend wall ends ≤1 m to seal leaks). Ported from the Python prototype.
2. Structured change log (walls, mm, needs review) and summary.
3. API: POST /api/surveys/{id}/tidy reads the raw scan, tidies it, stores {id}.tidied.json in the scans container (the tidied scan carries a heatlossdbTidy block with version, time, summary and changes), returns summary and changes. GET /api/surveys/{id}/scan/tidied serves it. Raw {id}.json never written.
4. Tests: new HeatLossDB.ScanTidy.Tests project with merged_3.json as test data (no Azurite needed); check output against the Python prototype; add an endpoint test to the existing Api tests.
5. Add both projects to HeatLossDB.sln; document in Api/README.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (Linux, .NET SDK 10.0.115, packages from the local NuGet cache, Azurite 3.37.0 in memory): dotnet build HeatLossDB.sln -c Release: 0 errors (the one warning, TestUser.Scheme hiding a member, was already there). dotnet test HeatLossDB.sln: HeatLossDB.ScanTidy.Tests 19/19 passed; HeatLossDB.Api.Tests 56/56 passed (52 existing + 4 new tidy endpoint tests).
AC evidence: #1 TidyingKeepsTheUploadAsItIsAndStoresTheTidiedScanBesideIt, TidyingAnUnknownSurveyIsNotFound. #2 same test: tidied 404 before tidying, raw scan byte-identical afterwards. #3 TidyingAgainStartsFromTheUploadSoGivesTheSameResult (API) and TidyingTwiceGivesTheSameGeometry (real scan). #4 LeavesTheInputAloneAndKeepsFieldsItDoesNotUse; on merged_3.json every door, window, opening, object and floor transform matches the Python prototype to 1e-15 and no top-level key is lost. #5 RealScanTests: EveryRoomHasAClosedBoundary, UpstairsOutsideWallsSitOnTheWallsBelow (< 5 mm, 5+ faces checked), TheDoubledPartitionBetweenTheLeftBedroomsIsOneWall (203 mm), TheFrontBedroomsWardrobeGapIsPartOfTheRoom (640 mm). Confirmed they read the fixture: with a broken merged_3.json all six fail. #6 ChangesSayWhichWallsMovedHowFarAndWhichNeedAPersonToCheck. #7 HeatLossDB.ScanTidy.Tests has no storage dependency.
Port check: on merged_3.json the C# output matches the Python prototype wall for wall (max endpoint difference 0.0 mm), with the same change log.
Decisions: tidied scan stored as {id}.tidied.json in the scans container; IScanStorage gained SaveTidiedAsync/OpenTidiedAsync. The real scan lives in Web/fixtures (gitignored) like the other real-scan fixtures. Faces more than 1 m from anything below are logged as NothingBelow rather than over tolerance. Wall extensions longer than the 25 cm corner tolerance are flagged for review.
Not done (outside this task): the website's Tidy button and showing the change log there.

Fix (2026-11-19, found from the website's Floor plan preview): the tidier turned and shifted each storey's top-level surfaces but not rooms[], each scanned room's own copy of its surfaces in the same world frame (34 shared wall ids on merged_3.json, median 1 mm apart). The website takes storey outlines and room shapes from rooms[] floors and adds infill walls where no wall runs along that outline, so the tidied plan drew walls turned 42 degrees over unturned rooms, with a ring of infill walls, and lost windows (16 to 9). ScanPlan now wraps rooms[] (ScanRoom) and ApplyToStorey moves its surfaces, labels and referenceOriginTransform with the storey. Per-wall nudges (snap within 8 degrees, stacking within 30 cm) aren't copied; within the website's 25 cm tolerance. ScanTidier.Version bumped to 2. Tests: TurnsTheScannedRoomsWithTheirStorey (synthetic) and TheScannedRoomsStayOnTheTidiedWalls (merged_3, compares at least 20 walls: within 8.5 degrees and 0.35 m). ScanTidy 21/21, Api 70/70. Checked in the website: tidied merged_3 draws square, rooms inside the walls, 8 windows/3 doors ground floor and 8 windows/2 doors first floor, as the original.

Stray walls (2026-11-19, user request from the tidied preview): new StrayWallPass after fitted storage, before room closure. Removes angled walls (more than 8 degrees off square) under StrayWallMaxLength (0.6 m) with no doors/windows/openings that either have an end meeting no wall (ConnectTolerance 0.25 m), or lie along one wall: both ends within 0.25 m of it, at least one part-way along it rather than at its ends, and within 45 degrees of it. Runs after interior because a partition's second face sits by a stray's end until merged. Logged as StrayWallRemoved (not needsReview). On merged_3 removes exactly B29DEE44 (434 mm across the first-floor bedroom doorway) and 3B4A9F2B (318 mm by the ground-floor hall); all four bay walls stay, every room still closed, 59 to 53 walls. ScanTidier.Version 3. Tests: RemovesAStrayAngledBitOfWallButNotOneThatJoinsWalls (loose-end stub, door-leaf stub, corner splay kept), StrayBitsOfWallGoButTheBaysStay (merged_3). ScanTidy 23/23, Api 70/70. Checked in the website on the tidied merged_3.

Room floors (2026-11-19, user report: a stub poking out where the first-floor partition meets the outside wall, and a room floor extending past the outside walls). Cause: per-wall moves (the 225 mm stacking of the back bedroom's outside wall) moved the walls but not rooms[]; the room's floor ran 230 mm past the wall, so the website added an infill wall to close its outline. New final RoomFloorPass: rooms[] copies of walls/doors/windows/openings take the tidied transform and dimensions (by id); corners of room floors and storey floors within PerimeterStackTolerance (0.30 m) of a straight tidied wall (and within ConnectTolerance of its span) snap onto it, per axis. Logged as FloorsLinedUp per storey (merged_3: 66 and 57 corners, up to 273 and 235 mm). Mat4.InverseRigid added. ScanTidier.Version 4. Tests: LinesTheScannedRoomsFloorsUpWithTheWalls (synthetic), NoRoomsFloorReachesPastTheOutsideWalls (merged_3). The website now adds no infill walls to the tidied merged_3 (it added one before). ScanTidy 25/25, Api 70/70, Web 93 passed. Checked both floors in the website.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds server-side tidying of LiDAR scans. New class library Api/HeatLossDB.ScanTidy (no package dependencies) runs six passes in order: orient, perimeter, storey stacking, interior, fitted storage and room closure. It returns a tidied CapturedStructure plus a structured change log (walls, mm, needsReview). The API gains POST /api/surveys/{id}/tidy, which always tidies the raw upload, stores {id}.tidied.json beside it and returns {summary, changes}, and GET /api/surveys/{id}/scan/tidied. The uploaded scan is never modified. Ported from the Python prototype and matched against it on merged_3.json. Tests: 19 new library tests (synthetic rules, plus the real house when Web/fixtures/merged_3.json is present) and 4 new endpoint tests; the whole solution passes (75 tests). Risks and follow-ups: tolerances are tuned on one house; floor outline polygons and rooms[] aren't rebuilt from the moved walls; tidying runs on the request thread (median 90 ms, max 144 ms for merged_3.json); the website button isn't built yet.
<!-- SECTION:FINAL_SUMMARY:END -->
