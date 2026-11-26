using System.Security.Claims;
using System.Text.Json;

namespace HeatLossDB.Api;

/// <summary>
/// Admins: accounts whose Clerk public metadata has {"isAdmin": true}, which only the Clerk dashboard
/// (or its backend API) can set. As with <see cref="Features"/>, the API sees that metadata through
/// the session token's "metadata" claim. Admins can list every uploaded survey and look at each one.
/// </summary>
public static class Admin
{
    /// <summary>Whether the user's metadata claim says they're an admin (isAdmin is JSON true, nothing else).</summary>
    public static bool IsAdmin(ClaimsPrincipal user)
    {
        if (user.FindFirst(Features.MetadataClaim)?.Value is not { Length: > 0 } json) return false;
        try
        {
            using var document = JsonDocument.Parse(json);
            var metadata = document.RootElement;
            return metadata.ValueKind == JsonValueKind.Object
                && metadata.TryGetProperty("isAdmin", out var isAdmin)
                && isAdmin.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>Refuses the endpoint (403) unless the user is an admin.</summary>
    public static TBuilder RequireAdmin<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (context, next) =>
            IsAdmin(context.HttpContext.User)
                ? await next(context)
                : Results.Json(new { error = "Only admins can see this." }, statusCode: StatusCodes.Status403Forbidden));
}

/// <summary>A survey in the admin list.</summary>
/// <param name="Name">The owner's name for it when saved, else its shared listing name, else null.</param>
/// <param name="Owned">Whether someone has saved it to their account.</param>
public record AdminSurveySummary(string Id, DateTimeOffset CreatedAt, int SizeBytes, bool Owned, bool IsShared, string? Name);
