---
id: HLDB-15
title: Link a home to its HeatPumpMonitor.org system
status: To Do
assignee: []
created_date: '2026-11-14T17:13:00Z'
updated_date: '2026-11-14T17:23:00Z'
labels: []
dependencies: []
references:
  - https://heatpumpmonitor.org
type: feature
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Real-world figures come from HeatPumpMonitor.org, which publishes monitored heat pump systems (mostly OpenEnergyMonitor/emoncms installs) publicly. Decision (2026-11-14): HeatLossDB does not connect to owners' emoncms accounts or hold their API keys. Getting a system's data published on HeatPumpMonitor.org is the owner's business and a separate problem. HeatLossDB only reads what HeatPumpMonitor.org already makes public, so there are no keys to protect, and the API only ever fetches from HeatPumpMonitor.org itself, never from an address the user typed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner of a saved home can link it to a HeatPumpMonitor.org system by its system id or the address of its page
- [ ] #2 The link is checked when it is made; a system that does not exist or is not public is refused with a clear message
- [ ] #3 A linked home shows which HeatPumpMonitor.org system it is linked to, with a link to that system's page
- [ ] #4 Only the home's owner can link, change or unlink it
- [ ] #5 Owners whose system is not on HeatPumpMonitor.org are pointed to how to add it there; HeatLossDB does not take their data any other way
- [ ] #6 API tests cover linking, refusing unknown or private systems, and owner-only changes
<!-- AC:END -->
