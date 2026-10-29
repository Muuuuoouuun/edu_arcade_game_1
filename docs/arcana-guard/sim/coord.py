import final, idle_hc, random, time, json
def cfgf():
    c=final.C(); c['regen_per']=10.0; c['lock']=[2,3,4,5]; c['hpmul']=[1.0,1.6,2.4,3.4,5.0]; return c
if __name__=="__main__":
  pass
c=cfgf(); r=final.run(c,det=True)
print('DET',r['win'],r['hp'],r['wave'],round(r['t'],1),r['wl'],'abs',r['absorbed'],r['boss'],'mana',r['wmana'],'nom',[round(x) for x in r['wdps']],'whp',r['whp'],'dur',[round(x,1) for x in r['wdur']],'start',[round(x,1) for x in r['wstart']])
s=final.summary(c,n=150); w=s.pop('waves'); print('MC',s); [print(' ',x) for x in w]
for g in (1.0,1.5):
    s=final.summary(c,n=80,guess=(g,0.25)); print('guess',g,s['win'],s['fail_wave'])
print('idle',{k:(v['wave'],v['leaks']) for k,v in final.idle(c).items()})
R=random.Random(3); n=0; surv=0; t0=time.time()
while time.time()-t0<15:
    b=[]
    for sl in R.sample(range(9),R.choice([2,3])): b.append(('S',R.choice('WCSP'),sl))
    rr=final.run(c,answer=False,build=b); n+=1; surv+= rr['wave']>2
print('idle random',n,'survW2',surv,'hc',idle_hc.search(c,secs=15)[0])
