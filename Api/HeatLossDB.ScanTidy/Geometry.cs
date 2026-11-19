namespace HeatLossDB.ScanTidy;

/// <summary>A point or direction in plan view: X across, Z along (RoomPlan is Y-up, so the floor is the X–Z plane).</summary>
public readonly record struct Vec2(double X, double Z)
{
    /// <summary>Component by index: 0 = X, 1 = Z.</summary>
    public double this[int k] => k == 0 ? X : Z;

    public Vec2 With(int k, double value) => k == 0 ? this with { X = value } : this with { Z = value };

    public double Length => Math.Sqrt(X * X + Z * Z);

    public static Vec2 operator +(Vec2 a, Vec2 b) => new(a.X + b.X, a.Z + b.Z);
    public static Vec2 operator -(Vec2 a, Vec2 b) => new(a.X - b.X, a.Z - b.Z);
    public static Vec2 operator -(Vec2 a) => new(-a.X, -a.Z);
    public static Vec2 operator *(Vec2 a, double s) => new(a.X * s, a.Z * s);

    public static double Dot(Vec2 a, Vec2 b) => a.X * b.X + a.Z * b.Z;

    /// <summary>2D cross product (the Y component of a × b).</summary>
    public static double Cross(Vec2 a, Vec2 b) => a.X * b.Z - a.Z * b.X;
}

/// <summary>
/// A 4×4 transform in double precision, indexed <c>[row, column]</c>.
/// RoomPlan stores transforms as 16 numbers in column-major order (simd_float4x4): column 0 is the element's
/// local X axis (along a wall), column 3 its position. <see cref="FromColumnMajor"/> and
/// <see cref="ToColumnMajor"/> do the conversion, so nothing else in the library has to think about it.
/// <c>System.Numerics.Matrix4x4</c> is deliberately not used: it is single precision and uses the
/// row-vector convention, which mirrors or rotates the plan if the layout is mixed up.
/// </summary>
public sealed class Mat4
{
    private readonly double[] _m = new double[16]; // row-major internally: _m[r * 4 + c]

    public double this[int row, int col]
    {
        get => _m[row * 4 + col];
        set => _m[row * 4 + col] = value;
    }

    public static Mat4 Identity()
    {
        var m = new Mat4();
        for (var i = 0; i < 4; i++) m[i, i] = 1;
        return m;
    }

    public static Mat4 FromColumnMajor(ReadOnlySpan<double> values)
    {
        if (values.Length != 16) throw new ArgumentException("A transform needs 16 values.", nameof(values));
        var m = new Mat4();
        for (var c = 0; c < 4; c++)
        for (var r = 0; r < 4; r++)
            m[r, c] = values[c * 4 + r];
        return m;
    }

    public double[] ToColumnMajor()
    {
        var a = new double[16];
        for (var c = 0; c < 4; c++)
        for (var r = 0; r < 4; r++)
            a[c * 4 + r] = this[r, c];
        return a;
    }

    public Mat4 Clone()
    {
        var m = new Mat4();
        Array.Copy(_m, m._m, 16);
        return m;
    }

    public static Mat4 operator *(Mat4 a, Mat4 b)
    {
        var m = new Mat4();
        for (var r = 0; r < 4; r++)
        for (var c = 0; c < 4; c++)
        {
            double s = 0;
            for (var k = 0; k < 4; k++) s += a[r, k] * b[k, c];
            m[r, c] = s;
        }
        return m;
    }

    /// <summary>Rotation about the vertical (Y) axis. Applied to an element, it reduces its plan angle by <paramref name="radians"/>.</summary>
    public static Mat4 RotateY(double radians)
    {
        var m = Identity();
        double c = Math.Cos(radians), s = Math.Sin(radians);
        m[0, 0] = c; m[0, 2] = s;
        m[2, 0] = -s; m[2, 2] = c;
        return m;
    }

    /// <summary>Translation in plan (X and Z); height is untouched.</summary>
    public static Mat4 Translate(double x, double z)
    {
        var m = Identity();
        m[0, 3] = x;
        m[2, 3] = z;
        return m;
    }

    /// <summary>The inverse of a rotation plus translation (every RoomPlan transform is one).</summary>
    public Mat4 InverseRigid()
    {
        var m = Identity();
        for (var r = 0; r < 3; r++)
        for (var c = 0; c < 3; c++)
            m[r, c] = this[c, r];
        for (var r = 0; r < 3; r++)
            m[r, 3] = -(m[r, 0] * this[0, 3] + m[r, 1] * this[1, 3] + m[r, 2] * this[2, 3]);
        return m;
    }

    public (double X, double Y, double Z) TransformPoint(double x, double y, double z) => (
        this[0, 0] * x + this[0, 1] * y + this[0, 2] * z + this[0, 3],
        this[1, 0] * x + this[1, 1] * y + this[1, 2] * z + this[1, 3],
        this[2, 0] * x + this[2, 1] * y + this[2, 2] * z + this[2, 3]);
}
