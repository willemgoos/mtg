"""Refine only the two border masonry materials; preserve the original scene file."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'sandstone-arena.blend'))


def linear(hex_value):
    values=[int(hex_value[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)


def masonry(name, dark, light):
    mat=bpy.data.materials[name]
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial')
    shader=nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value=0
    shader.inputs['IOR'].default_value=1.46
    shader.inputs['Specular IOR Level'].default_value=.28
    links.new(shader.outputs[0],output.inputs[0])
    geometry=nodes.new('ShaderNodeNewGeometry')
    def noise(label,scale,detail):
        node=nodes.new('ShaderNodeTexNoise');node.label=label
        node.inputs['Scale'].default_value=scale
        node.inputs['Detail'].default_value=detail
        node.inputs['Roughness'].default_value=.7
        links.new(geometry.outputs['Position'],node.inputs['Vector'])
        return node
    broad=noise('Mineral and weathering variation',3.8,4)
    grains=noise('Stone aggregate',95,3)
    micro=noise('Fine pores',190,2)
    palette=nodes.new('ShaderNodeValToRGB');palette.label='Uneven stone pigmentation'
    palette.color_ramp.elements[0].position=.18;palette.color_ramp.elements[0].color=linear(dark)
    palette.color_ramp.elements[1].position=.82;palette.color_ramp.elements[1].color=linear(light)
    links.new(broad.outputs['Fac'],palette.inputs[0])
    links.new(palette.outputs[0],shader.inputs['Base Color'])
    rough=nodes.new('ShaderNodeMapRange');rough.label='Dry matte stone with local roughness variation'
    rough.inputs['From Min'].default_value=.15;rough.inputs['From Max'].default_value=.85
    rough.inputs['To Min'].default_value=.72;rough.inputs['To Max'].default_value=.97
    links.new(grains.outputs['Fac'],rough.inputs['Value'])
    links.new(rough.outputs[0],shader.inputs['Roughness'])
    fine=nodes.new('ShaderNodeBump');fine.label='Microscopic pores'
    fine.inputs['Strength'].default_value=.2;fine.inputs['Distance'].default_value=.003
    links.new(micro.outputs['Fac'],fine.inputs['Height'])
    aggregate=nodes.new('ShaderNodeBump');aggregate.label='Uneven granular surface'
    aggregate.inputs['Strength'].default_value=.28;aggregate.inputs['Distance'].default_value=.007
    links.new(grains.outputs['Fac'],aggregate.inputs['Height'])
    links.new(fine.outputs['Normal'],aggregate.inputs['Normal'])
    links.new(aggregate.outputs['Normal'],shader.inputs['Normal'])


masonry('Ruins basalt','444936','677056')
masonry('Worn rim stone','736749','a18c60')
for obj in bpy.data.objects:
    if obj.type=='MESH' and obj.name!='Solid sandstone platform' and any(slot.material and slot.material.name in ['Ruins basalt','Worn rim stone'] for slot in obj.material_slots):
        for mod in obj.modifiers:
            if mod.type=='BEVEL':mod.width=min(mod.width,.025)
scene=bpy.context.scene
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    if any(device.type=='OPTIX' for device in prefs.devices):scene.cycles.device='GPU'
except Exception as error:
    print('CPU rendering:',error)
scene.cycles.samples=128
scene.render.filepath=str(ROOT/'sandstone-bricks-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'sandstone-arena-bricks.blend'))
bpy.ops.render.render(write_still=True)
# A closer material inspection render makes the grain and roughness easier to judge.
camera=scene.camera
camera.location=(7.2,3.4,3.2)
camera.rotation_euler=(Vector((7.2,6.4,.15))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=6.2
scene.render.resolution_x=1280;scene.render.resolution_y=720
scene.render.filepath=str(ROOT/'border-material-closeup.png')
bpy.ops.render.render(write_still=True)
print('BRICK_MATERIAL_REVISION_READY')
