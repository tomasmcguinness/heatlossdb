using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace HeatLossDB.Api.Tests;

public class SampleHeatPumpTests
{
    [Fact]
    public void TheSameSurveyAlwaysGetsTheSameFigures()
    {
        Assert.Equal(
            SampleHeatPumps.Generate("survey-1", 120).ToJsonString(),
            SampleHeatPumps.Generate("survey-1", 120).ToJsonString());
        Assert.NotEqual(
            SampleHeatPumps.Generate("survey-1", 120).ToJsonString(),
            SampleHeatPumps.Generate("survey-2", 120).ToJsonString());
    }

    [Theory]
    [InlineData(60)]
    [InlineData(150)]
    [InlineData(300)]
    public void FiguresAreBelievable(double floorArea)
    {
        for (var i = 0; i < 50; i++)
        {
            var record = SampleHeatPumps.Generate($"survey-{i}", floorArea);
            Assert.Equal("sample", (string?)record["source"]);

            var perSquareMetre = (double)record["designHeatLossW"]! / floorArea;
            Assert.InRange(perSquareMetre, 34, 76);

            var scop = (double)record["annual"]!["scop"]!;
            Assert.InRange(scop, 2.5, 4.8);

            var heat = (double)record["annual"]!["heatDeliveredKwh"]!;
            var electricity = (double)record["annual"]!["electricityKwh"]!;
            Assert.InRange(heat / electricity, scop - 0.1, scop + 0.1);

            // The heat pump is big enough for the design heat loss, unless it's the largest size.
            var capacity = (double)record["heatPump"]!["capacityKw"]!;
            Assert.True(capacity >= (double)record["designHeatLossW"]! / 1000 || capacity >= 12);
        }
    }
}

public class HeatPumpEndpointTests : IClassFixture<SurveyUploadTests.Api>
{
    private readonly HttpClient client;

    public HeatPumpEndpointTests(SurveyUploadTests.Api api) => client = api.CreateClient();

    private record Upload(string Id, string Url);
    private record CandidateDto(string Id, string CreatedAt, JsonElement Profile, JsonElement? HeatPump);

    private async Task<string> UploadSharedWithProfileAsync(string appSurveyId, double floorArea)
    {
        var content = new StringContent("""{"walls":[{"identifier":"A"}]}""", Encoding.UTF8, "application/json");
        content.Headers.Add("X-App-Survey-Id", appSurveyId);
        var id = (await (await client.PostAsync("/api/surveys", content)).Content.ReadFromJsonAsync<Upload>())!.Id;
        await client.PutAsync($"/api/surveys/{id}/profile",
            new StringContent($$"""{"version":1,"floorArea":{{floorArea}}}""", Encoding.UTF8, "application/json"));
        // Shared, so it's listed as a candidate.
        await client.PutAsync($"/api/surveys/{id}/share",
            new StringContent("""{"name":"Home","postcodeDistrict":"SW1A","shareRoomNames":false}""", Encoding.UTF8, "application/json"));
        return id;
    }

    [Fact]
    public async Task SampleDataIsAddedToHomesWithoutFiguresAndShownInCandidates()
    {
        var mine = await UploadSharedWithProfileAsync("hp-mine", 100);
        var theirs = await UploadSharedWithProfileAsync("hp-theirs", 120);
        var real = await UploadSharedWithProfileAsync("hp-real", 90);
        await client.PutAsync($"/api/surveys/{real}/heat-pump",
            new StringContent("""{"source":"heatpumpmonitor","designHeatLossW":5000}""", Encoding.UTF8, "application/json"));

        var seeded = await (await client.PostAsync("/api/dev/sample-heat-pumps", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(seeded.GetProperty("seeded").GetInt32() >= 2);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var theirsRecord = candidates!.Single(c => c.Id == theirs).HeatPump;
        Assert.Equal("sample", theirsRecord!.Value.GetProperty("source").GetString());
        // Real figures are never overwritten by sample ones.
        Assert.Equal("heatpumpmonitor", candidates!.Single(c => c.Id == real).HeatPump!.Value.GetProperty("source").GetString());
    }

    [Fact]
    public async Task ReplacingSampleDataNeverTouchesRealFigures()
    {
        var real = await UploadSharedWithProfileAsync("hp-real-replace", 90);
        await client.PutAsync($"/api/surveys/{real}/heat-pump",
            new StringContent("""{"source":"survey","designHeatLossW":4200}""", Encoding.UTF8, "application/json"));
        var mine = await UploadSharedWithProfileAsync("hp-mine-replace", 100);

        await client.PostAsync("/api/dev/sample-heat-pumps?replace=true", null);

        var candidates = await client.GetFromJsonAsync<List<CandidateDto>>($"/api/surveys/{mine}/candidates");
        var record = candidates!.Single(c => c.Id == real).HeatPump!.Value;
        Assert.Equal("survey", record.GetProperty("source").GetString());
        Assert.Equal(4200, record.GetProperty("designHeatLossW").GetInt32());
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"designHeatLossW":5000}""")]
    public async Task RejectsRecordsWithoutASource(string body)
    {
        var id = await UploadSharedWithProfileAsync("hp-invalid", 100);
        var response = await client.PutAsync($"/api/surveys/{id}/heat-pump", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
