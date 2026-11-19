using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Tests;

/// <summary>Each rule on a small made-up scan, so these run anywhere.</summary>
public class ScanTidierTests
{
    private static ScanPlan Tidied(TidyResult result) => ScanPlan.Load(result.Tidied);

    [Fact]
    public void SquaresUpAStoreyScannedAtAnAngle()
    {
        var scan = new TestScan().Box(0, 0, 4, 3).Label("bedroom", 2, 1.5).Build(degrees: 31);

        var result = ScanTidier.Tidy(scan);

        var walls = Tidied(result).Walls;
        Assert.All(walls, w => Assert.True(w.IsStraight(), $"{w} is at {w.AngleDeg():F2}°"));
        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.StoreyRotated);
        Assert.Equal(14, walls.Sum(w => w.Length), 6);
    }

    [Fact]
    public void TurnsTheScannedRoomsWithTheirStorey()
    {
        var scan = new TestScan().Box(0, 0, 4, 3).Label("bedroom", 2, 1.5).Build(degrees: 31);
        // RoomPlan keeps each scanned room's own copy of its surfaces, in the same frame.
        var label = scan["sections"]![0]!.DeepClone();
        var origin = new JsonArray(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        scan["rooms"] = new JsonArray(new JsonObject
        {
            ["story"] = 0,
            ["walls"] = new JsonArray(scan["walls"]!.AsArray().Select(w => w!.DeepClone()).ToArray()),
            ["sections"] = new JsonArray(label),
            ["referenceOriginTransform"] = origin,
        });

        var tidied = Tidied(ScanTidier.Tidy(scan));

        var room = Assert.Single(tidied.ScannedRooms);
        Assert.All(room.Surfaces, copy =>
        {
            var wall = Assert.Single(tidied.Walls, w => w.Id == copy.Id);
            Assert.True(copy.IsStraight(), $"The room's copy of {copy} is at {copy.AngleDeg():F2}°");
            var (a, b) = (copy.Ends(), wall.Ends());
            Assert.True((a.A - b.A).Length < 0.05 || (a.A - b.B).Length < 0.05, $"The room's copy of {copy} is away from the wall");
        });
        var section = Assert.Single(room.Sections).Plan;
        Assert.Equal(tidied.Sections[0].Plan.X, section.X, 6);
        Assert.Equal(tidied.Sections[0].Plan.Z, section.Z, 6);
        Assert.NotEqual(0.0, room.Node["referenceOriginTransform"]![2]!.GetValue<double>(), 3);
    }

    [Fact]
    public void RemovesAStrayAngledBitOfWallButNotOneThatJoinsWalls()
    {
        var scan = new TestScan()
            .Box(0, 0, 4, 3)
            // 0.5 m at about 37° from the back wall, its other end loose: scanning noise in a doorway.
            .Wall(1, 3, 1.4, 2.7, id: "STRAY")
            // 0.4 m lying along the front wall at about 20°, both ends by it: a door leaf caught in the scan.
            .Wall(2, 0, 2.38, 0.13, id: "LEAF")
            // As short and as angled, but meeting a wall at each end: a corner splay, kept.
            .Wall(4, 0.3, 3.7, 0, id: "SPLAY")
            .Label("bedroom", 2, 1.5)
            .Build();

        var result = ScanTidier.Tidy(scan);

        var walls = Tidied(result).Walls;
        Assert.DoesNotContain(walls, w => w.Id == "STRAY");
        Assert.DoesNotContain(walls, w => w.Id == "LEAF");
        Assert.Contains(walls, w => w.Id == "SPLAY");
        var removed = result.Changes.Where(c => c.Kind == ChangeKind.StrayWallRemoved).ToList();
        Assert.Equal(["LEAF", "STRAY"], removed.SelectMany(c => c.WallIds).Order());
        Assert.Equal(500, removed.Single(c => c.WallIds[0] == "STRAY").Millimetres!.Value, 0);
    }

    [Fact]
    public void LinesTheScannedRoomsFloorsUpWithTheWalls()
    {
        var scan = new TestScan().Box(0, 0, 4, 3).Label("bedroom", 2, 1.5).Build();
        // The room's floor runs 200 mm past the back wall (z = 3), as when a wall has been moved in.
        // RoomPlan floors lie in their own X–Y plane: local Y runs along world −Z.
        double[] floorTransform = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
        (double X, double Z)[] floorCorners = [(0, 0), (4, 0), (4, 3.2), (0, 3.2)];
        JsonNode Floor() => new JsonObject
        {
            ["identifier"] = "FLOOR",
            ["story"] = 0,
            ["dimensions"] = new JsonArray(4.0, 3.2, 0.0),
            ["transform"] = new JsonArray(floorTransform.Select(v => (JsonNode?)JsonValue.Create(v)).ToArray()),
            ["polygonCorners"] = new JsonArray(floorCorners.Select(c => (JsonNode?)new JsonArray(c.X, -c.Z, 0.0)).ToArray()),
        };
        // The room's copy of the back wall is 100 mm out from the stitched wall.
        var back = scan["walls"]!.AsArray().Single(w => w!["identifier"]!.GetValue<string>() == "W02")!.DeepClone();
        back["transform"]![14] = 3.1;
        scan["rooms"] = new JsonArray(new JsonObject { ["story"] = 0, ["floors"] = new JsonArray(Floor()), ["walls"] = new JsonArray(back) });
        scan["floors"] = new JsonArray(Floor());

        var result = ScanTidier.Tidy(scan);

        var tidied = Tidied(result);
        var room = Assert.Single(tidied.ScannedRooms);
        Assert.Equal(3.0, room.Surfaces.Single(s => s.Kind == "walls").Transform[2, 3], 6);
        foreach (var floor in new[] { room.Surfaces.Single(s => s.Kind == "floors"), tidied.Floors[0] })
        {
            var corners = floor.Node["polygonCorners"]!.AsArray()
                .Select(c => floor.Transform.TransformPoint(c![0]!.GetValue<double>(), c[1]!.GetValue<double>(), c[2]!.GetValue<double>()))
                .ToList();
            Assert.All(corners, c => Assert.True(Math.Abs(c.Z) < 1e-6 || Math.Abs(c.Z - 3) < 1e-6, $"A corner is at z = {c.Z:F3}"));
            Assert.All(corners, c => Assert.Equal(0, c.Y, 6));
        }
        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.FloorsLinedUp && c.Millimetres == 200);
    }

    [Fact]
    public void LeavesABayAtItsOwnAngle()
    {
        // A square room with a splayed bay on the front wall.
        var scan = new TestScan()
            .Wall(0, 0, 4, 0).Wall(4, 0, 4, 4)
            .Wall(4, 4, 3, 4).Wall(3, 4, 2.6, 4.6).Wall(2.6, 4.6, 1.4, 4.6).Wall(1.4, 4.6, 1, 4).Wall(1, 4, 0, 4)
            .Wall(0, 4, 0, 0)
            .Label("livingRoom", 2, 2)
            .Build();

        var result = ScanTidier.Tidy(scan);

        Assert.Equal(2, result.Changes.Count(c => c.Kind == ChangeKind.KeptAngled));
        Assert.Equal(2, Tidied(result).Walls.Count(w => !w.IsStraight()));
        Assert.True(result.Summary.AllRoomsClosed);
    }

    [Fact]
    public void MergesTheTwoFacesOfAPartitionIntoOneWallWithItsThickness()
    {
        // Two rooms scanned from inside: the wall between them arrives twice, 100 mm apart.
        var scan = new TestScan()
            .Wall(0, 0, 6.1, 0).Wall(6.1, 0, 6.1, 4).Wall(6.1, 4, 0, 4).Wall(0, 4, 0, 0)
            .Wall(3, 0, 3, 4, id: "FaceA").Wall(3.1, 0, 3.1, 4, id: "FaceB")
            .Label("bedroom", 1.5, 2).Label("bedroom", 4.5, 2)
            .Build();

        var result = ScanTidier.Tidy(scan);

        var plan = Tidied(result);
        var partition = Assert.Single(plan.Walls, w => w.Id is "FaceA" or "FaceB");
        Assert.Equal(3.05, partition.Offset(), 6);
        Assert.Equal(100, partition.Attributes["thicknessMm"]!.GetValue<int>());
        Assert.Equal(0.1, partition.Depth, 6);
        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.PartitionMerged && c.Millimetres == 100);
    }

    [Fact]
    public void ClosesARoomWhoseWallStopsShort()
    {
        // The back wall stops half a metre before the corner, so the room is open to the outside.
        var scan = new TestScan()
            .Wall(0, 0, 4, 0).Wall(4, 0, 4, 4).Wall(3.5, 4, 0, 4).Wall(0, 4, 0, 0)
            .Label("kitchen", 2, 2)
            .Build();

        var result = ScanTidier.Tidy(scan);

        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.RoomLeak);
        var extended = Assert.Single(result.Changes, c => c.Kind == ChangeKind.WallExtendedToClose);
        Assert.Equal(500, extended.Millimetres);
        Assert.True(extended.NeedsReview);
        Assert.True(result.Summary.AllRoomsClosed);
    }

    [Fact]
    public void FoldsAFittedWardrobeIntoItsRoom()
    {
        // The wardrobe front (x = 3.4) was taken for a wall, 600 mm in front of the room's real wall.
        var scan = new TestScan()
            .Box(0, 0, 4, 3)
            .Wall(3.4, 3, 3.4, 0.5, id: "WardrobeFront").Wall(3.4, 0.5, 4, 0.5, id: "WardrobeEnd")
            .Label("bedroom", 1.5, 1.5)
            .Build();

        var result = ScanTidier.Tidy(scan);

        var plan = Tidied(result);
        Assert.DoesNotContain(plan.Walls, w => w.Id is "WardrobeFront" or "WardrobeEnd");
        var storage = Assert.Single(plan.Objects);
        Assert.Equal("fitted", storage.Attributes["StorageType"]!.GetValue<string>());
        Assert.Equal(0.6, storage.Depth, 6);
        Assert.Equal(2.5, storage.Length, 6);
        Assert.Contains(result.Changes, c => c.Kind == ChangeKind.FittedStorageAbsorbed && c.NeedsReview);
        Assert.True(result.Summary.AllRoomsClosed);
    }

    [Fact]
    public void StacksAnUpperOutsideWallOnTheWallBelowAndFlagsABigMove()
    {
        var scan = new TestScan()
            .Box(0, 0, 5, 4, story: 0).Label("livingRoom", 2.5, 2, story: 0)
            // Upstairs, the back wall came out 120 mm further back than the one below.
            .Wall(0, 0, 5, 0, 1).Wall(5, 0, 5, 4, 1).Wall(5, 4.12, 0, 4.12, 1).Wall(0, 4, 0, 0, 1)
            .Label("bedroom", 2.5, 2, story: 1)
            .Build();

        var result = ScanTidier.Tidy(scan);

        var stacked = Assert.Single(result.Changes, c => c.Kind == ChangeKind.PerimeterStacked && Math.Abs(c.Millimetres ?? 0) > 100);
        Assert.Equal(-120, stacked.Millimetres);
        Assert.True(stacked.NeedsReview);
        var plan = Tidied(result);
        var backUp = plan.WallsOn(1).Single(w => w.Axis() == 0 && w.Offset() > 2);
        var backDown = plan.WallsOn(0).Single(w => w.Axis() == 0 && w.Offset() > 2);
        Assert.Equal(backDown.Offset(), backUp.Offset(), 6);
    }

    [Fact]
    public void FillsAHoleInTheOutsideWallButNotAStep()
    {
        var scan = new TestScan()
            // The right-hand wall is missing 1.5 m in the middle: both ends of the gap are loose.
            .Wall(0, 0, 6, 0).Wall(6, 0, 6, 2).Wall(6, 3.5, 6, 6).Wall(6, 6, 0, 6).Wall(0, 6, 0, 0)
            .Label("kitchen", 3, 3)
            .Build();

        var result = ScanTidier.Tidy(scan);

        var filled = Assert.Single(result.Changes, c => c.Kind == ChangeKind.PerimeterHoleFilled);
        Assert.Equal(1500, filled.Millimetres);
        var inferred = Assert.Single(Tidied(result).Walls, w => w.Attributes["inferred"] is not null);
        Assert.Equal(1.5, inferred.Length, 6);
        Assert.True(result.Summary.AllRoomsClosed);

        // A front that steps back has its ends joined by the side walls of the step, so nothing is filled.
        var stepped = new TestScan()
            .Wall(0, 0, 6, 0).Wall(6, 0, 6, 4).Wall(6, 4, 4, 4).Wall(4, 4, 4, 4.8).Wall(4, 4.8, 2, 4.8).Wall(2, 4.8, 2, 4)
            .Wall(2, 4, 0, 4).Wall(0, 4, 0, 0)
            .Label("livingRoom", 3, 2)
            .Build();
        Assert.DoesNotContain(ScanTidier.Tidy(stepped).Changes, c => c.Kind == ChangeKind.PerimeterHoleFilled);
    }

    [Fact]
    public void LeavesTheInputAloneAndKeepsFieldsItDoesNotUse()
    {
        var scan = new TestScan().Box(0, 0, 4, 3).Label("bedroom", 2, 1.5).Build(degrees: 12);
        scan["heatlossdbVersion"] = 1;
        scan["walls"]![0]!["somethingNew"] = "kept";
        var before = scan.ToJsonString();

        var result = ScanTidier.Tidy(scan);

        Assert.Equal(before, scan.ToJsonString());
        Assert.Equal(1, result.Tidied["heatlossdbVersion"]!.GetValue<int>());
        Assert.Contains(result.Tidied["walls"]!.AsArray(), w => w!["somethingNew"]?.GetValue<string>() == "kept");
        Assert.Equal(ScanTidier.Version, result.Tidied["heatlossdbTidy"]!["version"]!.GetValue<int>());
        Assert.NotNull(result.Tidied["heatlossdbTidy"]!["changes"]);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("""{"doors":[]}""")]
    [InlineData("""{"walls":[{"identifier":"A"}]}""")]
    public void RejectsInputThatIsNotAScan(string json)
    {
        Assert.Throws<ScanFormatException>(() => ScanTidier.Tidy(json));
    }

    [Fact]
    public void ReadsTransformsInRoomPlansColumnMajorOrder()
    {
        double[] translation = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 1.2, -3, 1];

        var m = Mat4.FromColumnMajor(translation);

        Assert.Equal(2.5, m[0, 3]);
        Assert.Equal(-3, m[2, 3]);
        Assert.Equal(translation, m.ToColumnMajor());
        // RotateY turns the plan clockwise as seen with +Z down the page: (1, 0) → (cos, −sin).
        var turned = Mat4.RotateY(Math.PI / 2).TransformPoint(1, 0, 0);
        Assert.Equal(0, turned.X, 9);
        Assert.Equal(-1, turned.Z, 9);
    }
}
