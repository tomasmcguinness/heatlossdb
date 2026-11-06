using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace HeatLossDB.Api;

/// <summary>
/// Stores uploaded scans: the JSON as-is on disk, and a row of metadata in SQLite.
/// Survey ids are 128-bit random values, so a link to a survey can't be guessed.
/// </summary>
public partial class SurveyStore
{
    private readonly string scansDirectory;
    private readonly string profilesDirectory;
    private readonly string heatPumpsDirectory;
    private readonly string connectionString;

    public SurveyStore(IOptions<HeatLossDbOptions> options, IHostEnvironment environment)
    {
        var dataDirectory = Path.GetFullPath(options.Value.DataDirectory, environment.ContentRootPath);
        scansDirectory = Path.Combine(dataDirectory, "scans");
        profilesDirectory = Path.Combine(dataDirectory, "profiles");
        Directory.CreateDirectory(scansDirectory);
        heatPumpsDirectory = Path.Combine(dataDirectory, "heat-pumps");
        Directory.CreateDirectory(profilesDirectory);
        Directory.CreateDirectory(heatPumpsDirectory);
        connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(dataDirectory, "heatlossdb.db"),
        }.ToString();

        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS Surveys (
                Id TEXT PRIMARY KEY,
                CreatedAt TEXT NOT NULL,
                AppSurveyId TEXT NULL,
                SizeBytes INTEGER NOT NULL
            )
            """;
        command.ExecuteNonQuery();
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }

    public async Task<string> SaveAsync(byte[] scan, string? appSurveyId, CancellationToken cancellationToken)
    {
        var id = NewId();
        await WriteAtomicallyAsync(Path.Combine(scansDirectory, $"{id}.json"), scan, cancellationToken);

        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO Surveys (Id, CreatedAt, AppSurveyId, SizeBytes)
            VALUES ($id, $createdAt, $appSurveyId, $size)
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$createdAt", DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$appSurveyId", (object?)appSurveyId ?? DBNull.Value);
        command.Parameters.AddWithValue("$size", scan.Length);
        await command.ExecuteNonQueryAsync(cancellationToken);

        return id;
    }

    /// <summary>The stored scan's file, or null if there's no survey with this id.</summary>
    public string? ScanPath(string id)
    {
        // Only well-formed ids reach the file system, so an id can't point outside the folder.
        if (!IdPattern().IsMatch(id)) return null;
        var path = Path.Combine(scansDirectory, $"{id}.json");
        return File.Exists(path) ? path : null;
    }

    public bool Exists(string id) => ScanPath(id) is not null;

    /// <summary>Saves the survey's shape profile: the measurements and lined-up outlines the
    /// website derives from the scan, used for matching.</summary>
    public Task SaveProfileAsync(string id, byte[] profile, CancellationToken cancellationToken) =>
        WriteAtomicallyAsync(Path.Combine(profilesDirectory, $"{id}.json"), profile, cancellationToken);

    /// <summary>
    /// Every other survey that has a profile, to match against. Uploads of the same app survey
    /// (e.g. "Upload Again") are left out, so a home never matches itself.
    /// </summary>
    public async Task<List<Candidate>> CandidatesForAsync(string id, CancellationToken cancellationToken)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CreatedAt FROM Surveys
            WHERE Id <> $id
              AND (AppSurveyId IS NULL
                   OR AppSurveyId IS NOT (SELECT AppSurveyId FROM Surveys WHERE Id = $id))
            ORDER BY CreatedAt DESC
            """;
        command.Parameters.AddWithValue("$id", id);

        var candidates = new List<Candidate>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var candidateId = reader.GetString(0);
            var profile = await ReadJsonAsync(Path.Combine(profilesDirectory, $"{candidateId}.json"), cancellationToken);
            if (profile is null) continue;
            var heatPump = await ReadJsonAsync(Path.Combine(heatPumpsDirectory, $"{candidateId}.json"), cancellationToken);
            candidates.Add(new Candidate(candidateId, reader.GetString(1), profile.Value, heatPump));
        }
        return candidates;
    }

    /// <summary>Saves a survey's heat loss and heat pump figures (real or sample).</summary>
    public Task SaveHeatPumpAsync(string id, byte[] record, CancellationToken cancellationToken) =>
        WriteAtomicallyAsync(Path.Combine(heatPumpsDirectory, $"{id}.json"), record, cancellationToken);

    /// <summary>Where the survey's saved figures came from ("sample", "heatpumpmonitor"…), or
    /// null if it has none.</summary>
    public async Task<string?> HeatPumpSourceAsync(string id, CancellationToken cancellationToken)
    {
        var record = await ReadJsonAsync(Path.Combine(heatPumpsDirectory, $"{id}.json"), cancellationToken);
        return record?.TryGetProperty("source", out var source) == true ? source.GetString() : null;
    }

    /// <summary>Every survey's id and saved floor area, for generating sample data.</summary>
    public async Task<List<(string Id, double FloorArea)>> SurveysWithProfilesAsync(CancellationToken cancellationToken)
    {
        var result = new List<(string, double)>();
        foreach (var path in Directory.EnumerateFiles(profilesDirectory, "*.json"))
        {
            using var document = JsonDocument.Parse(await File.ReadAllBytesAsync(path, cancellationToken));
            if (document.RootElement.TryGetProperty("floorArea", out var area) && area.TryGetDouble(out var floorArea))
                result.Add((Path.GetFileNameWithoutExtension(path), floorArea));
        }
        return result;
    }

    private async Task<JsonElement?> ReadJsonAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path)) return null;
        using var document = JsonDocument.Parse(await File.ReadAllBytesAsync(path, cancellationToken));
        return document.RootElement.Clone();
    }

    /// <summary>Writes to a temporary file first so a half-written file is never served.</summary>
    private static async Task WriteAtomicallyAsync(string path, byte[] contents, CancellationToken cancellationToken)
    {
        var temporary = path + ".tmp";
        await File.WriteAllBytesAsync(temporary, contents, cancellationToken);
        File.Move(temporary, path, overwrite: true);
    }

    private static string NewId() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex IdPattern();
}

public record Candidate(string Id, string CreatedAt, JsonElement Profile, JsonElement? HeatPump);
