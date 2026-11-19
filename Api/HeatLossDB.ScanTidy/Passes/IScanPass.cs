namespace HeatLossDB.ScanTidy.Passes;

/// <summary>Shared state for one tidy run.</summary>
internal sealed class TidyContext(TidyOptions options)
{
    public TidyOptions Options { get; } = options;

    public ChangeLog Log { get; } = new();

    /// <summary>Perimeter walls fixed by storey stacking; interior tidying moves other walls to these, never the reverse.</summary>
    public HashSet<ScanElement> Pinned { get; } = new(ReferenceEqualityComparer.Instance);
}

/// <summary>One step of the pipeline. Steps run in order and edit the plan in place.</summary>
internal interface IScanPass
{
    string Name { get; }

    void Apply(ScanPlan plan, TidyContext ctx);
}
