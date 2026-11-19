namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Removes stray bits of wall: short pieces left at an angle (more than <see cref="TidyOptions.AngleToleranceDeg"/>
/// off square, so the orient pass kept them), with no door, window or opening in them, that don't join anything up.
/// Either an end meets no other wall, or the piece lies along one wall (both ends by it, running within
/// <see cref="MaxAngleAlongWall"/>° of it), as when LiDAR catches a door leaf or furniture in a doorway.
/// The angled walls of a bay are kept: they carry its windows, or leave one wall steeply to meet another.
/// </summary>
internal sealed class StrayWallPass : IScanPass
{
    public string Name => "stray walls";

    /// <summary>A piece within this angle of the wall both its ends are by lies along that wall rather than leading off it.</summary>
    private const double MaxAngleAlongWall = 45;

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        foreach (var st in plan.Stories.ToList())
        {
            var walls = plan.WallsOn(st);
            var strays = walls.Where(w => IsStray(plan, w, walls, o)).ToList();
            foreach (var w in strays)
            {
                plan.Walls.Remove(w);
                ctx.Log.Add(Name, ChangeKind.StrayWallRemoved, st,
                    $"Removed a stray bit of wall {w.Short()} ({w.Length * 1000:0} mm, at {WallGeometry.FMod(w.AngleDeg(), 90):F0}°).",
                    [w.Id], w.Length * 1000);
            }
        }
    }

    private static bool IsStray(ScanPlan plan, ScanElement w, IReadOnlyList<ScanElement> walls, TidyOptions o)
    {
        if (w.Length >= o.StrayWallMaxLength || plan.ChildrenOf(w).Count > 0) return false;
        var a = w.AngleDeg();
        if (Math.Abs(a - Math.Round(a / 90) * 90) <= o.AngleToleranceDeg) return false;
        var (start, end) = w.Ends();
        if (!WallGeometry.Connected(start, w, walls, o.ConnectTolerance) || !WallGeometry.Connected(end, w, walls, o.ConnectTolerance))
            return true;
        // Lying along a wall means both ends by it and at least one beside it, part-way along (the other
        // can be at the wall's corner). A bay's short side runs off the end of the wall next to it instead.
        return walls.Any(v => !ReferenceEquals(v, w)
            && Near(v, start, o.ConnectTolerance) && Near(v, end, o.ConnectTolerance)
            && (Beside(v, start, o.ConnectTolerance) || Beside(v, end, o.ConnectTolerance))
            && AngleBetween(w, v) < MaxAngleAlongWall);
    }

    /// <summary>The point on the wall's line nearest <paramref name="p"/>, as a fraction of the way from one end to the other (0–1 is on the wall).</summary>
    private static (double T, double Distance) Project(ScanElement wall, Vec2 p)
    {
        var (a, b) = wall.Ends();
        var ab = b - a;
        var t = Vec2.Dot(p - a, ab) / Math.Max(Vec2.Dot(ab, ab), 1e-9);
        var clamped = Math.Clamp(t, 0, 1);
        return (t, (a + ab * clamped - p).Length);
    }

    private static bool Near(ScanElement wall, Vec2 p, double tolerance) => Project(wall, p).Distance <= tolerance;

    /// <summary>Within <paramref name="tolerance"/> of the wall and alongside it, rather than at or off one of its ends.</summary>
    private static bool Beside(ScanElement wall, Vec2 p, double tolerance)
    {
        var (t, distance) = Project(wall, p);
        var margin = tolerance / Math.Max(wall.Length, 1e-9);
        return t > margin && t < 1 - margin && distance <= tolerance;
    }

    /// <summary>The angle between two walls' lines, 0–90°.</summary>
    private static double AngleBetween(ScanElement a, ScanElement b) =>
        Math.Abs(WallGeometry.FMod(a.AngleDeg() - b.AngleDeg() + 90, 180) - 90);
}
