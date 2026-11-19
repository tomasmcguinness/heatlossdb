---
id: HLDB-21
title: Draw cavity wall insulation on the floor plan
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T17:51:00Z'
updated_date: '2026-11-19T17:55:00Z'
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
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
See C:\Users\Tomas\.claude\plans\we-need-to-capture-shimmying-beacon.md: plan.ts walls get room/inside; home.ts cavityOf; editor/wallShapes.ts (pieceShape moved, cavityWallShapes); FloorCanvas cavityOf prop, hatch pattern, fp-cavities, mid-wall doors/windows; ScanEditor wiring and legend; CSS tokens; tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: plan.ts PlanWall.room/inside (probe 0.3 m either side of each wall's middle; a room on one side only). home.ts wallCavity(home, settings). editor/wallShapes.ts: pieceShape moved there; cavityWallShapes (0.10 leaf + 0.07 cavity + 0.10 leaf = 0.27 m, built outward from the inside face), cornersOf (outer corner: carry on past the end to close it; inner corner, e.g. an L-shaped house: stop at the corner, cavity cut back a leaf; no neighbour: square), gapOffset (doors/windows drawn mid-wall). FloorCanvas: optional cavityOf prop, hatch <pattern> in metres, fp-cavities layer. ScanEditor: cavityOf for role 'external' walls with a room (party walls excluded), legend 'Cavity insulation' / 'Empty cavity' when on screen. CSS --plan-insulation (light/dark). Tests: plan.test (room/side per wall), home.test (wallCavity), wallShapes.test (bands, flip, corners, gaps). tsc, oxlint clean; vitest 114 passed (scan.test.ts missing fixture as before). Browser on merged_3: Cavity filled -> hatched 27 cm walls, corners close, windows mid-wall; not filled -> empty gap; Room 6 own 'Cavity, filled' with home not filled -> only Room 6 hatched, legend shows both. AC 4 (solid/timber/not sure/internal/party unchanged) covered by unit tests and code path; not separately clicked through in the browser.
<!-- SECTION:NOTES:END -->
