using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace HeatLossDB.Api;

/// <summary>
/// Believable but made-up heat loss and heat pump figures, for building the matching page before
/// real data arrives (from HeatPumpMonitor or surveys). Every record is marked "source": "sample".
/// The same survey always gets the same figures.
/// </summary>
public static class SampleHeatPumps
{
    private static readonly (string Make, string Model, double[] SizesKw)[] Models =
    [
        ("Vaillant", "aroTHERM plus", [3.5, 5, 7, 10, 12]),
        ("Mitsubishi", "Ecodan", [5, 6, 8.5, 11.2, 14]),
        ("Daikin", "Altherma 3", [4, 6, 8, 11, 14, 16]),
        ("Samsung", "EHS Mono R290", [5, 8, 12, 16]),
        ("Grant", "Aerona3", [6, 10, 13, 15.5]),
    ];

    /// <summary>Typical UK design conditions: 21 °C indoors at −2 °C outside.</summary>
    private const double IndoorTemperature = 21;
    private const double DesignOutdoorTemperature = -2;
    /// <summary>Heating degree days for a typical UK year.</summary>
    private const double DegreeDays = 2100;

    public static JsonObject Generate(string surveyId, double floorArea)
    {
        var random = new Random(StableSeed(surveyId));

        // Heat loss per m² at design conditions: 35 (well insulated) to 75 (draughty, solid walls).
        var designWatts = floorArea * (35 + random.NextDouble() * 40);
        var wattsPerKelvin = designWatts / (IndoorTemperature - DesignOutdoorTemperature);

        // Homes are rarely heated to design all year: scale degree-day demand down a little.
        var spaceHeatingKwh = wattsPerKelvin * DegreeDays * 24 / 1000 * 0.8;
        var hotWaterKwh = 1800 + random.NextDouble() * 1200;
        var heatKwh = spaceHeatingKwh + hotWaterKwh;

        var emitters = random.NextDouble() switch
        {
            < 0.7 => "radiators",
            < 0.85 => "underfloor",
            _ => "mixed",
        };
        var flowTemperature = emitters == "underfloor" ? 35 : Math.Round(38 + random.NextDouble() * 12);
        // Lower flow temperatures give better efficiency.
        var scop = Math.Round(4.7 - (flowTemperature - 35) * 0.07 - random.NextDouble() * 0.5, 1);

        var (make, model, sizes) = Models[random.Next(Models.Length)];
        var neededKw = designWatts / 1000;
        var capacityKw = sizes.FirstOrDefault(size => size >= neededKw, sizes[^1]);

        return new JsonObject
        {
            ["source"] = "sample",
            ["designHeatLossW"] = Math.Round(designWatts / 10) * 10,
            ["designOutdoorTemperature"] = DesignOutdoorTemperature,
            ["designIndoorTemperature"] = IndoorTemperature,
            ["heatLossBasis"] = random.NextDouble() < 0.5 ? "measured" : "survey",
            ["heatPump"] = new JsonObject
            {
                ["make"] = make,
                ["model"] = model,
                ["capacityKw"] = capacityKw,
            },
            ["annual"] = new JsonObject
            {
                ["heatDeliveredKwh"] = Math.Round(heatKwh / 10) * 10,
                ["electricityKwh"] = Math.Round(heatKwh / scop / 10) * 10,
                ["scop"] = scop,
            },
            ["designFlowTemperature"] = flowTemperature,
            ["emitters"] = emitters,
        };
    }

    private static int StableSeed(string value) =>
        BitConverter.ToInt32(SHA256.HashData(Encoding.UTF8.GetBytes(value)), 0);
}
