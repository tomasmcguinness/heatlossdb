using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
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
        /// <summary>Azurite on its usual ports, unless HEATLOSSDB_TEST_STORAGE gives another connection
        /// string (for when something else has those ports).</summary>
        private static readonly string Storage =
            Environment.GetEnvironmentVariable("HEATLOSSDB_TEST_STORAGE") is { Length: > 0 } storage ? storage : "UseDevelopmentStorage=true";
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
            builder.UseSetting("HeatLossDB:SharesContainer", name + "shares");
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
            account.Blobs.GetBlobContainerClient(name + "shares").DeleteIfExists();
            account.Tables.DeleteTable(name + "surveys");
            account.Tables.DeleteTable(name + "codes");
            account.Tables.DeleteTable(name + "homes");
        }
    }

    /// <summary>Signs the request in as the user named in X-Test-User, if there is one, with the Clerk
    /// public metadata in X-Test-Metadata.</summary>
    public class TestUser(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string Scheme = "Test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (Request.Headers["X-Test-User"].FirstOrDefault() is not { Length: > 0 } user) return Task.FromResult(AuthenticateResult.NoResult());
            Claim[] claims = Request.Headers["X-Test-Metadata"].FirstOrDefault() is { Length: > 0 } metadata
                ? [new Claim("sub", user), new Claim(Features.MetadataClaim, metadata, "JSON")]
                : [new Claim("sub", user)];
            var identity = new ClaimsIdentity(claims, Scheme, "sub", null);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
        }
    }

    private readonly Api api;
    private readonly HttpClient client;

    public SurveyUploadTests(Api api)
    {
        this.api = api;
        client = api.CreateClient();
    }

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
    public async Task WithoutAWebsiteAddressTheLinkUsesTheApisOwnAddress()
    {
        using var deployed = api.WithWebHostBuilder(builder => builder.UseSetting("HeatLossDB:PublicWebBaseUrl", ""));
        using var request = new HttpRequestMessage(HttpMethod.Post, "http://heatlossdb.test/api/surveys") { Content = Json(MinimalScan) };
        // As App Service's front end sends it, having taken the request over https.
        request.Headers.Add("X-Forwarded-For", "203.0.113.5");
        request.Headers.Add("X-Forwarded-Proto", "https");

        var response = await deployed.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var upload = await response.Content.ReadFromJsonAsync<Upload>();
        Assert.Equal($"https://heatlossdb.test/s/{upload!.Id}", upload.Url);
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

    /// <summary>A 4 m × 3 m room scanned at an angle, with its back wall stopping half a metre short of the corner.</summary>
    internal static string SmallRoomScan()
    {
        var turn = 20 * Math.PI / 180;
        (double X, double Z) Turned(double x, double z) => (x * Math.Cos(turn) - z * Math.Sin(turn), x * Math.Sin(turn) + z * Math.Cos(turn));
        JsonObject Wall(string id, double x1, double z1, double x2, double z2)
        {
            var (ax, az) = Turned(x1, z1);
            var (bx, bz) = Turned(x2, z2);
            double length = Math.Sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)), ux = (bx - ax) / length, uz = (bz - az) / length;
            double[] transform = [ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, (ax + bx) / 2, 1.2, (az + bz) / 2, 1];
            return new JsonObject
            {
                ["identifier"] = id,
                ["story"] = 0,
                ["dimensions"] = new JsonArray(length, 2.4, 0.0),
                ["transform"] = new JsonArray(transform.Select(v => (JsonNode?)JsonValue.Create(v)).ToArray()),
            };
        }
        var (lx, lz) = Turned(2, 1.5);
        return new JsonObject
        {
            ["walls"] = new JsonArray(Wall("A", 0, 0, 4, 0), Wall("B", 4, 0, 4, 3), Wall("C", 3.5, 3, 0, 3), Wall("D", 0, 3, 0, 0)),
            ["doors"] = new JsonArray(),
            ["windows"] = new JsonArray(),
            ["openings"] = new JsonArray(),
            ["sections"] = new JsonArray(new JsonObject { ["center"] = new JsonArray(lx, 0.0, lz), ["label"] = "bedroom", ["story"] = 0 }),
        }.ToJsonString();
    }

    [Fact]
    public async Task TidyingKeepsTheUploadAsItIsAndStoresTheTidiedScanBesideIt()
    {
        var original = SmallRoomScan();
        var upload = await (await client.PostAsync("/api/surveys", Json(original))).Content.ReadFromJsonAsync<Upload>();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/surveys/{upload!.Id}/scan/tidied")).StatusCode);

        var response = await client.PostAsync($"/api/surveys/{upload.Id}/tidy", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("summary").GetProperty("allRoomsClosed").GetBoolean());
        var changes = body.RootElement.GetProperty("changes").EnumerateArray().ToList();
        var extended = Assert.Single(changes, c => c.GetProperty("kind").GetString() == "WallExtendedToClose");
        Assert.Equal(500, extended.GetProperty("millimetres").GetDouble());
        Assert.True(extended.GetProperty("needsReview").GetBoolean());

        var tidied = JsonNode.Parse(await client.GetStringAsync($"/api/surveys/{upload.Id}/scan/tidied"))!;
        Assert.Equal(HeatLossDB.ScanTidy.ScanTidier.Version, tidied["heatlossdbTidy"]!["version"]!.GetValue<int>());
        Assert.NotNull(tidied["heatlossdbTidy"]!["tidiedAt"]);
        Assert.Equal(original, await client.GetStringAsync($"/api/surveys/{upload.Id}/scan"));
    }

    [Fact]
    public async Task TidyingAgainStartsFromTheUploadSoGivesTheSameResult()
    {
        var upload = await (await client.PostAsync("/api/surveys", Json(SmallRoomScan()))).Content.ReadFromJsonAsync<Upload>();

        var first = await (await client.PostAsync($"/api/surveys/{upload!.Id}/tidy", null)).Content.ReadAsStringAsync();
        var second = await (await client.PostAsync($"/api/surveys/{upload.Id}/tidy", null)).Content.ReadAsStringAsync();

        Assert.Equal(first, second);
    }

    [Theory]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("short")]
    public async Task TidyingAnUnknownSurveyIsNotFound(string id)
    {
        var response = await client.PostAsync($"/api/surveys/{id}/tidy", null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task TidyingAScanWithoutWallGeometrySaysWhy()
    {
        var upload = await (await client.PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>();

        var response = await client.PostAsync($"/api/surveys/{upload!.Id}/tidy", null);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("transform", await response.Content.ReadAsStringAsync());
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

    private Task<HttpResponseMessage> PutShareAsync(string id, string share) =>
        client.PutAsync($"/api/surveys/{id}/share", new StringContent(share, Encoding.UTF8, "application/json"));

    private const string Share = """{"name":"Semi-detached, 1945–64 home","postcodeDistrict":"SW1A","shareRoomNames":false,"home":{"propertyType":"semi-detached"}}""";

    /// <summary>Uploads a home with a profile and shares it, so others can match against it.</summary>
    private async Task<string> SharedHomeAsync(string appSurveyId, int floorArea)
    {
        var id = await UploadAsync(appSurveyId);
        await PutProfileAsync(id, $$"""{"version":1,"floorArea":{{floorArea}}}""");
        Assert.Equal(HttpStatusCode.NoContent, (await PutShareAsync(id, Share)).StatusCode);
        return id;
    }

    [Fact]
    public async Task CandidatesAreOtherSharedHomesWithProfilesButNotReuploadsOfTheSameSurvey()
    {
        var mine = await SharedHomeAsync("survey-mine", 100);
        var mineAgain = await SharedHomeAsync("survey-mine", 100);
        var theirs = await SharedHomeAsync("survey-theirs", 120);
        var noProfile = await UploadAsync("survey-no-profile");
        await PutShareAsync(noProfile, Share);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var ids = candidates!.Select(c => c.Id).ToList();

        Assert.Contains(theirs, ids);
        Assert.DoesNotContain(mine, ids);
        Assert.DoesNotContain(mineAgain, ids);
        Assert.DoesNotContain(noProfile, ids);
        Assert.Equal(120, candidates!.Single(c => c.Id == theirs).Profile.GetProperty("floorArea").GetInt32());
    }

    [Fact]
    public async Task HomesThatArentSharedAreNeverCandidates()
    {
        var mine = await UploadAsync("survey-unshared-mine");
        var unshared = await UploadAsync("survey-unshared");
        await PutProfileAsync(unshared, """{"version":1,"floorArea":110}""");

        var forUpload = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var forFile = await client.GetFromJsonAsync<List<CandidateDto>>("/api/candidates");
        Assert.DoesNotContain(unshared, forUpload!.Select(c => c.Id));
        Assert.DoesNotContain(unshared, forFile!.Select(c => c.Id));

        // Sharing it makes it one.
        await PutShareAsync(unshared, Share);
        var afterSharing = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        Assert.Contains(unshared, afterSharing!.Select(c => c.Id));
    }

    [Fact]
    public async Task ProfilesCanBeReplaced()
    {
        var a = await UploadAsync("survey-a");
        var b = await SharedHomeAsync("survey-b", 80);
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
    public async Task EverySharedHomeWithAProfileIsACandidateForAScanThatIsntUploaded()
    {
        var theirs = await SharedHomeAsync("survey-for-local", 70);

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
