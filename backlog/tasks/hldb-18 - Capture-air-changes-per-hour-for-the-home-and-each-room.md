---
id: HLDB-18
title: Capture air changes per hour for the home and each room
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T14:53:00Z'
updated_date: '2026-11-19T14:55:00Z'
labels: []
dependencies: []
type: feature
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Heat loss reports put ventilation loss down as air changes per hour (ACH), room by room, and nothing records it yet. Home fabric should hold a whole-home ACH that every room uses by default, and rooms that are leakier or tighter than the rest of the home should be able to set their own, the same way room fabric overrides work (HLDB-3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Home fabric has an optional Air changes per hour number field; blank is allowed, anything not above 0 and up to 20 shows an inline error and blocks applying
- [ ] #2 The Home fabric card in the editor shows the home's ACH, or Not set
- [ ] #3 A selected room's fabric section can set its own ACH, defaulting to Same as home with the home's value shown; clearing it goes back to the home's
- [ ] #4 Rooms with their own ACH are tagged Own fabric, count in the Apply to whole home warning, and are cleared by applying Home fabric
- [ ] #5 The home and room ACH survive a reload, Download and account Save
- [x] #6 Unit tests cover resolving room ACH, parsing input, and applyHome clearing it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. store.ts: airChangesPerHour on HomeFabric and RoomFabric. 2. home.ts: narrow roomFabricValue keys; roomAirChanges, parseAirChanges, formatAirChanges. 3. HomeFabricDialog: Draughts and ventilation card with validated number input. 4. RoomPanel: fact on Home fabric card; per-room number field. 5. Tests, tsc, oxlint, vitest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: airChangesPerHour on HomeFabric and RoomFabric (kept in room fabric so hasRoomFabric, customFabricCount, applyHome clearing and tidyRoom cover it unchanged). home.ts: RoomFabricChoice narrows roomFabricValue/canChange to the choice keys; roomAirChanges, parseAirChanges (blank -> undefined, invalid -> null, comma as decimal point, >0 and <=20), formatAirChanges. HomeFabricDialog: Draughts and ventilation card with validated number box; Apply checks postcode and ACH together. RoomPanel: Air changes fact on the Home fabric card; per-room Air changes per hour field (all storeys) with Same as home placeholder, saved on blur/Enter, inline error. Verified: tsc -b, oxlint, vitest src/fabric src/share (46 passed). Not yet checked in a browser, so UI criteria #1-#5 stay unchecked.
<!-- SECTION:NOTES:END -->
