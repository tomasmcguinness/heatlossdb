---
id: HLDB-16
title: Show a home's live HeatPumpMonitor.org data
status: To Do
assignee: []
created_date: '2026-11-14T17:14:00Z'
updated_date: '2026-11-14T17:23:00Z'
labels: []
dependencies:
  - HLDB-15
references:
  - https://heatpumpmonitor.org
type: feature
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once a home is linked to its HeatPumpMonitor.org system (HLDB-15), its real-world performance should be visible next to the scan and the reported heat loss, as close to live as HeatPumpMonitor.org publishes it, so owners and people researching similar homes can see how the heat pump is really doing. The data is public there, but many people may view one home, so the HeatLossDB API should fetch and cache it rather than every viewer calling HeatPumpMonitor.org on every refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A linked home's page shows the latest heat output, electricity use, COP, flow and return temperatures, and indoor and outdoor temperatures, for whichever of these the system publishes
- [ ] #2 The figures update on their own while the page is open, as often as HeatPumpMonitor.org has new data, without reloading
- [ ] #3 A chart shows the last 24 hours of the same figures, with a choice of longer periods
- [ ] #4 Shared homes show the data to anyone; homes that are not shared show it only to their owner
- [ ] #5 Requests to HeatPumpMonitor.org are cached and shared between viewers, so many viewers do not multiply the load on it
- [ ] #6 When HeatPumpMonitor.org cannot be reached or a system has stopped reporting, the page says how old the last figures are instead of showing them as current
- [ ] #7 Tests cover stale data, the caching and the visibility rule
<!-- AC:END -->
