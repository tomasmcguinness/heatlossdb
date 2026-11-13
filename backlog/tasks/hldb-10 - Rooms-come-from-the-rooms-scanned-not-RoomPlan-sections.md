---
id: HLDB-10
title: Rooms come from the rooms scanned, not RoomPlan sections
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T19:35:00Z'
updated_date: '2026-11-13T06:40:00Z'
labels: []
milestone: m-0
dependencies: []
type: bug
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Survey 4-63nvJmVRVSvyJNLoVwhA: one kitchen/diner scanned as a single room was split into Kitchen 2, Dining room and an unlabelled room, because plan.ts divided storeys by RoomPlan's sections (3 in that room). The ground floor outline also had ~9.5 m² no room covers (RoomPlan's merged floor), shown right of the dining room.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each room the user scanned (CapturedStructure.rooms) is one room on the plan; sections aren't used
- [x] #2 Storey outlines are the scanned rooms' floors joined across walls, so space no room covers isn't drawn
- [x] #3 Where scanned floors overlap, the smaller room gets the overlap
- [x] #4 Scans without rooms (older files) show one room per storey outline
- [x] #5 Tests, tsc, lint and build pass
- [x] #6 A room's floor that RoomPlan carried on past its walls (e.g. onto a patio) is cut to its own walls
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parse.ts: roomsOf(raw) reads each CapturedRoom's floor (world x/z); outlinesFor joins them with joinFloors (outline.ts: Clipper grow 0.2 m, merge, shrink; outer rings only) instead of RoomPlan's merged floor, which stays the fallback. Extra outline pieces get a copied floor element. Scan.sections removed; Scan.rooms added; restoreLastScan re-parses older saved scans from raw. plan.ts: divideRooms assigns grid cells by scanned floor (smallest containing floor wins), then floods the rest; names Room 1..N in reading order; ids scanroom-<index> (old room-<story>-<section> edits are orphaned). On survey 4-63nvJmVRVSvyJNLoVwhA: ground 96.1 m² (was 104.2), kitchen/diner one room of 30.4 m², 12 rooms. Scanned rooms 1 and 7 cover nearly the same space (likely scanned twice), so one is left with 0.2 m². Upstairs a 1.7 m² enclosed gap (stairwell?) is filled, as outlines have no holes. Follow-up: app should write its room names into merged.json so the website can use them.

Follow-up from the live site: Room 12 (scanroom-9, the 44.8 m² upstairs scan) also owned detached slivers its smaller neighbours' scans didn't reach, so hovering lit unrelated bits. divideRooms now claims cells (walls included) by smallest containing floor, keeps each room's largest connected claim (keepLargestParts), floods the rest from neighbours, then drops any extra piece under 0.25 m². On the real scan Room 12 is one piece (17.5 m²). Rooms 1, 3, 6 and 10 still have extra pieces of 0.9-8.9 m² inside their own scanned floor but across a wall line; kept, as they may be real (user to check).

Ground floor of 4-63nvJmVRVSvyJNLoVwhA had ~10 m² of floor outside the back wall: scanned room 10's (living room) floor runs ~3 m past its wall, presumably seen through the patio doors. outline.ts floorWithinWalls: widen the room's own walls/doors/windows/openings (rooms[i].*) into a 0.3 m band, take what the band's outer rings enclose, cut the floor to it; keep the floor as scanned if that's under 60% of it (gappy walls). A storey-wide version was tried first and rejected: upstairs wall gaps lost a whole bedroom. Result on the real scan: ground 96.1 -> 86.5 m², upstairs 65.8 -> 65.9 m². 5 of 12 rooms' own walls don't enclose them, so they stay as scanned (a ~1.5 m² strip outside the upstairs left wall remains).
<!-- SECTION:NOTES:END -->
