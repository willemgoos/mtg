"""Add restrained physical weathering to masonry, preserving earlier revisions."""
import bpy
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'sandstone-arena-bricks.blend'))
rng = random.Random(93026)


def subtract(stone, cutter):
    bpy.ops.object.select_all(action='DESELECT')
    stone.select_set(True)
    bpy.context.view_layer.objects.active = stone
    modifier = stone.modifiers.new('Small weathered fracture', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = cutter
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


stones = sorted([obj for obj in bpy.data.objects if obj.type == 'MESH' and
    obj.name.startswith(('Ancient border masonry', 'Recessed end border',
                         'Ruined pillar foundation', 'Broken pillar tier', 'Rubble'))],
    key=lambda obj: obj.name)
chips = cracks = 0
for stone in stones:
    # Mesh bounds remain in local space even on rotated blocks.
    bounds = [Vector(co) for co in stone.bound_box]
    lo = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    size = hi - lo
    if rng.random() < .48:
        for _ in range(1 if rng.random() < .8 else 2):
            sx, sy = rng.choice((-1, 1)), rng.choice((-1, 1))
            radius = rng.uniform(.065, .115)
            local = Vector((hi.x if sx > 0 else lo.x,
                            hi.y if sy > 0 else lo.y, hi.z))
            local += Vector((-sx * .018, -sy * .018, -.018))
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius,
                                                location=stone.matrix_world @ local)
            cutter = bpy.context.object
            cutter.name = 'Temporary angular corner chip'
            cutter.scale = (rng.uniform(.8, 1.3), rng.uniform(.8, 1.25), rng.uniform(.65, 1))
            cutter.rotation_euler = (rng.random(), rng.random(), rng.random())
            subtract(stone, cutter)
            chips += 1

    # Sparse short, shallow fissures, carved into the upper face.
    if rng.random() < .11 and size.x > .5 and size.y > .4:
        start_x = rng.uniform(lo.x + size.x * .2, lo.x + size.x * .4)
        start_y = rng.uniform(lo.y + size.y * .3, lo.y + size.y * .6)
        length = min(size.x * .42, .36)
        width = rng.uniform(.006, .011)
        points = [(start_x + length * i / 4,
                   start_y + rng.uniform(-.025, .025)) for i in range(5)]
        verts = []
        for z in (hi.z - .022, hi.z + .035):
            for x, y in points:
                verts.extend([(x, y - width / 2, z), (x, y + width / 2, z)])
        faces = []
        for i in range(4):
            a = i * 2
            faces.extend([(a, a + 2, a + 3, a + 1),
                          (a + 10, a + 11, a + 13, a + 12),
                          (a, a + 10, a + 12, a + 2),
                          (a + 1, a + 3, a + 13, a + 11)])
        faces.extend([(0, 1, 11, 10), (8, 18, 19, 9)])
        mesh = bpy.data.meshes.new('Shallow fissure cutter')
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        cutter = bpy.data.objects.new('Temporary fissure', mesh)
        bpy.context.collection.objects.link(cutter)
        cutter.matrix_world = stone.matrix_world.copy()
        subtract(stone, cutter)
        cracks += 1

    for modifier in stone.modifiers:
        if modifier.type == 'BEVEL':
            # Preserve thin cracks and chipped facets without inflated rounded edges.
            modifier.width = min(modifier.width, .012)

scene = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
if any(device.type == 'OPTIX' for device in prefs.devices):
    scene.cycles.device = 'GPU'
scene.render.filepath = str(ROOT / 'sandstone-damage-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'sandstone-arena-damaged.blend'))
bpy.ops.render.render(write_still=True)

camera = scene.camera
camera.location = (7.2, 3.4, 3.2)
camera.rotation_euler = (Vector((7.2, 6.4, .15)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.ortho_scale = 6.2
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.filepath = str(ROOT / 'border-damage-closeup.png')
bpy.ops.render.render(write_still=True)
print(f'DAMAGE_REVISION_READY: {chips} small chips, {cracks} shallow fissures')
