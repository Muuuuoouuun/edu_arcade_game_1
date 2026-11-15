"""Validate the actual exported human guard GLB, without Blender or extra packages.

Checks clip timing/loops, static weapon attachment, root stability, feet above
ground at 60 Hz, and maximum spear reach at the authored contact frame.
"""
import bisect
import copy
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/defense/prototypes/human-guard'
raw=(SOURCE/'human-guard.glb').read_bytes()
magic,version,total=struct.unpack_from('<III',raw)
assert magic==0x46546C67 and version==2 and total==len(raw)
offset=12;document=None;binary=None
while offset<len(raw):
    size,kind=struct.unpack_from('<II',raw,offset)
    chunk=raw[offset+8:offset+8+size]
    if kind==0x4E4F534A:document=json.loads(chunk)
    if kind==0x004E4942:binary=chunk
    offset+=8+size
assert document and binary
g=document
formats={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def accessor(index):
    a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
    fmt='<'+formats[a['componentType']]*sizes[a['type']]
    stride=v.get('byteStride',struct.calcsize(fmt))
    base=v.get('byteOffset',0)+a.get('byteOffset',0)
    result=[struct.unpack_from(fmt,binary,base+i*stride) for i in range(a['count'])]
    assert all(math.isfinite(x) for item in result for x in item)
    return result

IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def multiply(a,b):
    return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]

def local(node):
    if 'matrix' in node:return [node['matrix'][c*4+r] for r in range(4) for c in range(4)]
    x,y,z,w=node.get('rotation',[0,0,0,1]);sx,sy,sz=node.get('scale',[1,1,1]);tx,ty,tz=node.get('translation',[0,0,0])
    return [(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx,
            (2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty,
            (2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz,0,0,0,1]

parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])}
names={n.get('name'):i for i,n in enumerate(g['nodes'])}
assert all(name in names for name in ['human-guard','guard-body','guard-spear-arm','guard-shield-arm','guard-spear','guard-shield','guard-leg-left','guard-leg-right'])

def descendants(index):
    result={index}
    for child in g['nodes'][index].get('children',[]):result.update(descendants(child))
    return result

assert names['guard-spear'] in descendants(names['guard-spear-arm'])
assert names['guard-shield'] in descendants(names['guard-shield-arm'])
weapons=descendants(names['guard-spear'])|descendants(names['guard-shield'])
feet=descendants(names['guard-leg-left'])|descendants(names['guard-leg-right'])
vertices={i:[p for primitive in g['meshes'][n['mesh']]['primitives'] for p in accessor(primitive['attributes']['POSITION'])] for i,n in enumerate(g['nodes']) if 'mesh' in n}

def quaternion(a,b,t):
    dot=sum(x*y for x,y in zip(a,b))
    if dot<0:b=[-x for x in b];dot=-dot
    if dot>.9995:
        q=[x+(y-x)*t for x,y in zip(a,b)];norm=math.sqrt(sum(x*x for x in q));return [x/norm for x in q]
    angle=math.acos(max(-1,min(1,dot)));den=math.sin(angle)
    return [(x*math.sin((1-t)*angle)+y*math.sin(t*angle))/den for x,y in zip(a,b)]

def animation_state(clip,t):
    nodes=copy.deepcopy(g['nodes'])
    for channel in clip['channels']:
        sampler=clip['samplers'][channel['sampler']]
        times=[x[0] for x in accessor(sampler['input'])];values=accessor(sampler['output'])
        idx=max(0,min(len(times)-2,bisect.bisect_right(times,t)-1))
        if len(times)==1:value=values[0]
        elif t>=times[-1]:value=values[-1]
        else:
            amount=max(0,min(1,(t-times[idx])/(times[idx+1]-times[idx])))
            assert sampler.get('interpolation','LINEAR') in ['LINEAR','STEP']
            if sampler.get('interpolation')=='STEP':value=values[idx]
            elif channel['target']['path']=='rotation':value=quaternion(values[idx],values[idx+1],amount)
            else:value=[a+(b-a)*amount for a,b in zip(values[idx],values[idx+1])]
        nodes[channel['target']['node']][channel['target']['path']]=value
    matrices={}
    def world(index):
        if index not in matrices:matrices[index]=multiply(world(parents[index]),local(nodes[index])) if index in parents else local(nodes[index])
        return matrices[index]
    for index in range(len(nodes)):world(index)
    return matrices

def bounds(matrices,selected=None):
    selected=set(vertices) if selected is None else selected
    low=[math.inf]*3;high=[-math.inf]*3
    for index in selected:
        if index not in vertices:continue
        m=matrices[index]
        for p in vertices[index]:
            for axis in range(3):
                v=sum(m[axis*4+j]*p[j] for j in range(3))+m[axis*4+3]
                low[axis]=min(low[axis],v);high[axis]=max(high[axis],v)
    return low,high

clips={a['name']:a for a in g['animations']}
expected={'human-guard-idle':2,'human-guard-walk':.8,'human-guard-thrust':1}
assert set(clips)==set(expected),set(clips)
rest=animation_state(clips['human-guard-idle'],0)
rest_bounds=bounds(rest)
assert abs(rest_bounds[0][1])<.0001,rest_bounds
results=[]
for name,duration in expected.items():
    clip=clips[name]
    maximum=max(accessor(s['input'])[-1][0] for s in clip['samplers'])
    assert abs(maximum-duration)<1e-5,(name,maximum)
    for channel in clip['channels']:
        assert channel['target']['node'] not in weapons,'Weapon attachment animated independently'
        assert channel['target']['node']!=names['human-guard'],'Root motion is prohibited'
    first=animation_state(clip,0);last=animation_state(clip,duration)
    assert max(abs(a-b) for index in first for a,b in zip(first[index],last[index]))<1e-4,(name,'not loop/reset')
    minimum=math.inf;reach=[]
    for frame in range(round(duration*60)+1):
        t=frame/60
        mats=animation_state(clip,t)
        minimum=min(minimum,bounds(mats,feet)[0][1])
        if name=='human-guard-thrust':reach.append((t,-bounds(mats,descendants(names['guard-spear']))[0][2]))
    assert minimum>=-.0001,(name,minimum)
    item={'clip':name,'duration_seconds':duration,'minimum_feet_y':round(minimum,7),'loop_or_restored':True}
    if reach:
        time,distance=max(reach,key=lambda x:x[1])
        assert abs(time-.4)<=1/60+.0001,('Unexpected contact reach',time)
        item.update({'peak_forward_reach_seconds':time,'peak_forward_reach':round(distance,6)})
    results.append(item)
manifest=json.loads((SOURCE/'manifest.json').read_text())
for file,info in manifest['files'].items():assert hashlib.sha256((SOURCE/file).read_bytes()).hexdigest()==info['sha256'],file
for ext in ['glb','png']:
    assert (SOURCE/f'human-guard.{ext}').read_bytes()==(ROOT/f'public/defense/models/prototypes/human-guard.{ext}').read_bytes()
report={'asset':'human-guard','status':'passed','clips':results,'rest_bounds':rest_bounds,'runtime':manifest['runtime'],'scope':'GLB kinematics at 60 Hz and integrity; not collision or actual mobile rendering verification'}
print(json.dumps(report,ensure_ascii=False,indent=2))
