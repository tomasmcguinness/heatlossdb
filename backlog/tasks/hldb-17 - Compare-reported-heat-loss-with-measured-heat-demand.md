---
id: HLDB-17
title: Compare reported heat loss with measured heat demand
status: To Do
assignee: []
created_date: '2026-11-14T17:14:00Z'
updated_date: '2026-11-14T17:23:00Z'
labels: []
dependencies:
  - HLDB-14
  - HLDB-15
type: feature
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The main benefit of combining a heat loss report with real-world data is seeing how accurate the report was: heat loss surveys often overestimate, which leads to oversized heat pumps. Measured heat output from the home's HeatPumpMonitor.org system (HLDB-15) against the indoor-outdoor temperature difference over cold periods gives a real-world heat loss per degree, which can be set against the report's figure (HLDB-14). Comparing these across many shared homes is what makes HeatLossDB useful to someone sizing a heat pump for a similar home.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a home with a reported total heat loss and a linked HeatPumpMonitor.org system that publishes heat output and outdoor temperature, the page shows the measured heat loss per degree next to the reported one, and the difference as a percentage
- [ ] #2 The measured figure says which period it is based on and how much data it used, and is not shown when there is too little cold-weather data to be meaningful
- [ ] #3 Without a published indoor temperature, a stated assumed indoor temperature is used and the page says so
- [ ] #4 The measured heat loss is also given at the report's design outdoor temperature, so it can be compared directly with the report's total
- [ ] #5 Tests cover the calculation, the too-little-data case and the assumed indoor temperature
<!-- AC:END -->
