using System.Text.Json;

namespace HeatLossDB.Api;

/// <summary>Checks an upload looks like a RoomPlan CapturedStructure (the app's merged.json).</summary>
public static class ScanValidator
{
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
}
