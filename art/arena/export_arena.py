"""Bake the authored scene into two draw calls for the web runtime."""
import bpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parents[1] / 'apps/web/public/arena'
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'sandstone-arena-damaged.blend'))
scene = bpy.context.scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'OPTIX'
scene.cycles.device = 'GPU'
scene.cycles.samples = 32
floor = bpy.data.objects['Continuous carved sandstone']
source_material = bpy.data.materials['Carved sandstone floor']
source_uv = source_material.node_tree.nodes.new('ShaderNodeUVMap')
source_uv.uv_map = 'Carving UV'
for node in source_material.node_tree.nodes:
    if node.type == 'TEX_IMAGE':
        source_material.node_tree.links.new(source_uv.outputs['UV'], node.inputs['Vector'])


def bake(objects, name, resolution, unwrap=True):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    # Boolean chips can leave an empty material slot on their new faces.
    for obj in bpy.context.selected_objects:
        for polygon in obj.data.polygons:
            if not obj.data.materials[polygon.material_index]:
                polygon.material_index = 0
        for index in reversed(range(len(obj.data.materials))):
            if not obj.data.materials[index]:
                obj.data.materials.pop(index=index)
    if len(objects) > 1:
        bpy.ops.object.join()
    arena = bpy.context.object
    arena.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arena.data.uv_layers.new(name='Baked UV')
    arena.data.uv_layers.active_index = len(arena.data.uv_layers) - 1
    if unwrap:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.003)
        bpy.ops.object.mode_set(mode='OBJECT')
    else:
        for target, source in zip(arena.data.uv_layers.active.data, arena.data.uv_layers['Carving UV'].data):
            target.uv = source.uv
    atlas = bpy.data.images.new(name, width=resolution, height=resolution)
    atlas.colorspace_settings.name = 'sRGB'
    for material in arena.data.materials:
        if material:
            material.use_nodes = True
            for existing in material.node_tree.nodes:
                existing.select = False
            node = material.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = atlas
            node.select = True
            material.node_tree.nodes.active = node
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 12
    bpy.ops.object.bake(type='DIFFUSE')
    atlas.filepath_raw = str(OUT / (name + '.jpg'))
    atlas.file_format = 'JPEG'
    atlas.save()
    material = bpy.data.materials.new(name + ' baked lighting')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = atlas
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'Baked UV'
    material.node_tree.links.new(uv.outputs['UV'], texture.inputs['Vector'])
    emission = nodes.new('ShaderNodeEmission')
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(texture.outputs['Color'], emission.inputs['Color'])
    material.node_tree.links.new(emission.outputs[0], output.inputs[0])
    arena.data.materials.clear()
    arena.data.materials.append(material)
    for polygon in arena.data.polygons:
        polygon.material_index = 0
    # Export only the atlas UVs; source UVs are no longer needed.
    for layer in list(arena.data.uv_layers):
        if layer.name != 'Baked UV':
            arena.data.uv_layers.remove(layer)
    arena.data.uv_layers.active_index = 0
    arena.data.uv_layers[0].active_render = True
    return arena


objects = [obj for obj in scene.objects if obj.type in {'MESH', 'CURVE'} and not obj.hide_render and obj != floor]
scenery = bake(objects, 'sandstone-scenery', 4096)
floor = bake([floor], 'sandstone-floor', 2048, unwrap=False)
bpy.ops.object.select_all(action='DESELECT')
scenery.select_set(True)
floor.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'sandstone-arena.glb'),
    use_selection=True, export_format='GLB', export_image_format='JPEG',
    export_image_quality=92, export_cameras=False, export_lights=False)
print('WEB_ARENA_EXPORTED')
for name in ('sandstone-floor', 'sandstone-scenery'):
    (OUT / (name + '.jpg')).unlink()
