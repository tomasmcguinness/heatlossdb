using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.RateLimiting;
using HeatLossDB.Api;
using HeatLossDB.ScanTidy;
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
builder.Services.AddSingleton(services => new SharedHomeStore(
    services.GetRequiredService<StorageAccount>().Blobs.GetBlobContainerClient(services.GetRequiredService<IOptions<HeatLossDbOptions>>().Value.SharesContainer)));
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
// Behind App Service's front end, the visitor's address comes in X-Forwarded-For, and https in
// X-Forwarded-Proto (the upload link is built from the request's own address).
builder.Services.Configure<ForwardedHeadersOptions>(forwarded =>
{
    forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
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
    var url = $"{WebBase(request, options.Value)}/s/{saved.Id}";
    return Results.Created($"/api/surveys/{saved.Id}", new UploadResult(saved.Id, url, saved.Code, saved.CodeExpiresAt));
});

// The website's "Open a scan" screen: turns the code shown in the app into the survey's id.
app.MapGet("/api/codes/{code}", async (string code, SurveyStore store, CancellationToken cancellationToken) =>
    await store.FindByCodeAsync(code, cancellationToken) is { } id ? Results.Ok(new { id }) : Results.NotFound())
    .RequireRateLimiting("codes");

app.MapGet("/api/surveys/{id}/scan", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.OpenScanAsync(id, cancellationToken) is { } scan ? Results.Stream(scan, "application/json") : Results.NotFound());

// The scan squared up and cleaned (see POST /api/surveys/{id}/tidy below), or 404 until it's been tidied.
app.MapGet("/api/surveys/{id}/scan/tidied", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.OpenTidiedScanAsync(id, cancellationToken) is { } scan ? Results.Stream(scan, "application/json") : Results.NotFound());

