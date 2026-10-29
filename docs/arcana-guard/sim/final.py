# 아르카나 수비대 밸런스 검증 시뮬레이터 (01_core_mechanics.md 수치 근거)
import math, random, statistics as st, json, sys
DT=0.1
PTS=[(0,1),(7,1),(7,4),(1,4),(1,7),(7,7),(7,10),(4,10),(4,11)]
SEG=[];L=0.0
for a,b in zip(PTS,PTS[1:]):
    l=math.dist(a,b); SEG.append((a,b,L,l)); L+=l
def pos(d):
    d=max(0.0,min(d,L))
    for a,b,s,l in SEG:
        if d<=s+l: t=(d-s)/l; return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)
    return PTS[-1]
SLOTS=[(2,2.5),(4,2.5),(6,2.5),(2,5.5),(4,5.5),(6,5.5),(5,11),(4,8.5),(6,8.5)]
def C():  # config
    return dict(
    cards={
     'W':dict(dmg=[12,18,26,36],per=[1.2,1.2,1.2,1.0],rng=[2.5,2.5,2.5,3.0],tg=[1,1,1,1]),
     'C':dict(dmg=[3,4,5,6],per=[1.0,1.0,1.0,1.0],rng=[2.0,2.0,2.5,2.5],tg=[1,1,1,1],slow=[.30,.35,.40,.45],rad=[.8,.8,1.0,1.2]),
     'S':dict(dmg=[3,4,5,6],per=[0.5,0.5,0.4,0.4],rng=[2.0,2.0,2.5,2.5],tg=[2,2,3,3]),
     'P':dict(dmg=[4,5,6,8],per=[1.5,1.5,1.5,1.5],rng=[2.0,2.0,2.0,2.0],tg=[1,1,1,1],sh=[45,40,35,30]),
    },
    en={'fog':dict(hp=60,spd=1.2,dmg=1,el=0),'wsp':dict(hp=30,spd=2.0,dmg=1,el=0),
        'sil':dict(hp=300,spd=0.7,dmg=2,el=1),'king':dict(hp=3000,spd=0.7,dmg=5,el=1)},
    waves=[[('fog',6,2.6,0)],
           [('fog',8,2.2,0),('wsp',5,3.0,5)],
           [('fog',9,2.0,0),('wsp',6,2.6,3),('sil',2,8,6)],
           [('fog',10,1.8,0),('wsp',7,2.4,2),('sil',3,6,4)],
           [('fog',8,2.0,0),('wsp',5,2.5,2),('sil',1,0,4),('king',1,0,18),('wsp',6,2.5,22)]],
    hpmul=[1.0,2.0,2.8,4.1,4.4],
    start_mana=0,regen_per=5.0,cost_sum=5,cost_up=[4,6,8],rest=5.0,prep=5.0,hp=10,
    shield_cap=2,wand_elite=1.5,buff=0.25,buff_t=10.0,disc=2,ult_cd=20.0,
    boom=300,moon_slow=0.5,moon_t=8.0,star_heal=2,star_sh=1,slow_t=2.0,slow_floor=0.3,p4_heal=1,
    lock=[0,0,0])  # 오답 잠금(초): 1회/2회연속/3회+연속. 기준 플레이어 8초 평균엔 이미 포함.
BUILD=[('S','W',2),('S','S',3),('S','C',8),('S','W',1),('U',2),('S','P',6),('U',3),('S','S',4),
       ('U',2),('U',1),('S','W',5),('U',8),('U',3),('U',2),('U',1),('S','S',0),('U',4),('U',1),
       ('U',5),('U',3),('U',4),('U',5),('U',8),('U',6),('U',4),('U',5),('S','S',7),('U',6),('U',7),('U',6),('U',7),('U',7),('U',8),('U',0),('U',0),('U',0)]
BUILD2=[('S','W',7),('S','S',5),('S','W',4),('S','C',8),('U',7),('S','W',3),('U',4),('S','P',6),('U',5),('U',7),('U',4),
        ('S','S',2),('U',8),('U',3),('U',7),('U',4),('U',5),('U',3),('U',5),('U',8),('S','W',1),('U',2),('U',3),('U',1),
        ('U',2),('U',6),('U',1),('U',2),('U',6),('S','S',0),('U',1),('U',0),('U',0),('U',0),('U',6),('U',8)]
PAT=[1,1,0,1,1,0,1,1,1,0]  # 결정론 기준 플레이어: 10문제 중 7정답
def expand(spec):
    o=[]
    for t,n,iv,s0 in spec: o+=[(s0+i*iv,t) for i in range(n)]
    return sorted(o)
