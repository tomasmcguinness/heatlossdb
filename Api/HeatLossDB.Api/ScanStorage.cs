using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace HeatLossDB.Api;

/// <summary>Where uploaded scans (merged.json, up to 25 MB each) are kept, by survey id.
/// Callers only pass well-formed ids, so an id can't point anywhere else.</summary>
public interface IScanStorage
{
    Task SaveAsync(string id, byte[] scan, CancellationToken cancellationToken);

    /// <summary>The stored scan, or null if there isn't one.</summary>
    Task<Stream?> OpenAsync(string id, CancellationToken cancellationToken);
}

/// <summary>Scans as files in the data directory, for development and tests.</summary>
public class FileScanStorage : IScanStorage
{
    private readonly string directory;

    public FileScanStorage(string directory)
    {
        this.directory = directory;
        Directory.CreateDirectory(directory);
    }

    public async Task SaveAsync(string id, byte[] scan, CancellationToken cancellationToken)
    {
        // Write to a temporary file first so a half-written scan is never served.
        var path = PathFor(id);
        var temporary = path + ".tmp";
        await File.WriteAllBytesAsync(temporary, scan, cancellationToken);
        File.Move(temporary, path, overwrite: true);
    }

    public Task<Stream?> OpenAsync(string id, CancellationToken cancellationToken)
    {
        var path = PathFor(id);
        return Task.FromResult<Stream?>(File.Exists(path) ? File.OpenRead(path) : null);
    }

    private string PathFor(string id) => Path.Combine(directory, $"{id}.json");
}

/// <summary>Scans as blobs in an Azure Storage container. Blob uploads only become visible
/// once complete, so a half-written scan is never served.</summary>
public class BlobScanStorage : IScanStorage
{
    private readonly BlobContainerClient container;

    /// <param name="storage">A storage connection string, or the account's blob address
    /// (https://&lt;account&gt;.blob.core.windows.net) to sign in with the app's managed identity.</param>
    public BlobScanStorage(string storage, string containerName)
    {
        var service = storage.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            ? new BlobServiceClient(new Uri(storage), new DefaultAzureCredential())
            : new BlobServiceClient(storage);
        container = service.GetBlobContainerClient(containerName);
        container.CreateIfNotExists();
    }

    public async Task SaveAsync(string id, byte[] scan, CancellationToken cancellationToken)
    {
        var options = new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = "application/json" } };
        await container.GetBlobClient($"{id}.json").UploadAsync(new BinaryData(scan), options, cancellationToken);
    }

    public async Task<Stream?> OpenAsync(string id, CancellationToken cancellationToken)
    {
        try
        {
            return await container.GetBlobClient($"{id}.json").OpenReadAsync(cancellationToken: cancellationToken);
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }
}
