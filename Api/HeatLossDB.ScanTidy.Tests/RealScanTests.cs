using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Tests;

/// <summary>
/// A real two-storey house (merged_3.json from the app). Real scans are floor plans of people's homes, so they live
/// in the website's gitignored fixtures folder and these tests do nothing when it isn't there.
/// </summary>
public class RealScanTests
{
    private static readonly string Fixture =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../Web/fixtures/merged_3.json"));

    private static JsonNode? LoadFixture() => File.Exists(Fixture) ? JsonNode.Parse(File.ReadAllText(Fixture)) : null;

    private static string IdStartingWith(JsonNode scan, string prefix) =>
        scan["walls"]!.AsArray().Select(w => w!["identifier"]!.GetValue<string>()).Single(id => id.StartsWith(prefix));

    [Fact]
    public void EveryRoomHasAClosedBoundary()
    {
        if (LoadFixture() is not { } scan) return;

        var result = ScanTidier.Tidy(scan);

        Assert.True(result.Summary.AllRoomsClosed, string.Join("\n", result.Summary.OpenRooms));
        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.WallExtendedToClose);
    }

    [Fact]
    public void UpstairsOutsideWallsSitOnTheWallsBelow()
    {
        if (LoadFixture() is not { } scan) return;

        var plan = ScanPlan.Load(ScanTidier.Tidy(scan).Tidied);

        var below = WallGeometry.Faces(plan.WallsOn(0), TidyOptions.Default.LineTolerance);
        var checkedFaces = 0;
        foreach (var face in WallGeometry.Faces(plan.WallsOn(1), TidyOptions.Default.LineTolerance))
        {
            var offsets = below
                .Where(g => g.Axis == face.Axis && g.Side == face.Side && Math.Min(face.Hi, g.Hi) - Math.Max(face.Lo, g.Lo) > 0)
                .Select(g => g.Offset - face.Offset)
                .Where(d => Math.Abs(d) <= TidyOptions.Default.PerimeterStackTolerance)
                .ToList();
            if (offsets.Count == 0) continue;
            Assert.True(offsets.Min(Math.Abs) < 0.005, $"Face {string.Join(",", face.Walls)} is {offsets.Min(Math.Abs) * 1000:0.0} mm off the wall below");
            checkedFaces++;
        }
        Assert.True(checkedFaces >= 5);
    }

    [Fact]
    public void TheDoubledPartitionBetweenTheLeftBedroomsIsOneWall()
    {
        if (LoadFixture() is not { } scan) return;
        string a = IdStartingWith(scan, "CC89E27A"), b = IdStartingWith(scan, "BBB76B0F");

        var plan = ScanPlan.Load(ScanTidier.Tidy(scan).Tidied);

        var partition = Assert.Single(plan.Walls, w => w.Id == a || w.Id == b);
        Assert.Equal(203, partition.Attributes["thicknessMm"]!.GetValue<int>());
    }

    [Fact]
    public void TheFrontBedroomsWardrobeGapIsPartOfTheRoom()
    {
        if (LoadFixture() is not { } scan) return;
        var front = IdStartingWith(scan, "EFF865D2");

        var result = ScanTidier.Tidy(scan);

        var plan = ScanPlan.Load(result.Tidied);
        Assert.DoesNotContain(plan.Walls, w => w.Id == front);
        var wardrobe = Assert.Single(plan.Objects, o => o.Attributes["source"]?.GetValue<string>() == "tidy-void");
        Assert.Equal(0.64, wardrobe.Depth, 2);
        Assert.Equal(1, wardrobe.Story);
    }

    [Fact]
    public void StrayBitsOfWallGoButTheBaysStay()
    {
        if (LoadFixture() is not { } scan) return;
        // Angled stubs with a loose end: in the first-floor doorway between two bedrooms, and by the ground floor hall.
        string[] strays = [IdStartingWith(scan, "B29DEE44"), IdStartingWith(scan, "3B4A9F2B")];
        // The bay windows' angled walls, upstairs and down.
        string[] bays = ["35D48834", "33B699A7", "0DE3E5E8", "DD8CA066"];

        var plan = ScanPlan.Load(ScanTidier.Tidy(scan).Tidied);

        Assert.All(strays, id => Assert.DoesNotContain(plan.Walls, w => w.Id == id));
        Assert.All(bays, prefix => Assert.Contains(plan.Walls, w => w.Id.StartsWith(prefix)));
    }

    [Fact]
    public void NoRoomsFloorReachesPastTheOutsideWalls()
    {
        if (LoadFixture() is not { } scan) return;

        var plan = ScanPlan.Load(ScanTidier.Tidy(scan).Tidied);

        // Before, the back bedroom's floor ran 225 mm past its outside wall, which had been stacked onto the wall below.
        foreach (var room in plan.ScannedRooms)
        {
            var ends = plan.WallsOn(room.Story).SelectMany(w => new[] { w.Ends().A, w.Ends().B }).ToList();
            double minX = ends.Min(p => p.X), maxX = ends.Max(p => p.X), minZ = ends.Min(p => p.Z), maxZ = ends.Max(p => p.Z);
            foreach (var floor in room.Surfaces.Where(s => s.Kind == "floors"))
            foreach (var c in floor.Node["polygonCorners"]!.AsArray())
            {
                var (x, _, z) = floor.Transform.TransformPoint(c![0]!.GetValue<double>(), c[1]!.GetValue<double>(), c[2]!.GetValue<double>());
                Assert.True(x > minX - 0.01 && x < maxX + 0.01 && z > minZ - 0.01 && z < maxZ + 0.01,
                    $"A corner of a storey {room.Story} room's floor is at ({x:F2}, {z:F2}), outside the walls ({minX:F2}..{maxX:F2}, {minZ:F2}..{maxZ:F2})");
            }
        }
    }

    [Fact]
    public void TheScannedRoomsStayOnTheTidiedWalls()
    {
        if (LoadFixture() is not { } scan) return;

        var plan = ScanPlan.Load(ScanTidier.Tidy(scan).Tidied);

        // Each room's copy of a wall the tidier kept stays close to it: the storey's turn and shift
        // apply to both, and only the tidier's own nudges (squaring up within 8°, stacking within
        // 30 cm) separate them.
        var walls = plan.Walls.ToDictionary(w => w.Id);
        var compared = 0;
        foreach (var copy in plan.ScannedRooms.SelectMany(r => r.Surfaces).Where(s => s.Kind == "walls" && walls.ContainsKey(s.Id)))
        {
            var wall = walls[copy.Id];
            var turn = Math.Abs(WallGeometry.FMod(copy.AngleDeg() - wall.AngleDeg() + 90, 180) - 90);
            Assert.True(turn <= TidyOptions.Default.AngleToleranceDeg + 0.5, $"The room's copy of {copy} is {turn:F1}° off the wall");
            var centre = (copy.Ends().A + copy.Ends().B) * 0.5;
            var (a, b) = wall.Ends();
            Assert.True(DistanceToLine(centre, a, b) < 0.35, $"The room's copy of {copy} is {DistanceToLine(centre, a, b):F2} m off the wall");
            compared++;
        }
        Assert.True(compared >= 20, $"Only {compared} walls compared");
    }

    private static double DistanceToLine(Vec2 p, Vec2 a, Vec2 b)
    {
        var d = b - a;
        return Math.Abs(Vec2.Cross(d, p - a)) / d.Length;
    }

    [Fact]
    public void TidyingTwiceGivesTheSameGeometry()
    {
        if (LoadFixture() is not { } scan) return;

        static List<string> Geometry(TidyResult r) => ScanPlan.Load(r.Tidied).Walls
            .Select(w => w.Ends()).Select(e => $"{e.A.X:F6},{e.A.Z:F6},{e.B.X:F6},{e.B.Z:F6}")
            .Order().ToList();

        Assert.Equal(Geometry(ScanTidier.Tidy(scan)), Geometry(ScanTidier.Tidy(scan)));
    }

    [Fact]
    public void ChangesSayWhichWallsMovedHowFarAndWhichNeedAPersonToCheck()
    {
        if (LoadFixture() is not { } scan) return;

        var result = ScanTidier.Tidy(scan);

        var stacked = result.Changes.Where(c => c.Kind == ChangeKind.PerimeterStacked).ToList();
        Assert.All(stacked, c => Assert.NotEmpty(c.WallIds));
        Assert.All(stacked, c => Assert.NotNull(c.Millimetres));
        // The large bedroom's back wall came out 225 mm behind the wall below: worth a person's check.
        Assert.Contains(stacked, c => c.Millimetres == 225 && c.NeedsReview);
        Assert.Contains(stacked, c => c.Millimetres == -28 && !c.NeedsReview);
        Assert.Equal(result.Changes.Count(c => c.NeedsReview), result.Summary.NeedsReview);
    }
}
