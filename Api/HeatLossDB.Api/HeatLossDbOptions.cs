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
}
