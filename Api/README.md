# HeatLossDB API

ASP.NET Core (.NET 8) API that receives scans from the iOS app.

```sh
cd HeatLossDB.Api && dotnet run     # listens on http://0.0.0.0:5080
dotnet test                         # from Api/
```

## Endpoints

- `POST /api/surveys`: body is the app's `merged.json` (a RoomPlan `CapturedStructure`), sent as
  `application/json`, with an optional `X-App-Survey-Id` header. It returns `201 {id, url}`.
  `url` is the private link to the survey on the website (`HeatLossDB:PublicWebBaseUrl` + `/s/{id}`).
- `GET /api/surveys/{id}/scan`: the stored scan, exactly as uploaded.
- `GET /api/health`

IDs are 128-bit random values, so links can't be guessed. Holding the link is what gives access,
because there's no sign-in yet.

## Storage

Scans go in `HeatLossDB.Api/Data/scans/{id}.json`, and metadata in `Data/heatlossdb.db` (SQLite).
`Data/` is gitignored because it holds floorplans of real homes.

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
