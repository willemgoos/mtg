"""Build an original sandstone jungle arena and render a fixed-camera art preview.
Run: blender --background --factory-startup --python build_arena.py
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
random.seed(64129)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def color(hex_value):
    rgb = [int(hex_value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)


def material(name, tint, roughness=.9):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color(tint)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color(tint)
    shader.inputs['Roughness'].default_value = roughness
    return mat


sand = material('Weathered warm sandstone', 'ad8e57')
nodes, links = sand.node_tree.nodes, sand.node_tree.links
shader = nodes.get('Principled BSDF')
coord = nodes.new('ShaderNodeTexCoord')
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 7
noise.inputs['Detail'].default_value = 5
noise.inputs['Roughness'].default_value = .72
links.new(coord.outputs['Generated'], noise.inputs['Vector'])
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = .2
ramp.color_ramp.elements[0].color = color('6f6046')
ramp.color_ramp.elements[1].position = .8
ramp.color_ramp.elements[1].color = color('ba9c63')
ramp.color_ramp.elements.new(.5).color = color('9c8254')
links.new(noise.outputs['Fac'], ramp.inputs[0])
links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
fine = nodes.new('ShaderNodeTexNoise')
fine.inputs['Scale'].default_value = 230
fine.inputs['Detail'].default_value = 3
links.new(coord.outputs['Generated'], fine.inputs['Vector'])
grain_bump = nodes.new('ShaderNodeBump')
grain_bump.inputs['Strength'].default_value = .3
grain_bump.inputs['Distance'].default_value = .045
links.new(fine.outputs['Fac'], grain_bump.inputs['Height'])
links.new(grain_bump.outputs['Normal'], shader.inputs['Normal'])

floor_mat = sand.copy()
floor_mat.name = 'Carved sandstone floor'
nodes, links = floor_mat.node_tree.nodes, floor_mat.node_tree.links
shader = nodes.get('Principled BSDF')
image = nodes.new('ShaderNodeTexImage')
image.image = bpy.data.images.load(str(ROOT / 'sandstone-relief.png'))
image.image.colorspace_settings.name = 'Non-Color'
image.interpolation = 'Linear'
image.extension = 'EXTEND'
image.image.pack()
engraving_bump = nodes.new('ShaderNodeBump')
engraving_bump.inputs['Strength'].default_value = .85
engraving_bump.inputs['Distance'].default_value = .12
links.new(image.outputs['Color'], engraving_bump.inputs['Height'])
links.new(nodes.get('Bump').outputs['Normal'], engraving_bump.inputs['Normal'])
links.new(engraving_bump.outputs['Normal'], shader.inputs['Normal'])
# Groove pigment comes from the same relief, so the motif reads as carved stone.
base = shader.inputs['Base Color'].links[0].from_socket
pigment = nodes.new('ShaderNodeMixRGB')
pigment.blend_type = 'MULTIPLY'
pigment.inputs[0].default_value = .32
links.new(base, pigment.inputs[1])
links.new(image.outputs['Color'], pigment.inputs[2])
links.new(pigment.outputs[0], shader.inputs['Base Color'])

# Weathering follows the perimeter but varies with mineral noise, rather than a uniform vignette.
separate = nodes.new('ShaderNodeSeparateXYZ')
links.new(nodes.get('Texture Coordinate').outputs['UV'], separate.inputs[0])
def math_node(operation, a, b):
    node = nodes.new('ShaderNodeMath');node.operation=operation
    for index, value in enumerate([a,b]):
        if isinstance(value, (int,float)):node.inputs[index].default_value=value
        else:links.new(value,node.inputs[index])
    return node.outputs[0]
edge_x=math_node('MINIMUM',separate.outputs['X'],math_node('SUBTRACT',1,separate.outputs['X']))
edge_y=math_node('MINIMUM',separate.outputs['Y'],math_node('SUBTRACT',1,separate.outputs['Y']))
edge=math_node('MINIMUM',edge_x,edge_y)
falloff=math_node('MAXIMUM',0,math_node('SUBTRACT',.2,edge))
stain=math_node('MULTIPLY',math_node('MULTIPLY',falloff,7),nodes.get('Noise Texture').outputs['Fac'])
weather=nodes.new('ShaderNodeMixRGB');weather.blend_type='MIX'
links.new(stain,weather.inputs[0]);links.new(pigment.outputs[0],weather.inputs[1])
weather.inputs[2].default_value=color('4c5732')
links.new(weather.outputs[0],shader.inputs['Base Color'])

stone = material('Ruins basalt', '555f46')
stone_warm = material('Worn rim stone', '8b7951')
earth = material('Dark damp soil', '514930')
moss = material('Moss', '52633a')
moss_light = material('Moss ochre', '78804b')
leaf_materials = [material('Leaf olive', '596c39'), material('Leaf jade', '3e5b36'), material('Leaf yellow edge', '7a7c3c')]
red_leaf = material('Copper jungle flowers', '9e5637')
bark = material('Twisted roots', '62523a')
water = material('Shallow ravine shade', '243a30')


def cube(name, location, scale, mat, bevel=.07):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new('Weighted stone normals', 'WEIGHTED_NORMAL')
    return obj


cube('Solid sandstone platform', (0, 0, -.35), (21, 13, .65), stone_warm, .16)
# Explicit top UVs give the entire relief one uninterrupted surface.
mesh = bpy.data.meshes.new('Floor surface')
mesh.from_pydata([(-10,-6,0),(10,-6,0),(10,6,0),(-10,6,0)], [], [(0,1,2,3)])
mesh.uv_layers.new(name='Carving UV')
for loop, uv in zip(mesh.uv_layers.active.data, [(0,0),(1,0),(1,1),(0,1)]):
    loop.uv = uv
floor = bpy.data.objects.new('Continuous carved sandstone', mesh)
bpy.context.collection.objects.link(floor)
floor.data.materials.append(floor_mat)
cube('Surrounding earth', (0,0,-.55), (32,23,.3), earth, .02)
# Chunky border stones keep the playing area open and add thickness at the edge.
for side in [-1,1]:
    for i in range(14):
        y = -6.4 + i * .96
        block = cube('Ancient border masonry', (side*10.4,y,.12), (.66,.91,.58), stone, .1)
        block.rotation_euler[2] = random.uniform(-.04,.04)
    for i in range(22):
        x = -10.25+i*.98
        cube('Recessed end border', (x,side*6.45,.03), (.94,.48,.36), stone_warm, .07)


def curve(name, points, thickness, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = thickness
    data.bevel_resolution = 2
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, position in zip(spline.bezier_points, points):
        point.co = position
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    return obj


for sx in [-1,1]:
    for sy in [-1,1]:
        x,y = sx*10.6, sy*5.8
        cube('Ruined pillar foundation',(x,y,.35),(1.5,1.5,.65),stone,.12)
        for tier in range(random.randint(2,4)):
            block=cube('Broken pillar tier',(x,y,.9+tier*.55),(1.1,1.15,.5),stone,.06)
            block.rotation_euler[2]=random.uniform(-.08,.08)
        for i in range(6):
            xx,yy=x+random.uniform(-1,1),y+random.uniform(-1,1)
            block=cube('Rubble',(xx,yy,.2),(.35+random.random()*.55,.3+random.random()*.5,.2+random.random()*.2),stone,.07)
            block.rotation_euler[2]=random.random()*math.pi


# Bent spear leaves with a raised central vein, rather than spherical tree blobs.
def plant(x,y,size):
    for n in range(random.randint(7,11)):
        angle=random.random()*math.tau
        length=size*random.uniform(.75,1.35)
        width=length*random.uniform(.13,.19)
        verts=[]
        for i in range(9):
            t=i/8
            reach=length*t*.82
            z=.08+length*(math.sin(t*math.pi*.72)*.48+t*.12)
            half=width*math.sin(t*math.pi)**.7
            for across in [-1,0,1]:
                px=x+math.cos(angle)*reach-math.sin(angle)*half*across
                py=y+math.sin(angle)*reach+math.cos(angle)*half*across
                verts.append((px,py,z+(1-abs(across))*.045*math.sin(t*math.pi)))
        faces=[]
        for i in range(8):
            for j in range(2):
                a=i*3+j;faces.append((a,a+1,a+4,a+3))
        data=bpy.data.meshes.new('Leaf blade');data.from_pydata(verts,[],faces);data.update()
        obj=bpy.data.objects.new('Broad jungle leaf',data);bpy.context.collection.objects.link(obj)
        obj.data.materials.append(red_leaf if n==0 and random.random()<.5 else random.choice(leaf_materials))
        for p in data.polygons:p.use_smooth=True
        solid=obj.modifiers.new('Leaf thickness','SOLIDIFY');solid.thickness=.012


for sx in [-1,1]:
    for i in range(14):
        plant(sx*random.uniform(10.7,12.3),random.uniform(-7.7,7.7),random.uniform(1,1.9))
    for sy in [-1,1]:
        for i in range(7):
            plant(sx*random.uniform(6.3,10.8),sy*random.uniform(6.6,8.2),random.uniform(1,1.6))
    for i in range(6):
        y=random.uniform(-6,6)
        curve('Root gripping the rim',[(sx*12,y-1,-.1),(sx*10.9,y,.28),(sx*10.2,y+.5,.24),(sx*9.65,y+1.2,.02)],.035+random.random()*.055,bark)

# Light pools and broad soft shadows supply the warm, earthy reference mood.
def area(name, location, energy, tint, size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color(tint)[:3];data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()

area('Warm sunlight',(-7,-3,10),2500,'ffe3b0',5)
area('Open sky fill',(5,4,10),600,'fff1d5',10)
area('Left border glow',(-10,4,4),130,'ffd687',3)
area('Right border glow',(10,4,4),130,'ffd687',3)
world=bpy.data.worlds.new('Muted warm sky');world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=color('8b987f')
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.2
scene=bpy.context.scene;scene.world=world
camera_data=bpy.data.cameras.new('Game camera');camera=bpy.data.objects.new('Game camera',camera_data)
bpy.context.collection.objects.link(camera);camera.location=(0,-9,25)
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=24.5;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    if any(d.type=='OPTIX' for d in prefs.devices):scene.cycles.device='GPU'
except Exception as error:
    print('CPU rendering:',error)
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'sandstone-preview.png')
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.4
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'sandstone-arena.blend'))
bpy.ops.render.render(write_still=True)
print('ARENA_PREVIEW_READY',scene.render.filepath)
