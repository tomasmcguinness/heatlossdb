using System.Text.Json.Nodes;

namespace HeatLossDB.ScanTidy;

/// <summary>Thrown when the input isn't a RoomPlan / RoomStitch CapturedStructure the tidier can read.</summary>
public sealed class ScanFormatException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// A wall, door, window, opening, object or floor, wrapping its JSON node in place.
/// Reads and writes go straight to the node, so every field the tidier doesn't touch is kept as it was.
/// </summary>
public sealed class ScanElement
{
    internal ScanElement(JsonObject node, string kind)
    {
        Node = node;
        Kind = kind;
    }

    public JsonObject Node { get; }

    /// <summary>The CapturedStructure array this came from: walls, doors, windows, openings, objects or floors.</summary>
    public string Kind { get; }

    public string Id => Node["identifier"]?.GetValue<string>() ?? throw new ScanFormatException($"A {Kind} entry has no identifier.");

    public int Story => Node["story"]?.GetValue<int>() ?? 0;

    public string? ParentId
    {
        get => Node["parentIdentifier"]?.GetValue<string>();
        set => Node["parentIdentifier"] = value;
    }

    public Mat4 Transform
    {
        get
        {
            var arr = Node["transform"]?.AsArray() ?? throw new ScanFormatException($"{Kind} {Id} has no transform.");
            if (arr.Count != 16) throw new ScanFormatException($"{Kind} {Id} has a transform with {arr.Count} values, not 16.");
            Span<double> v = stackalloc double[16];
            for (var i = 0; i < 16; i++) v[i] = arr[i]!.GetValue<double>();
            return Mat4.FromColumnMajor(v);
        }
        set => Node["transform"] = new JsonArray(value.ToColumnMajor().Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
    }

    /// <summary>Width along the element's local X axis (a wall's length).</summary>
    public double Length { get => Dim(0); set => SetDim(0, value); }

    public double Height { get => Dim(1); set => SetDim(1, value); }

    /// <summary>Depth; RoomPlan reports 0 for walls, the tidier writes a merged partition's thickness here.</summary>
    public double Depth { get => Dim(2); set => SetDim(2, value); }

    /// <summary>The element's attributes object, created when first written to.</summary>
    public JsonObject Attributes
    {
        get
        {
            if (Node["attributes"] is JsonObject o) return o;
            var created = new JsonObject();
            Node["attributes"] = created;
            return created;
        }
    }

    private double Dim(int i) => Node["dimensions"]?.AsArray()[i]?.GetValue<double>() ?? throw new ScanFormatException($"{Kind} {Id} has no dimensions.");

    private void SetDim(int i, double value) => Node["dimensions"]!.AsArray()[i] = JsonValue.Create(value);

    public override string ToString() => $"{Kind}:{Id[..Math.Min(8, Id.Length)]}";
}

/// <summary>A room label (RoomPlan section): its centre, label and storey.</summary>
public sealed class ScanSection
{
    internal ScanSection(JsonObject node) => Node = node;

    public JsonObject Node { get; }

    public string Label => Node["label"]?.GetValue<string>() ?? "unidentified";

    public int Story => Node["story"]?.GetValue<int>() ?? 0;

    public (double X, double Y, double Z) Center
    {
        get
        {
            var a = Node["center"]!.AsArray();
            return (a[0]!.GetValue<double>(), a[1]!.GetValue<double>(), a[2]!.GetValue<double>());
        }
        set => Node["center"] = new JsonArray(JsonValue.Create(value.X), JsonValue.Create(value.Y), JsonValue.Create(value.Z));
    }

    public Vec2 Plan => new(Center.X, Center.Z);
}

/// <summary>
/// One of the RoomPlan rooms the structure was stitched from (<c>rooms[]</c>). Each keeps its own copies of
/// its walls, doors, windows, openings, floors, objects and labels, in the same world frame as the stitched
/// structure. Readers such as the website take room shapes from these copies, so they have to move with their
/// storey; otherwise a turned storey's walls no longer meet its rooms.
/// </summary>
public sealed class ScanRoom
{
    private static readonly string[] SurfaceKinds = ["walls", "doors", "windows", "openings", "floors", "objects"];

    internal ScanRoom(JsonObject node)
    {
        Node = node;
        // Every surface with a usable transform; anything else is passed through untouched.
        Surfaces = SurfaceKinds
            .SelectMany(kind => (node[kind] as JsonArray ?? []).OfType<JsonObject>()
                .Where(n => n["transform"] is JsonArray { Count: 16 })
                .Select(n => new ScanElement(n, kind)))
            .ToList();
        Sections = (node["sections"] as JsonArray ?? []).OfType<JsonObject>()
            .Where(n => n["center"] is JsonArray { Count: 3 })
            .Select(n => new ScanSection(n)).ToList();
        Story = node["story"] is JsonValue s && s.TryGetValue<int>(out var story) ? story : Surfaces.FirstOrDefault()?.Story ?? 0;
    }

    public JsonObject Node { get; }

    public int Story { get; }

    public IReadOnlyList<ScanElement> Surfaces { get; }

    public IReadOnlyList<ScanSection> Sections { get; }

    /// <summary>Pre-multiplies every copy in the room, and the room's own origin, by <paramref name="t"/>.</summary>
    internal void Apply(Mat4 t)
    {
        foreach (var e in Surfaces) e.Transform = t * e.Transform;
        foreach (var s in Sections)
        {
            var (x, y, z) = s.Center;
            s.Center = t.TransformPoint(x, y, z);
        }
        if (Node["referenceOriginTransform"] is JsonArray { Count: 16 } origin)
        {
            var values = origin.Select(v => v!.GetValue<double>()).ToArray();
            var moved = t * Mat4.FromColumnMajor(values);
            Node["referenceOriginTransform"] = new JsonArray(moved.ToColumnMajor().Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
        }
    }
}

/// <summary>
/// A loaded CapturedStructure. Walls and objects are held in lists the passes can add to and remove from;
/// everything else is edited in place. <see cref="ToJson"/> writes the lists back.
/// </summary>
public sealed class ScanPlan
{
    private readonly JsonArray _wallsArray;
    private readonly JsonArray _objectsArray;

