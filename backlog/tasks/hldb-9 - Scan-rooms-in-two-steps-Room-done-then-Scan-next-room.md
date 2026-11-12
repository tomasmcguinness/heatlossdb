---
id: HLDB-9
title: 'Scan rooms in two steps: Room done, then Scan next room'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T19:21:00Z'
updated_date: '2026-11-12T19:24:00Z'
labels: []
milestone: m-0
dependencies: []
type: bug
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app's walk-round scanning (ScanRoomView/ScanRoomModel) doesn't work reliably. Next room ends the room and starts the next straight away, chaining the next capture onto RoomPlan's hand-over (startAfterEnding). Split it: Room done stops and saves the room; once RoomPlan has handed it over, Scan next room starts the next on a fresh capture view sharing the AR session. Related: HLDB-4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While capturing, the main button is Room done; it saves the room and does not start another
- [ ] #2 While RoomPlan hands the room over, the controls show it's saving and can't be tapped twice
- [ ] #3 Between rooms, the view says the room is saved and offers Scan next room, Redo last room and Finish home
- [ ] #4 Scan next room starts capture on a fresh view; tracking carries on (AR session not paused)
- [ ] #5 Finish home works while capturing (saves the current room first) and between rooms
- [ ] #6 Builds and works on a device (user to verify; no Xcode on Windows)
- [ ] #7 The user gives a room count before the first room; the scanner shows Room N of M, offers Finish home first once M rooms are done, and the count can be changed from the top pill
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Model: endRoom(name:) no longer starts the next room; startAfterEnding removed; redoLastRoom only between rooms (deletes the last room, starts it again); startRoom logs. View: phases capturing / saving / betweenRooms. Capturing: Room done + Finish home. Saving: spinner, nothing tappable. Between: banner, Redo last room, Scan next room + Finish home (or Finish home + Scan another room once the plan is done). Room count added at the user's suggestion: Survey.plannedRoomCount (optional, so SwiftData migrates lightly), asked on the Before you scan sheet (stepper, min 2 to match the survey's two-room minimum, default 6), cleared on reset, editable from the top pill menu, raised automatically when scanning past it. Not built: no Xcode on this Windows machine.
<!-- SECTION:NOTES:END -->
