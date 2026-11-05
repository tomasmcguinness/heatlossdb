using HeatLossDB.Api;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<HeatLossDbOptions>(builder.Configuration.GetSection("HeatLossDB"));
builder.Services.AddSingleton<SurveyStore>();
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = Uploads.MaxScanBytes);

var app = builder.Build();

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

app.MapGet("/api/surveys/{id}/scan", (string id, SurveyStore store) =>
    store.ScanPath(id) is { } path ? Results.File(path, "application/json") : Results.NotFound());

app.Run();

public record UploadResult(string Id, string Url);

public static class Uploads
{
    /// <summary>A two-storey house is about 1.5 MB; this leaves plenty of room.</summary>
    public const long MaxScanBytes = 25 * 1024 * 1024;

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
