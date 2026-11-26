using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace HeatLossDB.Api.Tests;

public class AdminTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly SurveyUploadTests.Api api;

    public AdminTests(SurveyUploadTests.Api api) => this.api = api;

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";
    private const string AdminMetadata = """{"isAdmin": true}""";

    private record Upload(string Id);
    private record Summary(string Id, DateTimeOffset CreatedAt, int SizeBytes, bool Owned, bool IsShared, string? Name);

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static string Home(string name) => JsonSerializer.Serialize(new
    {
        name,
        edits = new { format = "heatlossdb.fabric", version = 1, scanHash = "h", rooms = new Dictionary<string, object> { ["scanroom-0"] = new { name = "Kitchen" } } },
    });

    private HttpClient As(string? user, string? metadata = null)
    {
        var client = api.CreateClient();
        if (user is not null) client.DefaultRequestHeaders.Add("X-Test-User", user);
        if (metadata is not null) client.DefaultRequestHeaders.Add("X-Test-Metadata", metadata);
        return client;
    }

    private async Task<string> UploadAsync() =>
        (await (await As(null).PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>())!.Id;

    private static string NewUser() => "user_" + Guid.NewGuid().ToString("N");

    [Fact]
    public async Task OnlyAdminsCanUseTheAdminApi()
    {
        var id = await UploadAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await As(null).GetAsync("/api/admin/surveys")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await As(null).GetAsync($"/api/admin/surveys/{id}")).StatusCode);
        foreach (var metadata in new string?[] { null, """{"isAdmin": false}""", """{"isAdmin": "true"}""", """{"earlyAccess": true}""", "not json" })
        {
            var client = As(NewUser(), metadata);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/surveys")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/admin/surveys/{id}")).StatusCode);
        }
    }

    [Fact]
    public async Task AdminsSeeEverySurveyWhoeverUploadedIt()
    {
        var unowned = await UploadAsync();
        var owned = await UploadAsync();
        await As(NewUser()).PutAsync($"/api/me/homes/{owned}", Json(Home("Their house")));

        var list = await As(NewUser(), AdminMetadata).GetFromJsonAsync<List<Summary>>("/api/admin/surveys");

        var first = Assert.Single(list!, s => s.Id == unowned);
        Assert.False(first.Owned);
        Assert.Null(first.Name);
        var second = Assert.Single(list!, s => s.Id == owned);
        Assert.True(second.Owned);
        Assert.Equal("Their house", second.Name);
    }

    [Fact]
    public async Task AdminsSeeTheOwnersSavedEdits()
    {
        var id = await UploadAsync();
        var owner = NewUser();
        await As(owner).PutAsync($"/api/me/homes/{id}", Json(Home("Mine")));
        // Someone else saving their own edits doesn't change what admins see.
        await As(NewUser()).PutAsync($"/api/me/homes/{id}", Json(Home("Not theirs")));

        using var survey = JsonDocument.Parse(await As(NewUser(), AdminMetadata).GetStringAsync($"/api/admin/surveys/{id}"));
        var root = survey.RootElement;
        Assert.Equal("Mine", root.GetProperty("name").GetString());
        Assert.True(root.GetProperty("owned").GetBoolean());
        Assert.Equal("Kitchen", root.GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0").GetProperty("name").GetString());
    }

    [Fact]
    public async Task AnUnsavedSurveyHasNoEdits()
    {
        var id = await UploadAsync();
        using var survey = JsonDocument.Parse(await As(NewUser(), AdminMetadata).GetStringAsync($"/api/admin/surveys/{id}"));
        Assert.Equal(JsonValueKind.Null, survey.RootElement.GetProperty("edits").ValueKind);
        Assert.False(survey.RootElement.GetProperty("owned").GetBoolean());
    }

    [Fact]
    public async Task AnUnknownSurveyIsNotFound()
    {
        var admin = As(NewUser(), AdminMetadata);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/admin/surveys/AAAAAAAAAAAAAAAAAAAAAA")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/admin/surveys/bad")).StatusCode);
    }

    [Theory]
    [InlineData("""{"isAdmin": true}""", true)]
    [InlineData("""{"isAdmin": true, "earlyAccess": true}""", true)]
    [InlineData("""{"isAdmin": false}""", false)]
    [InlineData("""{"isAdmin": "true"}""", false)]
    [InlineData("""{"isAdmin": 1}""", false)]
    [InlineData("""[true]""", false)]
    [InlineData("{", false)]
    [InlineData(null, false)]
    public void IsAdminOnlyForJsonTrue(string? metadata, bool expected)
    {
        Claim[] claims = metadata is null ? [new Claim("sub", "u")] : [new Claim("sub", "u"), new Claim(Features.MetadataClaim, metadata)];
        Assert.Equal(expected, Admin.IsAdmin(new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"))));
    }
}
