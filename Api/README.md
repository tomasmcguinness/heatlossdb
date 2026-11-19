# HeatLossDB API

ASP.NET Core (.NET 8) API that receives scans from the iOS app.

```sh
npx azurite --location .azurite --skipApiVersionCheck   # the storage emulator, in another terminal
cd HeatLossDB.Api && dotnet run     # listens on http://0.0.0.0:5080
dotnet test                         # from Api/; needs Azurite too
```

If something else has Azurite's ports, run it on others and point the tests at it with
`HEATLOSSDB_TEST_STORAGE` (a storage connection string with `BlobEndpoint` and `TableEndpoint`).

Publishing builds the website (`../Web`) into `wwwroot`, and the API serves it: any path outside
`/api` gets `index.html`, so links like `/s/{id}` work. In development, run the website with Vite
instead (see the main README).

## Endpoints

- `POST /api/surveys`: body is the app's `merged.json` (a RoomPlan `CapturedStructure`), sent as
  `application/json`, with an optional `X-App-Survey-Id` header. It returns
  `201 {id, url, code, codeExpiresAt}`. `url` is the private link to the survey on the website
  (`HeatLossDB:PublicWebBaseUrl` + `/s/{id}`); `code` is 5 letters and digits for typing into the
  website instead, valid for 24 hours.
- `GET /api/codes/{code}`: `{id}` for an unexpired code, or 404. Limited to 10 tries a minute per
  address, as codes are short enough to guess.
