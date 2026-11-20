---
id: HLDB-21
title: Draw cavity wall insulation on the floor plan
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T17:51:00Z'
updated_date: '2026-11-19T19:35:00Z'
labels:
  - frontend
dependencies: []
type: feature
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Home fabric (and each room's own fabric) records whether the outside walls are a filled or unfilled cavity, but the floor plan draws every outside wall the same, so the answer can't be seen or checked against the plan. Showing the cavity, and whether it's insulated, makes the fabric visible where people look.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Outside walls answered 'Cavity, filled' are drawn about 27 cm thick outward from the room's inside face, with hatched insulation in the cavity
- [x] #2 Outside walls answered 'Cavity, not filled' are drawn the same thickness with the empty cavity shown
- [x] #3 A room's own outside-wall answer is used for its walls instead of the home's
- [ ] #4 Solid, timber frame, not sure, unset, internal and party walls are drawn as before
- [x] #5 Corners close, and doors and windows in cavity walls sit across the wall
- [x] #6 The legend explains the insulation and empty cavity when they are on screen
- [x] #7 Tests cover which room a wall belongs to, resolving the wall answer, and the cavity wall shapes
- [x] #8 The side view shows loft insulation under the roof, the outside walls' cavity (filled or empty) and floor insulation, when Home fabric says they're there, with legend entries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
See C:\Users\Tomas\.claude\plans\we-need-to-capture-shimmying-beacon.md: plan.ts walls get room/inside; home.ts cavityOf; editor/wallShapes.ts (pieceShape moved, cavityWallShapes); FloorCanvas cavityOf prop, hatch pattern, fp-cavities, mid-wall doors/windows; ScanEditor wiring and legend; CSS tokens; tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: plan.ts PlanWall.room/inside (probe 0.3 m either side of each wall's middle; a room on one side only). home.ts wallCavity(home, settings). editor/wallShapes.ts: pieceShape moved there; cavityWallShapes (0.10 leaf + 0.07 cavity + 0.10 leaf = 0.27 m, built outward from the inside face), cornersOf (outer corner: carry on past the end to close it; inner corner, e.g. an L-shaped house: stop at the corner, cavity cut back a leaf; no neighbour: square), gapOffset (doors/windows drawn mid-wall). FloorCanvas: optional cavityOf prop, hatch <pattern> in metres, fp-cavities layer. ScanEditor: cavityOf for role 'external' walls with a room (party walls excluded), legend 'Cavity insulation' / 'Empty cavity' when on screen. CSS --plan-insulation (light/dark). Tests: plan.test (room/side per wall), home.test (wallCavity), wallShapes.test (bands, flip, corners, gaps). tsc, oxlint clean; vitest 114 passed (scan.test.ts missing fixture as before). Browser on merged_3: Cavity filled -> hatched 27 cm walls, corners close, windows mid-wall; not filled -> empty gap; Room 6 own 'Cavity, filled' with home not filled -> only Room 6 hatched, legend shows both. AC 4 (solid/timber/not sure/internal/party unchanged) covered by unit tests and code path; not separately clicked through in the browser.

Fix (user report: outside walls ignored, bay walls messy): cavity walls are now decided per stretch, not per wall. plan.ts PlanWall.outside: OutsideStretch[] (t0, t1, room, inside), sampled every 0.1 m with probes at 0.15 then 0.3 m; stretches under 0.3 m dropped, split where the inside room changes, carried to the wall end when within 0.3 m of it (probes miss the room by corners). Replaces room/inside. Only a user-chosen internal/party role turns a stretch off (the automatic role is per whole wall and was wrong for walls part outside, e.g. the 13.6 m wall C0A4B87C along Room 1 and Rooms 2/5/6). wallShapes.splitPiece splits each piece at stretch boundaries (square there). Overview: home.ts homeInsulation (loft deep/shallow/null, walls, floor) only once applied; OverviewCanvas draws a loft band under the roof (8/16 px), cavity strips down the storeys' side walls, a floor band above the ground; legend entries. Tests: plan stretches (whole wall, split by room), splitPiece, homeInsulation. tsc, oxlint clean; vitest 120 passed. Browser on tidied merged_3: Room 1's long wall and Rooms 10-12 walls now cavity where outside; overview shows all three with legend. Note: the user's dev server and API on 5179/5080 stopped during the check; verified on a separate Vite on 5174.
<!-- SECTION:NOTES:END -->
