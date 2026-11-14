---
id: HLDB-14
title: Enter room-by-room heat loss against the scanned rooms
status: To Do
assignee: []
created_date: '2026-11-14T17:13:00Z'
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
- [ ] #1 Each scanned room can be given its reported heat loss in watts, and optionally the design room temperature used in the report
- [ ] #2 The home can be given the report's design outdoor temperature and total heat loss; the total of the room figures is shown next to it, with any difference made clear
- [ ] #3 Rooms without a figure are shown as missing rather than counted as zero
- [ ] #4 Heat loss per m² of floor is shown for each room that has a figure, using the scanned floor area
- [ ] #5 The figures are kept with the scan's edits, so they survive reloading, Download and account Save
- [ ] #6 Shared homes include the room figures, with room names hidden as for the rest of a shared home (see HLDB-2)
- [ ] #7 Tests cover the totals, missing rooms and per-m² figures
<!-- AC:END -->
