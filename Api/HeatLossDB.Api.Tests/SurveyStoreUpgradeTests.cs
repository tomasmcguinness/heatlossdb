using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Options;

namespace HeatLossDB.Api.Tests;

public class SurveyStoreUpgradeTests : IDisposable
{
    private readonly string dataDirectory = Path.Combine(Path.GetTempPath(), "heatlossdb-upgrade-" + Guid.NewGuid());

    [Fact]
    public async Task BringsInProfilesAndFiguresKeptAsFilesBeforeTheyMovedIntoTheDatabase()
    {
        // A data directory as it was when profiles and figures were files beside the database.
        const string id = "AAAAAAAAAAAAAAAAAAAAAA";
        Directory.CreateDirectory(Path.Combine(dataDirectory, "profiles"));
        Directory.CreateDirectory(Path.Combine(dataDirectory, "heat-pumps"));
        await File.WriteAllTextAsync(Path.Combine(dataDirectory, "profiles", $"{id}.json"), """{"floorArea":84.5}""");
        await File.WriteAllTextAsync(Path.Combine(dataDirectory, "heat-pumps", $"{id}.json"), """{"source":"sample"}""");
        using (var connection = new SqliteConnection($"Data Source={Path.Combine(dataDirectory, "heatlossdb.db")}"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = $"""
                CREATE TABLE Surveys (Id TEXT PRIMARY KEY, CreatedAt TEXT NOT NULL, AppSurveyId TEXT NULL, SizeBytes INTEGER NOT NULL);
                INSERT INTO Surveys VALUES ('{id}', '2026-10-01T00:00:00.0000000+00:00', NULL, 100);
                """;
            command.ExecuteNonQuery();
        }

        var store = new SurveyStore(
            new FileScanStorage(Path.Combine(dataDirectory, "scans")),
            Options.Create(new HeatLossDbOptions { DataDirectory = dataDirectory }),
            new ConfigurationBuilder().Build(),
            new HostingEnvironment { ContentRootPath = dataDirectory });

        Assert.Equal([(id, 84.5)], await store.SurveysWithProfilesAsync(CancellationToken.None));
        Assert.Equal("sample", await store.HeatPumpSourceAsync(id, CancellationToken.None));
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(dataDirectory)) Directory.Delete(dataDirectory, recursive: true);
    }
}
