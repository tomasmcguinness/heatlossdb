---
id: HLDB-3
title: Set fabric per room and per door/window
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T13:42:00Z'
updated_date: '2026-11-12T14:28:00Z'
labels: []
dependencies: []
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Home fabric is answered once for the whole home, but real homes vary: an extension can be built differently from the original house, or one window can be newer than the rest. The Home fabric modal promises fine-tuning later, but the plan editor had nowhere to do it. Overrides use the same plain-language choices as Home fabric so non-experts can answer them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A selected room can override its outside walls, defaulting to Same as home
- [ ] #2 Only rooms on the top storey can override their ceiling/roof (loft, with the depth follow-up); only rooms on the ground storey can override their floor
- [ ] #3 Each door, window and skylight in a room (scanned or added) can override its door type or glazing
- [ ] #4 Rooms with overrides are marked in the room list
- [ ] #5 Overrides survive a reload and export/import
- [ ] #6 Applying Home fabric warns with a count that includes room and item overrides, and clears them
- [x] #7 Unit tests cover resolving overrides and applyHome clearing them
- [ ] #8 Room, door and window fabric can only be changed once Home fabric has been applied; until then the room shows a prompt to set up Home fabric
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store: RoomSettings.fabric (walls, loft, loftDepth, floorType, floorInsulation) and itemFabric (by item id); tidy on setRoom; applyHome strips them.
2. home.ts: roomFabricValue, itemFabricValue, customFabricCount with storey rules.
3. RoomPanel: Fabric in this room section (walls; ceiling on top storey; floor on ground storey), item selects, Own fabric tag, copy.
4. HomeFabricDialog: count and copy.
5. CSS, tests, typecheck, lint.

6. Gate room and item fabric on isHomeFabricSet: locked prompt with Set up Home fabric button; item selects and Own fabric tag hidden until set.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented RoomSettings.fabric/itemFabric (tidied on setRoom, stripped by applyHome), resolvers and customFabricCount in fabric/home.ts, Fabric in this room section and per-item selects in RoomPanel, Own fabric tag, updated Home fabric warning count/copy. Ceiling choices only on top storey rooms, floor choices only on ground storey rooms (user request). Removing a door/window also drops its fabric override.
Also, at the user's request: rooms can no longer be removed (Remove this room button, Removed list/Restore, RoomSettings.removed and the canvas/editor filters are gone); rooms previously marked removed show again.
Verified: tsc, oxlint, vitest src/fabric (26 passed). src/scan/scan.test.ts fails on a missing fixture (Web/fixtures/MergedRooms_8.json), unrelated. Not yet checked in a browser, so UI criteria stay unchecked.
Follow-up: share/listing.ts and matching still read only Home fabric.

Room fabric now requires Home fabric to be applied first (user request): RoomFabricSection shows a prompt with a Set up Home fabric button, and item selects and the Own fabric tag are hidden until then. tsc, oxlint, vitest src/fabric pass; not yet checked in a browser.
<!-- SECTION:NOTES:END -->
