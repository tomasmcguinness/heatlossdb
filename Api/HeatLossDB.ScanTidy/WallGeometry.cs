namespace HeatLossDB.ScanTidy;

/// <summary>A run of collinear perimeter walls facing the same way.</summary>
internal sealed class Face
{
    /// <summary>0 = runs along X (offset is Z), 1 = runs along Z (offset is X).</summary>
    public required int Axis { get; init; }

    /// <summary>Which side is outside: +1 or −1 along the offset direction.</summary>
    public required int Side { get; init; }

    /// <summary>The offset of the first wall when the face was built.</summary>
    public required double Offset { get; init; }

    public List<ScanElement> Walls { get; } = [];

    public double Lo => Walls.Min(w => w.Span().Lo);

    public double Hi => Walls.Max(w => w.Span().Hi);

    public double TotalLength => Walls.Sum(w => w.Length);
}

/// <summary>Plan-view geometry of walls, shared by the passes.</summary>
internal static class WallGeometry
{
    public const double Deg = Math.PI / 180;

    /// <summary>Floor modulo (always non-negative for positive m), matching Python's %.</summary>
    public static double FMod(double a, double m) => a - m * Math.Floor(a / m);

    public static int IMod(int a, int m) => ((a % m) + m) % m;

    public static double AngleRad(this ScanElement w)
    {
        var t = w.Transform;
        return Math.Atan2(t[2, 0], t[0, 0]);
    }

    public static double AngleDeg(this ScanElement w) => w.AngleRad() / Deg;

    /// <summary>0 if the wall runs along X, 1 if along Z (to the nearest right angle).</summary>
    public static int Axis(this ScanElement w) => IMod((int)Math.Round(w.AngleDeg() / 90), 2);

    /// <summary>Within half a degree of square.</summary>
    public static bool IsStraight(this ScanElement w)
    {
        var a = w.AngleDeg();
        return Math.Abs(a - Math.Round(a / 90) * 90) < 0.5;
    }

    /// <summary>Position across the wall: Z for walls along X, X for walls along Z.</summary>
    public static double Offset(this ScanElement w)
    {
        var t = w.Transform;
        return w.Axis() == 0 ? t[2, 3] : t[0, 3];
    }

    /// <summary>Index of the along-the-wall coordinate in a <see cref="Vec2"/>.</summary>
    public static int AlongIndex(this ScanElement w) => w.Axis() == 0 ? 0 : 1;

    public static (Vec2 A, Vec2 B) Ends(this ScanElement w)
    {
        var t = w.Transform;
        var half = w.Length / 2;
        var c = new Vec2(t[0, 3], t[2, 3]);
        var x = new Vec2(t[0, 0], t[2, 0]);
        return (c - x * half, c + x * half);
    }

    /// <summary>Extent along the wall.</summary>
    public static (double Lo, double Hi) Span(this ScanElement w)
    {
        var (a, b) = w.Ends();
        var k = w.AlongIndex();
        return a[k] <= b[k] ? (a[k], b[k]) : (b[k], a[k]);
    }

    /// <summary>Moves the endpoints of a wall, keeping its direction column; children are not moved.</summary>
    public static void SetEnds(this ScanElement w, Vec2 a, Vec2 b)
    {
        var t = w.Transform;
        var c = (a + b) * 0.5;
        t[0, 3] = c.X;
        t[2, 3] = c.Z;
        w.Transform = t;
        w.Length = (b - a).Length;
    }

    /// <summary>Moves a wall (and its doors and windows) across its own line.</summary>
    public static void Shift(this ScanPlan plan, ScanElement w, double dv)
    {
        if (dv == 0) return;
        plan.Apply(w, w.Axis() == 0 ? Mat4.Translate(0, dv) : Mat4.Translate(dv, 0));
    }

