using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HeatLossDB.Api.Tests;

public class SurveyUploadTests : IClassFixture<SurveyUploadTests.Api>
{
    /// <summary>Hosts the API against Azurite (the storage emulator, which must be running),
    /// with a container and tables of its own that are deleted afterwards.</summary>
    public class Api : WebApplicationFactory<Program>
    {
        private const string Storage = "UseDevelopmentStorage=true";
        private readonly string name = "test" + Guid.NewGuid().ToString("N")[..12];

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseSetting("ConnectionStrings:Storage", Storage);
            builder.UseSetting("HeatLossDB:ScansContainer", name);
            builder.UseSetting("HeatLossDB:SurveysTable", name + "surveys");
            builder.UseSetting("HeatLossDB:CodesTable", name + "codes");
            builder.UseSetting("HeatLossDB:PublicWebBaseUrl", "http://web.test/");
            builder.UseSetting("HeatLossDB:HomesTable", name + "homes");
            builder.UseSetting("HeatLossDB:EditsContainer", name + "edits");
            // Instead of Clerk's tokens, the signed-in user is whoever X-Test-User names.
            builder.ConfigureTestServices(services => services
                .AddAuthentication(TestUser.Scheme)
                .AddScheme<AuthenticationSchemeOptions, TestUser>(TestUser.Scheme, null));
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            var account = new StorageAccount(Storage);
            account.Blobs.GetBlobContainerClient(name).DeleteIfExists();
            account.Blobs.GetBlobContainerClient(name + "edits").DeleteIfExists();
            account.Tables.DeleteTable(name + "surveys");
            account.Tables.DeleteTable(name + "codes");
            account.Tables.DeleteTable(name + "homes");
        }
    }

    /// <summary>Signs the request in as the user named in X-Test-User, if there is one.</summary>
    public class TestUser(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string Scheme = "Test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (Request.Headers["X-Test-User"].FirstOrDefault() is not { Length: > 0 } user) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim("sub", user)], Scheme, "sub", null);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
        }
    }

    private readonly HttpClient client;

    public SurveyUploadTests(Api api) => client = api.CreateClient();

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private record Upload(string Id, string Url, string Code, DateTimeOffset CodeExpiresAt);
    private record CodeLookup(string Id);

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

    [Fact]
    public async Task UploadReturnsACodeThatOpensTheSurveyForADay()
    {
        var upload = await (await client.PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>();

        Assert.Matches("^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$", upload!.Code);
        Assert.InRange(upload.CodeExpiresAt - DateTimeOffset.UtcNow, TimeSpan.FromHours(23.9), TimeSpan.FromHours(24));

        // Codes are case-insensitive, as people type them.
        var lookup = await client.GetFromJsonAsync<CodeLookup>($"/api/codes/{upload.Code.ToLowerInvariant()}");
        Assert.Equal(upload.Id, lookup!.Id);
    }

    [Theory]
    [InlineData("ZZZZZ")]
    [InlineData("O0O0O")]
    [InlineData("TOOLONG")]
    public async Task UnknownOrMalformedCodesAreNotFound(string code)
    {
        var response = await client.GetAsync($"/api/codes/{code}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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
    private record CandidateDto(string Id, string CreatedAt, System.Text.Json.JsonElement Profile, System.Text.Json.JsonElement? Share);

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

    private Task<HttpResponseMessage> PutShareAsync(string id, string share) =>
        client.PutAsync($"/api/surveys/{id}/share", new StringContent(share, Encoding.UTF8, "application/json"));

    private const string Share = """{"name":"Semi-detached, 1945–64 home","postcodeDistrict":"SW1A","shareRoomNames":false,"home":{"propertyType":"semi-detached"}}""";

    [Fact]
    public async Task EveryHomeWithAProfileIsACandidateForAScanThatIsntUploaded()
    {
        var theirs = await UploadAsync("survey-for-local");
        await PutProfileAsync(theirs, """{"version":1,"floorArea":70}""");

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>("/api/candidates");
        Assert.Equal(70, candidates!.Single(c => c.Id == theirs).Profile.GetProperty("floorArea").GetInt32());
    }

    [Fact]
    public async Task CandidatesCarryTheirShareDetails()
    {
        var mine = await UploadAsync("survey-share-mine");
        var theirs = await UploadAsync("survey-share-theirs");
        await PutProfileAsync(theirs, """{"version":1,"floorArea":95}""");
        Assert.Equal(HttpStatusCode.NoContent, (await PutShareAsync(theirs, Share)).StatusCode);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var share = candidates!.Single(c => c.Id == theirs).Share!.Value;
        Assert.Equal("SW1A", share.GetProperty("postcodeDistrict").GetString());
        Assert.False(share.GetProperty("shareRoomNames").GetBoolean());
        Assert.Equal("semi-detached", share.GetProperty("home").GetProperty("propertyType").GetString());
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"postcodeDistrict":"SW1A","shareRoomNames":false}""")]
    [InlineData("""{"name":"Home","postcodeDistrict":"SW1A 1AA","shareRoomNames":false}""")]
    [InlineData("""{"name":"Home","postcodeDistrict":"SW1A"}""")]
    [InlineData("""{"name":"Home","postcodeDistrict":"SW1A","shareRoomNames":false,"home":"detached"}""")]
    public async Task RejectsInvalidShareDetails(string share)
    {
        var id = await UploadAsync("survey-invalid-share");
        Assert.Equal(HttpStatusCode.BadRequest, (await PutShareAsync(id, share)).StatusCode);
    }

    [Fact]
    public async Task UnknownSurveysAreNotFound()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await PutShareAsync("AAAAAAAAAAAAAAAAAAAAAA", Share)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PutProfileAsync("AAAAAAAAAAAAAAAAAAAAAA", """{"version":1}""")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/surveys/AAAAAAAAAAAAAAAAAAAAAA/candidates")).StatusCode);
    }
}
