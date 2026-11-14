---
id: HLDB-5
title: >-
  Share modal: ask for design outdoor temperature, postcode district and
  room-name consent
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T16:33:00Z'
updated_date: '2026-11-14T08:08:00Z'
labels: []
milestone: m-0
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The share dialog (Web/src/components/share/ShareDialog.tsx) asks for design flow temperature in the heat pump step. That should be the design outdoor temperature the heat loss was calculated at (stored as designOutdoorTemperature). Sharing also needs the first part of the postcode (outward code, e.g. SW1A) and whether the owner is happy for room names to be shared (see HLDB-2, which hides them otherwise).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Heat pump step asks for design outdoor temperature instead of flow temperature and saves it as designOutdoorTemperature
- [ ] #2 Check step asks for the first part of the postcode; only the outward code is kept, even if a full postcode is typed
- [ ] #3 Check step asks whether room names may be shared, defaulting to no
- [ ] #4 Postcode district and room-name choice are passed to submitShare
- [x] #5 Web tests and lint pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. heatPumpForm: replace flowTemperature with outdoorTemperature (-20..15 °C) -> designOutdoorTemperature; update tests.
2. New share/postcode.ts: outwardCode() accepts outward code or full postcode, returns normalised outward code or null; tests.
3. ShareDialog check step: postcode district field (required to continue) and 'share room names' checkbox (default off).
4. submitShare takes { postcodeDistrict, shareRoomNames } alongside name and heat pump.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Heat pump form now asks for design outdoor temperature (-20..15 °C, accepts typographic minus and decimal comma) and saves designOutdoorTemperature; flow temperature field removed. Added share/postcode.ts outwardCode() with tests: full postcodes are cut to the outward code on blur and before saving. Check step requires a valid district to continue; 'Show my room names' checkbox defaults off. submitShare(name, { postcodeDistrict, shareRoomNames }, heatPump); still a TODO stub on the API side, so nothing is stored yet. tsc, oxlint and share tests pass; scan.test.ts fails only because the gitignored fixtures/MergedRooms_8.json is missing (pre-existing). UI not yet exercised in a browser.

Account step removed at the user's request: the share wizard assumes the user is signed in. Steps are now Check → Heat pump → Done; the heat pump step's 'Share home' / 'Skip and share' submits the share. No pending/email-confirmation state any more: SharedHome is {name, sharedAt}; createAccount, resendConfirmation and the editor's pending banner are gone. Signed-in gating of the wizard is not built yet.
<!-- SECTION:NOTES:END -->
