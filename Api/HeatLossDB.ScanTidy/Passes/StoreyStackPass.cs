namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Lines each storey up with the one below, then stacks its outside walls on the outside walls below.
/// The storey is first shifted to whichever offset puts the most perimeter length within
/// <see cref="TidyOptions.StoreyAlignMatch"/> of a face below. Each perimeter face within
/// <see cref="TidyOptions.PerimeterStackTolerance"/> of the face below is then moved onto it and pinned, so the
/// interior pass can't pull it off again. The lower storey's perimeter is pinned too.
/// </summary>
internal sealed class StoreyStackPass : IScanPass
{
    public string Name => "storeys";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        var stories = plan.Stories.ToList();
        for (var i = 0; i + 1 < stories.Count; i++)
        {
            int lo = stories[i], hi = stories[i + 1];
            var below = WallGeometry.Faces(plan.WallsOn(lo), o.LineTolerance);
            var above = WallGeometry.Faces(plan.WallsOn(hi), o.LineTolerance);

            var shift = new double[2];
            foreach (var axis in new[] { 0, 1 })
                shift[1 - axis] = BestShift(axis, above, below, o);
            plan.ApplyToStorey(hi, Mat4.Translate(shift[0], shift[1]));
            ctx.Log.Add(Name, ChangeKind.StoreyAligned, hi,
                $"Storey {hi} moved {shift[0] * 1000:+0;-0;0} mm across and {shift[1] * 1000:+0;-0;0} mm front to back to line up with storey {lo}.",
                millimetres: Math.Sqrt(shift[0] * shift[0] + shift[1] * shift[1]) * 1000);

            foreach (var face in WallGeometry.Faces(plan.WallsOn(hi), o.LineTolerance))
                Stack(plan, ctx, face, below, hi);

            foreach (var w in below.SelectMany(f => f.Walls)) ctx.Pinned.Add(w);
        }
    }

    private void Stack(ScanPlan plan, TidyContext ctx, Face face, List<Face> below, int story)
    {
        var o = ctx.Options;
        double fl = face.Lo, fh = face.Hi;
        double? best = null;
        foreach (var g in below)
        {
            if (g.Axis != face.Axis || g.Side != face.Side) continue;
            if (Math.Min(fh, g.Hi) - Math.Max(fl, g.Lo) <= 0) continue;
            var dv = g.Offset - face.Offset;
            if (best is null || Math.Abs(dv) < Math.Abs(best.Value)) best = dv;
        }

        var ids = face.Walls.Select(w => w.Id).ToList();
        var names = string.Join(", ", face.Walls.Select(w => w.Short()));
        if (best is null || Math.Abs(best.Value) > o.NothingBelowDistance)
        {
            ctx.Log.Add(Name, ChangeKind.NothingBelow, story, $"Outside wall {names} has nothing below it (a setback or overhang?).", ids);
            return;
        }

        var mm = best.Value * 1000;
        if (Math.Abs(best.Value) <= o.PerimeterStackTolerance)
        {
            foreach (var w in face.Walls)
            {
                plan.Shift(w, best.Value);
                ctx.Pinned.Add(w);
            }
            if (Math.Abs(mm) >= 1)
                ctx.Log.Add(Name, ChangeKind.PerimeterStacked, story, $"Outside wall {names} moved {mm:+0;-0} mm onto the wall below.",
                    ids, mm, needsReview: Math.Abs(best.Value) > o.ReviewThreshold);
        }
        else
        {
            ctx.Log.Add(Name, ChangeKind.PerimeterOverTolerance, story,
                $"Outside wall {names} is {mm:+0;-0} mm off the wall below, beyond the {o.PerimeterStackTolerance * 1000:0} mm limit, so it was left where it is.",
                ids, mm, needsReview: true);
        }
    }

    /// <summary>The smallest shift, across faces on <paramref name="axis"/>, that lines up the most perimeter length.</summary>
    private static double BestShift(int axis, List<Face> above, List<Face> below, TidyOptions o)
    {
        var steps = (int)Math.Ceiling(Math.Round(2 * o.StoreyAlignSearch / o.StoreyAlignStep, 9));
        var scores = new double[steps];
        var candidates = new double[steps];
        for (var i = 0; i < steps; i++)
        {
            var s = -o.StoreyAlignSearch + i * o.StoreyAlignStep;
            candidates[i] = s;
            scores[i] = above
                .Where(f => f.Axis == axis && below.Any(g => g.Axis == axis && g.Side == f.Side && Math.Abs(g.Offset - (f.Offset + s)) < o.StoreyAlignMatch))
                .Sum(f => f.TotalLength);
        }
        var top = scores.Max();
        double best = 0;
        var found = false;
        for (var i = 0; i < steps; i++)
        {
            if (scores[i] < top) continue;
            if (!found || Math.Abs(candidates[i]) < Math.Abs(best)) { best = candidates[i]; found = true; }
        }
        return best;
    }
}
