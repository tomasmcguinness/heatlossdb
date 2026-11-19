using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Brings the scanned rooms (<c>rooms[]</c>) and the floors into line with the tidied walls. Readers such as the
/// website draw room shapes from each room's own floor, cut to that room's own copies of its walls, so after the
/// walls have been moved those have to follow:
/// <list type="bullet">
/// <item>each room's copy of a wall, door, window or opening the tidier kept becomes the tidied one;</item>
/// <item>each corner of a room's floor (and of the storey's floors) within <see cref="TidyOptions.PerimeterStackTolerance"/>
/// of a straight tidied wall is moved onto it, so a floor ends at its walls: not past an outside wall that was
/// moved in, and not short of one that was moved out.</item>
/// </list>
/// Runs last, once every wall is where it ends up.
/// </summary>
internal sealed class RoomFloorPass : IScanPass
{
    public string Name => "rooms";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var tidied = plan.Walls.Concat(plan.Doors).Concat(plan.Windows).Concat(plan.Openings)
            .GroupBy(e => e.Id).ToDictionary(g => g.Key, g => g.First());
        foreach (var copy in plan.ScannedRooms.SelectMany(r => r.Surfaces).Where(s => s.Kind is not ("floors" or "objects")))
        {
            if (!tidied.TryGetValue(copy.Id, out var element)) continue;
            copy.Node["transform"] = element.Node["transform"]?.DeepClone();
            copy.Node["dimensions"] = element.Node["dimensions"]?.DeepClone();
        }

        var tolerance = ctx.Options.PerimeterStackTolerance;
        foreach (var st in plan.Stories.ToList())
        {
            var walls = plan.WallsOn(st).Where(w => w.IsStraight()).ToList();
            var floors = plan.ScannedRooms.Where(r => r.Story == st).SelectMany(r => r.Surfaces).Where(s => s.Kind == "floors")
                .Concat(plan.Floors.Where(f => f.Story == st));
            int moved = 0;
            double furthest = 0;
            foreach (var floor in floors)
            {
                var (count, distance) = SnapCorners(floor, walls, tolerance, ctx.Options.ConnectTolerance);
                moved += count;
                furthest = Math.Max(furthest, distance);
            }
            if (moved > 0)
                ctx.Log.Add(Name, ChangeKind.FloorsLinedUp, st,
                    $"Storey {st}: {moved} floor corners lined up with the tidied walls (up to {furthest * 1000:0} mm).",
                    millimetres: furthest * 1000);
        }
    }

    /// <summary>Moves each corner of the floor onto the nearest straight wall within <paramref name="tolerance"/>, across
    /// each axis separately. Returns how many corners moved and the furthest move.</summary>
    private static (int Count, double Furthest) SnapCorners(ScanElement floor, IReadOnlyList<ScanElement> walls, double tolerance, double reach)
    {
        if (floor.Node["polygonCorners"] is not JsonArray corners || corners.Count == 0) return (0, 0);
        var toWorld = floor.Transform;
        var toLocal = toWorld.InverseRigid();
        int count = 0;
        double furthest = 0;
        for (var i = 0; i < corners.Count; i++)
        {
            if (corners[i] is not JsonArray { Count: >= 2 } corner) continue;
            double lx = corner[0]!.GetValue<double>(), ly = corner[1]!.GetValue<double>(), lz = corner.Count > 2 ? corner[2]!.GetValue<double>() : 0;
            var (x, y, z) = toWorld.TransformPoint(lx, ly, lz);
            var p = new Vec2(x, z);
            var snapped = p;
            // A wall along X fixes Z, one along Z fixes X.
            foreach (var axis in new[] { 0, 1 })
            {
                var along = axis == 0 ? 0 : 1;
                var across = 1 - along;
                double? best = null;
                foreach (var w in walls.Where(w => w.Axis() == axis))
                {
                    var (lo, hi) = w.Span();
                    if (p[along] < lo - reach || p[along] > hi + reach) continue;
                    var offset = w.Offset();
                    var d = offset - p[across];
                    if (Math.Abs(d) <= tolerance && (best is null || Math.Abs(d) < Math.Abs(best.Value - p[across]))) best = offset;
                }
                if (best is { } line) snapped = snapped.With(across, line);
            }
            var move = (snapped - p).Length;
            if (move < 1e-6) continue;
            var (nx, ny, nz) = toLocal.TransformPoint(snapped.X, y, snapped.Z);
            corners[i] = corner.Count > 2
                ? new JsonArray(JsonValue.Create(nx), JsonValue.Create(ny), JsonValue.Create(nz))
                : new JsonArray(JsonValue.Create(nx), JsonValue.Create(ny));
            count++;
            furthest = Math.Max(furthest, move);
        }
        return (count, furthest);
    }
}
