using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HeatLossDB.Api.Tests;

/// <summary>Choosing between the scan as uploaded and its accepted tidy.</summary>
public class FloorplanVersionTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly SurveyUploadTests.Api api;

    public FloorplanVersionTests(SurveyUploadTests.Api api) => this.api = api;

    private record Upload(string Id);

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static StringContent Version(string version) => Json(JsonSerializer.Serialize(new { version }));

    /// <summary>A client signed in as the user, or signed out without one.</summary>
    private HttpClient As(string? user)
    {
        var client = api.CreateClient();
        if (user is not null) client.DefaultRequestHeaders.Add("X-Test-User", user);
        return client;
    }

    private static string NewUser() => "user_" + Guid.NewGuid().ToString("N");

    private async Task<(string Id, string Original)> UploadAsync()
    {
        var original = SurveyUploadTests.SmallRoomScan();
        var upload = await (await As(null).PostAsync("/api/surveys", Json(original))).Content.ReadFromJsonAsync<Upload>();
        return (upload!.Id, original);
    }

    private static async Task<(string Version, string Body)> CurrentAsync(HttpClient client, string id)
    {
        var response = await client.GetAsync($"/api/surveys/{id}/scan/current");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (response.Headers.GetValues("X-Floorplan-Version").Single(), await response.Content.ReadAsStringAsync());
    }

    private static async Task<JsonElement> VersionsAsync(HttpClient client, string id)
    {
        using var document = JsonDocument.Parse(await client.GetStringAsync($"/api/surveys/{id}/versions"));
        return document.RootElement.Clone();
    }

    [Fact]
    public async Task ASurveyOpensAsUploadedUntilATidyIsAccepted()
    {
        var client = As(null);
        var (id, original) = await UploadAsync();

        Assert.Equal(("original", original), await CurrentAsync(client, id));
        var versions = await VersionsAsync(client, id);
        Assert.Equal("original", versions.GetProperty("current").GetString());
        Assert.Equal("original", Assert.Single(versions.GetProperty("versions").EnumerateArray()).GetProperty("id").GetString());

        // Tidying only makes a preview.
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        Assert.Equal(("original", original), await CurrentAsync(client, id));
    }

    [Fact]
    public async Task AcceptingNeedsATidyFirst()
    {
        var (id, _) = await UploadAsync();
        var response = await As(null).PostAsync($"/api/surveys/{id}/tidy/accept", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task AcceptingTheTidyMakesItCurrentAndKeepsTheUpload()
    {
        var client = As(null);
        var (id, original) = await UploadAsync();
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        var preview = await client.GetStringAsync($"/api/surveys/{id}/scan/tidied");

        var response = await client.PostAsync($"/api/surveys/{id}/tidy/accept", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("tidied", preview), await CurrentAsync(client, id));
        Assert.Equal(original, await client.GetStringAsync($"/api/surveys/{id}/scan"));
        var versions = await VersionsAsync(client, id);
        Assert.Equal("tidied", versions.GetProperty("current").GetString());
        var tidied = versions.GetProperty("versions").EnumerateArray().Single(v => v.GetProperty("id").GetString() == "tidied");
        Assert.Equal(HeatLossDB.ScanTidy.ScanTidier.Version, tidied.GetProperty("tidierVersion").GetInt32());
    }

    [Fact]
    public async Task TidyingAgainDoesNotChangeTheAcceptedPlan()
    {
        var client = As(null);
        var (id, _) = await UploadAsync();
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        await client.PostAsync($"/api/surveys/{id}/tidy/accept", null);
        var accepted = (await CurrentAsync(client, id)).Body;

        await client.PostAsync($"/api/surveys/{id}/tidy", null);

        // Each tidy records when it ran, so the new preview differs from what was accepted.
        Assert.NotEqual(accepted, await client.GetStringAsync($"/api/surveys/{id}/scan/tidied"));
        Assert.Equal(("tidied", accepted), await CurrentAsync(client, id));
    }

    [Fact]
    public async Task TheOriginalCanBeChosenAgainAndTheTidyIsKept()
    {
        var client = As(null);
        var (id, original) = await UploadAsync();
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        await client.PostAsync($"/api/surveys/{id}/tidy/accept", null);

        var response = await client.PutAsync($"/api/surveys/{id}/versions/current", Version("original"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("original", original), await CurrentAsync(client, id));
        Assert.Equal(2, (await VersionsAsync(client, id)).GetProperty("versions").GetArrayLength());
    }

    [Fact]
    public async Task SwitchingBackToTheTidyRestoresTheOneAcceptedNotANewerPreview()
    {
        var client = As(null);
        var (id, _) = await UploadAsync();
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        await client.PostAsync($"/api/surveys/{id}/tidy/accept", null);
        var accepted = (await CurrentAsync(client, id)).Body;
        await client.PutAsync($"/api/surveys/{id}/versions/current", Version("original"));
        await client.PostAsync($"/api/surveys/{id}/tidy", null);

        var response = await client.PutAsync($"/api/surveys/{id}/versions/current", Version("tidied"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("tidied", accepted), await CurrentAsync(client, id));
    }

    [Fact]
    public async Task SwitchingToATidyNeedsOneAccepted()
    {
        var client = As(null);
        var (id, _) = await UploadAsync();
        await client.PostAsync($"/api/surveys/{id}/tidy", null);
        var response = await client.PutAsync($"/api/surveys/{id}/versions/current", Version("tidied"));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task OnlyTheOwnerCanChangeAnOwnedSurveysFloorPlan()
    {
        var owner = NewUser();
        var (id, _) = await UploadAsync();
        var home = JsonSerializer.Serialize(new { name = "Mine", edits = new { format = "heatlossdb.fabric", version = 1, scanHash = "h" } });
        Assert.Equal(HttpStatusCode.NoContent, (await As(owner).PutAsync($"/api/me/homes/{id}", Json(home))).StatusCode);
        await As(null).PostAsync($"/api/surveys/{id}/tidy", null);

        Assert.Equal(HttpStatusCode.Forbidden, (await As(null).PostAsync($"/api/surveys/{id}/tidy/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await As(NewUser()).PostAsync($"/api/surveys/{id}/tidy/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(owner).PostAsync($"/api/surveys/{id}/tidy/accept", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await As(NewUser()).PutAsync($"/api/surveys/{id}/versions/current", Version("original"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(owner).PutAsync($"/api/surveys/{id}/versions/current", Version("original"))).StatusCode);
    }

    [Theory]
    [InlineData("""{"version":"newest"}""")]
    [InlineData("""{"version":1}""")]
    [InlineData("""{}""")]
    [InlineData("""not json""")]
    public async Task AnyOtherVersionIsRejected(string body)
    {
        var (id, _) = await UploadAsync();
        var response = await As(null).PutAsync($"/api/surveys/{id}/versions/current", Json(body));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("short")]
    public async Task AnUnknownSurveyIsNotFound(string id)
    {
        var client = As(null);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/surveys/{id}/scan/current")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/surveys/{id}/versions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsync($"/api/surveys/{id}/versions/current", Version("original"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/surveys/{id}/tidy/accept", null)).StatusCode);
    }
}
