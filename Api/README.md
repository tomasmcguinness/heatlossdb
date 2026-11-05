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
