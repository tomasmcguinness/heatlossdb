# HeatLossDB API

ASP.NET Core (.NET 8) API that receives scans from the iOS app.

```sh
npx azurite --location .azurite --skipApiVersionCheck   # the storage emulator, in another terminal
cd HeatLossDB.Api && dotnet run     # listens on http://0.0.0.0:5080
dotnet test                         # from Api/; needs Azurite too
```

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
- `GET /api/health`

IDs are 128-bit random values, so links can't be guessed. Holding the link is what gives access,
because there's no sign-in yet.

## Storage

Everything is kept in one Azure Storage account, named by the `Storage` connection string:

- **Blob container `scans`**: each scan (up to 25 MB), as uploaded, at `{id}.json`.
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
