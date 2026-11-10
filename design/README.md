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
| `WhatNext.dc.html` | What next? | Shown after a scan is uploaded. Four options: View my scan, Find similar homes, Share your home, Explore the database. Find similar homes and Explore are marked "Coming soon" and disabled until enough homes are shared. Share is selected by default. |
| `ViewScan.dc.html` | View my scan (v1) | Floor plan viewer with ground/first floor tabs and zoom controls, scan details, a room list per floor, and "Do more with your scan" actions (Share active, the other two coming soon). Nothing is saved. Superseded by `PlanEditor.dc.html` for checking and editing. |
| `PlanEditor.dc.html` | Floor plan editor (v2, full screen) | Full-screen canvas with a side panel. Tabs: **Overview** (the default), Ground floor and First floor. **Overview** is a logical side view: roof, then one band per floor (top floor first) with totals such as "5 windows · 1 skylight", and each room as a box as wide as its contents. Floor tabs show the 2D plan. In both views each room shows icons for its external doors, windows and skylights (interior doors aren't recorded), and has a pencil button. Hover highlights a room on the canvas and in the side panel list. Click selects (summary plus "Edit room"). Double-click or the pencil opens editing: name, heated yes/no, add or remove external doors, windows and skylights, mark as checked, remove room. The header shows "x of y rooms checked" and a "Home fabric" button. Fabric isn't edited per room. |
| `HomeFabric.dc.html` | Home fabric (full-screen modal) | Building-level fabric shown as a vertical cross-section, with settings beside each layer. Whole home: age band and property type (Detached, Semi-detached, Terraced); the side walls in the picture show as joined to neighbours to match. Roof and loft: roof type and insulation (the drawn insulation layer gets thicker with the choice; red for none). Each floor: walls and windows (first floor defaults to "Same as ground floor"), skylights, external doors, plus totals from the scan. Ground floor construction: floor type and insulation. An "Add an extension or conservatory" button covers parts built differently. Should open on first entry to the editor and from its "Home fabric" button. |
| `ShareHome.dc.html` | Share your home | Wizard: postcode → age and property type → construction (walls, loft, floor, glazing) → create account (skipped if signed in) → heat pump and design data (optional, can be skipped, report upload) → review and consent → done. |
| `FindSimilar.dc.html` | Find similar homes | The same three home-details steps, no account, then results: match criteria tags, summary tiles (typical heat loss, W/m², heat pump sizes fitted), sortable list of matched homes, and a prompt to share. |

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
