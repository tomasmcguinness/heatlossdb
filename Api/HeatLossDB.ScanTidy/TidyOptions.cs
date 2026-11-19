using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace HeatLossDB.ScanTidy;

/// <summary>Tolerances for each step. All distances are metres. Defaults are tuned on one house; widen with care.</summary>
public sealed record TidyOptions
{
    public static TidyOptions Default { get; } = new();

    // Orientation
    /// <summary>Walls within this many degrees of square are snapped to it; anything further (bays, splays) is left alone.</summary>
    public double AngleToleranceDeg { get; init; } = 8;

    /// <summary>Angled walls shorter than this, with nothing in them and a loose end, are stray bits and removed.</summary>
    public double StrayWallMaxLength { get; init; } = 0.6;

    // Lines and perimeter
    /// <summary>Parallel walls closer than this are treated as the same line.</summary>
    public double LineTolerance { get; init; } = 0.08;

    /// <summary>Perimeter runs this close on the same side may be joined across a hole.</summary>
    public double FaceTolerance { get; init; } = 0.15;

    /// <summary>Smallest gap along a perimeter face treated as a hole.</summary>
    public double HoleMinGap { get; init; } = 0.05;

    /// <summary>A wall end within this distance of another wall counts as meeting it (so a gap there is a step, not a hole).</summary>
    public double ConnectTolerance { get; init; } = 0.25;

    // Storeys
    /// <summary>Upper perimeter faces within this distance of the face below are stacked onto it and pinned.</summary>
    public double PerimeterStackTolerance { get; init; } = 0.30;

    /// <summary>Moves larger than this are flagged for the user to confirm.</summary>
    public double ReviewThreshold { get; init; } = 0.05;

    /// <summary>A face further than this from anything below has nothing below it (setback or single-storey part).</summary>
    public double NothingBelowDistance { get; init; } = 1.0;

    public double StoreyAlignSearch { get; init; } = 0.40;
    public double StoreyAlignStep { get; init; } = 0.005;
    public double StoreyAlignMatch { get; init; } = 0.03;

    // Interior
    /// <summary>Wall ends within this distance of a perpendicular wall are extended or trimmed to meet it.</summary>
    public double CornerTolerance { get; init; } = 0.25;

    /// <summary>Two overlapping parallel walls this far apart are the two faces of one partition.</summary>
    public double PartitionMin { get; init; } = 0.05;
    public double PartitionMax { get; init; } = 0.40;

    // Fitted storage (wardrobes)
    public double FittedDepthMin { get; init; } = 0.40;
    public double FittedDepthMax { get; init; } = 0.75;
    public double FittedEpsilon { get; init; } = 0.03;

    // Room closure
    public double ClosureResolution { get; init; } = 0.02;
    public double ClosureMaxExtension { get; init; } = 1.0;
    public double ClosurePadding { get; init; } = 1.0;
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ChangeKind
{
    StoreyRotated,
    AngleSnapped,
    KeptAngled,
    StrayWallRemoved,
    PerimeterHoleFilled,
    StoreyAligned,
    PerimeterStacked,
    PerimeterOverTolerance,
    NothingBelow,
    PartitionMerged,
    ZeroLengthWallRemoved,
    FittedStorageAbsorbed,
    RoomLeak,
    WallExtendedToClose,
    RoomStillOpen,
    FloorsLinedUp,
}

/// <summary>
/// One change the tidier made (or declined to make). <see cref="NeedsReview"/> marks the ones the app
/// should put in front of the user: inferred walls, large stacking moves, faces left unaligned, rooms still open.
/// </summary>
/// <param name="Millimetres">The move, extension or thickness involved, where there is one.</param>
public sealed record ChangeEntry(
    string Pass,
    ChangeKind Kind,
    int? Story,
    string Message,
    IReadOnlyList<string> WallIds,
    double? Millimetres = null,
    bool NeedsReview = false);

public sealed class ChangeLog
{
    private readonly List<ChangeEntry> _entries = [];

    public IReadOnlyList<ChangeEntry> Entries => _entries;

    public void Add(string pass, ChangeKind kind, int? story, string message, IEnumerable<string>? wallIds = null,
        double? millimetres = null, bool needsReview = false) =>
        _entries.Add(new ChangeEntry(pass, kind, story, message, (wallIds ?? []).ToList(),
            millimetres is null ? null : Math.Round(millimetres.Value), needsReview));
}

public sealed record TidySummary(
    int WallsBefore,
    int WallsAfter,
    int Changes,
    int NeedsReview,
    bool AllRoomsClosed,
    IReadOnlyList<string> OpenRooms);

public sealed record TidyResult(JsonObject Tidied, IReadOnlyList<ChangeEntry> Changes, TidySummary Summary);
