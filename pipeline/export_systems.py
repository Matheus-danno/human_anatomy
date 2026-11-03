"""Exporta o Z-Anatomy (.blend) em um GLB por sistema anatômico.

Uso (a partir da raiz do projeto):
    pipeline/blender.sh -b pipeline/source/z-anatomy.blend -P pipeline/export_systems.py
    pipeline/blender.sh -b pipeline/source/z-anatomy.blend -P pipeline/export_systems.py -- --list
    pipeline/blender.sh -b pipeline/source/z-anatomy.blend -P pipeline/export_systems.py -- --max-tris 30000

--list apenas imprime o mapeamento coleção -> sistema e as contagens, sem exportar.
O .blend NÃO é salvo: todas as alterações (modificadores aplicados, decimação) ficam só na memória.

Estrutura do Startup.blend do Z-Anatomy (template de 2023):
- As coleções de topo numeradas ("1: Skeletal system" ... "9: Regions of human body") contêm os objetos
  diretamente e definem o sistema.
- As subcoleções ("Pulmonary veins", "Sense organs", "Digestive system"...) vivem numa árvore paralela em
  "Bonus collection" e servem para subdividir as coleções 5, 7 e 8.
- Sufixos: .r/.l lado; .ol/.or/.el/.er origens/inserções musculares; .j/.i são âncoras de rótulo com
  2 vértices; .g são superfícies de agrupamento; objetos FONT são os rótulos. Vasos e nervos são CURVE
  com bevel e precisam ser convertidos em malha.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import bpy

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_ROOT / "public" / "models"
JSON_PATH = PROJECT_ROOT / "src" / "data" / "structures.raw.json"

SYSTEMS = [
    "skin", "skeletal", "muscular", "arteries", "veins", "lymphatic", "nervous",
    "respiratory", "digestive", "urinary", "reproductive", "endocrine", "sense_organs",
]

# Número da coleção de topo -> sistema fixo, ou lista de regras (sistema, regex) testadas primeiro contra as
# subcoleções do objeto e depois contra o nome dele; a primeira que casar vence. Uma string após as regras
# é o padrão quando nada casa; sem padrão, o objeto fica sem sistema e é listado no relatório.
# Ausente do dicionário = coleção ignorada ("2: Muscular insertions" não está na lista de sistemas).
TOP_LEVEL = {
    1: "skeletal",
    3: "skeletal",
    4: "muscular",
    5: [
        ("lymphatic", r"lymph"),
        ("veins", r"\bveins?\b|venous|\bvena\b|\bvenae\b"),
        "arteries",  # artérias e o coração (não há sistema próprio para o coração)
    ],
    6: "lymphatic",
    7: [
        ("sense_organs", r"sense organs|\beye\b|\beye\*|\bear\b|olfactory organ|gustatory organ"),
        "nervous",
    ],
    8: [
        ("lymphatic", r"lymph|spleen|thym|tonsil"),
        ("endocrine", r"endocrin|hypophys|pituitar|thyroid|suprarenal|adrenal|paragangl|pineal"),
        ("urinary", r"urinar|kidney|renal|ureter|bladder|urethr"),
        ("reproductive", r"genital|\buter|ovar|\btestis|\btestes|testicul|prostat|penis|vagin|mammary|scrot"),
        ("respiratory", r"respirat|\bnose\b|nasal|laryn|trache|bronch|lung|pleur|thoracic cavity|mediastin"),
        ("digestive", r"digest|mouth|fauces|pharyn|oesophag|esophag|stomach|intestin|liver|gallbladder|bile|"
                      r"pancrea|peritone|abdominopelvic|teeth|tooth|tongue|gingiv|palat|appendi|\bmeso"),
    ],
    9: "skin",  # Regions of human body: superfície do corpo dividida por regiões
}

HELPER_SUFFIX = re.compile(r"\.(j|i|g)$")
TOP_NAME = re.compile(r"^(\d+):")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="export_systems.py")
    p.add_argument("--list", action="store_true", help="só listar mapeamento e contagens")
    p.add_argument("--max-tris", type=int, default=50_000, help="limite de triângulos por malha")
    return p.parse_args(argv)


def collection_parents():
    parents = {}
    for coll in bpy.data.collections:
        for child in coll.children:
            parents.setdefault(child, coll)
    return parents


def subcollection_path(obj, parents):
    """Nomes das subcoleções do objeto e de seus ancestrais, sem as coleções de topo."""
    names = []
    for coll in obj.users_collection:
        while coll is not None and coll.name != "Bonus collection" and not TOP_NAME.match(coll.name):
            names.append(coll.name)
            coll = parents.get(coll)
    return names


def classify(obj, parents):
    """Retorna (sistema, número da coleção de topo, subcoleções). Sistema None = não exportar."""
    tops = sorted(int(m.group(1)) for c in obj.users_collection if (m := TOP_NAME.match(c.name)))
    if not tops:
        return None, None, []
    top = tops[0]
    path = subcollection_path(obj, parents)
    rule = TOP_LEVEL.get(top)
    if rule is None or isinstance(rule, str):
        return rule, top, path

    path_text = " | ".join(path).lower()
    name_text = obj.name.lower()
    for text in (path_text, name_text):
        for entry in rule:
            if isinstance(entry, tuple) and re.search(entry[1], text):
                return entry[0], top, path
    default = rule[-1] if isinstance(rule[-1], str) else None
    return default, top, path


def is_candidate(obj):
    return obj.type in ("MESH", "CURVE") and not HELPER_SUFFIX.search(obj.name)


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or "obj"


def triangle_count(mesh):
    return sum(len(p.vertices) - 2 for p in mesh.polygons)


def make_everything_visible():
    """Objetos excluídos da view layer não são avaliados nem exportáveis por seleção."""
    def walk(layer_coll):
        layer_coll.exclude = False
        layer_coll.hide_viewport = False
        layer_coll.collection.hide_viewport = False
        layer_coll.collection.hide_select = False
        for child in layer_coll.children:
            walk(child)

    walk(bpy.context.view_layer.layer_collection)
    bpy.context.view_layer.update()


def bake_objects(objs):
    """Aplica modificadores/shape keys, converte curvas em malhas e desfaz parentesco preservando a
    transformação global. Retorna a lista de objetos MESH na mesma ordem (curvas viram objetos novos)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    matrices = {obj: obj.matrix_world.copy() for obj in objs}
    baked = {}
    for obj in objs:
        if obj.type == "CURVE" or len(obj.modifiers) or obj.data.shape_keys:
            baked[obj] = bpy.data.meshes.new_from_object(
                obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)

    export_root = bpy.data.collections.new("__export__")
    bpy.context.scene.collection.children.link(export_root)

    curves = sum(1 for o in objs if o.type == "CURVE")
    result = []
    for obj in objs:
        mesh = baked.get(obj)
        if obj.type == "CURVE":
            name, matrix = obj.name, matrices.pop(obj)
            bpy.data.objects.remove(obj)  # libera o nome para o objeto-malha que o substitui
            new_obj = bpy.data.objects.new(name, mesh)
            export_root.objects.link(new_obj)
            new_obj.matrix_world = matrix
            result.append(new_obj)
            continue
        if mesh is not None:
            while obj.modifiers:
                obj.modifiers.remove(obj.modifiers[0])
            obj.shape_key_clear()
            obj.data = mesh
        while obj.constraints:
            obj.constraints.remove(obj.constraints[0])
        obj.parent = None
        obj.matrix_world = matrices[obj]
        result.append(obj)
    print(f"Modificadores/shape keys aplicados em {len(baked) - curves} malhas; {curves} curvas convertidas.")
    return result


