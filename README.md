# HeatLossDB

An open source repository of property floorpans and heat loss. The aim is to give users confidence to choose a heat pump, by using real world data.

## Running locally

| Part | Folder | Run |
| --- | --- | --- |
| iOS app | `App/` | Open `HeatLossDB.xcodeproj` and run on a LiDAR iPhone or iPad |
| API and website | `Api/`, `Web/` | Run `Api/HeatLossDB.sln` in Visual Studio, or `cd Api/HeatLossDB.Api && dotnet run` |

The API keeps its data in Azure Storage, so start [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite),
the storage emulator, first (`npx azurite --location .azurite`, or the Docker image). Running the API (port 5080) also starts the website's Vite dev server (port 5179, which proxies
`/api` to the API), and the browser is sent there. To work on the website alone, `cd Web && npm run dev`
with the API already running.

The app uploads to `HeatLossDBAPIBaseURL` in `App/HeatLossDB/Info.plist`, currently
`http://Tomass-Mac-Studio.local:5080`. The phone must be on the same Wi-Fi as the Mac. Upload links
open at `http://Tomass-Mac-Studio.local:5179/s/{id}`.

## Deploying

The API serves the website, so one deployment runs both:

```sh
dotnet publish Api/HeatLossDB.Api -c Release -o publish
```

This builds `Web/` (it needs Node.js) and puts it in `publish/wwwroot`. Set
`HeatLossDB__PublicWebBaseUrl` to the site's address (e.g. `https://heatlossdb.org`) so upload links
point there. Set the `Storage` connection string to the storage account (see `Api/README.md`).
