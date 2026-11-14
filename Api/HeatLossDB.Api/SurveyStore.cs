using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Azure;
using Azure.Data.Tables;

namespace HeatLossDB.Api;

/// <summary>
/// Stores uploaded surveys: the scan as-is in <see cref="IScanStorage"/>, and a row per survey in
/// Table Storage holding its metadata, shape profile and heat pump figures. Survey ids are 128-bit
/// random values, so a link to a survey can't be guessed. Each upload also gets a short code for
/// typing into the website, which expires after a day.
/// </summary>
public partial class SurveyStore
{
    private readonly IScanStorage scans;
    private readonly TableClient surveys;
    private readonly TableClient codes;

    public SurveyStore(IScanStorage scans, TableClient surveys, TableClient codes)
    {
        this.scans = scans;
        this.surveys = surveys;
        this.codes = codes;

        surveys.CreateIfNotExists();
        codes.CreateIfNotExists();
    }

    /// <summary>How long an upload's code can be used to open it. The link keeps working.</summary>
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromHours(24);

    public async Task<SavedSurvey> SaveAsync(byte[] scan, string? appSurveyId, CancellationToken cancellationToken)
    {
        // The scan goes first, so every row has its scan.
        var id = NewId();
        await scans.SaveAsync(id, scan, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        await AddAsync(new SurveyEntity { PartitionKey = id, CreatedAt = now, AppSurveyId = appSurveyId, SizeBytes = scan.Length }, cancellationToken);

        var (code, expiresAt) = await CreateCodeAsync(id, now, cancellationToken);
        return new SavedSurvey(id, code, expiresAt);
    }

    /// <summary>Adds a survey's row as it is, such as one brought over from the old database.</summary>
    public Task AddAsync(SurveyEntity survey, CancellationToken cancellationToken) =>
        surveys.AddEntityAsync(survey, cancellationToken);

    private async Task<(string Code, DateTimeOffset ExpiresAt)> CreateCodeAsync(string id, DateTimeOffset now, CancellationToken cancellationToken)
    {
        // Whole seconds, which the app's ISO 8601 date decoding expects.
        var expiresAt = now + CodeLifetime;
        expiresAt = expiresAt.AddTicks(-(expiresAt.Ticks % TimeSpan.TicksPerSecond));

        for (var attempt = 1; attempt <= 10; attempt++)
        {
            var entity = new CodeEntity { PartitionKey = NewCode(), SurveyId = id, ExpiresAt = expiresAt };
            try
            {
                await codes.AddEntityAsync(entity, cancellationToken);
                return (entity.PartitionKey, expiresAt);
            }
            catch (RequestFailedException e) when (e.Status == 409)
            {
                // The code is in use. Take it over if it has expired, unless another upload just did.
                var existing = (await codes.GetEntityAsync<CodeEntity>(entity.PartitionKey, "", cancellationToken: cancellationToken)).Value;
                if (existing.ExpiresAt >= now) continue;
                try
                {
                    await codes.UpdateEntityAsync(entity, existing.ETag, TableUpdateMode.Replace, cancellationToken);
                    return (entity.PartitionKey, expiresAt);
                }
                catch (RequestFailedException taken) when (taken.Status == 412)
                {
                }
            }
        }
        throw new InvalidOperationException("Couldn't find a free upload code.");
    }

    /// <summary>The id of the survey a code opens, or null if the code is unknown or has expired.
    /// Codes are case-insensitive.</summary>
    public async Task<string?> FindByCodeAsync(string code, CancellationToken cancellationToken)
    {
        code = code.ToUpperInvariant();
        if (!CodePattern().IsMatch(code)) return null;
        var entity = await codes.GetEntityIfExistsAsync<CodeEntity>(code, "", cancellationToken: cancellationToken);
        return entity.HasValue && entity.Value!.ExpiresAt >= DateTimeOffset.UtcNow ? entity.Value.SurveyId : null;
    }

    /// <summary>The stored scan, or null if there's no survey with this id.</summary>
    public Task<Stream?> OpenScanAsync(string id, CancellationToken cancellationToken) =>
        IdPattern().IsMatch(id) ? scans.OpenAsync(id, cancellationToken) : Task.FromResult<Stream?>(null);

    public async Task<bool> ExistsAsync(string id, CancellationToken cancellationToken) =>
        IdPattern().IsMatch(id) && (await GetAsync(id, [nameof(SurveyEntity.PartitionKey)], cancellationToken)) is not null;

    /// <summary>
    /// Makes the user the survey's owner, unless it already has one: the first person to Save it
    /// owns it, and saving it again (by them or anyone else) doesn't change that. Returns the owner.
    /// </summary>
    public async Task<string> ClaimAsync(string id, string userId, CancellationToken cancellationToken)
    {
        while (true)
        {
            var survey = await GetAsync(id, [nameof(SurveyEntity.OwnerId)], cancellationToken)
                ?? throw new InvalidOperationException($"There's no survey {id}.");
            if (survey.OwnerId is { Length: > 0 } owner) return owner;
            try
            {
                // Only if nobody has claimed it since it was read.
                var claim = new TableEntity(id, "") { [nameof(SurveyEntity.OwnerId)] = userId };
                await surveys.UpdateEntityAsync(claim, survey.ETag, TableUpdateMode.Merge, cancellationToken);
                return userId;
            }
            catch (RequestFailedException e) when (e.Status == 412)
            {
            }
        }
    }

    /// <summary>The Clerk user id of whoever owns the survey, or null if nobody has saved it yet.</summary>
    public async Task<string?> OwnerOfAsync(string id, CancellationToken cancellationToken) =>
        (await GetAsync(id, [nameof(SurveyEntity.OwnerId)], cancellationToken))?.OwnerId;

    /// <summary>Saves the survey's shape profile: the measurements and lined-up outlines the
    /// website derives from the scan, used for matching.</summary>
    public Task SaveProfileAsync(string id, byte[] profile, CancellationToken cancellationToken) =>
        SetAsync(id, nameof(SurveyEntity.Profile), Encoding.UTF8.GetString(profile), cancellationToken);

    /// <summary>
    /// Every shared survey that has a profile, to match against or browse. With an id, that survey and
    /// other uploads of the same app survey (e.g. "Upload Again") are left out, so a home never
    /// matches itself. Without one (a scan opened from a file), every home is a candidate.
    /// </summary>
    public async Task<List<Candidate>> CandidatesForAsync(string? id, CancellationToken cancellationToken)
    {
        var mine = id is null ? null : (await GetAsync(id, [nameof(SurveyEntity.AppSurveyId)], cancellationToken))?.AppSurveyId;

        // Every row: fine for thousands of homes, as matching needs every profile anyway.
        var candidates = new List<(DateTimeOffset CreatedAt, Candidate Candidate)>();
        string[] columns = [nameof(SurveyEntity.PartitionKey), nameof(SurveyEntity.CreatedAt), nameof(SurveyEntity.AppSurveyId), nameof(SurveyEntity.Profile), nameof(SurveyEntity.HeatPump), nameof(SurveyEntity.Share)];
        // Only homes that have been shared can be matched against.
        await foreach (var survey in surveys.QueryAsync<SurveyEntity>(s => s.IsShared, select: columns, cancellationToken: cancellationToken))
        {
            if (survey.PartitionKey == id || survey.Profile is null) continue;
            if (mine is not null && survey.AppSurveyId == mine) continue;
            var heatPump = survey.HeatPump is null ? (JsonElement?)null : ParseJson(survey.HeatPump);
            var share = survey.Share is null ? (JsonElement?)null : ParseJson(survey.Share);
            candidates.Add((survey.CreatedAt, new Candidate(survey.PartitionKey, survey.CreatedAt.ToString("O"), ParseJson(survey.Profile), heatPump, share)));
        }
        return candidates.OrderByDescending(c => c.CreatedAt).Select(c => c.Candidate).ToList();
    }

    /// <summary>Saves what the owner said when sharing (the listing name, postcode district,
    /// whether room names may be shown, and the answers about how the home is built), and marks
    /// the survey shared, so others can match against it.</summary>
    public Task SaveShareAsync(string id, byte[] share, CancellationToken cancellationToken) =>
        surveys.UpdateEntityAsync(
            new TableEntity(id, "") { [nameof(SurveyEntity.Share)] = Encoding.UTF8.GetString(share), [nameof(SurveyEntity.IsShared)] = true },
            ETag.All, TableUpdateMode.Merge, cancellationToken);

    /// <summary>Saves a survey's heat loss and heat pump figures (real or sample).</summary>
    public Task SaveHeatPumpAsync(string id, byte[] record, CancellationToken cancellationToken) =>
        SetAsync(id, nameof(SurveyEntity.HeatPump), Encoding.UTF8.GetString(record), cancellationToken);

    /// <summary>Where the survey's saved figures came from ("sample", "heatpumpmonitor"…), or
    /// null if it has none.</summary>
    public async Task<string?> HeatPumpSourceAsync(string id, CancellationToken cancellationToken)
    {
        if ((await GetAsync(id, [nameof(SurveyEntity.HeatPump)], cancellationToken))?.HeatPump is not { } json) return null;
        return ParseJson(json).TryGetProperty("source", out var source) ? source.GetString() : null;
    }

    /// <summary>Every survey's id and saved floor area, for generating sample data.</summary>
    public async Task<List<(string Id, double FloorArea)>> SurveysWithProfilesAsync(CancellationToken cancellationToken)
    {
        var result = new List<(string, double)>();
        string[] columns = [nameof(SurveyEntity.PartitionKey), nameof(SurveyEntity.Profile)];
        await foreach (var survey in surveys.QueryAsync<SurveyEntity>(select: columns, cancellationToken: cancellationToken))
        {
            if (survey.Profile is not null
                && ParseJson(survey.Profile).TryGetProperty("floorArea", out var area) && area.TryGetDouble(out var floorArea))
                result.Add((survey.PartitionKey, floorArea));
        }
        return result;
    }

    private async Task<SurveyEntity?> GetAsync(string id, string[] columns, CancellationToken cancellationToken)
    {
        if (!IdPattern().IsMatch(id)) return null;
        var survey = await surveys.GetEntityIfExistsAsync<SurveyEntity>(id, "", columns, cancellationToken);
        return survey.HasValue ? survey.Value : null;
    }

    /// <summary>Sets one column of an existing survey's row, leaving the others as they are.</summary>
    private Task SetAsync(string id, string column, string value, CancellationToken cancellationToken) =>
        surveys.UpdateEntityAsync(new TableEntity(id, "") { [column] = value }, ETag.All, TableUpdateMode.Merge, cancellationToken);

    private static JsonElement ParseJson(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L).</summary>
    private const string CodeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    private static string NewCode() =>
        string.Create(5, 0, (chars, _) =>
        {
            for (var i = 0; i < chars.Length; i++) chars[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
        });

    [GeneratedRegex("^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$")]
    private static partial Regex CodePattern();

    private static string NewId() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex IdPattern();

    /// <summary>Whether the id is well-formed (not whether there's a survey with it).</summary>
    public static bool IsId(string id) => IdPattern().IsMatch(id);
}

/// <summary>A survey's row, keyed by its id. Profile, HeatPump and Share are JSON, each at most 32 KB
/// (Table Storage keeps text properties under 64 KB).</summary>
public class SurveyEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "";
    public string RowKey { get; set; } = "";
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public string? AppSurveyId { get; set; }
    public int SizeBytes { get; set; }
    public string? Profile { get; set; }
    public string? HeatPump { get; set; }
    public string? Share { get; set; }
    /// <summary>The Clerk user id of the first person to Save the survey to their account. Uploads
    /// are anonymous, so until someone saves it the survey has no owner.</summary>
    public string? OwnerId { get; set; }
    /// <summary>Whether the home has been shared. Only shared homes are matched against (search
    /// and browsing). Older rows don't have it, which reads as false.</summary>
    public bool IsShared { get; set; }
}

/// <summary>An upload code, keyed by the code itself.</summary>
public class CodeEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "";
    public string RowKey { get; set; } = "";
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string SurveyId { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
}

public record SavedSurvey(string Id, string Code, DateTimeOffset CodeExpiresAt);

public record Candidate(string Id, string CreatedAt, JsonElement Profile, JsonElement? HeatPump, JsonElement? Share);
