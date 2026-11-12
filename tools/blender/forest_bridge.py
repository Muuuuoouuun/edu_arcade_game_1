"""Load-bearing masonry arch and timber deck; all dimensions use the terrain camera."""
import math
import bpy
from mathutils import Vector

def build_bridge(center_y, position, tile, stone, dark, wood, rim, iron):
    base,front=[],[]
    def block(name,x,y,w,h,z,mat,side,depth):
        obj=tile('Village bridge / '+name,x,y-.6*(z-20),w,h,z,mat,side,depth);base.append(obj);return obj
    def beam(name,a,b,width,depth,mat,foreground=False):
        a,b=Vector(a),Vector(b);delta=b-a
        bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2)
        obj=bpy.context.object;obj.name='Village bridge / '+name;obj.dimensions=(width,depth,delta.length)
        obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        obj.data.materials.append(mat);bevel=obj.modifiers.new('Timber edge bevel','BEVEL');bevel.width=.6;bevel.segments=2
        (front if foreground else base).append(obj);return obj
    # Two masonry abutments carry the open arch; the river is visible beneath its center.
    for x in (615,741):
        for course in range(3):
            block('abutment course',x,center_y,26,53,(-2+course*8),stone,dark,7.5)
        block('pier cap',x,center_y,29,56,16,stone,dark,5)
    for side in (-1,1):
        screen_y=center_y+side*24;world_y=position(678,screen_y,20)[1]
        for i in range(11):
            # Wedge joints stay visible at mobile size; a real opening, not a painted disk.
            a=i*math.pi/11+.012;b=(i+1)*math.pi/11-.012
            ring=[(50*math.cos(a),-10+20*math.sin(a)),(62*math.cos(a),-10+30*math.sin(a)),(62*math.cos(b),-10+30*math.sin(b)),(50*math.cos(b),-10+20*math.sin(b))]
            verts=[(678+x-450,world_y+offset,z) for offset in (-4,4) for x,z in ring]
            faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
            mesh=bpy.data.meshes.new('Arch wedge');mesh.from_pydata(verts,[],faces);mesh.materials.append(stone if i%3 else dark);mesh.update()
            obj=bpy.data.objects.new('Village bridge / arch voussoir',mesh);bpy.context.collection.objects.link(obj);base.append(obj)
            mod=obj.modifiers.new('Stone edge bevel','BEVEL');mod.width=.65;mod.segments=2
    # Long structural joists support transverse planks, with a continuous level walkway.
    for y in (-18,18):block('oak load beam',678,center_y+y,146,7,17,wood,dark,8)
    for i,x in enumerate(range(609,751,9)):
        block('deck plank',x,center_y,8.5,45,20,rim if i%3 else wood,wood,4)
        for y in (-17,17):block('deck iron peg',x,center_y+y,1.8,1.8,20.7,iron,iron,1)
    for side in (-1,1):
        y=center_y+side*25;foreground=side==1
        # Fixed world Y is essential: top and foot share the same upright post.
        wy=position(678,y,20)[1]
        for x in (607,642.5,678,713.5,749):
            before=len(base);block('rail stone foot',x,y,9,8,26,stone,dark,6)
            if foreground:front.extend(base[before:]);del base[before:]
            beam('rail upright',(x-450,wy,24),(x-450,wy,43),5,5,wood,foreground)
            beam('rail iron collar',(x-450,wy,38),(x-450,wy,41),6,6,iron,foreground)
        beam('timber handrail',(603-450,wy,43),(753-450,wy,43),5,5,rim,foreground)
        for x in (607,642.5,678,713.5):
            beam('rail diagonal brace',(x-450,wy,26),(x+35.5-450,wy,39),2.7,3,wood,foreground)
    for obj in base:obj['bridge_layer']='base'
    for obj in front:obj['bridge_layer']='front'
    return base,front