def decimate_objects(objs, max_tris):
    targets = {}
    for obj in objs:
        tris = triangle_count(obj.data)
        if tris > max_tris:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            mod = obj.modifiers.new("ExportDecimate", "DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = max_tris / tris
            mod.use_collapse_triangulate = True
            targets[obj] = tris
    if not targets:
        print("Nenhuma malha acima do limite de triângulos.")
        return {}

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for obj, before in targets.items():
        new_mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
        obj.modifiers.remove(obj.modifiers["ExportDecimate"])
        obj.data = new_mesh
        after = triangle_count(new_mesh)
        result[obj] = (before, after)
        print(f"  decimado: {obj.name}: {before:,} -> {after:,} triângulos")
    return result


def export_glb(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_select = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    wanted = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,          # já aplicados em bake_objects
        export_yup=True,
        export_extras=True,          # leva o custom property anatomy_id para userData no three.js
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
    # As opções do exportador mudam entre versões do Blender: passa só as que existem.
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in available})


def main():
    args = parse_args()
    print(f"Blender {bpy.app.version_string} | arquivo: {bpy.data.filepath}")
    parents = collection_parents()

    entries = []  # (obj, system, top, path)
    skipped = Counter()
    unmapped = []
    for obj in bpy.context.scene.objects:
        if not is_candidate(obj):
            continue
        system, top, path = classify(obj, parents)
        if system is None:
            if top in TOP_LEVEL:
                unmapped.append((obj.name, top, path))
            else:
                skipped[top] += 1
            continue
        entries.append((obj, system, top, path))

    counts = Counter(system for _, system, _, _ in entries)
    print("\n=== Objetos por sistema ===")
    for system in SYSTEMS:
        tops = Counter(top for _, s, top, _ in entries if s == system)
        origin = ", ".join(f"col.{t}: {n}" for t, n in sorted(tops.items()))
        print(f"  {system:<14} {counts[system]:>6}   ({origin})")
    print(f"  ignorados por coleção de topo: {dict(skipped)}")
    print(f"  sem regra (coleções 5/7/8): {len(unmapped)}")
    for name, top, path in unmapped[:40]:
        print(f"    col.{top} {name!r}  subcoleções={path}")

    if args.list:
        return

    make_everything_visible()
    baked = bake_objects([e[0] for e in entries])
    entries = [(new_obj, *rest) for new_obj, (_, *rest) in zip(baked, entries)]
    empty = [e for e in entries if len(e[0].data.polygons) == 0]
    if empty:
        print(f"Descartando {len(empty)} objetos sem faces: {[e[0].name for e in empty[:10]]}")
        entries = [e for e in entries if len(e[0].data.polygons) > 0]

    print(f"\nDecimando malhas acima de {args.max_tris:,} triângulos...")
    decimated = decimate_objects([e[0] for e in entries], args.max_tris)

    used_ids = set()
    records = []
    by_system = defaultdict(list)
    for system in SYSTEMS:
        for obj, s, top, path in entries:
            if s != system:
                continue
            base = slugify(obj.name)
            ident, n = base, 2
            while ident in used_ids:
                ident, n = f"{base}_{n}", n + 1
            used_ids.add(ident)
            # O GLTFLoader do three.js altera nomes de nós (espaços, pontos...), então o vínculo
            # estável entre malha e metadados é o anatomy_id (chega em mesh.userData.anatomy_id).
            # As demais custom properties do Z-Anatomy (Cross-section-*, muscle_color...) são removidas
            # para não irem parar nos extras do GLB.
            for key in list(obj.keys()):
                del obj[key]
            obj["anatomy_id"] = ident
            by_system[system].append(obj)
            records.append({
                "id": ident,
                "name": obj.name,
                "system": system,
                "collections": path,
                "triangles": triangle_count(obj.data),
                "decimatedFrom": decimated[obj][0] if obj in decimated else None,
            })

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print("\n=== Exportando GLBs ===")
    for system in SYSTEMS:
        objs_sys = by_system[system]
        path = MODELS_DIR / f"{system}.glb"
        if not objs_sys:
            print(f"  {system}: sem objetos, pulando")
            continue
        export_glb(objs_sys, path)
        tris = sum(triangle_count(o.data) for o in objs_sys)
        print(f"  {path.relative_to(PROJECT_ROOT)}: {len(objs_sys)} objetos, {tris:,} triângulos, "
              f"{path.stat().st_size / 1_048_576:.1f} MB")

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(records)} estruturas em {JSON_PATH.relative_to(PROJECT_ROOT)}")


main()
