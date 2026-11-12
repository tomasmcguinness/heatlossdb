---
id: HLDB-4
title: Scanning gets stuck when RoomPlan doesn't hand a room over
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T14:31:00Z'
updated_date: '2026-11-12T14:32:00Z'
labels: []
dependencies: []
type: bug
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scanning a home, on the fourth room Next room stopped doing anything. The app waits for RoomPlan's didEndWith after stopping a room and disables Next room and Finish home until it arrives. If RoomPlan had already ended the room itself (tracking lost, too hot, scene too big), or a retired capture session's callback was taken for the current one, it never arrives and the walk is stuck for good.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If RoomPlan ends a room on its own, the user is told why and Next room saves what was captured and carries on
- [ ] #2 Callbacks from earlier rooms' capture sessions are ignored
- [ ] #3 If RoomPlan doesn't hand a room over within 10 seconds, the room is marked failed and the next room starts, so the controls never stay disabled
- [ ] #4 The console logs why RoomPlan stopped, for diagnosing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ScanRoomModel: ignore didEndWith from non-current sessions; keep a room RoomPlan ended early and use it on Next/Redo/Close instead of stopping again; watchdog after stop; stoppedReason for the view.
2. ScanRoomView: banner when RoomPlan stopped a room.
3. Can't build iOS on Windows: user builds and tests on device.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in ScanRoomModel/ScanRoomView: didEndWith ignored unless from the current view's session; a room RoomPlan ends on its own is kept (endedEarly) with stoppedReason shown in a banner, and Next room/Finish/Redo/Close hand it over immediately (processed even if RoomPlan reported an error); 10 s watchdog after stop marks the room failed and starts the next. Not built: no Xcode on this Windows machine, so needs building and testing on device. Root cause of RoomPlan stopping at room 4 unconfirmed; the new [scan] logs should show it. If it's resource growth from retired capture views (one RoomCaptureSession kept alive per room), the next step is to stop keeping them.
<!-- SECTION:NOTES:END -->
