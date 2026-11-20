using System.Security.Claims;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace HeatLossDB.Api;

/// <summary>
/// Options held back as "coming soon" (<see cref="HeatLossDbOptions.ComingSoon"/>), and the accounts
/// allowed to use them anyway. As in the website, an account is let in by its Clerk public metadata:
/// {"features": ["search", "explore"]} for some, or {"earlyAccess": true} for all. The API sees that
/// metadata through the session token, which Clerk must be set to include as
/// {"metadata": "{{user.public_metadata}}"} (Clerk dashboard, Sessions, Customize session token).
/// </summary>
public static class Features
{
    public const string Search = "search";
    public const string Share = "share";
    public const string Explore = "explore";

    private static readonly string[] All = [Search, Share, Explore];

    /// <summary>The session token claim holding the user's Clerk public metadata.</summary>
    public const string MetadataClaim = "metadata";

    /// <summary>The known features in a comma-separated list, ignoring spaces, case and other names.</summary>
    public static IReadOnlySet<string> Parse(string? list) => Known((list ?? "").Split(','));

    private static HashSet<string> Known(IEnumerable<string> names) =>
        names.Select(name => name.Trim().ToLowerInvariant()).Where(All.Contains).ToHashSet();

    /// <summary>The held-back features the user may use anyway, from their metadata claim.</summary>
    public static IReadOnlySet<string> UnlockedFor(ClaimsPrincipal user)
    {
        if (user.FindFirst(MetadataClaim)?.Value is not { Length: > 0 } json) return new HashSet<string>();
        try
        {
            using var document = JsonDocument.Parse(json);
            var metadata = document.RootElement;
            if (metadata.ValueKind != JsonValueKind.Object) return new HashSet<string>();
            if (metadata.TryGetProperty("earlyAccess", out var early) && early.ValueKind == JsonValueKind.True) return All.ToHashSet();
            if (!metadata.TryGetProperty("features", out var features) || features.ValueKind != JsonValueKind.Array) return new HashSet<string>();
            return Known(features.EnumerateArray().Where(f => f.ValueKind == JsonValueKind.String).Select(f => f.GetString()!));
        }
        catch (JsonException)
        {
            return new HashSet<string>();
        }
    }

    /// <summary>Whether the user may use the feature: it isn't held back, or their account is let in.</summary>
    public static bool IsAvailable(string feature, IReadOnlySet<string> comingSoon, ClaimsPrincipal user) =>
        !comingSoon.Contains(feature) || UnlockedFor(user).Contains(feature);

    /// <summary>Refuses the endpoint (403) unless the user may use at least one of the features.</summary>
    public static TBuilder RequireFeature<TBuilder>(this TBuilder builder, params string[] anyOf) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var comingSoon = Parse(http.RequestServices.GetRequiredService<IOptions<HeatLossDbOptions>>().Value.ComingSoon);
            return anyOf.Any(feature => IsAvailable(feature, comingSoon, http.User))
                ? await next(context)
                : Results.Json(new { error = "This isn't available yet." }, statusCode: StatusCodes.Status403Forbidden);
        });
}