    /// <summary>+1 or −1 if nothing parallel lies beyond the wall on exactly one side (it's on the perimeter), otherwise 0.</summary>
    public static int Outward(this ScanElement w, IReadOnlyList<ScanElement> walls)
    {
        var (lo, hi) = w.Span();
        var mid = (lo + hi) / 2;
        var o = w.Offset();
        var ax = w.Axis();
        var free = new List<int>(2);
        foreach (var side in new[] { 1, -1 })
        {
            var blocked = walls.Any(v =>
            {
                if (ReferenceEquals(v, w) || !v.IsStraight() || v.Axis() != ax) return false;
                var (vl, vh) = v.Span();
                return vl < mid && mid < vh && side * (v.Offset() - o) > 0.02;
            });
            if (!blocked) free.Add(side);
        }
        return free.Count == 1 ? free[0] : 0;
    }

    /// <summary>Groups perimeter walls into faces: same axis, same outward side, offsets within <paramref name="tolerance"/> of the face's first wall.</summary>
    public static List<Face> Faces(IReadOnlyList<ScanElement> walls, double tolerance)
    {
        var perimeter = walls.Where(w => w.IsStraight())
            .Select(w => (Wall: w, Side: w.Outward(walls), Axis: w.Axis(), Offset: w.Offset()))
            .Where(p => p.Side != 0)
            .OrderBy(p => p.Axis).ThenBy(p => p.Side).ThenBy(p => p.Offset)
            .ToList();
        var faces = new List<Face>();
        foreach (var p in perimeter)
        {
            var last = faces.Count > 0 ? faces[^1] : null;
            if (last is not null && last.Axis == p.Axis && last.Side == p.Side && Math.Abs(p.Offset - last.Offset) < tolerance)
                last.Walls.Add(p.Wall);
            else
            {
                var f = new Face { Axis = p.Axis, Side = p.Side, Offset = p.Offset };
                f.Walls.Add(p.Wall);
                faces.Add(f);
            }
        }
        return faces;
    }

    /// <summary>True if <paramref name="p"/> is within <paramref name="tolerance"/> of any wall other than <paramref name="own"/>.</summary>
    public static bool Connected(Vec2 p, ScanElement own, IEnumerable<ScanElement> walls, double tolerance)
    {
        foreach (var v in walls)
        {
            if (ReferenceEquals(v, own)) continue;
            var (a, b) = v.Ends();
            var ab = b - a;
            var t = Math.Clamp(Vec2.Dot(p - a, ab) / Math.Max(Vec2.Dot(ab, ab), 1e-9), 0, 1);
            if ((a + ab * t - p).Length < tolerance) return true;
        }
        return false;
    }

    /// <summary>Length-weighted mean offset.</summary>
    public static double WeightedOffset(IEnumerable<ScanElement> walls)
    {
        double sum = 0, weight = 0;
        foreach (var w in walls)
        {
            sum += w.Offset() * w.Length;
            weight += w.Length;
        }
        return weight > 0 ? sum / weight : 0;
    }

    /// <summary>
    /// The storey's main wall direction, in radians: a 0.1° histogram of wall angles (mod 90°) weighted by length,
    /// refined by the weighted mean of walls within 1.5° of the peak.
    /// </summary>
    public static double DominantAngle(IReadOnlyList<ScanElement> walls)
    {
        var a = walls.Select(w => FMod(w.AngleDeg(), 90)).ToArray();
        var len = walls.Select(w => w.Length).ToArray();
        static double Dev(double angle, double t) => FMod(angle - t + 45, 90) - 45;

        double best = 0, bestScore = double.NegativeInfinity;
        for (var i = 0; i < 900; i++)
        {
            var t = i * 0.1;
            double score = 0;
            for (var j = 0; j < a.Length; j++)
                if (Math.Abs(Dev(a[j], t)) < 1) score += len[j];
            if (score > bestScore) { bestScore = score; best = t; }
        }

        double sum = 0, weight = 0;
        for (var j = 0; j < a.Length; j++)
        {
            var d = Dev(a[j], best);
            if (Math.Abs(d) >= 1.5) continue;
            sum += d * len[j];
            weight += len[j];
        }
        return (best + (weight > 0 ? sum / weight : 0)) * Deg;
    }

    public static string Short(this ScanElement w) => w.Id[..Math.Min(8, w.Id.Length)];
}