// The website's Tidy button. Squares the scan up, makes the outside walls continuous, stacks the
// storeys, merges partitions scanned from both sides, folds wardrobe gaps into their rooms and closes
// every room (see HeatLossDB.ScanTidy). The result is kept beside the scan, which stays exactly as
// uploaded, and tidying always starts again from the upload: pressing it twice gives the same plan,
// and a better tidier can redo every scan. Returns what changed; the changes a person should check
// (inferred walls, big moves, rooms still open) have needsReview set.
app.MapPost("/api/surveys/{id}/tidy", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
{
    JsonNode? scan;
    await using (var stored = await store.OpenScanAsync(id, cancellationToken))
    {
        if (stored is null) return Results.NotFound();
        try
        {
            scan = await JsonNode.ParseAsync(stored, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            scan = null;
        }
    }
    if (scan is null) return Results.UnprocessableEntity(new { error = "The stored scan isn't valid JSON." });

    TidyResult result;
    try
    {
        result = ScanTidier.Tidy(scan);
    }
    catch (ScanFormatException e)
    {
        return Results.UnprocessableEntity(new { error = e.Message });
    }

    result.Tidied["heatlossdbTidy"]!["tidiedAt"] = DateTimeOffset.UtcNow;
    await store.SaveTidiedScanAsync(id, JsonSerializer.SerializeToUtf8Bytes(result.Tidied), cancellationToken);
    return Results.Ok(new TidyResponse(result.Summary, result.Changes));
});

// The floor plan the survey opens with: the tidy its owner accepted, or else the scan as uploaded.
// X-Floorplan-Version says which.
app.MapGet("/api/surveys/{id}/scan/current", async (string id, HttpResponse response, SurveyStore store, CancellationToken cancellationToken) =>
{
    if (await store.OpenCurrentScanAsync(id, cancellationToken) is not var (scan, version)) return Results.NotFound();
    response.Headers["X-Floorplan-Version"] = version;
    return Results.Stream(scan, "application/json");
});

// The survey's floor plan versions: always the original upload, and the accepted tidy once there is one.
app.MapGet("/api/surveys/{id}/versions", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.VersionsAsync(id, cancellationToken) is { } versions ? Results.Ok(versions) : Results.NotFound());

// Changing a survey's floor plan: once someone has saved the survey to their account only they
// can; before that, anyone with the link can, as with sharing. Null when the change may go ahead.
async Task<IResult?> CannotChangeFloorplanAsync(string id, ClaimsPrincipal user, SurveyStore store, CancellationToken cancellationToken)
{
    if (!await store.ExistsAsync(id, cancellationToken)) return Results.NotFound();
    if (await store.OwnerOfAsync(id, cancellationToken) is { Length: > 0 } owner && user.Identity?.Name != owner)
        return Results.Json(new { error = "Only the person who saved this home can change its floor plan." }, statusCode: StatusCodes.Status403Forbidden);
    return null;
}

// "Use tidied plan": makes the latest tidy (POST /tidy) the survey's floor plan. It's copied, so
// tidying again later doesn't change the plan until that tidy is accepted too.
app.MapPost("/api/surveys/{id}/tidy/accept", async (string id, ClaimsPrincipal user, SurveyStore store, CancellationToken cancellationToken) =>
{
    if (await CannotChangeFloorplanAsync(id, user, store, cancellationToken) is { } refused) return refused;
    if (!await store.AcceptTidiedAsync(id, cancellationToken)) return Results.Conflict(new { error = "Tidy the floor plan first." });
    return Results.Ok(await store.VersionsAsync(id, cancellationToken));
});

// Switches between the versions kept: {"version": "original"} goes back to the upload,
// {"version": "tidied"} to the tidy accepted last (409 if none has been).
app.MapPut("/api/surveys/{id}/versions/current", async (
    string id,
    HttpRequest request,
    ClaimsPrincipal user,
    SurveyStore store,
    CancellationToken cancellationToken) =>
{
    if (await CannotChangeFloorplanAsync(id, user, store, cancellationToken) is { } refused) return refused;

    var body = await Uploads.ReadLimitedAsync(request.Body, Uploads.MaxProfileBytes, cancellationToken);
    string? version = null;
    try
    {
        if (body is not null && JsonNode.Parse(body)?["version"] is JsonValue value && value.TryGetValue<string>(out var text)) version = text;
    }
    catch (JsonException)
    {
    }
    if (version is not (FloorplanVersion.Original or FloorplanVersion.Tidied))
        return Results.BadRequest(new { error = "\"version\" must be \"original\" or \"tidied\"." });

    if (!await store.UseVersionAsync(id, version, cancellationToken))
        return Results.Conflict(new { error = "No tidied floor plan has been accepted yet." });
    return Results.Ok(await store.VersionsAsync(id, cancellationToken));
});

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

// Held-back features (HeatLossDbOptions.ComingSoon) are refused with a 403, except for accounts
// let in through their Clerk metadata (see Features). Shared links (/api/shared) stay open to anyone.

// Other homes to match against: every shared home (IsShared, set by sharing it) with a profile.
// Matching itself runs in the browser.
app.MapGet("/api/surveys/{id}/candidates", async (string id, SurveyStore store, CancellationToken cancellationToken) =>
    await store.ExistsAsync(id, cancellationToken) ? Results.Ok(await store.CandidatesForAsync(id, cancellationToken)) : Results.NotFound())
    .RequireFeature(Features.Search);

// The same, for a scan opened from a file (which isn't on the server), and for browsing.
app.MapGet("/api/candidates", async (SurveyStore store, CancellationToken cancellationToken) =>
    Results.Ok(await store.CandidatesForAsync(null, cancellationToken)))
    .RequireFeature(Features.Search, Features.Explore);

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
}).RequireFeature(Features.Share);

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
}).RequireFeature(Features.Share);

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
    // The first Save of a survey makes that user its owner.
    await surveys.ClaimAsync(surveyId, user.Identity!.Name!, cancellationToken);
    await homes.SaveAsync(user.Identity!.Name!, surveyId, root.GetProperty("name").GetString()!.Trim(), root.GetProperty("edits"), cancellationToken);
    return Results.NoContent();
});

// Shares the home by link: a snapshot of the owner's saved edits (room names removed unless they
// allowed them), its postcode district and heat pump figures, and the floor plan as it is now, at /h/{id}. Only the survey's owner can, once
// they've given the share details (PUT /api/surveys/{id}/share) and saved the home to their
// account. Sharing again replaces the snapshot and keeps the link.
me.MapPut("/homes/{surveyId}/share-link", async (
    string surveyId,
    HttpRequest request,
    ClaimsPrincipal user,
    SurveyStore surveys,
    HomeStore homes,
    SharedHomeStore shared,
    IOptions<HeatLossDbOptions> options,
    CancellationToken cancellationToken) =>
{
    var userId = user.Identity!.Name!;
    if (await surveys.ShareStateAsync(surveyId, cancellationToken) is not { } state) return Results.NotFound();
    if (state.OwnerId is { Length: > 0 } owner && owner != userId)
        return Results.Json(new { error = "Only the person who saved this home can share it." }, statusCode: StatusCodes.Status403Forbidden);
    if (!state.IsShared || state.Share is null)
        return Results.Conflict(new { error = "Give the home's share details first." });
    if (await homes.GetAsync(userId, surveyId, cancellationToken) is not { } saved)
        return Results.Conflict(new { error = "Save the home to your account first." });

    byte[] scan;
    if (await surveys.OpenCurrentScanAsync(surveyId, cancellationToken) is not var (stream, _)) return Results.NotFound();
    await using (stream)
    {
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);
        scan = buffer.ToArray();
    }

    var details = SharedHomes.Details(state.Share);
    var heatPump = await surveys.HeatPumpAsync(surveyId, cancellationToken);
    var shareId = await surveys.ShareLinkIdAsync(surveyId, cancellationToken);
    await shared.SaveAsync(shareId, SharedHomes.Snapshot(details, DateTimeOffset.UtcNow, saved.Edits, heatPump), SharedHomes.Scan(scan), cancellationToken);
    return Results.Ok(new ShareLinkResult(shareId, $"{WebBase(request, options.Value)}/h/{shareId}"));
}).RequireFeature(Features.Share);

