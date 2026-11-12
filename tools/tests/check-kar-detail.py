"""Check the authored Kar variant against its source GLB without requiring WebGL."""
import json, struct, pathlib, hashlib
R=pathlib.Path(__file__).resolve().parents[2];OUT=R/'art-source/defense/kar-detail-20261111';SRC=R/'art-source/defense/model-bridge-20261110/models/frontier-kar-game.glb'
def read(path):
 b=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',b);assert magic==b'glTF' and version==2 and total==len(b)
 n,k=struct.unpack_from('<I4s',b,12);assert k==b'JSON';d=json.loads(b[20:20+n]);offset=20+n;size,k=struct.unpack_from('<I4s',b,offset);assert k==b'BIN\0';return d,b[offset+8:offset+8+size]
def payload(doc,blob,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];components={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];assert a['componentType']==5126;size=4*components;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);return b''.join(blob[start+i*stride:start+i*stride+size] for i in range(a['count']))
a,ab=read(SRC);b,bb=read(OUT/'kar-detail.glb');assert len(a['animations'])==len(b['animations'])==19
for x,y in zip(a['animations'],b['animations']):
 assert x['name']==y['name'] and len(x['samplers'])==len(y['samplers']) and len(x['channels'])==len(y['channels'])
 for xs,ys in zip(x['samplers'],y['samplers']):
  assert xs.get('interpolation','LINEAR')==ys.get('interpolation','LINEAR')
  for k in ('input','output'):assert payload(a,ab,xs[k])==payload(b,bb,ys[k]),(x['name'],k)
 for xc,yc in zip(x['channels'],y['channels']):assert (a['nodes'][xc['target']['node']]['name'],xc['target']['path'])==(b['nodes'][yc['target']['node']]['name'],yc['target']['path'])
assert len(a['meshes'])==len(b['meshes'])==13
manifest=json.loads((OUT/'manifest.json').read_text())
for name,info in manifest['outputs'].items():
 data=(OUT/name).read_bytes();assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256']
assert (OUT/'before.png').read_bytes()!=(OUT/'after.png').read_bytes()
print('PASS: 19 clip curves/timings and targets match, 13 meshes retained, output hashes and comparison render checked')
