---
id: HLDB-7
title: Enable Find similar homes, Share and Explore on What next
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T16:42:00Z'
updated_date: '2026-11-14T08:04:00Z'
labels: []
milestone: m-0
dependencies:
  - HLDB-6
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WhatNext.tsx shows Find similar homes, Share your home and Explore the database as Coming soon. Enable them: search opens the matches page (works for local scans via GET /api/candidates), share opens the editor with the share dialog, explore opens a new page browsing shared homes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All four options on What next are choosable and their Continue button goes somewhere
- [ ] #2 Find similar homes opens the matches page, asking for Home fabric (incl. postcode) first when it isn't set
- [ ] #3 Share your home opens the editor with the share dialog open
- [ ] #4 Explore the database lists shared homes with filters by postcode area, age and property type
- [x] #5 Web tests, lint and tsc pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WhatNext: all options enabled, onChoose routes via PAGE_FOR in App.tsx. search -> MatchesPage (works without surveyId), opening HomeFabricDialog first when Home fabric isn't set; share -> ScanEditor startSharing; explore -> new ExplorePage (postcode area/district, property type, age band filters; sort by newest, size, W/m², SCOP). Shared fetching in match/candidates.ts (useCandidates). Not yet exercised in a browser.

surveys rows now have an IsShared column, set to true by PUT /api/surveys/{id}/share (SaveShareAsync). CandidatesForAsync queries only IsShared rows, so search (matches) and Explore list shared homes only. Older rows without the column read as false. API tests updated (HomesThatArentSharedAreNeverCandidates added); 51/51 pass.
<!-- SECTION:NOTES:END -->
