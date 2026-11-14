const {chromium}=require('playwright');
const d=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
let seed=Number(process.argv[2]||7);const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const c=await b.newContext({viewport:{width:390,height:780}});const p=await c.newPage();
 const bugs={},bug=(k,ex)=>{(bugs[k]=bugs[k]||[]).length<3&&bugs[k].push(ex)};let last='';
 p.on('pageerror',e=>bug('script error: '+e.message.slice(0,90),last));
 p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))bug('console error: '+m.text().slice(0,90),last)});
 p.on('response',r=>{const u=r.url().replace('http://127.0.0.1:8799','');if(u.startsWith('/api/')&&r.status()>=500)bug('server error '+r.status()+' on '+r.request().method()+' '+u.split('?')[0].replace(/[0-9a-f-]{20,}/,':id'),last);
   if(u.startsWith('/api/')&&r.status()>=400&&r.status()<500&&![401,404,422,429].includes(r.status())&&!/scan|chat|meals|pic/.test(u))bug('rejected '+r.status()+' on '+r.request().method()+' '+u.split('?')[0].replace(/[0-9a-f-]{20,}/,':id'),last)});
 await p.route('**/api/chat',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({heard:'',reply:'You have some.',changes:[],missed:[],proposal:[]})}));
 await p.route('**/api/scan/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({kind:'text',heard:'',store:'',bought:'',currency:'',actions:[{action:'add',name:'Lemons',quantity:3,sure:rnd()<.5,unit:'pcs',area:'Kitchen',category:'Produce',expiry:'',shelfLifeDays:14,finishDays:10,price:2,warn:''}]})}));
 await p.route('**/api/meals',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({meals:[{name:'Lemon rice',why:'Uses the rice',uses:['Rice'],missing:[],minutes:20}]})}));
 await p.goto('http://127.0.0.1:8799/');await p.fill('#who','Sush');await p.fill('#pin','test1234');await p.click('#gateForm button');await p.waitForTimeout(900);await p.click('#profSkip').catch(()=>{});
 const A=(name,q,unit,area,cat,exp,fin)=>({action:'add',name,quantity:q,unit,area,category:cat,expiry:exp||'',shelfLifeDays:exp?0:300,finishDays:fin||30,price:3});
 await p.evaluate(async a=>{const h={'content-type':'application/json'};await fetch('/api/apply',{method:'POST',credentials:'same-origin',headers:h,body:JSON.stringify({source:'bill',store:'Shop',bought:new Date(Date.now()-7*864e5).toISOString().slice(0,10),actions:a})});
   await fetch('/api/profile',{method:'POST',credentials:'same-origin',headers:h,body:JSON.stringify({personas:['couple'],adults:2,kids:0,allergies:['Peanuts'],members:[{name:'Maya',kind:'teen',when:'weekends',rules:['Celiac']}],shopDay:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()],budget:500})});
   for(const t of ['Coffee','Foil'])await fetch('/api/extras',{method:'POST',credentials:'same-origin',headers:h,body:JSON.stringify({text:t})})},
   [A('Baby Spinach',1,'pack','Kitchen','Produce',d(0)),A('Greek Yogurt',2,'pcs','Kitchen','Dairy',d(-1)),A('Whole Milk',1,'L','Kitchen','Dairy',d(5)),A('Rice',1,'kg','Kitchen','Pantry'),A('Cat Litter',1,'pcs','Pets','Pet care','',5),A('Toothpaste',1,'pcs','Bathroom','Dental'),A('Ibuprofen',1,'pack','Health','Medicine',d(200)),A('Diapers',1,'pack','Kids','Diapering','',6),A('Eggs',12,'pcs','Kitchen','Dairy',d(12))]);
 await p.reload();await p.waitForTimeout(1000);
 const N=Number(process.argv[3]||320);let done=0;
 for(let i=0;i<N;i++){
   const st=await p.evaluate(()=>({gate:!document.querySelector('#gate').hidden,busy:!document.querySelector('#busy').hidden,dlgs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
   if(st.gate){bug('fell back to the sign-in screen',last);break}
   if(st.sw>st.cw+1)bug('page scrolls sideways ('+st.sw+' > '+st.cw+')',last);
   if(st.dlgs.length>2)bug('more than two sheets stacked: '+st.dlgs.join(','),last);
   if(st.busy){await p.waitForTimeout(1500);if(await p.evaluate(()=>!document.querySelector('#busy').hidden)){bug('loading overlay stuck',last);await p.evaluate(()=>{document.querySelector('#busy').hidden=true})}continue}
   const r=rnd();
   if(r<0.06){await p.goBack().catch(()=>{});last='browser back';await p.waitForTimeout(150);if(!p.url().startsWith('http://127.0.0.1:8799')){bug('back button left the app',last);await p.goForward().catch(()=>{});await p.waitForTimeout(500)}continue}
   if(r<0.09){await p.keyboard.press('Escape');last='Escape';continue}
   const list=await p.evaluate(()=>{const top=[...document.querySelectorAll('dialog[open]')].pop();const root=top?[top]:[document.querySelector('#app'),document.querySelector('#tabbar')];let n=0;const out=[];
     document.querySelectorAll('[data-m]').forEach(x=>x.removeAttribute('data-m'));
     root.forEach(r=>r.querySelectorAll('button,input,select,summary').forEach(x=>{const b=x.getBoundingClientRect();if(b.width&&b.height&&x.offsetParent!==null&&!x.disabled&&!x.closest('dialog:not([open])')){x.setAttribute('data-m',n);out.push({i:n++,tag:x.tagName,type:x.type||'',id:x.id,label:(x.textContent||x.getAttribute('aria-label')||x.placeholder||'').trim().slice(0,30)})}}));return out});
   if(!list.length){await p.keyboard.press('Escape');continue}
   const info=list[Math.floor(rnd()*list.length)],e=p.locator('[data-m="'+info.i+'"]').first();
   if(/lockBtn|capShelf|capBill|capCode|capVoice|chatMic|copyLink|recStop|recCancel/.test(info.id)||/Lock|Copy link|Order|Amazon|Instacart|Walmart/i.test(info.label))continue;
   last=(st.dlgs.slice(-1)[0]||'page')+' > '+info.tag.toLowerCase()+(info.id?'#'+info.id:'')+' "'+info.label+'"';
   try{if(info.tag==='INPUT'&&info.type!=='checkbox'&&info.type!=='file'){await e.fill(info.type==='number'?String(Math.floor(rnd()*9)-2):['milk','  ','<b>x</b>','eggs 😀','a'.repeat(70),'0'][Math.floor(rnd()*6)],{timeout:1500});if(rnd()<0.5)await p.keyboard.press('Enter')}
     else if(info.tag==='SELECT'){const o=await e.evaluate(x=>[...x.options].map(y=>y.value));if(o.length)await e.selectOption(o[Math.floor(rnd()*o.length)],{timeout:1500})}
     else if(info.type==='file'){continue}
     else await e.click({timeout:1500})}catch(err){if(!/Timeout|intercepts|detached|not attached|not visible|outside/.test(String(err)))bug('tap failed: '+String(err).slice(0,80),last)}
   done++;if(done%50===0)console.log('  ...'+done+' actions');await p.waitForTimeout(60)}
 const end=await p.evaluate(async()=>{const d=await fetch('/api/items',{credentials:'same-origin'}).then(r=>r.ok?r.json():null);if(!d)return null;return {items:d.items.length,blank:d.items.filter(i=>!String(i.name).trim()).length,neg:d.items.filter(i=>i.qty<0||!isFinite(i.qty)).length,dupes:d.items.length-new Set(d.items.map(i=>i.name.toLowerCase())).size,extras:d.extras.length,blankExtras:d.extras.filter(x=>!String(x.text).trim()).length,markup:d.extras.filter(x=>/[<>]/.test(x.text)).length+d.items.filter(i=>/[<>]/.test(i.name+(i.note||''))).length}});
 if(end){if(end.blank||end.blankExtras)bug('blank names were saved',JSON.stringify(end));if(end.neg)bug('negative or broken quantity saved',JSON.stringify(end));if(end.dupes)bug('duplicate items created',JSON.stringify(end));if(end.markup)bug('markup characters were saved',JSON.stringify(end))}
 console.log('seed '+process.argv[2]+': '+done+' actions, data at end '+JSON.stringify(end));
 for(const [k,v] of Object.entries(bugs))console.log('  BUG '+k+'\n      after: '+v.join('\n      after: '));
 if(!Object.keys(bugs).length)console.log('  no bugs found');
 await b.close()})();
