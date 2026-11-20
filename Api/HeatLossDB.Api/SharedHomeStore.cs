using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace HeatLossDB.Api;

/// <summary>
/// Homes shared by link (/h/{shareId}): a snapshot of what the owner chose to share, taken when they
/// shared it, so later edits don't show until they share again. Each share has two blobs: the floor
/// plan the survey had then ({id}/scan.json) and the owner's edits with the listing name
/// ({id}/home.json). Share ids are 128-bit random values, unrelated to the survey's id, so a shared
/// link can't be used to open or change the survey.
/// </summary>
public partial class SharedHomeStore
{
    private readonly BlobContainerClient shares;

    public SharedHomeStore(BlobContainerClient shares)
    {
        this.shares = shares;
        shares.CreateIfNotExists();
    }

    /// <summary>Saves (or replaces) a share's snapshot. The scan goes first, so every shared home has its plan.</summary>
    public async Task SaveAsync(string shareId, byte[] home, byte[] scan, CancellationToken cancellationToken)
    {
        if (!IsShareId(shareId)) throw new ArgumentException("That isn't a share id.", nameof(shareId));
        var options = new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = "application/json" } };
        await shares.GetBlobClient($"{shareId}/scan.json").UploadAsync(BinaryData.FromBytes(scan), options, cancellationToken);
        await shares.GetBlobClient($"{shareId}/home.json").UploadAsync(BinaryData.FromBytes(home), options, cancellationToken);
    }

    /// <summary>The shared home's name, when it was shared and the owner's edits, or null if there's no such share.</summary>
    public Task<Stream?> OpenHomeAsync(string shareId, CancellationToken cancellationToken) => OpenAsync(shareId, "home.json", cancellationToken);

    /// <summary>The floor plan as it was when the home was shared, or null if there's no such share.</summary>
    public Task<Stream?> OpenScanAsync(string shareId, CancellationToken cancellationToken) => OpenAsync(shareId, "scan.json", cancellationToken);

    private async Task<Stream?> OpenAsync(string shareId, string file, CancellationToken cancellationToken)
    {
        if (!IsShareId(shareId)) return null;
        try
        {
            return (await shares.GetBlobClient($"{shareId}/{file}").DownloadStreamingAsync(cancellationToken: cancellationToken)).Value.Content;
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex ShareIdPattern();

    /// <summary>Whether the id is well-formed (not whether there's a share with it).</summary>
    public static bool IsShareId(string id) => ShareIdPattern().IsMatch(id);
}

/// <summary>What goes into a shared home's snapshot, and what's left out.</summary>
public static class SharedHomes
{
    /// <summary>
    /// The shared home's home.json: its listing name, when it was shared, its postcode district, the
    /// owner's edits and its heat loss and heat pump figures, if it has any.
    /// Unless the owner allowed room names, the names they gave rooms are removed, so the rooms show
    /// as the scan numbered them (Room 1, Room 2…). Room names can say who lives there.
    /// </summary>
    public static byte[] Snapshot(ShareDetails details, DateTimeOffset sharedAt, JsonElement edits, string? heatPump)
    {
        var (name, shareRoomNames, postcodeDistrict) = details;
        var shared = JsonNode.Parse(edits.GetRawText())!.AsObject();
        if (!shareRoomNames && shared["rooms"] is JsonObject rooms)
        {
            foreach (var (_, room) in rooms)
                (room as JsonObject)?.Remove("name");
        }
        var home = new JsonObject
        {
            ["name"] = name,
            ["sharedAt"] = sharedAt,
            ["edits"] = shared,
        };
        if (postcodeDistrict is { Length: > 0 }) home["postcodeDistrict"] = postcodeDistrict;
        if (heatPump is not null && JsonNode.Parse(heatPump) is JsonObject figures) home["heatPump"] = figures;
        return JsonSerializer.SerializeToUtf8Bytes(home);
    }

    /// <summary>The floor plan to share: as stored, but without any edits a downloaded file carried
    /// (those are the snapshot's job, with room names removed).</summary>
    public static byte[] Scan(byte[] scan)
    {
        if (JsonNode.Parse(scan) is not JsonObject root || !root.ContainsKey("edits")) return scan;
        root.Remove("edits");
        return JsonSerializer.SerializeToUtf8Bytes(root);
    }

    /// <summary>Reads what the owner said when sharing (see <see cref="ScanValidator.ValidateShare"/>):
    /// the listing name, whether room names may be shown, and the postcode district.</summary>
    public static ShareDetails Details(string share)
    {
        using var document = JsonDocument.Parse(share);
        var root = document.RootElement;
        var name = root.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()! : "";
        var roomNames = root.TryGetProperty("shareRoomNames", out var r) && r.ValueKind == JsonValueKind.True;
        var district = root.TryGetProperty("postcodeDistrict", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;
        return new ShareDetails(name, roomNames, district);
    }
}

/// <summary>What the owner said when sharing that the shared link uses.</summary>
public record ShareDetails(string Name, bool ShareRoomNames, string? PostcodeDistrict);

/// <param name="Id">The share's id, as in /h/{id}.</param>
/// <param name="Url">The link to hand out.</param>
public record ShareLinkResult(string Id, string Url);
