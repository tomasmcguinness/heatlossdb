namespace HeatLossDB.Api;

public class HeatLossDbOptions
{
    /// <summary>Where uploaded scans and the database live. Relative paths are resolved
    /// against the content root. Holds floorplans of real homes, so it's gitignored.</summary>
    public string DataDirectory { get; set; } = "Data";

    /// <summary>The website's address, used to build the link returned for each upload.</summary>
    public string PublicWebBaseUrl { get; set; } = "http://localhost:5179";
}
