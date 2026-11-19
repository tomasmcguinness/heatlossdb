namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Rotates each storey so its main wall direction lies on the X axis, then snaps walls within
/// <see cref="TidyOptions.AngleToleranceDeg"/> of square onto it. Walls further off (bays, splays) are left alone.
/// </summary>
internal sealed class OrientPass : IScanPass
{
    public string Name => "orient";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        foreach (var st in plan.Stories.ToList())
        {
            var walls = plan.WallsOn(st);
            if (walls.Count == 0) continue;
            var theta = WallGeometry.DominantAngle(walls);
            plan.ApplyToStorey(st, Mat4.RotateY(theta));
            ctx.Log.Add(Name, ChangeKind.StoreyRotated, st, $"Storey {st} rotated {theta / WallGeometry.Deg:F2}° onto the grid.");
        }

        foreach (var w in plan.Walls)
        {
            var a = w.AngleDeg();
            var da = a - Math.Round(a / 90) * 90;
            if (Math.Abs(da) <= o.AngleToleranceDeg)
            {
                if (Math.Abs(da) <= 0.01) continue;
                var t = w.Transform;
                double cx = t[0, 3], cz = t[2, 3];
                plan.Apply(w, Mat4.Translate(cx, cz) * Mat4.RotateY(da * WallGeometry.Deg) * Mat4.Translate(-cx, -cz));
                if (Math.Abs(da) > 1)
                    ctx.Log.Add(Name, ChangeKind.AngleSnapped, w.Story, $"Wall {w.Short()} squared up by {da:+0.0;-0.0}°.", [w.Id]);
            }
            else
            {
                ctx.Log.Add(Name, ChangeKind.KeptAngled, w.Story,
                    $"Wall {w.Short()} kept at {WallGeometry.FMod(a, 90):F1}° (bay or splay?).", [w.Id]);
            }
        }
    }
}
