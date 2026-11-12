---
id: HLDB-1
title: Allow whole home fabric to set in a simple UI
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T06:52:00Z'
updated_date: '2026-11-12T07:57:00Z'
labels: []
milestone: m-0
dependencies: []
ordinal: 1000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rebuild Home fabric from the updated design/HomeFabric.dc.html: plain-language, whole-home questions answered once (not per floor), as tap-to-choose cards with 'How to tell' tips.
2. Questions: property type, age band, outside walls, loft insulated (with a follow-up on depth above the joists), windows (skylights assumed to match), outside doors, ground floor type and insulation. Footer shows 'x of 7 answered'.
3. Blank answers use typical values, so Home fabric counts as set once applied.
4. Applying replaces any element's own fabric details and U-value (roles kept), after a 'Replace custom settings?' warning when there are any.
5. Open from the header button, the side panel card and Share's check (not automatically, as asked).
6. Verify in headless Chrome and with tsc, lint, vitest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built from design/HomeFabric.dc.html as a full-screen dialog (Web/src/components/fabric/HomeFabricDialog.tsx); questions and answers in Web/src/fabric/home.ts. Upper floors' walls and windows default to the ground floor's. Skylight glazing is asked only on floors with skylights. Roof insulation is skipped for 'Another home above'. Opens by itself once per scan while unset (Skip for now), and from the header button, the side panel card and Share's check. Left out: 'Add an extension or conservatory'. Verified in headless Chrome (dark, light, 390px): auto-open, filling every question, Apply, Cancel discarding, Share check passing, reload keeping answers. tsc, lint clean; vitest 47 passed, 2 skipped (scan.test.ts needs fixtures, as before).

Changed at the user's request: Home fabric no longer opens by itself on first visit; it opens only from the header button, the side panel card and Share's check. Cancel no longer reads 'Skip for now'.

Rebuilt from the updated design (whole-home questions, chips, tips, 'x of 7 answered', Replace custom settings? warning). Home fabric now counts as set once applied, since blanks use typical values. The cross-section and per-floor questions are gone. Verified in headless Chrome (dark, light, 390px): answering, the loft follow-up appearing and clearing, Apply, the warning with 2 custom elements (Escape closes only the warning, Replace clears their fabric but keeps roles), Share's check. tsc and lint clean; vitest 51 passed, 2 skipped.

Correction: vitest result is 45 passed, 2 skipped (scan.test.ts needs fixtures, as before).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Home fabric is a full-screen set of plain-language, whole-home questions from the updated HomeFabric design. Answers are saved with the scan's edits and in Save files, count as set once applied, feed Share's check and the listing name, and replace per-element fabric (after a warning) when applied.
<!-- SECTION:FINAL_SUMMARY:END -->
