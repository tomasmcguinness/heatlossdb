using Azure;
using Azure.Data.Tables;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace HeatLossDB.Api;

/// <summary>The storage account everything is kept in: scans as blobs, surveys in tables.</summary>
public class StorageAccount
{
    public BlobServiceClient Blobs { get; }
    public TableServiceClient Tables { get; }

    /// <param name="storage">A storage connection string ("UseDevelopmentStorage=true" for Azurite),
    /// or the account's blob address (https://&lt;account&gt;.blob.core.windows.net) to sign in with
    /// the app's managed identity.</param>
    public StorageAccount(string storage)
    {
        if (storage.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            var credential = new DefaultAzureCredential();
            var blobs = new Uri(storage);
            Blobs = new BlobServiceClient(blobs, credential);
            Tables = new TableServiceClient(new Uri(blobs.AbsoluteUri.Replace(".blob.", ".table.")), credential);
        }
        else
        {
            Blobs = new BlobServiceClient(storage);
            Tables = new TableServiceClient(storage);
        }
    }
}

/// <summary>Where uploaded scans (merged.json, up to 25 MB each) are kept, by survey id.
/// Callers only pass well-formed ids, so an id can't point anywhere else.</summary>
public interface IScanStorage
{
    Task SaveAsync(string id, byte[] scan, CancellationToken cancellationToken);

    /// <summary>The stored scan, or null if there isn't one.</summary>
    Task<Stream?> OpenAsync(string id, CancellationToken cancellationToken);
}

/// <summary>Scans as blobs in a container. Blob uploads only become visible once complete, so a
/// half-written scan is never served.</summary>
public class BlobScanStorage : IScanStorage
{
    private readonly BlobContainerClient container;

    public BlobScanStorage(BlobServiceClient service, string containerName)
    {
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
