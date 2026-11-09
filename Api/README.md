# HeatLossDB API

ASP.NET Core (.NET 8) API that receives scans from the iOS app.

```sh
cd HeatLossDB.Api && dotnet run     # listens on http://0.0.0.0:5080
dotnet test                         # from Api/
```

Publishing builds the website (`../Web`) into `wwwroot`, and the API serves it: any path outside
`/api` gets `index.html`, so links like `/s/{id}` work. In development, run the website with Vite
instead (see the main README).

## Endpoints

- `POST /api/surveys`: body is the app's `merged.json` (a RoomPlan `CapturedStructure`), sent as
  `application/json`, with an optional `X-App-Survey-Id` header. It returns `201 {id, url}`.
  `url` is the private link to the survey on the website (`HeatLossDB:PublicWebBaseUrl` + `/s/{id}`).
- `GET /api/surveys/{id}/scan`: the stored scan, exactly as uploaded.
- `GET /api/health`

IDs are 128-bit random values, so links can't be guessed. Holding the link is what gives access,
because there's no sign-in yet.

## Storage

Each survey is a scan (up to 25 MB, kept as uploaded) plus a database row holding its metadata,
shape profile and heat pump figures.

| | Scans | Database |
| --- | --- | --- |
| Local (default) | `Data/scans/{id}.json` | SQLite, `Data/heatlossdb.db` |
| Azure | Blob Storage, container `scans` | Azure SQL, table `Surveys` |

Azure is used when these connection strings are set (e.g. as `ConnectionStrings__Database` and
`ConnectionStrings__Storage` environment variables):

- `Database`: e.g. `Server=tcp:<server>.database.windows.net;Database=heatlossdb;Authentication=Active Directory Default;Encrypt=True`.
  The `Surveys` table is created on first start.
- `Storage`: the account's blob address, `https://<account>.blob.core.windows.net`, or a storage
  connection string. The `scans` container is created on first start.

With `Active Directory Default` and a blob address, the app signs in with its managed identity (or
your `az login` locally), so no keys are kept in settings. Give that identity:

- on the storage account, the **Storage Blob Data Contributor** role;
- in the database (run as the server's Entra admin), access including creating the table:
  ```sql
  CREATE USER [<app or identity name>] FROM EXTERNAL PROVIDER;
  ALTER ROLE db_datareader ADD MEMBER [<app or identity name>];
  ALTER ROLE db_datawriter ADD MEMBER [<app or identity name>];
  ALTER ROLE db_ddladmin ADD MEMBER [<app or identity name>];
  ```

`Data/` is gitignored because it holds floorplans of real homes. Data directories from before
profiles and figures moved into the database are upgraded on start; the old `profiles/` and
`heat-pumps/` folders are then no longer used.

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
