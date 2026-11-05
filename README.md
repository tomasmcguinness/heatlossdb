# HeatLossDB

An open source repository of property floorpans and heat loss. The aim is to give users confidence to choose a heat pump, by using real world data.

## Running locally

| Part | Folder | Run |
| --- | --- | --- |
| iOS app | `App/` | Open `HeatLossDB.xcodeproj` and run on a LiDAR iPhone or iPad |
| API | `Api/` | `cd Api/HeatLossDB.Api && dotnet run` (port 5080) |
| Website | `Web/` | `cd Web && npm install && npm run dev` (port 5179, proxies `/api` to the API) |

The app uploads to `HeatLossDBAPIBaseURL` in `App/HeatLossDB/Info.plist`, currently
`http://Tomass-Mac-Studio.local:5080`. The phone must be on the same Wi-Fi as the Mac. Upload links
open at `http://Tomass-Mac-Studio.local:5179/s/{id}`.
