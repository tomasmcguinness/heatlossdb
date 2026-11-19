namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Tidies the inside of each storey, after the perimeter is fixed:
/// parallel walls within <see cref="TidyOptions.LineTolerance"/> go onto one line (a pinned perimeter wall's line, if
/// one is involved); two overlapping faces between <see cref="TidyOptions.PartitionMin"/> and
/// <see cref="TidyOptions.PartitionMax"/> apart become one partition on the centreline, with the gap as its thickness
/// (each room is scanned from inside, so a shared wall arrives twice); and wall ends within
/// <see cref="TidyOptions.CornerTolerance"/> of a perpendicular wall are extended or trimmed to meet it.
/// </summary>
internal sealed class InteriorPass : IScanPass
{
    public string Name => "interior";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        foreach (var st in plan.Stories.ToList())
        {
            var walls = plan.WallsOn(st).Where(w => w.IsStraight()).ToList();
            foreach (var axis in new[] { 0, 1 })
            {
                MergeLines(plan, ctx, walls.Where(w => w.Axis() == axis).OrderBy(w => w.Offset()).ToList());
                var removed = MergePartitions(plan, ctx, walls.Where(w => w.Axis() == axis).ToList(), axis, st);
                plan.Walls.RemoveAll(removed.Contains);
                walls.RemoveAll(removed.Contains);
            }
            JoinCorners(walls, o.CornerTolerance);
        }
    }

    private static void MergeLines(ScanPlan plan, TidyContext ctx, List<ScanElement> sorted)
    {
        var clusters = new List<List<ScanElement>>();
        foreach (var w in sorted)
        {
            if (clusters.Count > 0 && w.Offset() - clusters[^1][^1].Offset() < ctx.Options.LineTolerance) clusters[^1].Add(w);
            else clusters.Add([w]);
        }
        foreach (var cluster in clusters)
        {
            var pinned = cluster.FirstOrDefault(ctx.Pinned.Contains);
            var line = pinned?.Offset() ?? WallGeometry.WeightedOffset(cluster);
            foreach (var w in cluster) plan.Shift(w, line - w.Offset());
        }
    }

    private HashSet<ScanElement> MergePartitions(ScanPlan plan, TidyContext ctx, List<ScanElement> group, int axis, int story)
    {
        var o = ctx.Options;
        var pairs = new List<(double Gap, ScanElement P, ScanElement Q)>();
        for (var i = 0; i < group.Count; i++)
        for (var j = i + 1; j < group.Count; j++)
        {
            ScanElement p = group[i], q = group[j];
            var gap = Math.Abs(p.Offset() - q.Offset());
            var (pl, ph) = p.Span();
            var (ql, qh) = q.Span();
            var overlap = Math.Min(ph, qh) - Math.Max(pl, ql);
            if (gap > o.PartitionMin && gap < o.PartitionMax && overlap > 0.5 * Math.Min(ph - pl, qh - ql)
                && !(ctx.Pinned.Contains(p) && ctx.Pinned.Contains(q)))
                pairs.Add((gap, p, q));
        }

        var removed = new HashSet<ScanElement>(ReferenceEqualityComparer.Instance);
        foreach (var (gap, p, q) in pairs.OrderBy(x => x.Gap))
        {
            if (removed.Contains(p) || removed.Contains(q)) continue;
            var lo = Math.Min(p.Span().Lo, q.Span().Lo);
            var hi = Math.Max(p.Span().Hi, q.Span().Hi);
            var centre = (p.Offset() + q.Offset()) / 2;

            var t = p.Transform;
            t[axis == 0 ? 0 : 2, 3] = (lo + hi) / 2;
            t[axis == 0 ? 2 : 0, 3] = centre;
            p.Transform = t;
            p.Length = hi - lo;
            p.Depth = gap;
            p.Attributes["thicknessMm"] = (int)Math.Round(gap * 1000);

            // Doors and windows from either face now sit in the one wall, on its centreline.
            foreach (var w in new[] { p, q })
            foreach (var child in plan.ChildrenOf(w))
            {
                var c = child.Transform;
                c[axis == 0 ? 2 : 0, 3] = centre;
                child.Transform = c;
            }
            plan.Reparent(q, p);
            removed.Add(q);
            ctx.Log.Add(Name, ChangeKind.PartitionMerged, story,
                $"Walls {p.Short()} and {q.Short()} were two faces of one partition; merged into one wall {gap * 1000:0} mm thick.",
                [p.Id, q.Id], gap * 1000);
        }
        return removed;
    }

    private static void JoinCorners(List<ScanElement> walls, double tolerance)
    {
        foreach (var w in walls)
        {
            var (a, b) = w.Ends();
            var ends = new[] { a, b };
            var k = w.AlongIndex();
            var axis = w.Axis();
            for (var e = 0; e < 2; e++)
            {
                var p = ends[e];
                double? best = null;
                foreach (var other in walls)
                {
                    if (ReferenceEquals(other, w) || other.Axis() == axis) continue;
                    var (oa, ob) = other.Ends();
                    var line = oa[k];
                    double l = Math.Min(oa[1 - k], ob[1 - k]), h = Math.Max(oa[1 - k], ob[1 - k]);
                    if (Math.Abs(p[k] - line) < tolerance && l - tolerance < p[1 - k] && p[1 - k] < h + tolerance &&
                        (best is null || Math.Abs(p[k] - line) < Math.Abs(p[k] - best.Value)))
                        best = line;
                }
                if (best is not null) ends[e] = p.With(k, best.Value);
            }
            w.SetEnds(ends[0], ends[1]);
        }
    }
}
