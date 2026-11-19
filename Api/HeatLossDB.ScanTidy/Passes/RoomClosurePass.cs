using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Passes;

/// <summary>
/// Makes sure every room has a closed boundary. Each storey's walls are drawn onto a grid
/// (<see cref="TidyOptions.ClosureResolution"/>) and flood-filled from every room label. A room leaks if its fill
/// escapes the house or reaches a label from a different RoomPlan room (several labels in one scanned room, like
/// a kitchen-diner, may share a space). Leaks are sealed by extending a wall end along its own direction, up to
/// <see cref="TidyOptions.ClosureMaxExtension"/>, to the next wall: shortest first, keeping any extension that
/// seals at least one leak. Runs last, as the check on everything before it.
/// </summary>
internal sealed class RoomClosurePass : IScanPass
{
    public string Name => "room-closure";

    public void Apply(ScanPlan plan, TidyContext ctx)
    {
        var o = ctx.Options;
        var group = RoomGroups(plan);
        foreach (var st in plan.Stories.ToList())
        {
            var leaks = Leaks(plan, st, group, o, null);
            foreach (var (section, why) in leaks)
                ctx.Log.Add(Name, ChangeKind.RoomLeak, st, $"{Describe(plan, section)} is {why}.");

            foreach (var c in Candidates(plan, st, o.ClosureMaxExtension))
            {
                if (leaks.Count == 0) break;
                var after = Leaks(plan, st, group, o, (c.From, c.To));
                if (after.Count >= leaks.Count) continue;
                var sealedRooms = leaks.Keys.Where(k => !after.ContainsKey(k)).Select(k => plan.Sections[k].Label);
                Extend(c.Wall, c.End, c.To);
                ctx.Log.Add(Name, ChangeKind.WallExtendedToClose, st,
                    $"Extended wall {c.Wall.Short()} by {c.Distance:F2} m to close {string.Join(", ", sealedRooms.Distinct())}.",
                    [c.Wall.Id], c.Distance * 1000, needsReview: c.Distance > o.CornerTolerance);
                leaks = after;
            }

            foreach (var (section, why) in leaks)
                ctx.Log.Add(Name, ChangeKind.RoomStillOpen, st, $"{Describe(plan, section)} is still {why}.", needsReview: true);
        }
    }

    internal static string Describe(ScanPlan plan, int section)
    {
        var s = plan.Sections[section];
        return $"The {s.Label} at ({s.Plan.X:F1}, {s.Plan.Z:F1})";
    }

    /// <summary>
    /// Section index → room group. Sections from one RoomPlan room share a group. The rooms' own copies are in
    /// each room's local frame, so they're matched to the structure's sections by label and by the distances
    /// between them, which a rigid move doesn't change.
    /// </summary>
    internal static int[] RoomGroups(ScanPlan plan)
    {
        var flat = plan.Sections;
        var group = Enumerable.Range(0, flat.Count).ToArray();
        foreach (var room in plan.Rooms?.OfType<JsonObject>() ?? [])
        {
            var sections = (room["sections"] as JsonArray)?.OfType<JsonObject>().Select(n => new ScanSection(n)).ToList() ?? [];
            if (sections.Count < 2) continue;
            var candidates = sections
                .Select(s => Enumerable.Range(0, flat.Count).Where(j => flat[j].Label == s.Label && flat[j].Story == s.Story).ToArray())
                .ToArray();

            (double Error, int[] Combo)? best = null;
            foreach (var combo in Product(candidates, 10_000))
            {
                if (combo.Distinct().Count() < combo.Length) continue;
                double err = 0;
                for (var a = 0; a < combo.Length; a++)
                for (var b = a + 1; b < combo.Length; b++)
                    err += Math.Abs((sections[a].Plan - sections[b].Plan).Length - (flat[combo[a]].Plan - flat[combo[b]].Plan).Length);
                if (best is null || err < best.Value.Error) best = (err, combo);
            }
            if (best is { Error: < 0.1 } match)
                foreach (var j in match.Combo) group[j] = match.Combo[0];
        }
        return group;
    }

    private static IEnumerable<int[]> Product(int[][] lists, int limit)
    {
        var count = 0;
        var index = new int[lists.Length];
        if (lists.Any(l => l.Length == 0)) yield break;
        while (count++ < limit)
        {
            yield return lists.Select((l, i) => l[index[i]]).ToArray();
            var pos = lists.Length - 1;
            while (pos >= 0 && ++index[pos] == lists[pos].Length) index[pos--] = 0;
            if (pos < 0) yield break;
        }
    }

