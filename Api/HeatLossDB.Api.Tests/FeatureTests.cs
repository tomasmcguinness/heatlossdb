using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.TestHost;

namespace HeatLossDB.Api.Tests;

public class FeatureTests : IClassFixture<FeatureTests.HeldBackApi>
{
    /// <summary>The API with every feature held back, as when deployed.</summary>
    public class HeldBackApi : SurveyUploadTests.Api
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("HeatLossDB:ComingSoon", "search, share, explore");
        }
    }

    private readonly HeldBackApi api;

    public FeatureTests(HeldBackApi api) => this.api = api;

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private record Upload(string Id);

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    /// <summary>A client signed in with the given Clerk public metadata, or signed out without a user.</summary>
    private HttpClient As(string? user, string? metadata = null)
    {
        var client = api.CreateClient();
        if (user is not null) client.DefaultRequestHeaders.Add("X-Test-User", user);
        if (metadata is not null) client.DefaultRequestHeaders.Add("X-Test-Metadata", metadata);
        return client;
    }

    private async Task<string> UploadAsync() =>
        (await (await As(null).PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>())!.Id;

    [Fact]
    public async Task HeldBackFeaturesAreRefusedToEveryoneElse()
    {
        var id = await UploadAsync();
        foreach (var client in new[] { As(null), As("user_plain"), As("user_other", """{"features": ["nonsense"]}""") })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/candidates")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/surveys/{id}/candidates")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsync($"/api/surveys/{id}/share", Json("{}"))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsync($"/api/surveys/{id}/heat-pump", Json("{}"))).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await As("user_plain").PutAsync($"/api/me/homes/{id}/share-link", null)).StatusCode);
    }

    [Fact]
    public async Task AnAccountCanBeLetInToSomeFeatures()
    {
        var id = await UploadAsync();
        var explorer = As("user_explorer", """{"features": ["Explore"]}""");

        Assert.Equal(HttpStatusCode.OK, (await explorer.GetAsync("/api/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await explorer.GetAsync($"/api/surveys/{id}/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await explorer.PutAsync($"/api/surveys/{id}/share", Json("{}"))).StatusCode);
    }

    [Fact]
    public async Task EarlyAccessLetsAnAccountInToEverything()
    {
        var id = await UploadAsync();
        var early = As("user_early", """{"earlyAccess": true}""");

        Assert.Equal(HttpStatusCode.OK, (await early.GetAsync("/api/candidates")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await early.GetAsync($"/api/surveys/{id}/candidates")).StatusCode);
        // Past the check, on to the usual validation of what was sent.
        Assert.Equal(HttpStatusCode.BadRequest, (await early.PutAsync($"/api/surveys/{id}/share", Json("{}"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await early.PutAsync($"/api/surveys/{id}/heat-pump", Json("{}"))).StatusCode);
    }

    [Fact]
    public async Task SharedLinksStayOpen() =>
        Assert.Equal(HttpStatusCode.NotFound, (await As(null).GetAsync("/api/shared/NoSuchShare0000000000000")).StatusCode);

    [Theory]
    [InlineData(null, "")]
    [InlineData("not json", "")]
    [InlineData("[]", "")]
    [InlineData("""{"features": "search"}""", "")]
    [InlineData("""{"features": ["Search", 3, "nonsense", "share"]}""", "search,share")]
    [InlineData("""{"earlyAccess": true}""", "explore,search,share")]
    [InlineData("""{"earlyAccess": "yes"}""", "")]
    public void ReadsTheUnlockedFeaturesFromTheMetadataClaim(string? metadata, string expected)
    {
        var claims = metadata is null ? Array.Empty<Claim>() : [new Claim(Features.MetadataClaim, metadata)];
        var unlocked = Features.UnlockedFor(new ClaimsPrincipal(new ClaimsIdentity(claims)));
        Assert.Equal(expected, string.Join(",", unlocked.Order()));
    }

    [Fact]
    public void ReadsTheComingSoonList() =>
        Assert.Equal("explore,search", string.Join(",", Features.Parse(" Search, explore ,view").Order()));
}
