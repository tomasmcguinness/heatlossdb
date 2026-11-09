using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;

namespace HeatLossDB.Api;

/// <summary>
/// Stores uploaded surveys: the scan as-is in <see cref="IScanStorage"/>, and a row per survey
/// holding its metadata, shape profile and heat pump figures. The database is Azure SQL when
/// the "Database" connection string is set, otherwise SQLite in the data directory.
/// Survey ids are 128-bit random values, so a link to a survey can't be guessed.
/// </summary>
public partial class SurveyStore
{
    private readonly IScanStorage scans;
    private readonly Func<DbConnection> connect;
    private readonly bool sqlServer;

    public SurveyStore(IScanStorage scans, IOptions<HeatLossDbOptions> options, IConfiguration configuration, IHostEnvironment environment)
    {
        this.scans = scans;
        if (configuration.GetConnectionString("Database") is { } connectionString)
        {
            sqlServer = true;
            // A serverless database pauses when idle and takes a while to wake, so keep retrying.
            var retry = SqlConfigurableRetryFactory.CreateExponentialRetryProvider(new SqlRetryLogicOption
            {
                NumberOfTries = 6,
                DeltaTime = TimeSpan.FromSeconds(2),
                MaxTimeInterval = TimeSpan.FromSeconds(30),
            });
            connect = () => new SqlConnection(connectionString) { RetryLogicProvider = retry };
            CreateSqlServerSchema();
        }
        else
        {
            var dataDirectory = options.Value.ResolveDataDirectory(environment);
            Directory.CreateDirectory(dataDirectory);
            var sqlite = new SqliteConnectionStringBuilder { DataSource = Path.Combine(dataDirectory, "heatlossdb.db") }.ToString();
            connect = () => new SqliteConnection(sqlite);
            CreateSqliteSchema(dataDirectory);
        }
    }

    private void CreateSqlServerSchema()
    {
        // Ids are case-sensitive, so they get a binary collation.
        try
        {
            CreateSurveysTable();
        }
        catch (SqlException e) when (e.Number == 2714)
        {
            // Another instance starting at the same time created it first.
        }
    }

    private void CreateSurveysTable()
    {
        Execute("""
            IF OBJECT_ID('dbo.Surveys') IS NULL
            CREATE TABLE dbo.Surveys (
                Id VARCHAR(22) COLLATE Latin1_General_BIN2 NOT NULL PRIMARY KEY,
                CreatedAt DATETIMEOFFSET NOT NULL,
                AppSurveyId NVARCHAR(MAX) NULL,
                SizeBytes INT NOT NULL,
                Profile NVARCHAR(MAX) NULL,
                HeatPump NVARCHAR(MAX) NULL
            )
            """);
    }

    private void CreateSqliteSchema(string dataDirectory)
    {
        Execute("""
            CREATE TABLE IF NOT EXISTS Surveys (
                Id TEXT PRIMARY KEY,
                CreatedAt TEXT NOT NULL,
                AppSurveyId TEXT NULL,
                SizeBytes INTEGER NOT NULL,
                Profile TEXT NULL,
                HeatPump TEXT NULL
            )
            """);

        // Databases from before profiles and figures moved into the table: add the columns and
        // bring in the files they used to be kept in.
        using var connection = Open();
        using var columns = connection.CreateCommand();
        columns.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Surveys') WHERE name = 'Profile'";
        if (Convert.ToInt64(columns.ExecuteScalar()) > 0) return;

        Execute("ALTER TABLE Surveys ADD COLUMN Profile TEXT NULL");
        Execute("ALTER TABLE Surveys ADD COLUMN HeatPump TEXT NULL");
        foreach (var (folder, column) in new[] { ("profiles", "Profile"), ("heat-pumps", "HeatPump") })
        {
            var directory = Path.Combine(dataDirectory, folder);
            if (!Directory.Exists(directory)) continue;
            foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
                Execute($"UPDATE Surveys SET {column} = @value WHERE Id = @id",
                    ("@id", Path.GetFileNameWithoutExtension(path)), ("@value", File.ReadAllText(path)));
        }
    }

