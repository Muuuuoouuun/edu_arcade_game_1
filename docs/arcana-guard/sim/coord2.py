import final,sys
def cfgf(k,esc):
    c=final.C(); c['regen_per']=10.0; c['lock']=[2,3,4,5]; c['hpmul']=[1.0,1.6,2.4,3.4,5.0]; c['en']['king']['hp']=k
    if esc is not None: c['waves'][4]=[('fog',8,2.0,0),('wsp',5,2.5,2),('sil',1,0,4),('king',1,0,18),('wsp',esc,2.5,22)]
    return c
for k,esc in [(2000,6),(2000,3),(1600,6)]:
    c=cfgf(k,esc); r=final.run(c,det=True); s=final.summary(c,n=100)
    print(k,esc,'DET hp',r['hp'],r['wl'],r['boss'],round(r['t']),'| MC win',s['win'],s['hp_q10_25_50_75_90'],'winmed',s['win_hp_med'],'boss',s.get('boss_dead'),'t',s['t'],'leak',[w['leak'] for w in s['waves']])
