---
id: HLDB-6
title: Match on heat loss per degree, postcode climate and fabric
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T16:39:00Z'
updated_date: '2026-11-14T08:16:00Z'
labels: []
milestone: m-0
dependencies:
  - HLDB-5
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Matching (Web/src/match/similarity.ts) compares shape only, and estimateFor (match/heatPump.ts) scales raw designHeatLossW, which isn't comparable across design outdoor temperatures. Use the design outdoor temperature (from HLDB-5) or a postcode-area design temperature to compare heat loss per degree, store share details on the server, and add fabric and climate factors. Plan: C:/Users/Tomas/.claude/plans/how-will-the-matching-mellow-backus.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 estimateFor compares heat loss per degree (W/K) and rescales to the user's design temperature, falling back to raw watts when no temperature is known
- [x] #2 designTemperatureFor(district) returns a design outdoor temperature by postcode area from a cited published table
- [ ] #3 The user's postcode district is stored with the home fabric and prefilled in the share step
- [x] #4 PUT /api/surveys/{id}/share stores listing name, postcode district, room-name choice and fabric; candidates return district and fabric
- [x] #5 compare() has fabric and climate factors, uninformative when data is missing
- [x] #6 Web tests, lint, tsc and dotnet tests pass
- [ ] #7 Matching works for a scan opened from a local file, via an id-free GET /api/candidates, without uploading it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope added at user's question: matching must work for scans not saved on the server. compare() already runs client-side; add GET /api/candidates (no id) and let MatchesPage use it when there's no surveyId. Climate source: MCS 031 Appendix A Table 1 (postcode -> degree days, outdoor low temperature), e.g. CF -3.1 °C.

Done: match/climate.ts (MCS 031 a) Issue 5.0 Appendix A Table 1, 124 postcode areas; pdftotext mangled column 3 (temps shifted down a row, degree days up a row), realigned and sanity-checked: TQ/TR -1.5 like PL/EX, TA 1835 like BA/BS). estimateFor rescales via W/K to the user's design temperature (DEFAULT_INDOOR_TEMPERATURE 21). compare() gains fabric (0.15) and climate (0.05) factors; other weights scaled down. API: SurveyEntity.Share, PUT /api/surveys/{id}/share (ValidateShare), GET /api/candidates (id-free), candidates carry share. HomeFabric.postcodeDistrict asked for in HomeFabricDialog and prefilled in ShareDialog. Test project retargeted net8.0 -> net10.0 (API moved in 87fb99d, tests hadn't built since) with Mvc.Testing 10.0.0, and fixture cleanup made idempotent. Verified: 36/36 dotnet tests (7 new), vitest 71 passed (scan.test.ts needs gitignored fixture), tsc, oxlint. Not verified in a browser: Chrome couldn't reach the local dev server. Risk: GET /api/candidates exposes every profile/heat pump/share record without an id; restrict to confirmed shares once Clerk lands.

Own scan excluded from matching: ShapeProfile.scanHash (Scan.hash, fingerprint of RoomPlan element ids) saved with every profile; MatchesPage drops candidates with the open scan's hash (otherHomes in match/candidates.ts). Covers local files and re-uploads from another app survey; profiles saved before this have no hash until their survey is next opened. Explore still lists your own home.

At the user's request: the party wall factor is gone ('Wall shared with neighbours'); an 'Insulation' factor (insulated / partly / uninsulated, from listing.ts insulationOf; one step apart = 0.5) takes its place, counted only when both owners said. Weights: insulation 0.08, fabric 0.15 → 0.11, total unchanged. Matches page: one card per row, plan left and the Compared/Yours/Theirs table always visible on the right (wraps below when narrow).
<!-- SECTION:NOTES:END -->