    private ScanPlan(JsonObject root)
    {
        Root = root;
        _wallsArray = root["walls"] as JsonArray ?? throw new ScanFormatException("The scan has no walls array.");
        _objectsArray = root["objects"] as JsonArray ?? (JsonArray)(root["objects"] = new JsonArray());

        Walls = Detach(_wallsArray, "walls");
        Objects = Detach(_objectsArray, "objects");
        Doors = InPlace("doors");
        Windows = InPlace("windows");
        Openings = InPlace("openings");
        Floors = InPlace("floors");
        Sections = (root["sections"] as JsonArray ?? [])
            .OfType<JsonObject>().Select(n => new ScanSection(n)).ToList();
        ScannedRooms = (root["rooms"] as JsonArray ?? []).OfType<JsonObject>().Select(n => new ScanRoom(n)).ToList();

        foreach (var child in Doors.Concat(Windows).Concat(Openings))
        {
            if (child.ParentId is not { } parent) continue;
            if (!Children.TryGetValue(parent, out var list)) Children[parent] = list = [];
            list.Add(child);
        }
    }

    public JsonObject Root { get; }

    public List<ScanElement> Walls { get; }

    public List<ScanElement> Objects { get; }

    public IReadOnlyList<ScanElement> Doors { get; }

    public IReadOnlyList<ScanElement> Windows { get; }

    public IReadOnlyList<ScanElement> Openings { get; }

    public IReadOnlyList<ScanElement> Floors { get; }

    public IReadOnlyList<ScanSection> Sections { get; }

    /// <summary>Doors, windows and openings keyed by the identifier of the wall they sit in.</summary>
    internal Dictionary<string, List<ScanElement>> Children { get; } = [];

    /// <summary>The RoomPlan rooms the structure was stitched from, as JSON.</summary>
    public JsonArray? Rooms => Root["rooms"] as JsonArray;

    /// <summary>The same rooms, wrapped so a storey's turn and shift can be applied to them (see <see cref="ApplyToStorey"/>).</summary>
    public IReadOnlyList<ScanRoom> ScannedRooms { get; }

    /// <summary>Loads a deep copy of <paramref name="source"/>; the caller's document is never modified.</summary>
    public static ScanPlan Load(JsonNode source)
    {
        if (source.DeepClone() is not JsonObject root)
            throw new ScanFormatException("The scan must be a JSON object (a RoomPlan CapturedStructure).");
        return new ScanPlan(root);
    }

    public IEnumerable<int> Stories => Walls.Select(w => w.Story).Distinct().Order();

    public List<ScanElement> WallsOn(int story) => Walls.Where(w => w.Story == story).ToList();

    public IReadOnlyList<ScanElement> ChildrenOf(ScanElement wall) =>
        Children.TryGetValue(wall.Id, out var list) ? list : [];

    /// <summary>Pre-multiplies the element's transform by <paramref name="t"/>, and its doors and windows with it.</summary>
    public void Apply(ScanElement element, Mat4 t, bool withChildren = true)
    {
        element.Transform = t * element.Transform;
        if (!withChildren) return;
        foreach (var child in ChildrenOf(element)) child.Transform = t * child.Transform;
    }

    /// <summary>Applies <paramref name="t"/> to everything on a storey: walls, children, objects, floors, room labels,
    /// and the scanned rooms' own copies of them.</summary>
    public void ApplyToStorey(int story, Mat4 t)
    {
        foreach (var e in Walls.Concat(Doors).Concat(Windows).Concat(Openings).Concat(Objects).Concat(Floors))
            if (e.Story == story) e.Transform = t * e.Transform;
        foreach (var s in Sections)
        {
            if (s.Story != story) continue;
            var (x, y, z) = s.Center;
            s.Center = t.TransformPoint(x, y, z);
        }
        foreach (var room in ScannedRooms)
            if (room.Story == story) room.Apply(t);
    }

    /// <summary>Moves children of <paramref name="from"/> onto <paramref name="to"/> (used when two wall faces merge).</summary>
    internal void Reparent(ScanElement from, ScanElement to)
    {
        if (!Children.Remove(from.Id, out var moving)) return;
        if (!Children.TryGetValue(to.Id, out var target)) Children[to.Id] = target = [];
        foreach (var c in moving)
        {
            c.ParentId = to.Id;
            target.Add(c);
        }
    }

    /// <summary>Writes the wall and object lists back and returns the document.</summary>
    public JsonObject ToJson()
    {
        _wallsArray.Clear();
        foreach (var w in Walls) { w.Node.Parent?.AsArray().Remove(w.Node); _wallsArray.Add(w.Node); }
        _objectsArray.Clear();
        foreach (var o in Objects) { o.Node.Parent?.AsArray().Remove(o.Node); _objectsArray.Add(o.Node); }
        return Root;
    }

    private List<ScanElement> Detach(JsonArray array, string kind)
    {
        var items = array.OfType<JsonObject>().ToList();
        array.Clear();
        return items.Select(n => new ScanElement(n, kind)).ToList();
    }

    private List<ScanElement> InPlace(string kind) =>
        (Root[kind] as JsonArray ?? []).OfType<JsonObject>().Select(n => new ScanElement(n, kind)).ToList();
}