def run(cfg,seed=0,acc=0.7,mean_iv=8.0,mana_q=4,answer=True,reset='half',use_ult=True,guess=None,build=None,det=False):
    build=build or BUILD2
    R=random.Random(seed); p=cfg; CARDS=cfg['cards']; EN=cfg['en']
    mana=p['start_mana']; hp=p['hp']; shield=0; towers={}
    gauge=0; streak=0; maxstreak=0; disc=False; buff_until=-1.0; ticket=0; ult_ready=0.0
    S=dict(correct=0,wrong=0,ults=0,earned=0,regen=0,c3=0,c5=0,c8=0,wl=[],wdur=[],wstart=[],wmana=[],wdps=[],whp=[],wdmg=[],boss=None,absorbed=0,healed=0)
    bi=0; t=0.0; racc=0.0; wrong_run=0
    def next_q():
        if guess: return guess[0]+(p['lock'][min(wrong_run,len(p['lock']))-1] if wrong_run else 0)
        if det: return mean_iv
        return R.uniform(mean_iv*0.5,mean_iv*1.5)
    qt=next_q()
    def spend():
        nonlocal mana,bi,disc
        while bi<len(build):
            a=build[bi]
            if a[0]=='S':
                if a[2] in towers: bi+=1; continue
                c=p['cost_sum']-(p['disc'] if disc else 0)
                if mana<c: return
                mana-=c; disc=False; towers[a[2]]=[a[1],0,0.0,0.0]; bi+=1
            else:
                tw=towers.get(a[1])
                if not tw or tw[1]>=3: bi+=1; continue
                c=p['cost_up'][tw[1]]
                if mana<c: return
                mana-=c; tw[1]+=1; bi+=1
    def tick_player():
        nonlocal qt,mana,gauge,streak,maxstreak,disc,buff_until,ticket,wrong_run,racc
        racc+=DT
        if racc>=p['regen_per']-1e-9: racc=0.0; mana+=1; S['regen']+=1
        if not answer: return
        qt-=DT
        if qt>1e-9: return
        ok=(PAT[(S['correct']+S['wrong'])%10]==1) if det else R.random()<(guess[1] if guess else acc)
        if ok:
            mana+=mana_q; S['earned']+=mana_q; S['correct']+=1; gauge+=1; streak+=1; maxstreak=max(maxstreak,streak); wrong_run=0
            if gauge==3: disc=True; S['c3']+=1
            if gauge==5: buff_until=t+p['buff_t']; S['c5']+=1
            if gauge>=8:
                S['c8']+=1; gauge=0
                if ticket==0: ticket=1
                else: mana+=5
        else:
            S['wrong']+=1; streak=0; wrong_run+=1
            gauge = gauge//2 if reset=='half' else 0
        qt=next_q()
    def nom():
        return sum(CARDS[a][ 'dmg'][l]/CARDS[a]['per'][l]*CARDS[a]['tg'][l] for a,l,_,_ in towers.values())
    while t<p['prep']-1e-9: tick_player(); spend(); t+=DT
    for wi,spec in enumerate(p['waves']):
        sched=expand(spec); enemies=[]; wt=0.0; leak=0; dealt=0.0
        S['wstart'].append(t); S['wmana'].append(p['start_mana']+S['earned']+S['regen']); S['wdps'].append(nom())
        S['whp'].append(sum(EN[ty]['hp']*(1 if ty=='king' else p['hpmul'][wi]) for _,ty in sched))
        while sched or enemies:
            while sched and sched[0][0]<=wt+1e-9:
                _,ty=sched.pop(0); e=EN[ty]; m=1 if ty=='king' else p['hpmul'][wi]
                enemies.append(dict(ty=ty,hp=e['hp']*m,mx=e['hp']*m,d=0.0,slow=0.0,st=0.0,spd=e['spd'],dmg=e['dmg'],el=e['el'],ms=0.0))
            tick_player(); spend()
            if use_ult and ticket and t>=ult_ready and enemies:
                ch=None
                if hp<=5: ch='star'
                elif len(enemies)>=8 or any(e['ty']=='king' for e in enemies): ch='sun'
                if ch:
                    ticket=0; ult_ready=t+p['ult_cd']; S['ults']+=1
                    if ch=='star': hp=min(p['hp'],hp+p['star_heal']); shield=min(p['shield_cap'],shield+p['star_sh'])
                    else:
                        for e in enemies: e['hp']-=p['boom']
            mul=1+(p['buff'] if t<buff_until else 0)
            for s,tw in towers.items():
                ty,lv=tw[0],tw[1]; c=CARDS[ty]
                if ty=='P':
                    tw[3]+=DT
                    if tw[3]>=c['sh'][lv]-1e-9: tw[3]=0.0; shield=min(p['shield_cap'],shield+1)
                tw[2]-=DT
                if tw[2]>1e-9: continue
                sp=SLOTS[s]
                inr=[e for e in enemies if e['hp']>0 and math.dist(pos(e['d']),sp)<=c['rng'][lv]]
                if not inr: tw[2]=0.0; continue
                inr.sort(key=lambda e:-e['d'])
                for e in inr[:c['tg'][lv]]:
                    dm=c['dmg'][lv]*mul*(p['wand_elite'] if ty=='W' and e['el'] else 1)
                    dealt+=min(dm,max(e['hp'],0)); e['hp']-=dm
                    if ty=='C':
                        ep=pos(e['d'])
                        for o in enemies:
                            if math.dist(pos(o['d']),ep)<=c['rad'][lv]:
                                o['slow']=max(o['slow'] if o['st']>0 else 0,c['slow'][lv]); o['st']=p['slow_t']
                tw[2]=c['per'][lv]
            nxt=[]
            for e in enemies:
                if e['hp']<=0:
                    if e['ty']=='king': S['boss']=('dead',e['d']/L)
                    continue
                sl=e['slow'] if e['st']>0 else 0.0; e['st']-=DT
                e['d']+=e['spd']*max(p['slow_floor'],1-sl)*DT
                if e['d']>=L:
                    if e['ty']=='king': S['boss']=('reach',e['hp']/e['mx'])
                    a=min(shield,e['dmg']); shield-=a; hp-=e['dmg']-a; leak+=e['dmg']; S['absorbed']+=a
                    if hp<=0:
                        S['wl'].append(leak); S['wdur'].append(wt); S['wdmg'].append(dealt)
                        return dict(win=False,hp=0,wave=wi+1,t=t,maxstreak=maxstreak,towers=towers,**S)
                    continue
                nxt.append(e)
            enemies=nxt; t+=DT; wt+=DT
        S['wl'].append(leak); S['wdur'].append(wt); S['wdmg'].append(dealt)
        if any(tw[0]=='P' and tw[1]==3 for tw in towers.values()) and hp<p['hp']: hp+=p['p4_heal']; S['healed']+=1
        if wi<len(p['waves'])-1:
            e_end=t+p['rest']
            while t<e_end-1e-9: tick_player(); spend(); t+=DT
    return dict(win=True,hp=hp,wave=5,t=t,maxstreak=maxstreak,towers=towers,**S)
