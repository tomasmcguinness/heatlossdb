using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Makes each storey's perimeter continuous. Perimeter walls on one line are straightened onto it, and a
/// gap along a face is filled with an inferred wall, but only when neither end of the gap meets another wall:
/// a gap whose end turns a corner is a step in the house (a bay, a recessed porch), not a hole.
/// </summary>
internal sealed class PerimeterPass : IScanPass
{
    public string Name => "perimeter";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        foreach (var st in plan.Stories.ToList())
        {
            foreach (var face in WallGeometry.Faces(plan.WallsOn(st), o.LineTolerance))
            {
                var line = WallGeometry.WeightedOffset(face.Walls);
                foreach (var w in face.Walls) plan.Shift(w, line - w.Offset());
            }

            foreach (var face in WallGeometry.Faces(plan.WallsOn(st), o.FaceTolerance))
            {
                var walls = face.Walls.OrderBy(w => w.Span().Lo).ToList();
                var k = face.Axis == 0 ? 0 : 1;
                for (var i = 0; i + 1 < walls.Count; i++)
                {
                    ScanElement a = walls[i], b = walls[i + 1];
                    double g0 = a.Span().Hi, g1 = b.Span().Lo;
                    if (g1 - g0 < o.HoleMinGap) continue;

                    var storey = plan.WallsOn(st);
                    var pa = new Vec2(0, 0).With(k, g0).With(1 - k, a.Offset());
                    var pb = new Vec2(0, 0).With(k, g1).With(1 - k, b.Offset());
                    if (WallGeometry.Connected(pa, a, storey, o.ConnectTolerance) ||
                        WallGeometry.Connected(pb, b, storey, o.ConnectTolerance))
                        continue;

                    // A real hole: put the runs either side on one line, then bridge the gap.
                    var aLine = a.Offset();
                    var bLine = b.Offset();
                    var both = walls.Where(w => Math.Abs(w.Offset() - aLine) < o.LineTolerance)
                        .Concat(walls.Where(w => Math.Abs(w.Offset() - bLine) < o.LineTolerance))
                        .ToList();
                    var line = WallGeometry.WeightedOffset(both);
                    foreach (var w in both) plan.Shift(w, line - w.Offset());

                    var fill = InferredWall(a, b, g0, g1, line, k);
                    plan.Walls.Add(fill);
                    ctx.Log.Add(Name, ChangeKind.PerimeterHoleFilled, st,
                        $"Filled a {g1 - g0:F2} m hole in the outside wall between {a.Short()} and {b.Short()}.",
                        [a.Id, b.Id, fill.Id], (g1 - g0) * 1000, needsReview: true);
                }
            }
        }
    }

    private static ScanElement InferredWall(ScanElement a, ScanElement b, double g0, double g1, double line, int k)
    {
        var node = (JsonObject)a.Node.DeepClone();
        node["identifier"] = Guid.NewGuid().ToString().ToUpperInvariant();
        node["attributes"] = new JsonObject { ["inferred"] = "perimeter-gap" };
        node["confidence"] = new JsonObject { ["low"] = new JsonObject() };
        var wall = new ScanElement(node, "walls")
        {
            Length = g1 - g0,
            Height = Math.Min(a.Height, b.Height),
        };
        var t = wall.Transform;
        t[k == 0 ? 0 : 2, 3] = (g0 + g1) / 2; // along the face
        t[k == 0 ? 2 : 0, 3] = line;          // across it
        wall.Transform = t;
        return wall;
    }
}
