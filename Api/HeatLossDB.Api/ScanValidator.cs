using System.Text.Json;
using System.Text.RegularExpressions;

namespace HeatLossDB.Api;

/// <summary>Checks uploads look like what the app and website send.</summary>
public static partial class ScanValidator
{
    /// <summary>A scan is a RoomPlan CapturedStructure (the app's merged.json).</summary>
    /// <returns>Null if the scan is acceptable, otherwise a message for the client.</returns>
    public static string? Validate(byte[] body)
    {
        if (body.Length == 0) return "The upload is empty.";
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return "The scan must be a JSON object.";
            if (!root.TryGetProperty("walls", out var walls) || walls.ValueKind != JsonValueKind.Array)
                return "This doesn't look like a RoomPlan scan: it has no walls.";
            if (walls.GetArrayLength() == 0) return "The scan has no walls.";
            return null;
        }
        catch (JsonException)
        {
            return "The upload isn't valid JSON.";
        }
    }

    /// <summary>Heat pump figures are a JSON object saying where they came from ("source").</summary>
    public static string? ValidateHeatPump(byte[] body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return "The heat pump record must be a JSON object.";
            if (!root.TryGetProperty("source", out var source) || source.ValueKind != JsonValueKind.String)
                return "The heat pump record must say where its figures came from (\"source\").";
            return null;
        }
        catch (JsonException)
        {
            return "The heat pump record isn't valid JSON.";
        }
    }

    /// <summary>
    /// Share details: a JSON object with the listing "name", the first part of the postcode
    /// ("postcodeDistrict", never the full postcode), "shareRoomNames", and optionally "home",
    /// the owner's answers about how it's built.
    /// </summary>
    public static string? ValidateShare(byte[] body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return "The share details must be a JSON object.";
            if (!root.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String)
                return "The share details need the home's listing name (\"name\").";
            if (!root.TryGetProperty("postcodeDistrict", out var district)
                || district.ValueKind != JsonValueKind.String
                || !OutwardCode().IsMatch(district.GetString()!))
                return "The share details need the first part of a postcode (\"postcodeDistrict\"), such as SW1A.";
            if (!root.TryGetProperty("shareRoomNames", out var rooms) || rooms.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                return "The share details must say whether room names can be shown (\"shareRoomNames\").";
            if (root.TryGetProperty("home", out var home) && home.ValueKind != JsonValueKind.Object)
                return "\"home\" must be a JSON object.";
            return null;
        }
        catch (JsonException)
        {
            return "The share details aren't valid JSON.";
        }
    }

    /// <summary>A UK outward code, the first part of a postcode, uppercase.</summary>
    [GeneratedRegex("^[A-Z]{1,2}[0-9][A-Z0-9]?$")]
    private static partial Regex OutwardCode();

    /// <summary>A shape profile is a JSON object with "version": 1.</summary>
    public static string? ValidateProfile(byte[] body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return "The profile must be a JSON object.";
            if (!root.TryGetProperty("version", out var version)
                || version.ValueKind != JsonValueKind.Number
                || !version.TryGetInt32(out var number)
                || number != 1)
                return "Unsupported profile version.";
            return null;
        }
        catch (JsonException)
        {
            return "The profile isn't valid JSON.";
        }
    }
}
