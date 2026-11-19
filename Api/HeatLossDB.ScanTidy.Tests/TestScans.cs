using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy.Tests;

/// <summary>Builds small CapturedStructures from wall endpoints, laid out the way RoomPlan writes them.</summary>
internal sealed class TestScan
{
    private readonly List<(double X1, double Z1, double X2, double Z2, int Story, string Id)> walls = [];
    private readonly List<(string Label, double X, double Z, int Story)> labels = [];

    /// <summary>A wall from (x1, z1) to (x2, z2), in metres, seen from above.</summary>
    public TestScan Wall(double x1, double z1, double x2, double z2, int story = 0, string? id = null)
    {
        walls.Add((x1, z1, x2, z2, story, id ?? $"W{walls.Count:D2}"));
        return this;
    }

    /// <summary>The four walls of a rectangle.</summary>
    public TestScan Box(double x0, double z0, double x1, double z1, int story = 0) =>
        Wall(x0, z0, x1, z0, story).Wall(x1, z0, x1, z1, story).Wall(x1, z1, x0, z1, story).Wall(x0, z1, x0, z0, story);

    public TestScan Label(string label, double x, double z, int story = 0)
    {
        labels.Add((label, x, z, story));
        return this;
    }

    /// <summary>The structure, turned <paramref name="degrees"/> about the origin as a real scan would be.</summary>
    public JsonObject Build(double degrees = 0)
    {
        var r = degrees * Math.PI / 180;
        (double X, double Z) Turn(double x, double z) => (x * Math.Cos(r) - z * Math.Sin(r), x * Math.Sin(r) + z * Math.Cos(r));

        var wallNodes = new JsonArray();
        foreach (var (x1, z1, x2, z2, story, id) in walls)
        {
            var a = Turn(x1, z1);
            var b = Turn(x2, z2);
            wallNodes.Add(WallNode(a, b, story, id));
        }
        var sectionNodes = new JsonArray();
        foreach (var (label, x, z, story) in labels)
        {
            var p = Turn(x, z);
            sectionNodes.Add(new JsonObject { ["center"] = new JsonArray(p.X, 0.0, p.Z), ["label"] = label, ["story"] = story });
        }
        return new JsonObject
        {
            ["version"] = 2,
            ["walls"] = wallNodes,
            ["doors"] = new JsonArray(),
            ["windows"] = new JsonArray(),
            ["openings"] = new JsonArray(),
            ["objects"] = new JsonArray(),
            ["floors"] = new JsonArray(),
            ["sections"] = sectionNodes,
            ["rooms"] = new JsonArray(),
        };
    }

    public static JsonObject WallNode((double X, double Z) a, (double X, double Z) b, int story, string id, double height = 2.4)
    {
        double dx = b.X - a.X, dz = b.Z - a.Z, length = Math.Sqrt(dx * dx + dz * dz);
        double ux = dx / length, uz = dz / length;
        // Columns: local X along the wall, Y up, Z = X × Y, then the centre.
        double[] transform =
        [
            ux, 0, uz, 0,
            0, 1, 0, 0,
            -uz, 0, ux, 0,
            (a.X + b.X) / 2, height / 2, (a.Z + b.Z) / 2, 1,
        ];
        return new JsonObject
        {
            ["category"] = new JsonObject { ["wall"] = new JsonObject() },
            ["completedEdges"] = new JsonArray(),
            ["confidence"] = new JsonObject { ["high"] = new JsonObject() },
            ["curve"] = null,
            ["dimensions"] = new JsonArray(length, height, 0.0),
            ["identifier"] = id,
            ["parentIdentifier"] = null,
            ["polygonCorners"] = new JsonArray(),
            ["story"] = story,
            ["transform"] = new JsonArray(transform.Select(v => (JsonNode?)JsonValue.Create(v)).ToArray()),
        };
    }
}
