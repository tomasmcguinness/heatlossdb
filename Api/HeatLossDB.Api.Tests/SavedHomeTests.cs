using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

namespace HeatLossDB.Api.Tests;

public class SavedHomeTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly SurveyUploadTests.Api api;

    public SavedHomeTests(SurveyUploadTests.Api api) => this.api = api;

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private record Upload(string Id);
    private record Summary(string Id, string Name, DateTimeOffset SavedAt);
    private record Saved(string Name, DateTimeOffset SavedAt, JsonElement Edits);

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static string Home(string name, string roomName = "Kitchen") => JsonSerializer.Serialize(new
    {
        name,
        edits = new { format = "heatlossdb.fabric", version = 1, scanHash = "h", rooms = new Dictionary<string, object> { ["scanroom-0"] = new { name = roomName } } },
    });

    /// <summary>A client signed in as the user, or signed out without one.</summary>
    private HttpClient As(string? user)
    {
        var client = api.CreateClient();
        if (user is not null) client.DefaultRequestHeaders.Add("X-Test-User", user);
        return client;
    }

    private async Task<string> UploadAsync() =>
        (await (await As(null).PostAsync("/api/surveys", Json(MinimalScan))).Content.ReadFromJsonAsync<Upload>())!.Id;

    private static string NewUser() => "user_" + Guid.NewGuid().ToString("N");

    private Task<string?> OwnerOfAsync(string id) =>
        api.Services.GetRequiredService<SurveyStore>().OwnerOfAsync(id, CancellationToken.None);

    [Fact]
    public async Task AnUploadHasNoOwnerUntilSomeoneSavesIt()
    {
        var id = await UploadAsync();
        Assert.Null(await OwnerOfAsync(id));

        var first = NewUser();
        Assert.Equal(HttpStatusCode.NoContent, (await As(first).PutAsync($"/api/me/homes/{id}", Json(Home("Mine")))).StatusCode);
        Assert.Equal(first, await OwnerOfAsync(id));
    }

    [Fact]
    public async Task SavingAgainDoesNotChangeTheOwner()
    {
        var id = await UploadAsync();
        var first = NewUser();
        await As(first).PutAsync($"/api/me/homes/{id}", Json(Home("Mine")));

        // Someone else with the link can still keep their own edits, but doesn't become the owner.
        Assert.Equal(HttpStatusCode.NoContent, (await As(NewUser()).PutAsync($"/api/me/homes/{id}", Json(Home("Also mine")))).StatusCode);
        await As(first).PutAsync($"/api/me/homes/{id}", Json(Home("Still mine")));

        Assert.Equal(first, await OwnerOfAsync(id));
    }

    [Fact]
    public async Task SignedOutRequestsAreUnauthorized()
    {
        var id = await UploadAsync();
        var client = As(null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me/homes")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/me/homes/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsync($"/api/me/homes/{id}", Json(Home("Mine")))).StatusCode);
    }

    [Fact]
    public async Task ASavedHomeCanBeListedAndOpenedByItsOwner()
    {
        var id = await UploadAsync();
        var owner = As(NewUser());

        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsync($"/api/me/homes/{id}", Json(Home("  My house  ")))).StatusCode);

        var list = await owner.GetFromJsonAsync<List<Summary>>("/api/me/homes");
        var listed = Assert.Single(list!);
        Assert.Equal(id, listed.Id);
        Assert.Equal("My house", listed.Name);

        var saved = await owner.GetFromJsonAsync<Saved>($"/api/me/homes/{id}");
        Assert.Equal("My house", saved!.Name);
        Assert.Equal("Kitchen", saved.Edits.GetProperty("rooms").GetProperty("scanroom-0").GetProperty("name").GetString());
    }

    [Fact]
    public async Task OtherUsersCannotSeeIt()
    {
        var id = await UploadAsync();
        await As(NewUser()).PutAsync($"/api/me/homes/{id}", Json(Home("Mine")));

        var other = As(NewUser());
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/me/homes/{id}")).StatusCode);
        Assert.Empty((await other.GetFromJsonAsync<List<Summary>>("/api/me/homes"))!);
    }

    [Fact]
    public async Task SavingAgainReplacesTheEarlierSave()
    {
        var id = await UploadAsync();
        var owner = As(NewUser());
        await owner.PutAsync($"/api/me/homes/{id}", Json(Home("First", "Kitchen")));
        await owner.PutAsync($"/api/me/homes/{id}", Json(Home("Second", "Lounge")));

        var listed = Assert.Single((await owner.GetFromJsonAsync<List<Summary>>("/api/me/homes"))!);
        Assert.Equal("Second", listed.Name);
        var saved = await owner.GetFromJsonAsync<Saved>($"/api/me/homes/{id}");
        Assert.Equal("Lounge", saved!.Edits.GetProperty("rooms").GetProperty("scanroom-0").GetProperty("name").GetString());
    }

    [Fact]
    public async Task UnknownSurveysAreNotFound()
    {
        var owner = As(NewUser());
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PutAsync("/api/me/homes/AAAAAAAAAAAAAAAAAAAAAA", Json(Home("Mine")))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/api/me/homes/not-an-id")).StatusCode);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"edits":{"format":"heatlossdb.fabric"}}""")]
    [InlineData("""{"name":"","edits":{"format":"heatlossdb.fabric"}}""")]
    [InlineData("""{"name":"Mine"}""")]
    [InlineData("""{"name":"Mine","edits":{"format":"something else"}}""")]
    [InlineData("""{"name":"Mine","edits":{"format":1}}""")]
    public async Task RejectsInvalidSaves(string body)
    {
        var id = await UploadAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await As(NewUser()).PutAsync($"/api/me/homes/{id}", Json(body))).StatusCode);
    }
}
