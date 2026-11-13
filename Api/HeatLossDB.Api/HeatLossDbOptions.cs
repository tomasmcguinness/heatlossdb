namespace HeatLossDB.Api;

public class HeatLossDbOptions
{
    /// <summary>The blob container scans go in.</summary>
    public string ScansContainer { get; set; } = "scans";

    /// <summary>The table holding a row per survey: its metadata, profile and heat pump figures.</summary>
    public string SurveysTable { get; set; } = "surveys";

    /// <summary>The table of short codes for opening an upload on the website.</summary>
    public string CodesTable { get; set; } = "surveycodes";

    /// <summary>The website's address, used to build the link returned for each upload.</summary>
    public string PublicWebBaseUrl { get; set; } = "http://localhost:5179";

    /// <summary>The table listing each user's saved homes.</summary>
    public string HomesTable { get; set; } = "homes";

    /// <summary>The blob container saved edits go in.</summary>
    public string EditsContainer { get; set; } = "edits";

    /// <summary>Clerk's Frontend API address (https://&lt;instance&gt;.clerk.accounts.dev), which issues
    /// the session tokens the website sends. Without it, nothing needing sign-in can be used.</summary>
    public string ClerkIssuer { get; set; } = "";

    /// <summary>The website addresses Clerk tokens may come from (their "azp"). Empty allows any.</summary>
    public string[] ClerkAuthorizedParties { get; set; } = [];
}