- `GET /api/surveys/{id}/scan`: the stored scan, exactly as uploaded.
- `POST /api/surveys/{id}/tidy`: tidies the stored scan (the website's Tidy button; see
  [Tidying scans](#tidying-scans)) and keeps the result beside it. Returns `{summary, changes}`;
  404 for an unknown survey, 422 if the scan can't be tidied. The upload itself is never changed.
- `GET /api/surveys/{id}/scan/tidied`: the latest tidy (a preview), or 404 until it has been tidied.
- `POST /api/surveys/{id}/tidy/accept`: makes the latest tidy the survey's floor plan ("Use tidied
  plan"). It's copied, so tidying again doesn't change the plan until that tidy is accepted too.
  Returns the versions; 409 if the survey hasn't been tidied.
- `PUT /api/surveys/{id}/versions/current` with `{"version": "original" | "tidied"}`: switches
  between the versions kept, the upload or the tidy accepted last. Returns the versions; 409 for
  `tidied` before any tidy has been accepted, 400 for anything else.
- `GET /api/surveys/{id}/versions`: `{current, versions: [{id, at, tidierVersion}]}`. The original
  upload is always listed; the tidy once one has been accepted.
- `GET /api/surveys/{id}/scan/current`: the floor plan the website opens, the accepted tidy when
  it's in use, else the upload. `X-Floorplan-Version` says which.

Once a survey has an owner (the first person to Save it), only they can accept a tidy or switch
versions (403 for anyone else). Before that, anyone with the link can, as with sharing.
- `GET /api/health`

IDs are 128-bit random values, so links can't be guessed. Holding the link is what gives access,
because there's no sign-in yet.

## Storage

Everything is kept in one Azure Storage account, named by the `Storage` connection string:

- **Blob container `scans`**: each scan (up to 25 MB), as uploaded, at `{id}.json`; its latest
  tidy, once made, at `{id}.tidied.json`; and the tidy its owner accepted at `{id}.accepted.json`.
  The survey row's `CurrentScan` says which one the website opens.
- **Table `surveys`**: a row per survey (partition key = survey id) holding its metadata, shape
  profile and heat pump figures. Profiles and figures are JSON, up to 32 KB each.
- **Table `surveycodes`**: upload codes (partition key = code), with the survey they open and when
  they expire. An expired code is reused by a later upload.

The container and tables are created on first start. In development the connection string is
`UseDevelopmentStorage=true` (Azurite; see `appsettings.Development.json`). In Azure, set
`ConnectionStrings__Storage` to the account's blob address, `https://<account>.blob.core.windows.net`,
and the app signs in with its managed identity (or your `az login` locally), so no keys are kept in
settings. Give that identity the **Storage Blob Data Contributor** and **Storage Table Data
Contributor** roles on the account. A storage connection string with a key works too.

## Heat pump figures

- `PUT /api/surveys/{id}/heat-pump`: a survey's heat loss and heat pump figures, as a JSON object
  with a `source` (e.g. `"heatpumpmonitor"` or `"survey"`). Candidates include these figures.
- Development only: `POST /api/dev/sample-heat-pumps` gives every home that has a profile but no
  figures believable made-up ones, marked `"source": "sample"` and shown as **Sample data** on the
  website. Add `?replace=true` to regenerate existing sample figures. Real figures are never
  overwritten by sample ones.

```sh
curl -X POST http://localhost:5080/api/dev/sample-heat-pumps
```

Homes uploaded later need seeding again once their link has been opened, because opening the
link is what saves their profile.

## Tidying scans

LiDAR scans stitched from rooms come out wonky: each storey at an angle, partitions scanned from both
sides as two walls with a gap, wardrobe fronts taken for walls, holes in the outside walls, upper
floors overhanging the floor below, and rooms that aren't closed. `HeatLossDB.ScanTidy` fixes these
in order, each step a class in `Passes/`:

1. **Orient**: turns each storey so its walls run along the axes, and squares up walls within 8°.
   Walls further off, such as bays, are left at their angle.
2. **Perimeter**: puts each outside face on one line, and fills a gap in it with an inferred wall
   when neither end of the gap meets another wall (a gap that turns a corner is a step, not a hole).
3. **Storeys**: lines each storey up with the one below, then moves each outside wall within 30 cm
   onto the wall below it and pins it there.
4. **Interior**: merges walls on the same line, turns two faces 5–40 cm apart into one partition
   with that thickness (`thicknessMm`), and joins corners within 25 cm.
5. **Fitted storage**: folds a 40–75 cm gap behind a doorless internal wall into its room, keeping
   it as a storage object.
6. **Stray walls**: removes short (under 60 cm) angled bits of wall with nothing in them that don't
   join anything up: an end meets no wall, or the piece lies along one wall (such as a door leaf
   caught in a doorway). A bay's angled walls stay: they carry windows or run off the end of a wall.
7. **Room closure**: flood-fills each storey from every room label and extends wall ends (up to
   1 m) until no room is open to the outside or to another room.
8. **Rooms**: brings the scanned rooms (`rooms[]`, each room's own copies of its surfaces, which
   the website draws room shapes from) into line: their copies of walls, doors and windows become
   the tidied ones, and each corner of a room's or storey's floor within 30 cm of a straight wall
   is moved onto it, so no floor runs past an outside wall or stops short of one.

Turning and shifting a storey moves `rooms[]` with it as well.

The tidied scan is a CapturedStructure like the upload, with every field it doesn't change kept, plus
a `heatlossdbTidy` block: the tidier's `version`, `tidiedAt`, the summary and every change. Each
change names the walls, the distance in mm and whether it `needsReview` (inferred walls, moves over
5 cm, wardrobe gaps, faces left unaligned, rooms still open). Tidying always starts again from the
upload, so it gives the same result every time; bump `ScanTidier.Version` when the rules change so
older tidied scans can be redone. Tolerances are in `TidyOptions`.

On the website, the editor's **Floor plan** action runs the tidy, shows the tidied plan beside
the current one with the changes worth checking, and accepts it with **Use tidied plan**. The
original stays listed there as a version to switch back to. Room names, Home fabric and other edits
carry over; storey nudges don't, as they were made for the other plan.

`HeatLossDB.ScanTidy.Tests` covers each rule on small made-up scans, and a real two-storey house
when `Web/fixtures/merged_3.json` is there (fixtures are gitignored, as they're people's homes).
These tests don't need Azurite.
