# HeatLossDB web

A 3D viewer for scans from the HeatLossDB iOS app. Open the `merged.json` the app shares after
completing a survey, then click walls, windows, doors, floors and ceilings to describe their
construction. Set property-wide defaults once and override individual elements.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build    # type check and production build
```

## How it works

- `src/scan/`: parses RoomPlan's `CapturedStructure` JSON and builds each element's geometry from
  its `dimensions` and `transform`. RoomPlan captures no ceilings, so each storey gets one at
  wall height.
- `src/scan/outline.ts`: closes notches narrower than 0.9 m in each storey's floor outline.
  RoomPlan can't see into built-in wardrobes, so it traces rooms around them. Where no scanned wall
  runs along the closed outline, the parser adds one, usually at the end of a wardrobe.
- `src/scan/classify.ts`: guesses which walls are external. Walls lying along their storey's closed
  outline are external, as is any wall holding a window. The user corrects the guess in the viewer.
- `src/scan/align.ts`: lines each storey up with the one below. Storeys scanned separately, or after
  tracking drifted on the stairs, can be rotated and shifted. It tries each quarter turn, then
  refines rotation and shift to put the upper outline on the lower one. Users can nudge it in the
  Storeys tab.
- `src/fabric/`: element roles and construction settings, property defaults, and the
  `fabric.json` export format. Settings are saved in the browser for now. The API will take over
  once it exists.

No heat loss is calculated. Users supply their own validated figures.

## Local test scans

Put real scans in `fixtures/` (gitignored, as they're floorplans of real homes). The tests use
`fixtures/MergedRooms_8.json` when it's present. In development, `?scan=/fixtures/<file>.json`
opens a scan directly. Optional extras: `&view=plan,spread,ceilings,storage,external,hide:<storey>`,
`&select=<element id or index:N>` and `&tab=<tab>`.
