using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using HeatLossDB.Api;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<HeatLossDbOptions>(builder.Configuration.GetSection("HeatLossDB"));
// Everything is kept in one storage account: scans as blobs, surveys in tables. In development
// that's Azurite, the storage emulator.
builder.Services.AddSingleton(services => new StorageAccount(
    services.GetRequiredService<IConfiguration>().GetConnectionString("Storage")
    ?? throw new InvalidOperationException("Set the \"Storage\" connection string (\"UseDevelopmentStorage=true\" for Azurite).")));
builder.Services.AddSingleton<IScanStorage>(services => new BlobScanStorage(
    services.GetRequiredService<StorageAccount>().Blobs,
    services.GetRequiredService<IOptions<HeatLossDbOptions>>().Value.ScansContainer));
builder.Services.AddSingleton(services =>
{
    var tables = services.GetRequiredService<StorageAccount>().Tables;
    var options = services.GetRequiredService<IOptions<HeatLossDbOptions>>().Value;
    return new SurveyStore(services.GetRequiredService<IScanStorage>(), tables.GetTableClient(options.SurveysTable), tables.GetTableClient(options.CodesTable));
});
builder.Services.AddSingleton(services =>
{
    var account = services.GetRequiredService<StorageAccount>();
    var options = services.GetRequiredService<IOptions<HeatLossDbOptions>>().Value;
    return new HomeStore(account.Tables.GetTableClient(options.HomesTable), account.Blobs.GetBlobContainerClient(options.EditsContainer));
});
// Signing in is Clerk's: the website sends the user's Clerk session token, a JWT signed with keys
// Clerk publishes at the issuer. The tokens have no audience; "azp" says which site asked for them.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<HeatLossDbOptions>>((jwt, heatLossDb) =>
    {
        var clerk = heatLossDb.Value;
        if (string.IsNullOrWhiteSpace(clerk.ClerkIssuer))
        {
            // Not set up: no token is accepted, so everything needing sign-in is a 401.
            jwt.Events = new JwtBearerEvents { OnMessageReceived = context => { context.NoResult(); return Task.CompletedTask; } };
            return;
        }
        jwt.Authority = clerk.ClerkIssuer.TrimEnd('/');
        jwt.MapInboundClaims = false;
        jwt.TokenValidationParameters.ValidateAudience = false;
        jwt.TokenValidationParameters.NameClaimType = "sub";
        jwt.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var party = context.Principal?.FindFirst("azp")?.Value;
                if (clerk.ClerkAuthorizedParties.Length > 0 && (party is null || !clerk.ClerkAuthorizedParties.Contains(party.TrimEnd('/'), StringComparer.OrdinalIgnoreCase)))
                    context.Fail("The token wasn't issued for this site.");
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();
// Codes are short enough to guess, so each address can only try a few a minute.
builder.Services.AddRateLimiter(limiter =>
{
    limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    limiter.AddPolicy("codes", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});
// Behind App Service's front end, the visitor's address comes in X-Forwarded-For.
builder.Services.Configure<ForwardedHeadersOptions>(forwarded =>
{
    forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
    forwarded.KnownNetworks.Clear();
    forwarded.KnownProxies.Clear();
});
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = Uploads.MaxScanBytes);

var app = builder.Build();

app.UseForwardedHeaders();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

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
    var saved = await store.SaveAsync(body, appSurveyId, cancellationToken);
    var url = $"{options.Value.PublicWebBaseUrl.TrimEnd('/')}/s/{saved.Id}";
    return Results.Created($"/api/surveys/{saved.Id}", new UploadResult(saved.Id, url, saved.Code, saved.CodeExpiresAt));
});

// The website's "Open a scan" screen: turns the code shown in the app into the survey's id.
app.MapGet("/api/codes/{code}", async (string code, SurveyStore store, CancellationToken cancellationToken) =>
    await store.FindByCodeAsync(code, cancellationToken) is { } id ? Results.Ok(new { id }) : Results.NotFound())
    .RequireRateLimiting("codes");

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

// Other homes to match against. For now every upload with a profile is a candidate; once
// accounts are confirmed, only shared homes will be. Matching itself runs in the browser.
app.MapGet("/api/surveys/{id}/candidates", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.ExistsAsync(id, cancellationToken) ? Results.Ok(await store.CandidatesForAsync(id, cancellationToken)) : Results.NotFound());

// The same, for a scan opened from a file (which isn't on the server), and for browsing.
app.MapGet("/api/candidates", async (SurveyStore store, CancellationToken cancellationToken) =>
    Results.Ok(await store.CandidatesForAsync(null, cancellationToken)));

// What the owner said when sharing the home (see ScanValidator.ValidateShare).
app.MapPut("/api/surveys/{id}/share", async (
    string id,
    HttpRequest request,
    SurveyStore store,
    CancellationToken cancellationToken) =>
{
    if (!await store.ExistsAsync(id, cancellationToken)) return Results.NotFound();
    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxProfileBytes, cancellationToken);
    if (body is null)
        return Results.Problem("The share details are too large.", statusCode: StatusCodes.Status413PayloadTooLarge);
    if (ScanValidator.ValidateShare(body) is { } error)
        return Results.BadRequest(new { error });
    await store.SaveShareAsync(id, body, cancellationToken);
    return Results.NoContent();
});

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

// Homes the signed-in user has saved: their edits to a survey, kept with their account.
var me = app.MapGroup("/api/me").RequireAuthorization();

me.MapGet("/homes", async (ClaimsPrincipal user, HomeStore homes, CancellationToken cancellationToken) =>
    Results.Ok(await homes.ListAsync(user.Identity!.Name!, cancellationToken)));

me.MapGet("/homes/{surveyId}", async (string surveyId, ClaimsPrincipal user, HomeStore homes, CancellationToken cancellationToken) =>
    SurveyStore.IsId(surveyId) && await homes.GetAsync(user.Identity!.Name!, surveyId, cancellationToken) is { } home
        ? Results.Ok(home)
        : Results.NotFound());

me.MapPut("/homes/{surveyId}", async (
    string surveyId,
    HttpRequest request,
    ClaimsPrincipal user,
    SurveyStore surveys,
    HomeStore homes,
    CancellationToken cancellationToken) =>
{
    if (!await surveys.ExistsAsync(surveyId, cancellationToken)) return Results.NotFound();
    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxSavedHomeBytes, cancellationToken);
    if (body is null)
        return Results.Problem("The saved home is too large.", statusCode: StatusCodes.Status413PayloadTooLarge);
    if (ScanValidator.ValidateSavedHome(body) is { } error)
        return Results.BadRequest(new { error });
    using var document = JsonDocument.Parse(body);
    var root = document.RootElement;
    await homes.SaveAsync(user.Identity!.Name!, surveyId, root.GetProperty("name").GetString()!.Trim(), root.GetProperty("edits"), cancellationToken);
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

public record UploadResult(string Id, string Url, string Code, DateTimeOffset CodeExpiresAt);

public static class Uploads
{
    /// <summary>A two-storey house is about 1.5 MB; this leaves plenty of room.</summary>
    public const long MaxScanBytes = 25 * 1024 * 1024;

    /// <summary>Profiles hold a few outlines and figures: a few kilobytes. Table Storage keeps
    /// text properties under 64 KB, which is 32 KB of UTF-8 at worst.</summary>
    public const long MaxProfileBytes = 32 * 1024;

    /// <summary>A saved home's edits: a setting or two per element and room, so tens of kilobytes.</summary>
    public const long MaxSavedHomeBytes = 2 * 1024 * 1024;

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
