# heatlossdb design

Exported from the "HeatLossDB" design canvas in Claude. These are design references for the web app, not production code.

## How to read these files

Each `*.dc.html` file is one artboard from the canvas. The markup is plain HTML with inline styles. The `<script type="text/x-dc">` block at the bottom holds each screen's state and step logic. `{{name}}` placeholders are filled from `renderVals()` in that script. `<sc-if>` is a conditional block and `<sc-for>` is a loop.

They load `./support.js`, which is the canvas runtime and isn't included here, so they won't run on their own in a browser. Use them for layout, copy, colours, fields and flow.

Values in square brackets, such as `[N] rooms` or `[X] kW`, are placeholders for real data, mostly from the uploaded `merged.json`.

`canvas.json` is the canvas index: board titles and positions.

## Screens (web app)

| File | Screen | Notes |
|---|---|---|
| `Landing.dc.html` | Landing page | Two large card buttons that go straight to their screen and light up on hover or keyboard focus (orange border, slight lift). **Open a scan** takes a code from the app first (placeholder "ABC-123", turned into capitals and the dash added automatically, O and I read as 0 and 1, a pasted `…/s/ABC-123` link reduced to the code, Open enabled at 6 characters), then "Choose a file" or drag-and-drop a `merged.json` (the card highlights while dragging). **Explore the database** links to `Explore.dc.html`. A link shared from the app should skip this page and load the scan directly. |
| `Explore.dc.html` | Explore the database | Postcode district search; summary tiles (homes shared, median W/m², with a heat pump, with measured performance); filters (property type and age chips, floor area, data available: heat pump / measured performance / installer calc); Homes / By area switch and sort. Homes: cards with a mini plan, district, type, age, area, heat loss, W/m², heat pump size, badges for measured SCOP and installer calc, and "View home". By area: table by postcode district. A "Share your home" prompt sits at the bottom. |
| `ScanHub.dc.html` | Your scan (alternative) | Alternative to `WhatNext` + `ViewScan`: three large vertical tabs on the left (**View**, **Share**, **Compare**, the last marked "Coming soon"), with hover highlighting. View: floor plan with floor tabs, key details, and "Check & edit rooms" → `PlanEditor`. Share: pitch, 4 steps, what's shared vs never shown, "Start sharing" → `ShareHome`. Compare: explanation, progress towards enough homes, "Share yours to help" and "Email me when it opens". |
| `WhatNext.dc.html` | What next? | Shown after a scan is uploaded. Four options: View my scan, Find similar homes, Share your home, Explore the database. Find similar homes and Explore are marked "Coming soon" and disabled until enough homes are shared. Share is selected by default. |
| `ViewScan.dc.html` | View my scan (v1) | Floor plan viewer with ground/first floor tabs and zoom controls, scan details, a room list per floor, and "Do more with your scan" actions (Share active, the other two coming soon). Nothing is saved. Superseded by `PlanEditor.dc.html` for checking and editing. |
| `PlanEditor.dc.html` | Floor plan editor (v2, full screen) | Full-screen canvas with a side panel. Tabs: **Overview** (the default), Ground floor and First floor. **Overview** is a logical side view: roof, then one band per floor (top floor first) with totals such as "5 windows · 1 skylight", and each room as a box as wide as its contents. Floor tabs show the 2D plan. In both views each room shows icons for its external doors, windows and skylights (interior doors aren't recorded), and has a pencil button. Hover highlights a room on the canvas and in the side panel list. Click selects (summary plus "Edit room"). Double-click or the pencil opens editing: name, heated yes/no, add or remove external doors, windows and skylights, mark as checked, remove room. The header shows "x of y rooms checked" and a "Home fabric" button. Fabric isn't edited per room. |
| `HomeFabric.dc.html` | Home fabric (full-screen modal) | Broad, whole-home fabric settings for people who don't know much about their home. They're answered once, not per floor, and differences are set later element by element. Plain-language questions with tap-to-choose answers, most including "Not sure" (unanswered uses typical values for the age band), with "How to tell" tips. Questions: property type (Detached / Semi-detached / Terraced) and age band; outside walls (solid, cavity not filled, cavity filled, timber frame); loft insulated? (Yes / No / No loft / Not sure); if Yes, "Does the insulation come up above the top of the joists?" (No: about 100 mm or less; Yes: about 200 mm or more), because the 0–100 mm range matters most for heat loss; windows (single, older double, double 2002 or newer, triple; skylights assumed to match); outside doors; ground floor (timber or solid) and whether it's insulated. The footer shows "x of 7 answered". "Apply to whole home" first shows a "Replace custom settings?" warning that per-element changes will be lost, with "Keep my changes" or "Replace and apply". Should open on first entry to the editor and from its "Home fabric" button. |
| `ShareHome.dc.html` | Share your home | Wizard: postcode → age and property type → construction (walls, loft, floor, glazing) → create account (skipped if signed in) → heat pump and design data (optional, can be skipped, report upload) → review and consent → done. |
| `FindSimilar.dc.html` | Find similar homes | The same three home-details steps, no account, then results: match criteria tags, summary tiles (typical heat loss, W/m², heat pump sizes fitted), sortable list of matched homes, and a prompt to share. |
| `HomeHeat.dc.html` | Your home's heat (predicted vs measured) | Whole-house tiles (predicted vs measured heat loss, floor area, W/m²); floor plan coloured by layer: Predicted W/m², Live room vs target, or Predicted vs measured; radiators/emitters marked on the plan; time switch (Now / Coldest night / Pick a date); room panel with predicted vs measured bars, a plain-language verdict and its emitters. A `sampleData` tweak toggles sample measured values. |

## After the scan: capturing the heat loss report

| File | Screen | Notes |
|---|---|---|
| `Main-surl.dc.html` | Your home · checklist | "Add your heat loss report": progress bar and grouped steps (Your scan → Heat loss report → Real-world data → Share). Heat loss totals and Heat pump are "Needed to share"; Room by room and HeatPumpMonitor.org link are optional; Share stays locked until the needed steps are done. Side panel summarises the heat loss once totals are in. A `progress` tweak switches between Just scanned / Report started / Ready to share. |
| `HeatLossTotals-yh62.dc.html` | Step 3 · Heat loss totals | Design outdoor temperature, indoor temperature (same everywhere or varies by room), total heat loss, ventilation heat loss and the report's floor area, each with "what to look for" help. Live side panel: heat loss per degree (W/K), ventilation share, W/m². |
| `RoomHeatLoss-lykg.dc.html` | Step 4 · Room by room (optional) | Scanned rooms by floor with temperature and heat loss inputs and a per-m² bar. Running total vs the report total, flagging a difference over 2% and missing rooms; area-weighted average indoor temperature. |
| `HeatPumpDesign-ox9h.dc.html` | Step 5 · Heat pump and design | Make and model, rated output, design flow temperature, predicted SPF/SCOP, and predicted heating and hot water kWh a year; prompts to link HeatPumpMonitor.org next. |

These step screens link to each other as `Main.dc.html`, `HeatLossTotals.dc.html`, `RoomHeatLoss.dc.html` and `HeatPumpDesign.dc.html`. Those names don't match the file names here (`Main.dc.html` is actually the logo board), so treat the links as intent only.

## Flow

| File | What it is |
|---|---|
| `Artboard-a1lf.dc.html` | Flow diagram: scan in the app → upload → what next? → explore / search / share, with the account step only on the share path. |

## Brand

| File | What it is |
|---|---|
| `Main.dc.html` | Chosen logo and app icon: "House Layers", a house exploded into roof, first floor and ground floor plan. Includes the wordmark (`heatloss` + orange `db`) on light and dark backgrounds, and icon sizes. |
| `FanHouse.dc.html`, `LossGrid.dc.html`, `Monogram.dc.html` | Alternative logo directions that weren't taken forward. |

## Shared styles (dark UI)

- Page `#17181C` · header `#1E1F23` · cards `#202125` · borders `#2C2E33` / `#3A3C42`
- Text `#F2F2F2` · muted text `#A9ADB5`
- Primary button `#C8692A` · selected border `#E07B35` · wordmark accent `#F2994A`
- "No account needed" badge: text `#9CC3F5` on `#1C2A3D` · "Account required" badge: text `#F6B97E` on `#3A2614`
- Headings: Space Grotesk 700 · body: Segoe UI / system-ui
