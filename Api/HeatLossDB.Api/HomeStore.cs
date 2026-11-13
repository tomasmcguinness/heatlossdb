using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Azure;
using Azure.Data.Tables;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace HeatLossDB.Api;

/// <summary>
/// Homes users have saved to their account: a row per home in Table Storage (keyed by the user's
/// Clerk id, then the survey's id) for listing, and the user's edits as a blob, which can be larger
/// than a table row allows. Only the user who saved a home can read it.
/// </summary>
public class HomeStore
{
    private readonly TableClient homes;
    private readonly BlobContainerClient edits;

    public HomeStore(TableClient homes, BlobContainerClient edits)
    {
        this.homes = homes;
        this.edits = edits;
        homes.CreateIfNotExists();
        edits.CreateIfNotExists();
    }

    /// <summary>Saves (or replaces) the user's edits to a survey. The blob goes first, so every
    /// listed home has its edits.</summary>
    public async Task SaveAsync(string userId, string surveyId, string name, JsonElement editsJson, CancellationToken cancellationToken)
    {
        var options = new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = "application/json" } };
        await Blob(userId, surveyId).UploadAsync(BinaryData.FromString(editsJson.GetRawText()), options, cancellationToken);
        var entity = new HomeEntity { PartitionKey = userId, RowKey = surveyId, Name = name, SavedAt = DateTimeOffset.UtcNow };
        await homes.UpsertEntityAsync(entity, TableUpdateMode.Replace, cancellationToken);
    }

    /// <summary>The user's saved homes, most recently saved first.</summary>
    public async Task<List<SavedHomeSummary>> ListAsync(string userId, CancellationToken cancellationToken)
    {
        var result = new List<SavedHomeSummary>();
        await foreach (var home in homes.QueryAsync<HomeEntity>(h => h.PartitionKey == userId, cancellationToken: cancellationToken))
            result.Add(new SavedHomeSummary(home.RowKey, home.Name, home.SavedAt));
        return result.OrderByDescending(h => h.SavedAt).ToList();
    }

    /// <summary>The user's saved home, or null if they haven't saved this survey.</summary>
    public async Task<SavedHome?> GetAsync(string userId, string surveyId, CancellationToken cancellationToken)
    {
        var row = await homes.GetEntityIfExistsAsync<HomeEntity>(userId, surveyId, cancellationToken: cancellationToken);
        if (!row.HasValue) return null;
        try
        {
            var content = await Blob(userId, surveyId).DownloadContentAsync(cancellationToken);
            using var document = JsonDocument.Parse(content.Value.Content.ToMemory());
            return new SavedHome(row.Value!.Name, row.Value.SavedAt, document.RootElement.Clone());
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }

    // Clerk ids are safe in a path, but hashing keeps blob names free of anything about the user.
    private BlobClient Blob(string userId, string surveyId) =>
        edits.GetBlobClient($"{Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(userId)))}/{surveyId}.json");
}

/// <summary>A saved home's row: PartitionKey is the user's Clerk id, RowKey the survey's id.</summary>
public class HomeEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "";
    public string RowKey { get; set; } = "";
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Name { get; set; } = "";
    public DateTimeOffset SavedAt { get; set; }
}

public record SavedHomeSummary(string Id, string Name, DateTimeOffset SavedAt);

public record SavedHome(string Name, DateTimeOffset SavedAt, JsonElement Edits);
