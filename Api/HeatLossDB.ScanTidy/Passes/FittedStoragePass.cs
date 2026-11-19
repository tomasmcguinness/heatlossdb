using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Folds fitted wardrobes and similar voids back into their room. RoomPlan often takes a wardrobe front for a
/// wall, leaving a shallow gap between it and the room's real wall. Pattern: an internal wall with no door or
/// opening in it, a parallel wall between <see cref="TidyOptions.FittedDepthMin"/> and
/// <see cref="TidyOptions.FittedDepthMax"/> behind it that covers its whole length, and no room label in between.
/// The false wall and the end panels across the gap go; walls that stopped at it are extended to the real wall;
/// the space is kept as a fitted storage object. Zero-length walls left over from earlier steps are removed first.
/// </summary>
internal sealed class FittedStoragePass : IScanPass
{
    public string Name => "fitted-storage";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        var eps = o.FittedEpsilon;
        var holders = plan.Doors.Concat(plan.Openings).Select(c => c.ParentId).OfType<string>().ToHashSet();

        foreach (var st in plan.Stories.ToList())
        {
            foreach (var w in plan.WallsOn(st).Where(w => w.Length < 0.05))
            {
                plan.Walls.Remove(w);
                ctx.Log.Add(Name, ChangeKind.ZeroLengthWallRemoved, st, $"Removed wall {w.Short()}, which had shrunk to nothing.", [w.Id]);
            }

            var labels = plan.Sections.Where(s => s.Story == st).Select(s => s.Plan).ToList();
            while (TryAbsorbOne(plan, ctx, st, labels, holders, eps)) { }
        }
    }

    private bool TryAbsorbOne(ScanPlan plan, TidyContext ctx, int st, List<Vec2> labels, HashSet<string> holders, double eps)
    {
        var o = ctx.Options;
        foreach (var front in plan.WallsOn(st).Where(w => w.IsStraight()).ToList())
        {
            if (holders.Contains(front.Id) || front.Outward(plan.WallsOn(st)) != 0) continue;
            var (wl, wh) = front.Span();
            var k = front.AlongIndex();

            foreach (var back in plan.WallsOn(st))
            {
                if (ReferenceEquals(back, front) || !back.IsStraight() || back.Axis() != front.Axis()) continue;
                var depth = back.Offset() - front.Offset();
                var (pl, ph) = back.Span();
                if (!(Math.Abs(depth) > o.FittedDepthMin && Math.Abs(depth) < o.FittedDepthMax && pl - eps <= wl && wh <= ph + eps)) continue;

                double lo = Math.Min(front.Offset(), back.Offset()), hi = Math.Max(front.Offset(), back.Offset());
                if (labels.Any(p => wl < p[k] && p[k] < wh && lo < p[1 - k] && p[1 - k] < hi)) continue;

                var panels = new List<ScanElement>();
                var extend = new List<ScanElement>();
                foreach (var e in plan.WallsOn(st))
                {
                    if (ReferenceEquals(e, front) || !e.IsStraight() || e.Axis() == front.Axis()) continue;
                    var (el, eh) = e.Span();
                    var pos = e.Offset();
                    if (!(wl - eps <= pos && pos <= wh + eps)) continue;
                    var touchesFront = el - eps <= front.Offset() && front.Offset() <= eh + eps;
                    var touchesBack = el - eps <= back.Offset() && back.Offset() <= eh + eps;
                    if (touchesFront && touchesBack && eh - el < Math.Abs(depth) + eps) panels.Add(e);
                    else if (touchesFront && (Math.Abs(el - front.Offset()) < eps || Math.Abs(eh - front.Offset()) < eps)) extend.Add(e);
                }

                foreach (var e in extend)
                {
                    var (a, b) = e.Ends();
                    if (Math.Abs(a[1 - k] - front.Offset()) < eps) a = a.With(1 - k, back.Offset());
                    if (Math.Abs(b[1 - k] - front.Offset()) < eps) b = b.With(1 - k, back.Offset());
                    e.SetEnds(a, b);
                }

                plan.Objects.Add(StorageObject(plan, front, back, wh - wl, Math.Abs(depth), st));
                plan.Walls.Remove(front);
                foreach (var p in panels) plan.Walls.Remove(p);
                ctx.Log.Add(Name, ChangeKind.FittedStorageAbsorbed, st,
                    $"A {Math.Abs(depth) * 1000:0} mm × {wh - wl:F2} m gap behind wall {front.Short()} looks like fitted storage; it's now part of the room.",
                    [front.Id, .. panels.Select(p => p.Id), .. extend.Select(e => e.Id)], Math.Abs(depth) * 1000, needsReview: true);
                return true;
            }
        }
        return false;
    }

    private static ScanElement StorageObject(ScanPlan plan, ScanElement front, ScanElement back, double width, double depth, int story)
    {
        var template = plan.Objects.FirstOrDefault(x => x.Node["category"] is JsonObject c && c.ContainsKey("storage"));
        var node = template is not null
            ? (JsonObject)template.Node.DeepClone()
            : new JsonObject { ["category"] = new JsonObject { ["storage"] = new JsonObject() }, ["parentIdentifier"] = null };
        node["identifier"] = Guid.NewGuid().ToString().ToUpperInvariant();
        node["story"] = story;
        node["attributes"] = new JsonObject { ["StorageType"] = "fitted", ["source"] = "tidy-void" };
        node["confidence"] = new JsonObject { ["medium"] = new JsonObject() };
        node["dimensions"] = new JsonArray(JsonValue.Create(width), JsonValue.Create(front.Height), JsonValue.Create(depth));

        var t = front.Transform.Clone();
        var middle = (front.Offset() + back.Offset()) / 2;
        t[front.Axis() == 0 ? 2 : 0, 3] = middle;
        node["transform"] = new JsonArray(t.ToColumnMajor().Select(v => (JsonNode?)JsonValue.Create(v)).ToArray());
        return new ScanElement(node, "objects");
    }
}