def summary(cfg,n=200,**kw):
    rs=[run(cfg,seed=i,**kw) for i in range(n)]
    hp=sorted(r['hp'] for r in rs); wins=[r for r in rs if r['win']]; wh=sorted(r['hp'] for r in wins)
    out=dict(win=round(len(wins)/n,3),hp_q10_25_50_75_90=[hp[int(n*q)] for q in (.1,.25,.5,.75,.9)],
        win_hp_med=wh[len(wh)//2] if wh else None, win_hp_q25_75=[wh[len(wh)//4],wh[3*len(wh)//4]] if wh else None,
        t=round(st.mean(r['t'] for r in wins),1) if wins else None,
        fail_wave=[sum(1 for r in rs if not r['win'] and r['wave']==w) for w in range(1,6)],
        ults=round(st.mean(r['ults'] for r in rs),2),c3=round(st.mean(r['c3'] for r in rs),2),c5=round(st.mean(r['c5'] for r in rs),2),c8=round(st.mean(r['c8'] for r in rs),2),
        absorbed=round(st.mean(r['absorbed'] for r in rs),2),maxstreak=round(st.mean(r['maxstreak'] for r in rs),1),
        correct=round(st.mean(r['correct'] for r in rs),1))
    b=[r['boss'] for r in rs if r['boss']]
    if b: out['boss_dead']=f"{sum(1 for x in b if x[0]=='dead')}/{len(b)}"; out['boss_dead_at_med']=round(st.median([x[1] for x in b if x[0]=='dead']),2) if any(x[0]=='dead' for x in b) else None
    waves=[]
    for w in range(5):
        sub=[r for r in rs if len(r['wl'])>w]
        if not sub: break
        f=lambda k: round(st.mean(r[k][w] for r in sub),1)
        waves.append(dict(w=w+1,n=len(sub),start=f('wstart'),dur=f('wdur'),cum_mana=f('wmana'),nomDPS=f('wdps'),waveHP=f('whp'),dealt=f('wdmg'),leak=round(st.mean(r['wl'][w] for r in sub),2)))
    out['waves']=waves
    return out
IDLE_BUILDS={'W':[('S','W',s) for s in (2,3,8,1,4,5,0)],'S':[('S','S',s) for s in (2,3,8,1,4,5,0)],
    'WS':[('S','W',2),('S','S',3),('S','W',8),('S','S',1),('S','W',4),('S','S',5)],
    'WC':[('S','W',2),('S','C',3),('S','W',8),('S','W',1),('S','W',4)],
    'WWU':[('S','W',2),('S','W',3),('U',2),('U',3),('S','W',8)],
    'SSU':[('S','S',2),('S','S',3),('U',2),('U',3),('S','S',8)],
    'PW':[('S','P',6),('S','W',2),('S','W',3),('S','W',8)],
    'PP':[('S','P',6),('S','W',2),('S','P',5),('S','W',3)]}
def idle(cfg):
    out={}
    for k,b in IDLE_BUILDS.items():
        r=run(cfg,answer=False,build=b); out[k]=dict(wave=r['wave'],leaks=r['wl'],hp=r['hp'],absorbed=r['absorbed'])
    return out
if __name__=='__main__':
    cfg=C(); mode=sys.argv[1] if len(sys.argv)>1 else 'target'
    if len(sys.argv)>2:
        for k,v in json.loads(sys.argv[2]).items(): cfg[k]=v
    if mode=='target': print(json.dumps(summary(cfg,n=int(sys.argv[3]) if len(sys.argv)>3 else 200),ensure_ascii=False,indent=0))
    elif mode=='idle': print(json.dumps(idle(cfg),ensure_ascii=False))