    /// <summary>Leaking sections on a storey, in section order, with what each leaks into.</summary>
    internal static Dictionary<int, string> Leaks(ScanPlan plan, int st, int[] group, TidyOptions o, (Vec2 A, Vec2 B)? extra)
    {
        var walls = plan.WallsOn(st);
        var segments = walls.Select(w => w.Ends()).ToList();
        var result = new Dictionary<int, string>();
        if (segments.Count == 0) return result;

        double x0 = segments.Min(s => Math.Min(s.A.X, s.B.X)) - o.ClosurePadding, x1 = segments.Max(s => Math.Max(s.A.X, s.B.X)) + o.ClosurePadding;
        double z0 = segments.Min(s => Math.Min(s.A.Z, s.B.Z)) - o.ClosurePadding, z1 = segments.Max(s => Math.Max(s.A.Z, s.B.Z)) + o.ClosurePadding;
        if (extra is { } e) segments.Add(e);

        var res = o.ClosureResolution;
        int cols = (int)((x1 - x0) / res) + 1, rows = (int)((z1 - z0) / res) + 1;
        var blocked = new bool[rows, cols];
        foreach (var (a, b) in segments)
        {
            var n = (int)((b - a).Length / (res / 2)) + 2;
            for (var i = 0; i < n; i++)
            {
                var p = a + (b - a) * (n == 1 ? 0 : i / (double)(n - 1));
                int r = (int)((p.Z - z0) / res), c = (int)((p.X - x0) / res);
                for (var rr = Math.Max(r - 1, 0); rr <= Math.Min(r + 1, rows - 1); rr++)
                for (var cc = Math.Max(c - 1, 0); cc <= Math.Min(c + 1, cols - 1); cc++)
                    blocked[rr, cc] = true;
            }
        }

        var label = FloodLabels(blocked, rows, cols);
        var outside = new HashSet<int>();
        for (var c = 0; c < cols; c++) { outside.Add(label[0, c]); outside.Add(label[rows - 1, c]); }
        for (var r = 0; r < rows; r++) { outside.Add(label[r, 0]); outside.Add(label[r, cols - 1]); }

        var onStorey = Enumerable.Range(0, plan.Sections.Count).Where(j => plan.Sections[j].Story == st).ToList();
        var component = onStorey.ToDictionary(j => j, j =>
        {
            var p = plan.Sections[j].Plan;
            int r = (int)((p.Z - z0) / res), c = (int)((p.X - x0) / res);
            return r >= 0 && r < rows && c >= 0 && c < cols ? label[r, c] : 0;
        });

        foreach (var j in onStorey)
        {
            var comp = component[j];
            if (comp == 0) continue;
            var why = new List<string>();
            if (outside.Contains(comp)) why.Add("open to the outside");
            var others = onStorey.Where(k => k != j && component[k] == comp && group[k] != group[j]).Select(k => plan.Sections[k].Label).ToList();
            if (others.Count > 0) why.Add("open into the " + string.Join(", ", others));
            if (why.Count > 0) result[j] = string.Join(" and ", why);
        }
        return result;
    }

    /// <summary>4-connected labelling of the free cells; 0 marks wall cells.</summary>
    private static int[,] FloodLabels(bool[,] blocked, int rows, int cols)
    {
        var label = new int[rows, cols];
        var next = 0;
        var queue = new Queue<(int R, int C)>();
        for (var r0 = 0; r0 < rows; r0++)
        for (var c0 = 0; c0 < cols; c0++)
        {
            if (blocked[r0, c0] || label[r0, c0] != 0) continue;
            label[r0, c0] = ++next;
            queue.Enqueue((r0, c0));
            while (queue.Count > 0)
            {
                var (r, c) = queue.Dequeue();
                Visit(r - 1, c); Visit(r + 1, c); Visit(r, c - 1); Visit(r, c + 1);
            }
        }
        return label;

        void Visit(int r, int c)
        {
            if (r < 0 || c < 0 || r >= rows || c >= cols || blocked[r, c] || label[r, c] != 0) return;
            label[r, c] = next;
            queue.Enqueue((r, c));
        }
    }

    private sealed record Candidate(double Distance, ScanElement Wall, int End, Vec2 From, Vec2 To);

    /// <summary>Every wall end that, carried on along its own wall, meets another wall within <paramref name="maxExtension"/>; shortest first.</summary>
    private static List<Candidate> Candidates(ScanPlan plan, int st, double maxExtension)
    {
        var walls = plan.WallsOn(st);
        var found = new List<Candidate>();
        foreach (var w in walls)
        {
            var (a, b) = w.Ends();
            var len = (b - a).Length;
            if (len < 1e-9) continue;
            var u = (b - a) * (1 / len);
            foreach (var (p, dir, end) in new[] { (b, u, 1), (a, -u, 0) })
            {
                (double T, Vec2 Hit)? best = null;
                foreach (var v in walls)
                {
                    if (ReferenceEquals(v, w)) continue;
                    var (c, e) = v.Ends();
                    var r = e - c;
                    var den = Vec2.Cross(dir, r);
                    if (Math.Abs(den) < 1e-6) continue;
                    var q = c - p;
                    var t = Vec2.Cross(q, r) / den;
                    var s = Vec2.Cross(q, dir) / den;
                    if (t > 0.03 && t <= maxExtension && s >= -0.01 && s <= 1.01 && (best is null || t < best.Value.T))
                        best = (t, p + dir * t);
                }
                if (best is { } hit) found.Add(new Candidate(hit.T, w, end, p, hit.Hit));
            }
        }
        return found.OrderBy(c => c.Distance).ToList();
    }

    private static void Extend(ScanElement wall, int end, Vec2 to)
    {
        var (a, b) = wall.Ends();
        if (end == 1) b = to; else a = to;
        wall.SetEnds(a, b);
        wall.Attributes["extendedToClose"] = true;
    }
}
