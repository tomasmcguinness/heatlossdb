using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;

namespace HeatLossDB.Api.Tests;

public class SurveyUploadTests : IClassFixture<SurveyUploadTests.Api>
{
    /// <summary>Hosts the API with its data in a throwaway folder.</summary>
    public class Api : WebApplicationFactory<Program>
    {
        public string DataDirectory { get; } = Path.Combine(Path.GetTempPath(), "heatlossdb-tests-" + Guid.NewGuid());

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("HeatLossDB:DataDirectory", DataDirectory);
            builder.UseSetting("HeatLossDB:PublicWebBaseUrl", "http://web.test/");
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (Directory.Exists(DataDirectory)) Directory.Delete(DataDirectory, recursive: true);
        }
    }

    private readonly HttpClient client;

    public SurveyUploadTests(Api api) => client = api.CreateClient();

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private record Upload(string Id, string Url);

    [Fact]
    public async Task UploadReturnsALinkAndTheScanCanBeFetchedUnchanged()
    {
        var response = await client.PostAsync("/api/surveys", Json(MinimalScan));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var upload = await response.Content.ReadFromJsonAsync<Upload>();
        Assert.NotNull(upload);
        Assert.Matches("^[A-Za-z0-9_-]{22}$", upload.Id);
        Assert.Equal($"http://web.test/s/{upload.Id}", upload.Url);

        var scan = await client.GetAsync($"/api/surveys/{upload.Id}/scan");
        Assert.Equal(HttpStatusCode.OK, scan.StatusCode);
        Assert.Equal("application/json", scan.Content.Headers.ContentType?.MediaType);
        Assert.Equal(MinimalScan, await scan.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task EachUploadGetsItsOwnId()
    {
        var first = await (await client.PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>();
        var second = await (await client.PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>();
        Assert.NotEqual(first!.Id, second!.Id);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("""{"doors":[]}""")]
    [InlineData("""{"walls":[]}""")]
    [InlineData("")]
    public async Task RejectsUploadsThatAreNotScans(string body)
    {
        var response = await client.PostAsync("/api/surveys", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("..%2F..%2Fsecrets")]
    [InlineData("short")]
    public async Task UnknownOrMalformedIdsAreNotFound(string id)
    {
        var response = await client.GetAsync($"/api/surveys/{id}/scan");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AcceptsARealScanWhenOneIsAvailable()
    {
        // Real scans live in the website's gitignored fixtures folder.
        var fixture = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../Web/fixtures/MergedRooms_8.json"));
        if (!File.Exists(fixture)) return;

        var bytes = await File.ReadAllBytesAsync(fixture);
        var response = await client.PostAsync("/api/surveys", new ByteArrayContent(bytes));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var upload = await response.Content.ReadFromJsonAsync<Upload>();
        var stored = await client.GetByteArrayAsync($"/api/surveys/{upload!.Id}/scan");
        Assert.Equal(bytes, stored);
    }
}

public class MatchingCandidateTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly HttpClient client;

    public MatchingCandidateTests(SurveyUploadTests.Api api) => client = api.CreateClient();

    private const string Scan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private record Upload(string Id, string Url);
    private record CandidateDto(string Id, string CreatedAt, System.Text.Json.JsonElement Profile);

    private async Task<string> UploadAsync(string appSurveyId)
    {
        var content = new StringContent(Scan, Encoding.UTF8, "application/json");
        content.Headers.Add("X-App-Survey-Id", appSurveyId);
        var response = await client.PostAsync("/api/surveys", content);
        return (await response.Content.ReadFromJsonAsync<Upload>())!.Id;
    }

    private Task<HttpResponseMessage> PutProfileAsync(string id, string profile) =>
        client.PutAsync($"/api/surveys/{id}/profile", new StringContent(profile, Encoding.UTF8, "application/json"));

    [Fact]
    public async Task CandidatesAreOtherHomesWithProfilesButNotReuploadsOfTheSameSurvey()
    {
        var mine = await UploadAsync("survey-mine");
        var mineAgain = await UploadAsync("survey-mine");
        var theirs = await UploadAsync("survey-theirs");
        var noProfile = await UploadAsync("survey-no-profile");

        Assert.Equal(HttpStatusCode.NoContent, (await PutProfileAsync(mine, """{"version":1,"floorArea":100}""")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PutProfileAsync(mineAgain, """{"version":1,"floorArea":100}""")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await PutProfileAsync(theirs, """{"version":1,"floorArea":120}""")).StatusCode);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var ids = candidates!.Select(c => c.Id).ToList();

        Assert.Contains(theirs, ids);
        Assert.DoesNotContain(mine, ids);
        Assert.DoesNotContain(mineAgain, ids);
        Assert.DoesNotContain(noProfile, ids);
        Assert.Equal(120, candidates!.Single(c => c.Id == theirs).Profile.GetProperty("floorArea").GetInt32());
    }

    [Fact]
    public async Task ProfilesCanBeReplaced()
    {
        var a = await UploadAsync("survey-a");
        var b = await UploadAsync("survey-b");
        await PutProfileAsync(b, """{"version":1,"floorArea":80}""");
        await PutProfileAsync(b, """{"version":1,"floorArea":90}""");

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{a}/candidates");
        Assert.Equal(90, candidates!.Single(c => c.Id == b).Profile.GetProperty("floorArea").GetInt32());
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"floorArea":1}""")]
    [InlineData("""{"version":2}""")]
    public async Task RejectsInvalidProfiles(string profile)
    {
        var id = await UploadAsync("survey-invalid");
        Assert.Equal(HttpStatusCode.BadRequest, (await PutProfileAsync(id, profile)).StatusCode);
    }

    [Fact]
    public async Task UnknownSurveysAreNotFound()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await PutProfileAsync("AAAAAAAAAAAAAAAAAAAAAA", """{"version":1}""")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/surveys/AAAAAAAAAAAAAAAAAAAAAA/candidates")).StatusCode);
    }
}
