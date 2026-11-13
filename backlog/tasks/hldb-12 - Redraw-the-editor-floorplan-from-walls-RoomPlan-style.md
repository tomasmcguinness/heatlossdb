---
id: HLDB-12
title: Redraw the editor floorplan from walls, RoomPlan-style
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-13T10:43:00Z'
updated_date: '2026-11-13T11:51:00Z'
labels: []
dependencies: []
references:
  - >-
    https://totheroot.io/article/create-a-2-d-floor-plan-with-room-plan-and-sprite-kit-part-ii
type: enhancement
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The scan editor's per-floor plan looked poor: a floor fill, room shapes built from 5 cm grid squares (staircase edges), and hairline wall/door/window lines whose width ignored zoom and whose ends didn't meet. Rendering is being redone following the totheroot.io 'Create a 2D floor plan with RoomPlan and SpriteKit, part II' approach: each wall is a segment along its local X axis (-width/2..+width/2) placed by its transform, stroked at real wall thickness with square caps so corners close. First step is walls only, keeping the room labels so room selection still works; doors, windows and room fills come later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each floor's plan draws its scanned walls as solid bars of real thickness (metres) that scale with zoom
- [ ] #2 Wall corners close without visible gaps
- [ ] #3 External walls are drawn thicker than internal walls
- [ ] #4 Floor fill and door/window lines are no longer drawn
- [ ] #5 Room labels still show and select/rename rooms
- [ ] #6 Hovering a room on the plan highlights it; the selected room stays highlighted
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. FloorCanvas: drop floor fill, grid room paths and door/window lines; draw plan.walls as lines with stroke width in metres (0.1 internal, 0.2 external), square caps, no non-scaling-stroke. 2. index.css: replace .fp-wall rules with .fp-walls line; remove unused fp-floor/fp-room/fp-door/fp-window. 3. Type check, tests, check in browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FloorCanvas now draws plan.walls only, as lines stroked at 0.1 m (internal) / 0.2 m (external) with square caps and no non-scaling-stroke; floor fill, grid room paths and door/window lines removed; unused fp-* CSS removed. tsc + vite build pass; vitest passes except scan.test.ts, which needs the gitignored fixtures/MergedRooms_8.json (pre-existing). Not yet checked visually with a real scan: corners and label placement still to confirm.

Per user: put back room hover/selected highlight (fp-room grid paths, transparent fill, drawn under the walls) so hovering or clicking on the plan highlights and selects the room.

Per user: walls whose opening covers at least 90% of their width (OPEN_WALL) are left out of plan.walls, so they're not drawn; room division already ignored them.

Openings are now matched to walls by position (parallel, centre within 0.15 m of the wall's middle) as well as by parentId, since RoomPlan doesn't always link them. Checked on Downloads/home-c83d9dba.json: bay-mouth wall 553F8898 and doorway wall C6F6451C are not drawn.

Bay-mouth wall still showed in the browser because restoreLastScan returned the Scan as parsed by older code (stored in localStorage). It now re-parses from scan.raw whenever it was kept, so derived walls and outlines always come from current code.

Walls thinned to 0.06/0.12 m. Doors, windows and openings are cut out of their walls (matched by parentId or position: parallel, within 0.15 m of the line, overlapping by at least 5 cm) and drawn as a 1.5 px non-scaling line. Wall pieces are drawn as rectangles; only the wall's own ends are carried on by half the thickness, so corners close and gap sides stay square. Room division still uses whole walls.
<!-- SECTION:NOTES:END -->