    public async Task<string> SaveAsync(byte[] scan, string? appSurveyId, CancellationToken cancellationToken)
    {
        // The scan goes first, so every row has its scan.
        var id = NewId();
        await scans.SaveAsync(id, scan, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        await ExecuteAsync("""
            INSERT INTO Surveys (Id, CreatedAt, AppSurveyId, SizeBytes)
            VALUES (@id, @createdAt, @appSurveyId, @size)
            """,
            cancellationToken,
            ("@id", id), ("@createdAt", sqlServer ? now : (object)now.ToString("O")), ("@appSurveyId", appSurveyId), ("@size", scan.Length));

        return id;
    }

    /// <summary>The stored scan, or null if there's no survey with this id.</summary>
    public Task<Stream?> OpenScanAsync(string id, CancellationToken cancellationToken) =>
        IdPattern().IsMatch(id) ? scans.OpenAsync(id, cancellationToken) : Task.FromResult<Stream?>(null);

    public async Task<bool> ExistsAsync(string id, CancellationToken cancellationToken) =>
        IdPattern().IsMatch(id) && await ScalarAsync("SELECT 1 FROM Surveys WHERE Id = @id", cancellationToken, ("@id", id)) is not null;

    /// <summary>Saves the survey's shape profile: the measurements and lined-up outlines the
    /// website derives from the scan, used for matching.</summary>
    public Task SaveProfileAsync(string id, byte[] profile, CancellationToken cancellationToken) =>
        ExecuteAsync("UPDATE Surveys SET Profile = @value WHERE Id = @id", cancellationToken,
            ("@id", id), ("@value", Encoding.UTF8.GetString(profile)));

    /// <summary>
    /// Every other survey that has a profile, to match against. Uploads of the same app survey
    /// (e.g. "Upload Again") are left out, so a home never matches itself.
    /// </summary>
    public async Task<List<Candidate>> CandidatesForAsync(string id, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = Command(connection, """
            SELECT Id, CreatedAt, Profile, HeatPump FROM Surveys AS s
            WHERE Id <> @id
              AND Profile IS NOT NULL
              AND (AppSurveyId IS NULL
                   OR NOT EXISTS (SELECT 1 FROM Surveys AS me WHERE me.Id = @id AND me.AppSurveyId = s.AppSurveyId))
            ORDER BY CreatedAt DESC
            """,
            ("@id", id));

        var candidates = new List<Candidate>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var createdAt = reader.GetValue(1) is DateTimeOffset at ? at.ToString("O") : reader.GetString(1);
            var heatPump = reader.IsDBNull(3) ? (JsonElement?)null : ParseJson(reader.GetString(3));
            candidates.Add(new Candidate(reader.GetString(0), createdAt, ParseJson(reader.GetString(2)), heatPump));
        }
        return candidates;
    }

    /// <summary>Saves a survey's heat loss and heat pump figures (real or sample).</summary>
    public Task SaveHeatPumpAsync(string id, byte[] record, CancellationToken cancellationToken) =>
        ExecuteAsync("UPDATE Surveys SET HeatPump = @value WHERE Id = @id", cancellationToken,
            ("@id", id), ("@value", Encoding.UTF8.GetString(record)));

    /// <summary>Where the survey's saved figures came from ("sample", "heatpumpmonitor"…), or
    /// null if it has none.</summary>
    public async Task<string?> HeatPumpSourceAsync(string id, CancellationToken cancellationToken)
    {
        if (await ScalarAsync("SELECT HeatPump FROM Surveys WHERE Id = @id", cancellationToken, ("@id", id)) is not string json)
            return null;
        return ParseJson(json).TryGetProperty("source", out var source) ? source.GetString() : null;
    }

    /// <summary>Every survey's id and saved floor area, for generating sample data.</summary>
    public async Task<List<(string Id, double FloorArea)>> SurveysWithProfilesAsync(CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = Command(connection, "SELECT Id, Profile FROM Surveys WHERE Profile IS NOT NULL");
        var result = new List<(string, double)>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (ParseJson(reader.GetString(1)).TryGetProperty("floorArea", out var area) && area.TryGetDouble(out var floorArea))
                result.Add((reader.GetString(0), floorArea));
        }
        return result;
    }

    private DbConnection Open()
    {
        var connection = connect();
        connection.Open();
        return connection;
    }

    private async Task<DbConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = connect();
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static DbCommand Command(DbConnection connection, string sql, params (string Name, object? Value)[] parameters)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.Value = value ?? DBNull.Value;
            command.Parameters.Add(parameter);
        }
        return command;
    }

    private void Execute(string sql, params (string, object?)[] parameters)
    {
        using var connection = Open();
        using var command = Command(connection, sql, parameters);
        command.ExecuteNonQuery();
    }

    private async Task ExecuteAsync(string sql, CancellationToken cancellationToken, params (string, object?)[] parameters)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = Command(connection, sql, parameters);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<object?> ScalarAsync(string sql, CancellationToken cancellationToken, params (string, object?)[] parameters)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = Command(connection, sql, parameters);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is DBNull ? null : value;
    }

    private static JsonElement ParseJson(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
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
