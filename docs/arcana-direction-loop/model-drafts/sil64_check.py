"""64px grayscale silhouette check for defense monster sprites (direction loop, cycle 30).

Usage: python3 sil64_check.py --dev <checkout of the dev integration branch> [--out sheet.png] [name=path ...]
Each sprite is cropped to its alpha box, fitted into 60px, bottom-aligned in a 64x64 cell.
A 1152x384 baked atlas uses its first frame (walk-a). Extra name=path pairs add candidates.
For every pair it prints the silhouette overlap (IoU of alpha masks), the mean gray value and the
gray spread (surface contrast) inside the mask. Provisional pass rule: a pair is distinct if
IoU < 0.65, or mean gray differs by >= 30, or gray spread differs by >= 12.
Requires Pillow and NumPy. Reads files only.
"""
import argparse, itertools
from pathlib import Path
from PIL import Image, ImageOps
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--dev',required=True);p.add_argument('--out');p.add_argument('extra',nargs='*')
a=p.parse_args();dev=Path(a.dev)
def load(path):
    img=Image.open(path).convert('RGBA')
    return img.crop((0,0,img.height,img.height)) if img.size==(1152,384) else img
src={}
for k,f in (('slime','insulator-slime'),('stone','stone-golem'),('wood','wood-soldier'),('ice','ice-knight'),('wolf','frost-wolf')):
    f=dev/'public/defense/models'/f'{f}-atlas.webp'
    if f.exists():src[k]=load(f)
atlas=Image.open(dev/'public/defense/atlas.png').convert('RGBA')
for k,(x,y,w,h) in (('sprout*',(40,690,245,210)),('metal*',(20,940,280,250))):src[k]=atlas.crop((x,y,x+w,y+h))
for item in a.extra:
    name,path=item.split('=',1);src[name]=load(path)
def fit(img):
    bb=img.getchannel('A').point(lambda v:255 if v>127 else 0).getbbox();img=img.crop(bb)
    s=60/max(img.size);img=img.resize((max(1,round(img.width*s)),max(1,round(img.height*s))),Image.LANCZOS)
    c=Image.new('RGBA',(64,64),(0,0,0,0));c.paste(img,((64-img.width)//2,62-img.height),img);return c
S={k:fit(v) for k,v in src.items()}
M={k:np.array(v.getchannel('A'))>127 for k,v in S.items()}
G={k:np.array(ImageOps.grayscale(v.convert('RGB')),dtype=float) for k,v in S.items()}
stat={k:(G[k][M[k]].mean(),G[k][M[k]].std()) for k in S}
for k,(m,sd) in stat.items():print(f'{k:12s} mean gray {m:5.0f}  spread {sd:4.0f}')
print('* = illustrated atlas.png cell (no baked model yet)')
rows=[]
for x,y in itertools.combinations(S,2):
    iou=(M[x]&M[y]).sum()/(M[x]|M[y]).sum();dg=abs(stat[x][0]-stat[y][0]);ds=abs(stat[x][1]-stat[y][1])
    rows.append((iou,x,y,dg,ds,iou<.65 or dg>=30 or ds>=12))
for iou,x,y,dg,ds,ok in sorted(rows,reverse=True):print(f'{x:12s} {y:12s} IoU {iou:.2f}  gray diff {dg:4.0f}  spread diff {ds:4.0f}  {"distinct" if ok else "CONFUSABLE"}')
if a.out:
    sheet=Image.new('RGB',(72*len(S),144),(255,255,255))
    for i,(k,v) in enumerate(S.items()):
        bg=Image.new('RGBA',(64,64),(255,255,255,255));bg.alpha_composite(v)
        sheet.paste(ImageOps.grayscale(bg.convert('RGB')).convert('RGB'),(i*72+4,4))
        sheet.paste(Image.fromarray((~M[k]*255).astype('uint8')).convert('RGB'),(i*72+4,76))
    sheet.save(a.out)
