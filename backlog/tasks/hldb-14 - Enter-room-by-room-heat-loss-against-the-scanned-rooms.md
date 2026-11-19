---
id: HLDB-14
title: Enter room-by-room heat loss against the scanned rooms
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-14T17:13:00Z'
updated_date: '2026-11-19T17:43:00Z'
labels: []
dependencies: []
type: feature
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
HeatLossDB is changing approach: the useful thing to share is a real heat loss report (room by room, as a heat loss survey produces it) laid over the LiDAR scan, backed later by real-world figures from emoncms. Most owners will only have a PDF or printout from their installer, so the figures are typed in by hand for now; importing from report files or design tools can come later. The Home fabric questions and insulation-level guesses become secondary to the reported figures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each scanned room can be given its reported heat loss in watts, and optionally the design room temperature used in the report
- [ ] #2 The home can be given the report's design outdoor temperature and total heat loss; the total of the room figures is shown next to it, with any difference made clear
- [ ] #3 Rooms without a figure are shown as missing rather than counted as zero
- [ ] #4 Heat loss per m² of floor is shown for each room that has a figure, using the scanned floor area
- [ ] #5 The figures are kept with the scan's edits, so they survive reloading, Download and account Save
- [ ] #6 Shared homes include the room figures, with room names hidden as for the rest of a shared home (see HLDB-2)
- [ ] #7 Tests cover the totals, missing rooms and per-m² figures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
First slice (user request 2026-11-19): when a room is heated, the room panel takes its target (design) temperature in °C and its reported heat loss in W; both show on the room's label in the floor and side views. 1. RoomSettings.targetTemperature / heatLossW, carried into EditedRoom; kept but not shown while the room is unheated. 2. fabric/heatLoss.ts: parse and format, with limits (temperature 5–35 °C, heat loss 0–50,000 W). 3. RoomPanel: two number fields under Heated, saved on blur/Enter, inline errors (shared NumberField, reused by the air changes field). 4. FloorCanvas and OverviewCanvas labels show '21 °C · 1,250 W' (or whichever is set). 5. Tests. Home totals, missing-room display, per-m² figures and sharing (AC 2-4, 6) stay for later.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1 done: RoomSettings.targetTemperature (°C) and heatLossW (W), carried into EditedRoom; kept (not shown) while a room is unheated, and kept by applyHome. fabric/heatLoss.ts parses 5-35 °C and 0-50,000 W (accepts '°C', 'W', '1,250', '1.25 kW'), formats '21 °C · 1,250 W'. RoomPanel: Heat loss section under Heated? (only when heated) with two fields on a shared NumberField (the air changes field now uses it too). FloorCanvas and OverviewCanvas labels show the figures under the room name. Tests: heatLoss.test.ts and a store test (carried into the room, kept by Home fabric, export/import). tsc, oxlint clean; vitest 101 passed (scan.test.ts missing fixture as before). Browser: entered 21 and '1.25 kW' on Room 5, label showed '21 °C · 1,250 W' on the floor and side views; 50 °C showed the error; unheated hid the fields and figures, heated again brought them back. Not yet: home totals vs report (AC 2), missing rooms (3), W/m² (4), sharing (6).
<!-- SECTION:NOTES:END -->
