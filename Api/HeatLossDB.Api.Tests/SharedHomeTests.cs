using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace HeatLossDB.Api.Tests;

public class SharedHomeTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly SurveyUploadTests.Api api;

    public SharedHomeTests(SurveyUploadTests.Api api) => this.api = api;

    private const string MinimalScan = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[]}""";

    private record Upload(string Id);
    private record Link(string Id, string Url);

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    private static string Home(string roomName = "Sophie's room", int heatLossW = 1250) => JsonSerializer.Serialize(new
    {
        name = "My home",
        edits = new
        {
            format = "heatlossdb.fabric",
            version = 1,
            scanHash = "h",
            rooms = new Dictionary<string, object> { ["scanroom-0"] = new { name = roomName, heatLossW, targetTemperature = 21 } },
        },
    });

    private static string Share(bool shareRoomNames = false) => JsonSerializer.Serialize(new
    {
        name = "Detached, 1945–64, insulated home",
        postcodeDistrict = "SW1A",
        shareRoomNames,
        home = new { postcodeDistrict = "SW1A" },
    });

    private HttpClient As(string? user)
    {
        var client = api.CreateClient();
        if (user is not null) client.DefaultRequestHeaders.Add("X-Test-User", user);
        return client;
    }

    private static string NewUser() => "user_" + Guid.NewGuid().ToString("N");

    private async Task<string> UploadAsync(string scan = MinimalScan) =>
        (await (await As(null).PostAsync("/api/surveys", Json(scan))).Content.ReadFromJsonAsync<Upload>())!.Id;

    /// <summary>Uploads a scan, saves it to the user's account and gives its share details.</summary>
    private async Task<string> SavedAndSharedAsync(string user, bool shareRoomNames = false, string scan = MinimalScan)
    {
        var id = await UploadAsync(scan);
        Assert.Equal(HttpStatusCode.NoContent, (await As(user).PutAsync($"/api/me/homes/{id}", Json(Home()))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await As(null).PutAsync($"/api/surveys/{id}/share", Json(Share(shareRoomNames)))).StatusCode);
        return id;
    }

    private async Task<Link> ShareLinkAsync(string user, string id)
    {
        var response = await As(user).PutAsync($"/api/me/homes/{id}/share-link", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Link>())!;
    }

    private async Task<JsonElement> SharedAsync(string shareId)
    {
        var response = await As(null).GetAsync($"/api/shared/{shareId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task SharingGivesALinkOfItsOwnThatAnyoneCanOpen()
    {
        var user = NewUser();
        var id = await SavedAndSharedAsync(user);

        var link = await ShareLinkAsync(user, id);

        Assert.NotEqual(id, link.Id);
        Assert.Equal($"http://web.test/h/{link.Id}", link.Url);
        var home = await SharedAsync(link.Id);
        Assert.Equal("Detached, 1945–64, insulated home", home.GetProperty("name").GetString());
        var room = home.GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0");
        Assert.Equal(1250, room.GetProperty("heatLossW").GetInt32());
        Assert.Equal(21, room.GetProperty("targetTemperature").GetInt32());
        Assert.Equal("SW1A", home.GetProperty("postcodeDistrict").GetString());
        Assert.False(home.TryGetProperty("heatPump", out _));

        var scan = await As(null).GetAsync($"/api/shared/{link.Id}/scan");
        Assert.Equal(HttpStatusCode.OK, scan.StatusCode);
        Assert.True((await scan.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("walls", out _));
    }

    [Fact]
    public async Task TheHeatPumpFiguresAreShared()
    {
        var user = NewUser();
        var id = await SavedAndSharedAsync(user);
        const string figures = """{"source":"owner","designHeatLossW":6200,"heatPump":{"make":"Vaillant","model":"aroTHERM plus","capacityKw":7}}""";
        Assert.Equal(HttpStatusCode.NoContent, (await As(null).PutAsync($"/api/surveys/{id}/heat-pump", Json(figures))).StatusCode);

        var heatPump = (await SharedAsync((await ShareLinkAsync(user, id)).Id)).GetProperty("heatPump");

        Assert.Equal(6200, heatPump.GetProperty("designHeatLossW").GetInt32());
        Assert.Equal(7, heatPump.GetProperty("heatPump").GetProperty("capacityKw").GetInt32());
    }

    [Fact]
    public async Task RoomNamesAreLeftOutUnlessTheOwnerAllowedThem()
    {
        var user = NewUser();
        var hidden = await ShareLinkAsync(user, await SavedAndSharedAsync(user, shareRoomNames: false));
        var shown = await ShareLinkAsync(user, await SavedAndSharedAsync(user, shareRoomNames: true));

        var hiddenRoom = (await SharedAsync(hidden.Id)).GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0");
        Assert.False(hiddenRoom.TryGetProperty("name", out _));
        Assert.Equal(1250, hiddenRoom.GetProperty("heatLossW").GetInt32());
        var shownRoom = (await SharedAsync(shown.Id)).GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0");
        Assert.Equal("Sophie's room", shownRoom.GetProperty("name").GetString());
    }

    [Fact]
    public async Task EditsCarriedInTheScanAreNotShared()
    {
        var user = NewUser();
        const string scanWithEdits = """{"walls":[{"identifier":"A"}],"doors":[],"windows":[],"openings":[],"edits":{"rooms":{"scanroom-0":{"name":"Sophie's room"}}}}""";
        var link = await ShareLinkAsync(user, await SavedAndSharedAsync(user, scan: scanWithEdits));

        var scan = await (await As(null).GetAsync($"/api/shared/{link.Id}/scan")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(scan.TryGetProperty("edits", out _));
    }

    [Fact]
    public async Task SharingAgainUpdatesTheSnapshotAndKeepsTheLink()
    {
        var user = NewUser();
        var id = await SavedAndSharedAsync(user);
        var first = await ShareLinkAsync(user, id);

        await As(user).PutAsync($"/api/me/homes/{id}", Json(Home(heatLossW: 900)));
        // Saving alone doesn't change what the link shows.
        Assert.Equal(1250, (await SharedAsync(first.Id)).GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0").GetProperty("heatLossW").GetInt32());

        var second = await ShareLinkAsync(user, id);
        Assert.Equal(first.Id, second.Id);
        Assert.Equal(900, (await SharedAsync(second.Id)).GetProperty("edits").GetProperty("rooms").GetProperty("scanroom-0").GetProperty("heatLossW").GetInt32());
    }

    [Fact]
    public async Task OnlyTheOwnerCanShareByLink()
    {
        var owner = NewUser();
        var id = await SavedAndSharedAsync(owner);
        var someoneElse = NewUser();
        await As(someoneElse).PutAsync($"/api/me/homes/{id}", Json(Home()));

        Assert.Equal(HttpStatusCode.Forbidden, (await As(someoneElse).PutAsync($"/api/me/homes/{id}/share-link", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await As(null).PutAsync($"/api/me/homes/{id}/share-link", null)).StatusCode);
    }

    [Fact]
    public async Task AHomeMustBeSavedAndHaveShareDetailsFirst()
    {
        var user = NewUser();
        var notShared = await UploadAsync();
        await As(user).PutAsync($"/api/me/homes/{notShared}", Json(Home()));
        Assert.Equal(HttpStatusCode.Conflict, (await As(user).PutAsync($"/api/me/homes/{notShared}/share-link", null)).StatusCode);

        var notSaved = await UploadAsync();
        await As(null).PutAsync($"/api/surveys/{notSaved}/share", Json(Share()));
        Assert.Equal(HttpStatusCode.Conflict, (await As(user).PutAsync($"/api/me/homes/{notSaved}/share-link", null)).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await As(user).PutAsync("/api/me/homes/AAAAAAAAAAAAAAAAAAAAAA/share-link", null)).StatusCode);
    }

    [Theory]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("not-a-share")]
    public async Task UnknownLinksAreNotFound(string shareId)
    {
        Assert.Equal(HttpStatusCode.NotFound, (await As(null).GetAsync($"/api/shared/{shareId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await As(null).GetAsync($"/api/shared/{shareId}/scan")).StatusCode);
    }

    [Fact]
    public async Task TheSurveyIdIsNotAShareLink()
    {
        var user = NewUser();
        var id = await SavedAndSharedAsync(user);
        await ShareLinkAsync(user, id);

        Assert.Equal(HttpStatusCode.NotFound, (await As(null).GetAsync($"/api/shared/{id}")).StatusCode);
    }
}
