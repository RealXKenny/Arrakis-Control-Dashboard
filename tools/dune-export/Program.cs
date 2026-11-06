// Bulk-exports Dune: Awakening meshes (glTF binary, textures embedded) using CUE4Parse.
// Usage: dotnet run -c Release -- --out <dir> [--paks <Paks dir>] [--list <file of package paths>]
//        [--prefix <path prefix>] [--contains <path fragment>] [--batch 100]
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;

var paks = @"D:\SteamLibrary\steamapps\common\DuneAwakening\DuneSandbox\Content\Paks";
string? outDir = null;
string? listFile = null;
var prefixes = new List<string>();
var contains = new List<string>();
var batchSize = 100;
List<string>? dump = null;
string? layersDir = null;
for (var i = 0; i < args.Length - 1; i += 2)
{
    switch (args[i])
    {
        case "--paks": paks = args[i + 1]; break;
        case "--out": outDir = args[i + 1]; break;
        case "--dump": (dump ??= new()).Add(args[i + 1]); break;
        case "--layers": layersDir = args[i + 1]; break;
        case "--list": listFile = args[i + 1]; break;
        case "--prefix": prefixes.Add(args[i + 1].Replace("\\", "/").Trim('/').ToLowerInvariant()); break;
        case "--contains": contains.Add(args[i + 1].Replace("\\", "/").ToLowerInvariant()); break;
        case "--batch": batchSize = int.Parse(args[i + 1]); break;
        default: Console.Error.WriteLine($"Unknown option {args[i]}"); return 2;
    }
}
if (outDir is null) { Console.Error.WriteLine("Pass --out <directory>"); return 2; }

var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_DuneAwakening));
provider.Initialize();
provider.Mount();
Console.WriteLine($"Mounted {provider.MountedVfs.Count} containers, {provider.Files.Count} files");

if (dump is not null)
{
    foreach (var dumpPath in dump)
    {
        var dumpPackage = provider.LoadPackage(dumpPath);
        Console.WriteLine(Newtonsoft.Json.JsonConvert.SerializeObject(dumpPackage.GetExports(), Newtonsoft.Json.Formatting.Indented));
    }
    return 0;
}
if (layersDir is not null)
{
    // Reads every Texture2DRefArray ("Layer BaseColor" etc.) of the listed material packages and exports the layer textures.
    Directory.CreateDirectory(layersDir);
    var materialPackages = File.ReadAllLines(listFile!).Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
    var table = new Dictionary<string, Dictionary<string, List<string?>>>();
    var textureSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var materialPath in materialPackages)
    {
        try
        {
            var package = provider.LoadPackage(materialPath + ".uasset");
            foreach (var export in package.GetExports())
            {
                if (export.ExportType != "Texture2DRefArray") continue;
                var json = Newtonsoft.Json.Linq.JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(export));
                var list = new List<string?>();
                foreach (var item in json["Properties"]?["Textures"] ?? new Newtonsoft.Json.Linq.JArray())
                {
                    var objectPath = item.HasValues ? (string?)item["ObjectPath"] : null;
                    if (objectPath is null) { list.Add(null); continue; }
                    var pkg = "DuneSandbox/Content/" + objectPath.Replace("/Game/", "")[..objectPath.Replace("/Game/", "").LastIndexOf('.')];
                    list.Add(pkg);
                    textureSet.Add(pkg);
                }
                if (!table.TryGetValue(materialPath, out var arrays)) table[materialPath] = arrays = new();
                arrays[export.Name] = list;
            }
        }
        catch (Exception e) { Console.Error.WriteLine($"SKIP {materialPath}: {e.GetType().Name}"); }
    }
    File.WriteAllText(Path.Combine(layersDir, "layers.json"), Newtonsoft.Json.JsonConvert.SerializeObject(table, Newtonsoft.Json.Formatting.Indented));
    Console.WriteLine($"{table.Count} materials with arrays, {textureSet.Count} layer textures");
    var pngOptions = new ExportOptions(meshFormat: EMeshFormat.Gltf2, textureFormat: ETextureFormat.Png, exportMaterials: false);
    var textureList = textureSet.OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList();
    var done = 0;
    for (var start = 0; start < textureList.Count; start += 100)
    {
        var session = new ExportSession();
        foreach (var texturePath in textureList.Skip(start).Take(100))
        {
            try { foreach (var export in provider.LoadPackage(texturePath + ".uasset").GetExports()) if (export is UTexture) { session.Add(export); done++; } }
            catch (Exception e) { Console.Error.WriteLine($"SKIP {texturePath}: {e.GetType().Name}"); }
        }
        if (session.HasQueuedItems) await session.RunAsync(layersDir, pngOptions);
        Console.WriteLine($"{Math.Min(start + 100, textureList.Count)}/{textureList.Count} textures");
    }
    return 0;
}
var wanted = listFile is null
    ? null
    : File.ReadAllLines(listFile).Select(l => l.Trim().ToLowerInvariant()).Where(l => l.Length > 0).ToHashSet();
var packages = provider.Files.Keys
    .Where(k => k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
    .Where(k => wanted is null || wanted.Contains(k[..^".uasset".Length].ToLowerInvariant()))
    .Where(k => prefixes.Count == 0 || prefixes.Any(p => k.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
    .Where(k => contains.Count == 0 || contains.Any(c => k.Contains(c, StringComparison.OrdinalIgnoreCase)))
    .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
    .ToList();
Console.WriteLine($"{packages.Count} candidate packages" + (wanted is null ? "" : $" of {wanted.Count} listed"));
if (wanted is not null)
{
    var found = packages.Select(k => k[..^".uasset".Length].ToLowerInvariant()).ToHashSet();
    foreach (var missing in wanted.Where(w => !found.Contains(w))) Console.Error.WriteLine($"MISSING {missing}");
}

var options = new ExportOptions(meshFormat: EMeshFormat.Gltf2, textureFormat: ETextureFormat.Png, exportMaterials: true);
int meshes = 0, failed = 0, scanned = 0;
for (var start = 0; start < packages.Count; start += batchSize)
{
    var session = new ExportSession();
    foreach (var path in packages.Skip(start).Take(batchSize))
    {
        scanned++;
        try
        {
            var package = provider.LoadPackage(path);
            foreach (var export in package.GetExports())
            {
                if (export is not (UStaticMesh or USkeletalMesh or UTexture)) continue;
                session.Add(export);
                meshes++;
            }
        }
        catch (Exception e) { failed++; Console.Error.WriteLine($"SKIP {path}: {e.GetType().Name}"); }
    }
    if (!session.HasQueuedItems) continue;
    try { await session.RunAsync(outDir, options); }
    catch (Exception e) { failed++; Console.Error.WriteLine($"BATCH {start}: {e.Message}"); }
    Console.WriteLine($"{scanned}/{packages.Count} scanned, {meshes} meshes queued, {failed} failures");
}
Console.WriteLine($"Done: {meshes} meshes, {failed} failures");
return 0;
