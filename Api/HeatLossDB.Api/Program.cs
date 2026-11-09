using HeatLossDB.Api;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<HeatLossDbOptions>(builder.Configuration.GetSection("HeatLossDB"));
// Scans go in Azure Blob Storage when the "Storage" connection string is set, otherwise in files.
builder.Services.AddSingleton<IScanStorage>(services =>
{
    var options = services.GetRequiredService<IOptions<HeatLossDbOptions>>().Value;
    return services.GetRequiredService<IConfiguration>().GetConnectionString("Storage") is { } storage
        ? new BlobScanStorage(storage, options.ScansContainer)
        : new FileScanStorage(Path.Combine(options.ResolveDataDirectory(services.GetRequiredService<IHostEnvironment>()), "scans"));
});
builder.Services.AddSingleton<SurveyStore>();
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = Uploads.MaxScanBytes);

var app = builder.Build();

// The website, built into wwwroot on publish (in development, Vite serves it instead). Vite
// fingerprints everything under /assets, so those can be cached for good; index.html must not be.
var websiteFiles = new StaticFileOptions
{
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl =
        context.Context.Request.Path.StartsWithSegments("/assets") ? "public, max-age=31536000, immutable" : "no-cache",
};
app.UseDefaultFiles();
app.UseStaticFiles(websiteFiles);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// The app uploads a completed survey's merged.json (a RoomPlan CapturedStructure) as the body.
app.MapPost("/api/surveys", async (
    HttpRequest request,
    SurveyStore store,
    IOptions<HeatLossDbOptions> options,
    CancellationToken cancellationToken) =>
{
    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxScanBytes, cancellationToken);
    if (body is null)
        return Results.Problem("The scan is too large.", statusCode: StatusCodes.Status413PayloadTooLarge);

    if (ScanValidator.Validate(body) is { } error)
        return Results.BadRequest(new { error });

    var appSurveyId = request.Headers["X-App-Survey-Id"].FirstOrDefault();
    var id = await store.SaveAsync(body, appSurveyId, cancellationToken);
    var url = $"{options.Value.PublicWebBaseUrl.TrimEnd('/')}/s/{id}";
    return Results.Created($"/api/surveys/{id}", new UploadResult(id, url));
});

app.MapGet("/api/surveys/{id}/scan", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.OpenScanAsync(id, cancellationToken) is { } scan ? Results.Stream(scan, "application/json") : Results.NotFound());

// The website derives a shape profile from the scan (measurements and lined-up outlines) and
// stores it here, so matching doesn't need every scan in full.
app.MapPut("/api/surveys/{id}/profile", async (
    string id,
    HttpRequest request,
    SurveyStore store,
    CancellationToken cancellationToken) =>
{
    if (!await store.ExistsAsync(id, cancellationToken)) return Results.NotFound();
    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxProfileBytes, cancellationToken);
    if (body is null)
        return Results.Problem("The profile is too large.", statusCode: StatusCodes.Status413PayloadTooLarge);
    if (ScanValidator.ValidateProfile(body) is { } error)
        return Results.BadRequest(new { error });
    await store.SaveProfileAsync(id, body, cancellationToken);
    return Results.NoContent();
});

// Other homes to match against. For now every upload with a profile is a candidate; sharing
// consent comes with the "do you have a heat pump?" flow.
app.MapGet("/api/surveys/{id}/candidates", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.ExistsAsync(id, cancellationToken) ? Results.Ok(await store.CandidatesForAsync(id, cancellationToken)) : Results.NotFound());

// A survey's heat loss and heat pump figures. Real ones will come from HeatPumpMonitor or a
// heat loss survey; until then, sample figures fill the gap (see below).
app.MapPut("/api/surveys/{id}/heat-pump", async (
    string id,
    HttpRequest request,
    SurveyStore store,
    CancellationToken cancellationToken) =>
{
    if (!await store.ExistsAsync(id, cancellationToken)) return Results.NotFound();
    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxProfileBytes, cancellationToken);
    if (body is null)
        return Results.Problem("The heat pump record is too large.", statusCode: StatusCodes.Status413PayloadTooLarge);
    if (ScanValidator.ValidateHeatPump(body) is { } error)
        return Results.BadRequest(new { error });
    await store.SaveHeatPumpAsync(id, body, cancellationToken);
    return Results.NoContent();
});

if (app.Environment.IsDevelopment())
{
    // Development only: gives every home that has a profile but no figures made-up heat loss and
    // heat pump data (marked "source": "sample"), for building the matching page.
    app.MapPost("/api/dev/sample-heat-pumps", async (SurveyStore store, bool? replace, CancellationToken cancellationToken) =>
    {
        var seeded = 0;
        foreach (var (id, floorArea) in await store.SurveysWithProfilesAsync(cancellationToken))
        {
            // Never overwrite real figures; replace sample ones only when asked.
            var source = await store.HeatPumpSourceAsync(id, cancellationToken);
            if (source is not null && (source != "sample" || replace != true)) continue;
            var record = SampleHeatPumps.Generate(id, floorArea);
            await store.SaveHeatPumpAsync(id, System.Text.Encoding.UTF8.GetBytes(record.ToJsonString()), cancellationToken);
            seeded++;
        }
        return Results.Ok(new { seeded });
    });
}

// Unknown API routes stay 404s; any other path is a page of the website, such as /s/{id}.
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html", websiteFiles);

app.Run();

public record UploadResult(string Id, string Url);

public static class Uploads
{
    /// <summary>A two-storey house is about 1.5 MB; this leaves plenty of room.</summary>
    public const long MaxScanBytes = 25 * 1024 * 1024;

    /// <summary>Profiles hold a few outlines and figures: a few kilobytes.</summary>
    public const long MaxProfileBytes = 1024 * 1024;

    /// <summary>Reads the stream, or returns null as soon as it exceeds the limit.</summary>
    public static async Task<byte[]?> ReadLimitedAsync(Stream stream, long limit, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > limit) return null;
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }
}

/// <summary>Exposed so the tests can host the API.</summary>
public partial class Program;
