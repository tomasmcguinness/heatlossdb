namespace HeatLossDB.Api;

public class HeatLossDbOptions
{
    /// <summary>Where uploaded scans and the database live when Azure isn't configured (the
    /// "Database" and "Storage" connection strings). Relative paths are resolved against the
    /// content root. Holds floorplans of real homes, so it's gitignored.</summary>
    public string DataDirectory { get; set; } = "Data";

    /// <summary>The blob container scans go in when the "Storage" connection string is set.</summary>
    public string ScansContainer { get; set; } = "scans";

    /// <summary>The website's address, used to build the link returned for each upload.</summary>
    public string PublicWebBaseUrl { get; set; } = "http://localhost:5179";

    public string ResolveDataDirectory(IHostEnvironment environment) =>
        Path.GetFullPath(DataDirectory, environment.ContentRootPath);
}
