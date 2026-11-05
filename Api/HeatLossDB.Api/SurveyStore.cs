using System.Security.Cryptography;
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
    private readonly string connectionString;

    public SurveyStore(IOptions<HeatLossDbOptions> options, IHostEnvironment environment)
    {
        var dataDirectory = Path.GetFullPath(options.Value.DataDirectory, environment.ContentRootPath);
        scansDirectory = Path.Combine(dataDirectory, "scans");
        Directory.CreateDirectory(scansDirectory);
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
        var path = Path.Combine(scansDirectory, $"{id}.json");

        // Write to a temporary file first so a half-written scan is never served.
        var temporary = path + ".tmp";
        await File.WriteAllBytesAsync(temporary, scan, cancellationToken);
        File.Move(temporary, path);

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

    private static string NewId() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex IdPattern();
}
