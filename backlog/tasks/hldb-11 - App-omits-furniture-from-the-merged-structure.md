---
id: HLDB-11
title: App omits furniture from the merged structure
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T19:51:00Z'
updated_date: '2026-11-12T19:51:00Z'
labels: []
milestone: m-0
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app's merged.json (and so the upload and merged.usdz) includes RoomPlan's furniture (CapturedStructure.objects and each room's objects; 55 in survey 4-63nvJmVRVSvyJNLoVwhA). HeatLossDB only needs the building: walls, floors, doors, windows, openings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new merge has no objects, at the top level or in any room
- [ ] #2 merged.usdz is exported from the structure without furniture
- [ ] #3 A cached merge that still has furniture is merged again
- [ ] #4 Builds and works on a device (user to verify; no Xcode on Windows)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ScanRoomModel: mergeSelectedRooms returns withoutFurniture(structure): encode, set objects to [] at the top level and in every room, decode back to CapturedStructure (it can't be mutated). merged.json, the upload and merged.usdz all come from that. loadMergedStructure rejects a cached merge with any objects, so older surveys re-merge (and rewrite merged.json/usdz) next time they're opened. No file format change, so the website's heatlossdbVersion check is unaffected. Website effect: new uploads have no storage objects, so built-in wardrobes aren't drawn; the outline's notch closing still covers them. Not built: no Xcode here.
<!-- SECTION:NOTES:END -->
