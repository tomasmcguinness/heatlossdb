using System.Text.Json;
using System.Text.Json.Nodes;
using HeatLossDB.ScanTidy.Passes;

namespace HeatLossDB.ScanTidy;

/// <summary>
/// Tidies a RoomStitch / RoomPlan CapturedStructure: squares it up, makes the outside walls continuous, stacks
/// the storeys, merges doubled partitions, folds wardrobe voids into their rooms and closes every room.
/// The input is never modified; the result is a new document in the same format, with a
/// <c>heatlossdbTidy</c> block recording the tidier's version and every change it made.
/// </summary>
public static class ScanTidier
{
    /// <summary>Bump when the rules change, so tidied scans made by an older version can be found and redone.</summary>
    /// <remarks>2: the scanned rooms' own copies (<c>rooms[]</c>) turn and move with their storey.
    /// 3: stray angled bits of wall are removed.
    /// 4: the rooms' copies of walls follow the tidied walls, and floors are lined up with them.</remarks>
    public const int Version = 4;

    /// <summary>The steps, in order. The perimeter is fixed before the interior so interior tidying can't move an outside wall.
    /// Stray bits of wall are only judged once partitions are merged (a partition's second face can sit by a stray's
    /// loose end until then), and before room closure, so closing rooms doesn't build on them.</summary>
    private static readonly IScanPass[] Passes =
    [
        new OrientPass(),
        new PerimeterPass(),
        new StoreyStackPass(),
        new InteriorPass(),
        new FittedStoragePass(),
        new StrayWallPass(),
        new RoomClosurePass(),
        new RoomFloorPass(),
    ];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static TidyResult Tidy(string scanJson, TidyOptions? options = null)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(scanJson);
        }
        catch (JsonException e)
        {
            throw new ScanFormatException("The scan isn't valid JSON.", e);
        }
        return Tidy(node ?? throw new ScanFormatException("The scan is empty."), options);
    }

    public static TidyResult Tidy(JsonNode scan, TidyOptions? options = null)
    {
        var o = options ?? TidyOptions.Default;
        var plan = ScanPlan.Load(scan);
        var before = plan.Walls.Count;
        var ctx = new TidyContext(o);

        try
        {
            foreach (var pass in Passes) pass.Apply(plan, ctx);
        }
        catch (Exception e) when (e is InvalidOperationException or FormatException or KeyNotFoundException or IndexOutOfRangeException or ArgumentException)
        {
            // Almost always a field of the wrong type or shape somewhere in the scan.
            throw new ScanFormatException($"The scan couldn't be tidied: {e.Message}", e);
        }

        var changes = ctx.Log.Entries;
        var open = changes.Where(c => c.Kind == ChangeKind.RoomStillOpen).Select(c => c.Message).ToList();
        var summary = new TidySummary(before, plan.Walls.Count, changes.Count, changes.Count(c => c.NeedsReview), open.Count == 0, open);

        var tidied = plan.ToJson();
        tidied["heatlossdbTidy"] = new JsonObject
        {
            ["version"] = Version,
            ["summary"] = JsonSerializer.SerializeToNode(summary, Json),
            ["changes"] = JsonSerializer.SerializeToNode(changes, Json),
        };
        return new TidyResult(tidied, changes, summary);
    }
}