// A home shared by link, for anyone with the link: its name, when it was shared and the owner's
// edits, then the floor plan as it was then. Read-only; nothing here leads back to the survey.
app.MapGet("/api/shared/{shareId}", async (string shareId, SharedHomeStore shared, CancellationToken cancellationToken) =>
    await shared.OpenHomeAsync(shareId, cancellationToken) is { } home ? Results.Stream(home, "application/json") : Results.NotFound());

app.MapGet("/api/shared/{shareId}/scan", async (string shareId, SharedHomeStore shared, CancellationToken cancellationToken) =>
    await shared.OpenScanAsync(shareId, cancellationToken) is { } scan ? Results.Stream(scan, "application/json") : Results.NotFound());

// Admins only ({"isAdmin": true} in their Clerk public metadata): every uploaded survey, and each
// one to look at. The floor plan itself comes from the open GET /api/surveys/{id}/scan/current.
var admin = app.MapGroup("/api/admin").RequireAuthorization().RequireAdmin();

admin.MapGet("/surveys", async (SurveyStore surveys, HomeStore homes, CancellationToken cancellationToken) =>
{
    var all = await surveys.AllAsync(cancellationToken);
    var owners = all.Where(s => s.OwnerId is { Length: > 0 }).ToDictionary(s => s.PartitionKey, s => s.OwnerId!);
    var saved = await homes.NamesBySurveyAsync(owners, cancellationToken);
    return Results.Ok(all.Select(s => new AdminSurveySummary(
        s.PartitionKey,
        s.CreatedAt,
        s.SizeBytes,
        s.OwnerId is { Length: > 0 },
        s.IsShared,
        saved.TryGetValue(s.PartitionKey, out var name) && name.Length > 0 ? name
            : s.Share is { } share && SharedHomes.Details(share).Name is { Length: > 0 } listed ? listed
            : null)));
});

// Shaped like a shared home's snapshot (GET /api/shared/{id}), with the owner's saved edits in full,
// or null edits if nobody has saved the survey.
admin.MapGet("/surveys/{id}", async (string id, SurveyStore surveys, HomeStore homes, CancellationToken cancellationToken) =>
{
    if (await surveys.ForAdminAsync(id, cancellationToken) is not { } survey) return Results.NotFound();
    var home = survey.OwnerId is { Length: > 0 } owner ? await homes.GetAsync(owner, id, cancellationToken) : null;
    var details = survey.Share is { } share ? SharedHomes.Details(share) : null;
    var result = new JsonObject
    {
        ["name"] = home?.Name is { Length: > 0 } saved ? saved : details?.Name is { Length: > 0 } listed ? listed : null,
        ["createdAt"] = survey.CreatedAt,
        ["owned"] = survey.OwnerId is { Length: > 0 },
        ["savedAt"] = home?.SavedAt,
        ["postcodeDistrict"] = details?.PostcodeDistrict,
        ["edits"] = home is null ? null : JsonNode.Parse(home.Edits.GetRawText()),
    };
    if (survey.HeatPump is not null && JsonNode.Parse(survey.HeatPump) is JsonObject figures) result["heatPump"] = figures;
    return Results.Ok(result);
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

// The website's address, for links handed out: PublicWebBaseUrl, or else this API's own address,
// which serves the website when deployed.
static string WebBase(HttpRequest request, HeatLossDbOptions options) =>
    (options.PublicWebBaseUrl is { Length: > 0 } configured ? configured : $"{request.Scheme}://{request.Host}").TrimEnd('/');

public record UploadResult(string Id, string Url, string Code, DateTimeOffset CodeExpiresAt);

public record TidyResponse(TidySummary Summary, IReadOnlyList<ChangeEntry> Changes);

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
