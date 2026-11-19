(function(){
  var DAY=86400000,UNITS=['pcs','pack','g','kg','ml','L','lb','oz'];
  var CAT={Produce:[135,'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-5 6-8 10-10'],Dairy:[205,'M9 3h6v3l2 4v11H7V10l2-4zM7 14h10'],
    Bakery:[35,'M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4c0 1-1 2-2 2v6H6v-6c-1 0-2-1-2-2z'],Meat:[355,'M14 4a6 6 0 0 1 4 10l-5 5a3 3 0 0 1-4 0l-4-4a3 3 0 0 1 0-4zM8 16l-3 3'],
    Frozen:[190,'M12 3v18M4 7l16 10M20 7L4 17'],Pantry:[45,'M8 3h8v3H8zM7 6h10l1 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z'],Drinks:[265,'M7 4h10l-1 16H8zM7 9h10'],
    Snacks:[20,'M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5zM9 12h.01M13 16h.01M9 16h.01'],Household:[230,'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z'],
    Other:[160,'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8']};
  var AREA={Kitchen:[45,CAT.Pantry[1]],Bathroom:[200,'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z'],Cleaning:[230,'M9 9h5v12H9zM9 9V6h4l3-2M16 7h2'],
    Kids:[330,'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0'],Pets:[25,'M12 13c-2.5 0-4.5 2-4.5 4.2 0 1.3 1 2.3 2.3 2.3.8 0 1.5-.5 2.2-.5s1.4.5 2.2.5c1.3 0 2.3-1 2.3-2.3C16.5 15 14.5 13 12 13zM7 9.5h.01M10 6h.01M14 6h.01M17 9.5h.01'],
    Health:[355,'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z'],Home:[160,'M4 11l8-7 8 7v9H4z']};
  function areaOf(o){return AREA[o.area]?o.area:'Kitchen'}
  /* pictures: the icon shows first; a generated picture fades in over it when ready. At most three load at once. */
  var picQ=[],picBusy=0,picBad={};
  function picNext(){while(picBusy<3&&picQ.length){var j=picQ.shift();if(!j.img.isConnected)continue;picBusy++;j.img.src=j.url}}
  function picFor(span,name){
    if(!name||picBad[name])return;var img=new Image();img.alt='';img.decoding='async';
    function fin(){picBusy--;picNext()}
    img.onload=function(){img.className='on';fin()};img.onerror=function(){picBad[name]=1;img.remove();fin()};
    span.append(img);picQ.push({img:img,url:'/api/pic?name='+encodeURIComponent(name)});setTimeout(picNext,0);
  }
  function iconFor(o){var a=areaOf(o),c=a==='Kitchen'?(CAT[o.category]||CAT.Pantry):AREA[a],b=el('span','ico');b.style.setProperty('--h',c[0]);b.append(icon(c[1]));
    if(o.name){b.className='ico pic';picFor(b,o.name)}return b}
  /* household profiles: a persona sets sensible defaults, then people, diet and allergies refine it */
  var PERSONA={mom:['Busy mom','Kids, school runs, no spare time',2,3,[],'home'],dadbusy:['Busy dad','Kids, school runs, no spare time',2,3,[],'home'],dad:['Single dad','One adult running the whole house',1,2,[],'home'],momsolo:['Single mom','One adult running the whole house',1,2,[],'home'],
    family4:['Family of four','Two adults, two kids',2,2,[],'home'],big:['Big family','Five or more at the table',2,4,[],'home'],
    newparents:['New parents','A baby and no sleep',2,1,[],'home'],couple:['Couple','Two of you',2,0,[],'home'],
    solo:['Living solo','Just you',1,0,[],'home'],roommates:['Roommates','Shared kitchen, shared staples',3,0,[],'home'],
    empty:['Empty nesters','Kids grown, or retired',2,0,[],'home'],carer:['Caring for a parent','An older adult at home',2,0,[],'home'],
    student:['College student','Small budget, small kitchen',0,0,[],'style'],pro:['Busy professional','No time to cook',0,0,[],'style'],
    gym:['Gym bro','Lifting, protein, repeat',0,0,['High protein'],'style'],fit:['Fitness freak','Training hard, eating clean',0,0,['High protein'],'style'],
    vegan:['Vegan','A plant-based home',0,0,['Vegan'],'style'],host:['Host','Loves to cook for people',0,0,[],'style'],
    petparent:['Pet parent','Fur comes first',0,0,[],'style'],other:['Something else','Set it up your own way',0,0,[],'style']};
  var STARTER={mom:['Milk','Eggs','Bread','Fruit for lunchboxes','Lunchbox snacks','Yogurt','Diapers','Baby wipes','Kids fever medicine','Laundry detergent','Dish soap','Toilet paper'],
    dad:['Milk','Eggs','Bread','Cereal','Pasta','Pasta sauce','Chicken','Frozen vegetables','Lunchbox snacks','Laundry detergent','Dish soap','Toilet paper'],
    family4:['Milk','Eggs','Bread','Rice','Pasta','Chicken','Fruit','Vegetables','Cereal','Laundry detergent','Dish soap','Toilet paper'],
    student:['Instant noodles','Eggs','Rice','Pasta','Coffee','Peanut butter','Bread','Frozen pizza','Bananas','Toilet paper','Laundry pods','Dish soap'],
    gym:['Chicken breast','Eggs','Protein powder','Rice','Oats','Greek yogurt','Bananas','Peanut butter','Broccoli','Creatine','Tuna','Electrolytes'],
    fit:['Greek yogurt','Berries','Spinach','Salmon','Quinoa','Almonds','Eggs','Sweet potatoes','Oats','Avocados','Electrolytes','Olive oil'],
    vegan:['Tofu','Oat milk','Chickpeas','Lentils','Nutritional yeast','Spinach','Bananas','Peanut butter','Rice','Vitamin B12','Hummus','Olive oil'],
    big:['Milk','Eggs','Bread','Rice','Pasta','Chicken','Ground beef','Cereal','Fruit','Frozen vegetables','Toilet paper','Laundry detergent','Trash bags'],
    newparents:['Diapers','Baby wipes','Formula','Diaper cream','Baby wash','Coffee','Eggs','Bread','Frozen meals','Laundry detergent','Hand soap'],
    couple:['Eggs','Bread','Coffee','Pasta','Chicken','Salad greens','Olive oil','Cheese','Fruit','Dish soap','Toilet paper'],
    solo:['Eggs','Bread','Coffee','Rice','Frozen vegetables','Chicken','Bananas','Yogurt','Dish soap','Toilet paper'],
    roommates:['Toilet paper','Dish soap','Trash bags','Cooking oil','Rice','Salt','Sponges','Paper towels','Laundry detergent','Milk'],
    empty:['Milk','Eggs','Bread','Oats','Fruit','Vegetables','Fish','Tea','Soup','Dish soap','Toilet paper'],
    carer:['Milk','Eggs','Oats','Soup','Bananas','Yogurt','Tea','Tissues','Hand soap','Pain reliever','Bandages'],
    pro:['Coffee','Eggs','Frozen meals','Salad kits','Rotisserie chicken','Yogurt','Granola bars','Bananas','Dish soap','Toilet paper'],
    host:['Olive oil','Butter','Garlic','Lemons','Pasta','Parmesan','Fresh herbs','Sparkling water','Coffee','Paper napkins','Dish soap'],
    petparent:['Pet food','Pet treats','Paper towels','Trash bags','Lint roller'],
    other:['Milk','Eggs','Bread','Rice','Coffee','Fruit','Vegetables','Toilet paper','Dish soap','Laundry detergent']};
  var CUISINES=['Indian','Italian','Mexican','Chinese','Thai','Japanese','Mediterranean','American','Middle Eastern','Korean'],DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],DAYNAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var DIETS=['Vegetarian','Vegan','Pescatarian','Eggetarian','Halal','Kosher','Gluten-free','Dairy-free','High protein','Keto','Low carb','Paleo','Mediterranean','Jain','No onion or garlic','No beef','No pork','Low FODMAP'],ALLERGENS=['Peanuts','Tree nuts','Milk','Eggs','Wheat','Soy','Fish','Shellfish','Sesame','Mustard','Celery','Corn','Sulphites'];
  var RULES=['Celiac','Lactose intolerant','Low salt','Low sugar','Diabetic'],HOUSE=['Less sugar','Less salt','No palm oil','No MSG','No artificial colours','Less fat','Less saturated fat','No artificial sweeteners','No hydrogenated oils','Fewer preservatives'],AVOID=['Mushrooms','Onions','Cilantro','Spicy food','Seafood','Olives','Eggplant'],GOALS=[['waste','Waste less'],['spend','Spend less'],['healthy','Eat healthier'],['time','Save time'],['stock','Never run out']],
    KINDS=[['adult','Adult'],['teen','Teenager'],['child','Child'],['toddler','Toddler'],['baby','Baby'],['older','Older adult'],['visitor','Visits often']];
  var PLANT=/peanut butter|almond butter|oat milk|almond milk|soy milk|coconut milk/i,DAIRY=/milk|yogurt|cheese|butter|cream|whey|parmesan|mozzarella|cheddar|paneer|ghee|custard|pizza|lasagn|chocolate|frozen meals/i,MEAT=/chicken|beef|pork|turkey|salmon|tuna|fish|meat|hot dog|bacon|ham\b/i,WHEAT=/bread|pasta|noodle|cereal|flour|tortilla|pizza|cracker/i;
  var CLASH={Peanuts:/peanut/i,'Tree nuts':/almond|walnut|cashew|pecan|hazelnut|pistachio/i,Eggs:/\begg/i,Soy:/tofu|soy|edamame|tempeh/i,Fish:/salmon|tuna|fish/i,Shellfish:/shrimp|prawn|crab|lobster/i,Sesame:/sesame|tahini|hummus/i};
  var FISHY=/salmon|tuna|fish|shrimp|prawn|crab|lobster/i,PORK=/pork|bacon|ham\b|hot dog/i;
  function everyone(key){var out=profile[key].slice();(profile.members||[]).forEach(function(m){m[key].forEach(function(x){if(out.indexOf(x)<0)out.push(x)})});return out}
  function mentions(name,list){var l=' '+name.toLowerCase();return list.some(function(x){var w=x.toLowerCase().replace(/(es|s)$/,'');return w.length>2&&l.indexOf(' '+w)>-1})}
  /* shared lists respect every allergy and medical rule in the home, and the diet the whole home follows */
  var NOTFOOD=/diaper|wipe|soap|detergent|shampoo|toothpaste|paper|bags?\b|litter|cleaner|sponge|batter(y|ies)|lotion|sunscreen|bandage|medicine|tablet|thermometer|candle|roller|napkin|tissue|pods|\bwash\b|antiseptic|reliever|antacid|pet treats| food$/i;
  function fits(name){
    if(!profile||NOTFOOD.test(name)&&!/baby food/i.test(name))return true;var dairy=DAIRY.test(name)&&!PLANT.test(name),d=everyone('diet'),a=everyone('allergies'),r=everyone('rules'),has=function(l,x){return l.indexOf(x)>-1};
    if(has(a,'Milk')&&dairy)return false;if((has(a,'Wheat')||has(r,'Celiac'))&&(WHEAT.test(name)||/oats|barley|malt|granola/i.test(name)))return false;
    for(var k in CLASH)if(has(a,k)&&CLASH[k].test(name))return false;
    if(mentions(name,a.filter(function(x){return ALLERGENS.indexOf(x)<0}))||mentions(name,profile.avoid||[]))return false;
    if(has(d,'Vegan')&&(dairy||MEAT.test(name)||/\begg|honey/i.test(name)))return false;
    if((has(d,'Vegetarian')||has(d,'Eggetarian')||has(d,'Jain'))&&MEAT.test(name))return false;
    if(has(d,'Pescatarian')&&MEAT.test(name)&&!FISHY.test(name))return false;
    if((has(d,'Halal')||has(d,'Kosher')||has(d,'No pork'))&&PORK.test(name))return false;if(has(d,'No beef')&&/beef/i.test(name))return false;
    if((has(d,'Jain')||has(d,'No onion or garlic'))&&/onion|garlic/i.test(name))return false;
    if((has(d,'Dairy-free')||has(r,'Lactose intolerant'))&&dairy)return false;if(has(d,'Gluten-free')&&WHEAT.test(name))return false;
    return true;
  }
  var ALIAS={dadbusy:'mom',momsolo:'dad'};
  function pers(){return profile?(profile.personas||[profile.persona]):[]}
  function starterList(){var lists=pers().map(function(k){return STARTER[ALIAS[k]||k]}),out=[],extra=[];
    (profile.pets||[]).forEach(function(p){if(p==='Dog')extra.push('Dog food','Poop bags');else if(p==='Cat')extra.push('Cat food','Cat litter');else extra.push(p+' food')});
    if((profile.members||[]).some(function(m){return m.kind==='baby'}))extra.push('Diapers','Baby wipes');
    if(extra.length)lists=lists.map(function(l){return l.filter(function(n){return n!=='Pet food'})});lists.unshift(extra);for(var i=0;i<14;i++)lists.forEach(function(l){if(l[i]&&out.indexOf(l[i])<0)out.push(l[i])});return out}
  function profileLine(){if(!profile)return 'Make it yours';var n=profile.adults+profile.kids,a=everyone('allergies'),r=everyone('rules'),lab=pers().map(function(k){return PERSONA[k][0]}),
      eat=profile.diet.length===1?profile.diet[0]:profile.diet.length?profile.diet.length+' diets':'',
      care=a.length===1?'no '+a[0].toLowerCase():a.length?a.length+' allergies':r.length===1?r[0].toLowerCase():r.length?r.length+' health rules':'';
    var who=profile.kids?profile.adults+(profile.adults===1?' adult':' adults')+' and '+profile.kids+(profile.kids===1?' child':' children'):n+(n===1?' person':' people');
    return lab.join(', ')+' \u00b7 '+who+(eat?', '+eat:'')+(care?', '+care:'')}
  var SVGNS='http://www.w3.org/2000/svg';
  var $=function(id){return document.getElementById(id)};
  function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e}
  function icon(d){var s=document.createElementNS(SVGNS,'svg');s.setAttribute('class','i');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');
    var p=document.createElementNS(SVGNS,'path');p.setAttribute('d',d);s.append(p);return s}
  function catIcon(cat){var c=CAT[cat]||CAT.Other,b=el('span','ico');b.style.setProperty('--h',c[0]);b.append(icon(c[1]));return b}
  function pad(n){return (n<10?'0':'')+n}
  function today(){var d=new Date();d.setHours(0,0,0,0);return d}
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function parse(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;var p=s.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]);return isNaN(d)?null:d}
  function daysFrom(s){var d=parse(s);return d?Math.round((d-today())/DAY):null}
  function addDays(s,n){var d=parse(s)||today();d.setDate(d.getDate()+n);return iso(d)}
  function fmt(s){var d=parse(s);if(!d)return '—';var o={month:'short',day:'numeric'};if(d.getFullYear()!==today().getFullYear())o.year='numeric';return d.toLocaleDateString(undefined,o)}
  function qtyText(q){return String(Math.round(q*100)/100)}
  function amount(q,u){var n=qtyText(q);return u==='pcs'?n:u==='pack'?n+(q<=1?' pack':' packs'):n+' '+u}
  function amt(it){return it.qty<=0?'Out':amount(it.qty,it.unit)}

  var items=[],log=[],extras=[],waste=0,shelf=null,saved=null,shops=[],handoff=null,shop=null,moreLow=false,spend=null,profile=null,me='',owner=true,signup=false,pipe=false,tab='today',cat='All',query='',open={},turned=null,busy=false,pending=null,toastTimer=null;

  /* why something failed, said truthfully: offline only when the phone really is offline */
  function why(e,what){var c=e&&e.code;return c==='offline'?what+' You seem to be offline, so nothing was changed.':c&&c!=='server'&&COPY[c]?COPY[c]:what+' Something went wrong on my side, and nothing was changed. Try again.'}
  function toast(msg,label,fn){clearTimeout(toastTimer);$('toastMsg').textContent=msg;var b=$('toastBtn');b.hidden=!label;if(label){b.textContent=label;b.onclick=function(){$('toast').hidden=true;fn()}}
    $('toast').hidden=false;if(label&&navigator.vibrate)try{navigator.vibrate(8)}catch(e){}toastTimer=setTimeout(function(){$('toast').hidden=true},label?12000:5000)}
  var WAIT={'Reading':['Reading your receipt','Squinting at the small print','Sorting things into rooms','Working out how long things keep','Nearly there'],
    'Looking at the shelf':['Looking at the shelf','Counting what I can see','Working out what is what','Nearly there'],
    'Listening back':['Listening back','Working out what changed'],'Thinking about dinner':['Looking at what you have','Checking what goes off first','Thinking about dinner'],
    'Looking up that product':['Looking up that product','Reading the ingredient list']},waitTimer=null;
  function setBusy(msg){busy=!!msg;$('busy').hidden=!msg;clearInterval(waitTimer);
    if(!msg){if(window.Tote&&!$('app').hidden)render();return}
    var lines=WAIT[msg]||WAIT[Object.keys(WAIT).filter(function(k){return msg.indexOf(k)===0})[0]]||[msg],i=0;$('busyMsg').textContent=lines[0];
    waitTimer=setInterval(function(){i=Math.min(lines.length-1,i+1);$('busyMsg').textContent=lines[i]},3800);
    var live=window.Tote&&Tote.mount($('toteBusy'),128,buddy()+' is working');$('toteBusy').hidden=!live;$('busyDoc').hidden=!!live;if(live){Tote.onTap=null;Tote.mood('think')}}
  /* adding to the list: if it is already there, say so, with one tap to add another (no sheet in the way) */
  async function addToList(text,quiet){var r=await api('/api/extras',{method:'POST',body:JSON.stringify({text:text,whole:!!quiet})});
    if(r.many){if(!quiet)toast(r.added.length+' added to your shopping list.'+(r.kept.length?' '+r.kept.join(', ')+(r.kept.length===1?' was':' were')+' already there.':''));return 'many'}
    if(!r.already&&r.have&&!quiet){toast(r.text+' is on your list. You have '+amount(r.have.qty,r.have.unit)+(r.have.unit==='pcs'?' ':' of ')+r.have.name+' at home.');return 'asked'}
    if(!r.already)return 'added';if(quiet)return 'kept';
    toast(r.text+' is already on your list.','Add another',async function(){try{await api('/api/extras',{method:'POST',body:JSON.stringify({text:text,again:true})});await refresh();toast(r.text+LISTMSG.again)}catch(e){if(e.code!=='locked')toast(why(e,'Could not add that.'))}});
    return 'asked'}
  var LISTMSG={added:' is on your shopping list.',again:': one more on your shopping list.',kept:' is already on your list. Left as it is.'};
  function listSaid(n,how){if(how!=='asked')toast(n+LISTMSG[how])}
  /* ---- reminders on this phone, and what the helper has learned ---- */
  var learnt={hour:17,hourLearned:false,muted:[],dishes:[],phones:0},reviewN=0,pushOn=false,swReg=null;
  var pushCan='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var homeScreen=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  function every(n){return n<=1?'day':n===7?'week':n===14?'two weeks':n+' days'}
  function hourText(h){return (h%12||12)+(h<12?' am':' pm')}
  function learntLine(changes){var ln=(changes||[]).filter(function(c){return c.learnt}).slice(0,2);if(!ln.length)return '';
    return ' I have noticed you buy '+ln.map(function(c){return c.name.toLowerCase()+' about every '+every(c.learnt)}).join(' and ')+'. I will let you know when '+(ln.length===1?'it is':'they are')+' due.'}
  function pushWhy(){return pushCan?'':isIOS&&!homeScreen?'On an iPhone, add Stocker to your Home Screen first: tap Share, then Add to Home Screen, and open it from there.':'This browser cannot show reminders.'}
  function keyBytes(t){var raw=atob((t+'==='.slice((t.length+3)%4)).replace(/-/g,'+').replace(/_/g,'/')),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
  function pushState(){if(!pushCan)return Promise.resolve(false);
    return navigator.serviceWorker.getRegistration('/').then(function(r){swReg=r||null;return r?r.pushManager.getSubscription():null}).then(function(s){pushOn=!!s&&Notification.permission==='granted';return s}).catch(function(){return null})}
  async function pushSave(s,quiet){var j=s.toJSON(),tz='UTC';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}
    return api('/api/push',{method:'POST',body:JSON.stringify({endpoint:j.endpoint,keys:j.keys,tz:tz,quiet:!!quiet})})}
  async function pushEnable(){
    if(!pushCan){toast(pushWhy());return false}
    var perm=await Notification.requestPermission();
    if(perm!=='granted'){toast('Reminders are blocked for Stocker. Allow notifications for it in your phone or browser settings, then try again.');return false}
    swReg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
    var k=keyBytes((await api('/api/push')).key),s=await swReg.pushManager.getSubscription();
    if(!s){try{s=await swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:k})}catch(e){var old=await swReg.pushManager.getSubscription();if(old)await old.unsubscribe();s=await swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:k})}}
    var r=await pushSave(s);pushOn=true;try{localStorage.setItem('stocker.pushSync',iso(today()))}catch(e){}
    await refresh();say(r.hello?'Reminders are on. I have just sent a hello to this phone to check it works.':'Reminders are on. I will let you know when something is due.');return true}
  async function pushDisable(){try{var s=swReg&&await swReg.pushManager.getSubscription();if(s){await api('/api/push',{method:'DELETE',body:JSON.stringify({endpoint:s.endpoint})});await s.unsubscribe()}}catch(e){}
    pushOn=false;await refresh();toast('Reminders are off on this phone.')}
  /* once a day, tell the server this phone is still here and which time zone it is in */
  function pushSync(){pushState().then(function(s){if(!$('app').hidden)render();if(!s||!pushOn)return;var seen='';try{seen=localStorage.getItem('stocker.pushSync')||''}catch(e){}
    if(seen===iso(today()))return;pushSave(s,true).then(function(){try{localStorage.setItem('stocker.pushSync',iso(today()))}catch(e){}},function(){})})}
  /* one way to answer "is it running low?", from the bell, the list or a notification, so every answer teaches the same thing */
  async function remindAnswer(list,ans,ahead){
    await api('/api/remind',{method:'POST',body:JSON.stringify({ids:list.map(function(i){return i.id}),answer:ans,ahead:!!ahead,hour:new Date().getHours()})});await refresh();
    var names=list.map(function(i){return i.name}).join(', ');
    toast(ans==='add'?'On your list: '+names+'.':ans==='still'?'Got it. I will ask about '+names+' again later.':ans==='stop'?'I will not remind you about '+names+'.':'I will remind you about '+names+' again.')}
  function openNudges(){drawNudges();if(!$('nudgeDlg').open)$('nudgeDlg').showModal()}
  if(pushCan)navigator.serviceWorker.addEventListener('message',function(ev){if(ev.data&&ev.data.stocker==='nudges'&&!$('app').hidden)refresh().then(openNudges,openNudges)});
  function onceOff(id){try{return localStorage.getItem('stocker.once.'+id)==='1'}catch(e){return false}}
  /* nudges: one list of what needs a person, each with a single tap to deal with it */
  function offToday(){try{var o=JSON.parse(localStorage.getItem('stocker.nudgeOff')||'{}');return o.day===iso(today())?o.ids||[]:[]}catch(e){return []}}
  /* Everything that needs a person, worked out once. Today shows the first three as cards, the bell counts them,
     and the sheet lists every one, so the number is the same wherever it is shown. */
  function needs(){var use=items.filter(needsUse).sort(function(a,b){return expiry(a).d-expiry(b).d}),buy=items.filter(needsBuy).sort(function(a,b){return plan(a).days-plan(b).days}),off=offToday();
    return needCards(use,buy).filter(function(c){return off.indexOf(c.id)<0})}
  function needCount(){return needs().filter(function(c){return c.k!=='list'}).length}
  /* leaving a sheet: wait for it to close before going anywhere, or the browser cancels the move */
  function afterClose(d,fn){if(!d||!d.open){fn();return}var done=false,run=function(){if(done)return;done=true;window.removeEventListener('popstate',run);setTimeout(fn,0)};window.addEventListener('popstate',run);d.close();setTimeout(run,350)}
  function leaveSheet(fn){return function(){afterClose($('nudgeDlg'),fn)}}
  /* jumping to one item always shows it: any room, kind or filter left over from before is cleared first */
  function showItem(it){cat='All';sub='All';stat='all';query=it.name;$('search').value=it.name;open[it.id]=true;go('pantry')}
  /* what keeps in the freezer: meat, fish, bread, butter, cheese, berries, bananas, peas, corn, cooked food. Not salad, lettuce,
     cucumber, whole pears or eggs in the shell, which come out ruined. */
  function freezes(it){var n=it.name.toLowerCase();if(/lettuce|salad|cucumber|celery|radish|cress|sprout|egg\b|eggs\b|yog|cream cheese|sour cream|mayo|potato(?!es? (?:fries|wedges))|pear|apple|grape|melon|citrus|orange|tomato/.test(n))return false;
    return it.category==='Meat'||it.category==='Bakery'||it.category==='Frozen'||/berr|banana|mango|peas\b|corn|spinach|butter|cheese|milk|bread|tortilla|soup|stock|broth|sauce|rice|chicken|beef|pork|fish|salmon|shrimp|dumpling|curry|chili|leftover|cooked/.test(n)}
  /* the same thing as a short row, for the bell's sheet */
  function nudgeOf(c){var it=c.it,lc=function(x){return x.toLowerCase()};
    if(c.k==='use'){var e=expiry(it);
      if(e.d<0)return {text:it.name+' is past its date',sub:'Best before '+fmt(it.expiry),label:'Threw it away',fn:function(){return binIt(it)}};
      return {text:e.d===0?'The '+lc(it.name)+' wants using today':it.name+': '+lc(e.text),sub:areaOf(it)==='Kitchen'&&freezes(it)?'Use it soon, or put it in the freezer':areaOf(it)==='Kitchen'?'Use it soon':'Best before '+fmt(it.expiry),label:'Used it up',fn:function(){return useUp(it)}}}
    if(c.k==='out')return {text:"You're out of "+lc(it.name),sub:'An essential. It is on your list.',label:'Open list',nav:1,fn:function(){go('list')}};
    if(c.k==='many')return {text:'How many '+lc(it.name)+' are there?',sub:it.source==='shelf'?'I could not count them in your photo':'You did not say how many',label:'Answer',nav:1,fn:function(){go('today')}};
    if(c.k==='warn')return {text:'Check the label on '+lc(it.name),sub:cap(it.warn),label:'Show me',nav:1,fn:function(){showItem(it)}};
    if(c.k==='low')return {text:it.name+' might be running low',sub:it.learned?'You usually buy it about every '+every(it.finish_days):'My guess from how long it usually lasts',label:'Add to list',fn:function(){return remindAnswer([it],'add')}};
    return {text:c.text,sub:c.sub,label:c.label,nav:c.nav,fn:c.fn}}
  function drawBell(){var n=needCount(),dot=$('bellDot');dot.hidden=!n;dot.textContent=n>9?'9+':String(n);$('bell').setAttribute('aria-label',n?n+(n===1?' thing needs you':' things need you'):'Nothing needs you right now');
    try{if(navigator.setAppBadge){if(n)navigator.setAppBadge(n);else navigator.clearAppBadge()}}catch(e){}}
  function drawNudges(){var list=needs().filter(function(c){return c.k!=='list'}),box=$('nudgeList');box.textContent='';$('nudgeSub').textContent=list.length?'One tap deals with each. Later hides it until tomorrow.':'Nothing needs you right now. I will keep watching.';
    list.forEach(function(c){var n=nudgeOf(c),row=el('div','nudge'),g=el('div'),bt=el('div','btns'),a=el('button','mini',n.label),l=el('button','mini','Later');a.type=l.type='button';g.append(el('div','name',n.text),el('div','sub',n.sub));
      a.onclick=async function(){a.disabled=true;try{if(n.nav)afterClose($('nudgeDlg'),n.fn);else{await n.fn();drawNudges()}}catch(er){a.disabled=false;if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
      l.setAttribute('aria-label','Hide until tomorrow: '+n.text);l.onclick=function(){try{var off=offToday();off.push(c.id);localStorage.setItem('stocker.nudgeOff',JSON.stringify({day:iso(today()),ids:off}));if(c.once)localStorage.setItem('stocker.once.'+c.id,'1')}catch(e){}drawNudges();drawBell();if(!$('app').hidden)renderToday()};
      bt.append(a,l);row.append(g,bt);box.append(row)})}
  $('bell').onclick=function(){drawNudges();$('nudgeDlg').showModal()};
  /* moments: a short line from the helper when something worth noticing happens */
  var moment=null,momentTimer=null;
  function say(text,how){moment=text;clearTimeout(momentTimer);momentTimer=setTimeout(function(){moment=null;if(!$('app').hidden)renderToday()},7000);
    if(!$('app').hidden)renderToday();if(window.Tote){if(how==='party')Tote.celebrate();else if(how==='oops'){Tote.mood('oops');setTimeout(function(){if(!busy&&!$('app').hidden)renderToday()},4200)}else Tote.hop()}}
  function oops(text){toast(text);if(window.Tote&&!$('chatDlg').open){Tote.mood('oops');setTimeout(function(){if(!busy&&!$('app').hidden)renderToday()},4200)}}
  function toteLine(use,buy,n){
    if(moment)return moment;
    if(!items.length)return 'Nothing to look after yet. Show me a receipt and I will take it from there.';
    var gone=use.filter(function(i){return expiry(i).d<0}),now=use.filter(function(i){return expiry(i).d===0}),ess=buy.filter(function(i){return i.essential&&i.qty<=0});
    if(profile&&profile.shopDay===DAYS[today().getDay()])return "It's shopping day"+(profile.store?' at '+profile.store:'')+'. '+(buy.length+extras.length)+' on the list.';
    if(ess.length)return "We're out of "+ess[0].name.toLowerCase()+". I've put it on the list.";
    if(now.length)return 'The '+now[0].name.toLowerCase()+(now.length>1?' and '+(now.length-1)+' more want':' wants')+' using today.';
    if(gone.length)return gone.length===1?'The '+gone[0].name.toLowerCase()+' has gone past its date. Worth a look.':gone.length+' things have gone past their date. Worth a look.';
    var soon=use.filter(function(i){return expiry(i).d>0});
    if(soon.length)return 'The '+soon[0].name.toLowerCase()+(soon.length>1?' and '+(soon.length===2?'the '+soon[1].name.toLowerCase():(soon.length-1)+' more'):'')+(soon.length>1?' want':' wants')+' using in the next few days.';
    if(n)return n===1?'One thing to look at, then you are done.':'A few quick taps and you are done.';
    return "Everything's in order. I'll keep watching."}
  window.addEventListener('offline',function(){$('offline').hidden=false});window.addEventListener('online',function(){$('offline').hidden=true;if(!$('app').hidden)refresh().catch(function(){})});
  if(navigator.onLine===false)$('offline').hidden=false;

  async function api(path,opts){
    opts=opts||{};opts.headers=Object.assign({'x-today':iso(today())},opts.body?{'content-type':'application/json'}:{},opts.headers||{});opts.credentials='same-origin';
    var r,data=null;try{r=await fetch(path,opts)}catch(e){throw {code:'offline'}}
    try{data=await r.json()}catch(e){}
    if(r.status===401&&data&&data.error==='locked'){showGate();throw {code:'locked'}}
    if(!r.ok)throw {code:(data&&data.error)||'server',message:data&&data.message};
    return data;
  }
  /* Signing in. The screen asks the server what is on: Google, a code by email, or only the code the owner and friends type. */
  var signOpts=null,gAsked=false,gateSaid='';
  var SIGNMSG={full:'Every home is taken for now. Your place on the waiting list is saved.',bad_token:'Google did not confirm that sign-in. Try again.',too_many:'Too many tries. Wait a while, then try again.',home_off:'This home is turned off. Ask the person who runs Stocker.',wrong_code:"That code isn't right, or it has run out. Check it, or ask for a new one.",signin_off:'That way of signing in is not on yet.',email_off:'That way of signing in is not on yet.',bad_email:'That does not look like an email address.',mail_failed:'I could not send the code. Try again in a minute.',offline:'You seem to be offline. Check your connection and try again.'};
  function gateSay(t){gateSaid=t||'';gateMode(!$('gateForm').hidden&&!$('backSign').hidden)}
  function gateMode(code){var has=!!(signOpts&&(signOpts.google||signOpts.email));
    $('signin').hidden=!has||code;$('gateForm').hidden=has&&!code;$('backSign').hidden=!(has&&code);
    $('gateMsg').textContent=gateSaid||(has&&!code?(signOpts.places?'Sign in to open your home. New here? Signing in makes one for you.':'Sign in to open your home. Every home is taken for now, so new sign-ins go on the waiting list.'):'Enter your code to open Stocker.')}
  async function loadSignin(){
    if(!signOpts){try{var r=await fetch('/api/signin/options',{credentials:'same-origin'});signOpts=r.ok?await r.json():null}catch(e){signOpts=null}}
    if(!signOpts){gateMode(true);return}
    $('mailForm').hidden=!signOpts.email;$('gBtn').hidden=!signOpts.google;$('signOr').hidden=!(signOpts.google&&signOpts.email);gateMode(false);if(signOpts.google)loadGoogle()}
  /* Google's own button, loaded from Google only when the sign-in screen is shown. It hands back a signed note of who signed in; the server checks it. */
  function loadGoogle(){if(window.google&&google.accounts){drawGoogle();return}if(gAsked)return;gAsked=true;
    var sc=document.createElement('script');sc.src='https://accounts.google.com/gsi/client';sc.async=true;sc.onload=drawGoogle;
    sc.onerror=function(){gAsked=false;$('gBtn').textContent='Could not reach Google. Check your connection and reload.'};document.head.append(sc)}
  function drawGoogle(){if(!(window.google&&google.accounts&&signOpts&&signOpts.google))return;
    try{google.accounts.id.initialize({client_id:signOpts.google,callback:function(resp){signIn('/api/signin/google',{credential:resp&&resp.credential})},auto_select:false,ux_mode:'popup'});
      $('gBtn').textContent='';google.accounts.id.renderButton($('gBtn'),{type:'standard',theme:'outline',size:'large',shape:'pill',text:'continue_with',width:Math.max(200,Math.min(332,($('gate').clientWidth||380)-48))})}
    catch(e){$('gBtn').textContent='Could not show the Google button. Reload and try again.'}}
  async function signIn(path,body){
    try{var d=await api(path,{method:'POST',body:JSON.stringify(body)});if(d.fresh){try{localStorage.removeItem('stocker.profSkip');localStorage.removeItem('stocker.sorted')}catch(e){}}gateSaid='';mailReset();await start();return true}
    catch(e){gateSay(SIGNMSG[e.code]||'Could not reach Stocker. Check your connection.');if(e.code==='wrong_code'&&!$('mailCodeRow').hidden)wrongIn($('mailCode'));return false}}
  /* a wrong code: red, and a shake (CSS leaves the shake out under reduce motion). A second wrong try shakes again */
  function wrongIn(inp){inp.setAttribute('aria-invalid','true');inp.classList.remove('shake');void inp.offsetWidth;inp.classList.add('shake')}
  ['pin','mailCode'].forEach(function(id){var i=$(id);i.addEventListener('input',function(){i.removeAttribute('aria-invalid')});i.addEventListener('animationend',function(){i.classList.remove('shake')})});
  /* the next step slides in from the right, the step back from the left */
  function stepIn(e,back){e.classList.remove('step-f','step-b');void e.offsetWidth;e.classList.add(back?'step-b':'step-f')}
  ['signin','gateForm','mailCodeRow'].forEach(function(id){$(id).addEventListener('animationend',function(ev){if(ev.target===$(id))$(id).classList.remove('step-f','step-b')})});
  function mailReset(){$('mailCodeRow').hidden=true;$('mailCode').value='';$('mailCode').required=false;$('mailGo').textContent='Email me a code'}
  $('mailForm').addEventListener('submit',async function(ev){ev.preventDefault();var b=$('mailGo'),to=$('mailTo').value.trim();b.disabled=true;
    if($('mailCodeRow').hidden){
      try{await api('/api/signin/email',{method:'POST',body:JSON.stringify({email:to})});$('mailCodeRow').hidden=false;stepIn($('mailCodeRow'));$('mailCode').required=true;b.textContent='Open';gateSay('I sent a 6-digit code to '+to+'. It works for 10 minutes.');$('mailCode').focus()}
      catch(e){gateSay(SIGNMSG[e.code]||'Could not reach Stocker. Check your connection.')}}
    else if(!(await signIn('/api/signin/email/check',{email:to,code:$('mailCode').value}))&&/taken|turned off/.test(gateSaid))mailReset();
    b.disabled=false});
  $('mailTo').addEventListener('input',function(){if(!$('mailCodeRow').hidden){mailReset();gateSay('')}});
  $('haveCode').onclick=function(){gateSaid='';gateMode(true);stepIn($('gateForm'));$('who').focus()};
  $('backSign').onclick=function(){gateSaid='';gateMode(false);stepIn($('signin'),true)};
  function showGate(msg){document.querySelectorAll('dialog[open]').forEach(function(d){d.close()});$('app').hidden=true;$('tabbar').hidden=true;$('gate').hidden=false;gateSaid=msg||'';if(signOpts)gateMode(false);else{$('signin').hidden=true;$('gateForm').hidden=true;$('gateMsg').textContent=gateSaid}loadSignin()}
  $('gateForm').addEventListener('submit',async function(ev){ev.preventDefault();
    try{await api('/api/login',{method:'POST',body:JSON.stringify({pin:$('pin').value,name:$('who').value})});try{localStorage.setItem('stocker.who',$('who').value.trim())}catch(e2){}$('pin').value='';gateSaid='';start()}
    catch(e){if(e.code==='wrong_pin')wrongIn($('pin'));gateSaid=$('gateMsg').textContent=e.code==='wrong_pin'?"That code isn't right. Check it and try again.":e.code==='too_many'?'Too many tries. Wait ten minutes, then try again.':e.code==='setup'?'There is no passcode yet. Set one in the Worker settings as a secret named APP_PIN.':'Could not reach Stocker. Check your connection.'}});
  $('lockBtn').onclick=async function(){var acct=signup;try{await api('/api/logout',{method:'POST'})}catch(e){}showGate(acct?'Signed out.':'Locked. Enter your code to open Stocker.')};
  $('menuOutAll').onclick=async function(){try{await api('/api/signout/all',{method:'POST'});showGate('Signed out on every phone.')}catch(e){if(e.code!=='locked')toast(why(e,'Could not sign out.'))}};
  $('menuPrivacy').onclick=function(){location.href='/privacy.html'};
  /* Delete my home: said inside the sheet, and it takes a second tap, because it cannot be undone */
  var delArmed=0;
  $('menuDelete').onclick=function(){$('menuDlg').close();delArmed=0;$('delGo').textContent='Delete everything';$('delGo').disabled=false;$('delSay').textContent='';$('delDlg').showModal()};
  $('delGo').onclick=async function(){var b=$('delGo');
    if(Date.now()-delArmed>8000){delArmed=Date.now();b.textContent='Tap again to delete everything';$('delSay').textContent='Tap once more and it is all gone for good.';setTimeout(function(){if(b.isConnected&&!b.disabled&&Date.now()-delArmed>=8000){b.textContent='Delete everything';$('delSay').textContent=''}},8100);return}
    b.disabled=true;try{await api('/api/home/delete',{method:'POST',body:JSON.stringify({confirm:'delete'})});try{localStorage.removeItem('stocker.profSkip');localStorage.removeItem('stocker.sorted')}catch(e2){}showGate('Your home is deleted. Nothing of it is kept.')}
    catch(e){b.disabled=false;if(e.code!=='locked')$('delSay').textContent=why(e,'Could not delete your home.')}};

  /* ---- the agent's rules ---- */
  /* The shopping list holds only what you are out of, what you said is running low, and essentials about to run out.
     Anything the app merely suspects is offered as a suggestion and never goes on the list by itself. */
  /* fewer people at home this week means things last longer */
  function homeScale(){if(!profile)return 1;var total=Math.max(1,profile.adults+profile.kids),away=Math.min(total-1,(profile.members||[]).filter(function(m){return m.away}).length);return total/(total-away)}
  /* eating out stretches fresh food; the freezer stops the clock on a date */
  function paceScale(it){var out=profile&&profile.eatOut?Math.min(6,profile.eatOut):0;return homeScale()*(areaOf(it)==='Kitchen'?7/(7-out*0.5):1)}
  function runOut(it){return addDays(it.bought||it.added,Math.round(it.finish_days*paceScale(it)))}
  function plan(it){
    if(it.qty<=0)return {days:-999,date:iso(today()),why:"You're out"};
    if(it.low)return {days:-998,date:iso(today()),why:'Running low'};
    var d=runOut(it);return {days:daysFrom(d),date:d,why:it.learned?'at your usual pace':'at a typical pace'};
  }
  function guess(it){return it.qty>0&&!it.low&&daysFrom(runOut(it))<=(it.essential?3:1)&&-daysFrom(it.bought||it.added)>=2}
  function maybeLow(it){return !needsBuy(it)&&!needsUse(it)&&guess(it)}
  /* standing at the list, "low" means "out before I shop again": look ahead by how often this home shops, when that is known */
  function ahead(it){if(needsBuy(it)||needsUse(it)||!(it.qty>0)||it.low)return false;var reach=Math.max(it.essential?3:1,shop&&shop.known?shop.days:1);return daysFrom(runOut(it))<=reach&&-daysFrom(it.bought||it.added)>=2}
  function expiry(it){
    if(!it.expiry||it.qty<=0||it.frozen)return null;var d=daysFrom(it.expiry);
    if(d<0)return {cls:'bad',text:'Expired',d:d};
    if(d===0)return {cls:'warn',text:'Use today',d:d};
    if(d<=3)return {cls:'warn',text:d+(d===1?' day left':' days left'),d:d};
    return {cls:'',text:'',d:d};
  }
  function needsUse(it){var e=expiry(it);return !!e&&e.d<=3}
  function needsBuy(it){return !it.nolist&&(it.qty<=0||!!it.low||(!!it.essential&&guess(it)))}
  function fresh(it){var s=parse(it.bought||it.added),e=parse(it.expiry);if(!s||!e||e<=s||it.qty<=0)return null;return Math.max(0,Math.min(1,(today()-s)/(e-s)))}

  /* ---- views ---- */
  function emptyCard(cat,title,text,btn,fn){var c=el('div','empty');c.append(catIcon(cat),el('h2','',title),el('p','sub',text));
    if(btn){var b=el('button','btn primary',btn);b.type='button';b.onclick=fn;c.append(b)}return c}

  function spendCard(v){
    if(spend&&spend.total>0){var sp=el('div','card'),money=function(n){try{return new Intl.NumberFormat(undefined,{style:'currency',currency:spend.currency||'USD',maximumFractionDigits:0}).format(n)}catch(e){return String(Math.round(n))}};
      var row=el('div','row'),gg=el('div','grow');gg.append(el('div','sub','Spent this month'+(profile&&profile.budget?' of your '+money(profile.budget)+' budget':'')),el('div','name',money(spend.total)));gg.lastChild.style.fontFamily='var(--display)';gg.lastChild.style.fontSize='1.6rem';row.append(gg);sp.append(row);
      if(profile&&profile.budget){var bb=el('div','bar'),bf=el('i',spend.total>profile.budget?'bad':spend.total>profile.budget*0.8?'warn':'');bf.style.width=Math.min(100,Math.round(spend.total/profile.budget*100))+'%';bb.append(bf);sp.append(bb)}
      var fx=el('div','facts');spend.byArea.forEach(function(a){var t=el('span');t.append(document.createTextNode(a.area+' '),el('b','',money(a.amount)));fx.append(t)});sp.append(fx,el('p','sub','From the prices on receipts you scanned.'));v.append(sp)}
  }
  function starterCard(v){
    var hide=false;try{hide=localStorage.getItem('stocker.starterHide')==='1'}catch(e){}
    if(profile&&!hide){var have=items.map(function(i){return i.name.toLowerCase()}).concat(extras.map(function(x){return x.text.toLowerCase()}));
      var picks=starterList().filter(function(n){var l=n.toLowerCase();return fits(n)&&!have.some(function(h){return h.indexOf(l)>-1||l.indexOf(h)>-1})}).slice(0,10);
      if(picks.length){var sc=el('div','card'),sh=el('div','sechead'),hb=el('button','link','Hide');hb.type='button';hb.style.padding='0';hb.style.minWidth='44px';hb.style.minHeight='40px';
        hb.onclick=function(){try{localStorage.setItem('stocker.starterHide','1')}catch(e){}render()};
        sh.append(el('h3','',pers().length===1?PERSONA[pers()[0]][0]+' staples':'Staples for your home'),hb);sc.append(sh,el('p','sub','A starter list picked for your kind of home. Tap what you want on your shopping list.'));
        var wc=el('div','wrapchips');picks.forEach(function(n){var b=el('button','mini','+ '+n);b.type='button';
          b.onclick=async function(){b.disabled=true;try{var how=await addToList(n);await refresh();listSaid(n,how)}catch(er){b.disabled=false;if(er.code!=='locked')toast(why(er,'Could not add that.'))}};wc.append(b)});
        var all=el('button','btn primary block','Put these '+picks.length+' on my list');all.type='button';
        all.onclick=async function(){all.disabled=true;try{var kept=0;for(var i=0;i<picks.length;i++)if((await addToList(picks[i],true))==='kept')kept++;await refresh();toast((picks.length-kept)+' added to your shopping list.')}catch(er){all.disabled=false;if(er.code!=='locked')toast(why(er,'Could not add those.'))}};
        sc.append(wc,all);v.append(sc)}}
  }
  /* Today: Tote first, then at most three things that want a person, each with one big button */
  var doneInfo=null;
  function cap(t){return t.charAt(0).toUpperCase()+t.slice(1)}
  function patchItem(it,body,msg){return async function(){try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify(body)});await refresh();toast(msg)}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}}}
  function btn(cls,label,fn){var b=el('button',cls,label);b.type='button';b.onclick=async function(){b.disabled=true;try{await fn()}finally{b.disabled=false}};return b}
  function needCards(use,buy){var out=[];
    use.forEach(function(it){var e=expiry(it);out.push({p:e.d<0?0:e.d===0?1:4,it:it,k:'use',id:(e.d<0?'gone:':e.d===0?'today:':'soon:')+it.id})});
    buy.filter(function(i){return i.essential&&i.qty<=0}).forEach(function(it){out.push({p:2,it:it,k:'out',id:'out:'+it.id})});
    items.filter(function(i){return i.unsure&&i.qty>0}).forEach(function(it){out.push({p:3,it:it,k:'many',id:'many:'+it.id})});
    items.filter(function(i){return i.warn&&i.qty>0}).forEach(function(it){out.push({p:3.5,it:it,k:'warn',id:'warn:'+it.id+':'+it.warn})});
    items.filter(maybeLow).forEach(function(it){out.push({p:5,it:it,k:'low',id:'low:'+it.id})});
    /* misses waiting for review are the owner's work, not the home's: they live in the household menu, never in this count */
    if(!pushOn&&!onceOff('push')&&(pushCan||(isIOS&&!homeScreen))&&items.some(function(i){return i.learned||i.essential}))out.push({p:5.5,k:'note',id:'push',once:true,text:'Let me remind you on this phone',sub:pushCan?'When something you buy regularly is due. Once a day at most.':'Add Stocker to your Home Screen first: Share, then Add to Home Screen',label:'Turn on',fn:pushEnable});
    if(!profile&&items.length)out.push({p:7,k:'note',id:'profile',text:'Tell me about your home',sub:'Allergies, who lives here, how you eat',label:'Set up',nav:1,fn:openProfile});
    var rest=buy.filter(function(i){return !(i.essential&&i.qty<=0)}).length+extras.length;if(rest)out.push({p:6,k:'list',id:'list',n:rest});
    var seen={};return out.sort(function(a,b){return a.p-b.p}).filter(function(c){if(!c.it)return true;if(seen[c.it.id])return false;seen[c.it.id]=1;return true})}
  /* Used up, thrown away, removed: done at once, and always with a way back */
  function restoreItem(copy,binned){return async function(){try{await api('/api/items/restore',{method:'POST',body:JSON.stringify({item:copy,binned:!!binned})});await refresh();toast(copy.name+' is back as it was.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not undo that.'))}}}
  async function useUp(it,quiet){var prev=it.qty,low=!!it.low;await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({qty:0,out:true})});await refresh();
    var undo=async function(){try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({qty:prev,low:low,takeBack:true})});await refresh();toast(it.name+' is back at '+amount(prev,it.unit)+'.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not undo that.'))}};
    if(!quiet)toast('Marked all of the '+it.name.toLowerCase()+' as used up. It is on your list.','Undo',undo);return undo}
  async function binIt(it,quiet){var copy=Object.assign({},it);await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({binned:true})});await refresh();var undo=restoreItem(copy,true);
    if(!quiet)toast('Noted. It will not be put on your list.','Undo',undo);return undo}
  /* Today groups what needs a person into at most three cards, one per job: use these first, running out, check these.
     The headline counts exactly what the bell counts, so the numbers never disagree. */
  function whenPill(it){var e=expiry(it);return e.d<0?['bad','Past date']:e.d===0?['warn','Today']:e.d===1?['warn','Tomorrow']:['plain',e.d+' days']}
  function groupCard(kicker,title,sub,rows,primary){var card=el('div','need'),hd=el('div');hd.append(el('div','kicker',kicker),el('h3','',title));if(sub)hd.append(el('div','sub',sub));card.append(hd);
    if(rows&&rows.length){var box=el('div','rows');rows.forEach(function(r){box.append(r)});card.append(box)}if(primary){var acts=el('div','acts');acts.append(primary);card.append(acts)}return card}
  function itemLine(it,pill,line,action){var r=el('div','row'),g=el('div','grow'),top=el('div','row');top.style.gap='8px';top.style.flexWrap='wrap';
    top.append(el('span','name',it.name));if(pill)top.append(el('span','when pill '+pill[0],pill[1]));g.append(top);if(line)g.append(el('div','sub',line));r.append(iconFor(it),g);if(action)r.append(action);return r}
  /* a "How many?" the card after a scan is already asking is not asked a second time on the same screen */
  function asking(it){return !!doneInfo&&done.some(function(c){return c.id===it.id&&c.unsure})}
  function todayCards(use,buy){var cards=[],kit=items.filter(function(i){return areaOf(i)==='Kitchen'&&i.qty>0}).length>=2;
    if(use.length){var urgent=use.filter(function(i){return expiry(i).d<=0}),kitUse=use.filter(function(i){return areaOf(i)==='Kitchen'&&expiry(i).d>=0});
      var rows=use.slice(0,4).map(function(it){var e=expiry(it);return itemLine(it,whenPill(it),'',e.d<0?btn('mini','Threw it away',function(){return binIt(it)}):btn('mini','Used it all',function(){return useUp(it)}))});
      if(use.length>4){var mr=btn('link','And '+(use.length-4)+' more at home',function(){stat='use';go('pantry')});mr.style.minHeight='44px';rows.push(mr)}
      cards.push(groupCard(urgent.length?'Use today':'Use first',use.length===1?'The '+use[0].name.toLowerCase()+' goes first':urgent.length?'These go first':'Use these in the next few days','',rows,
        kitUse.length&&kit?btn('btn primary block','Show me a dish with '+(kitUse.length===1?'it':'them'),cookIdeas):null))}
    var outE=buy.filter(function(i){return i.essential&&i.qty<=0}),low=items.filter(maybeLow).sort(function(a,b){return plan(a).days-plan(b).days}),listN=buy.length+extras.length;
    if(outE.length||low.length){var rr=[];
      outE.slice(0,3).forEach(function(it){rr.push(itemLine(it,['bad','Out'],'An essential. It is on your list.'))});
      low.slice(0,3).forEach(function(it){rr.push(itemLine(it,['warn','My guess'],it.learned?'You buy it about every '+every(it.finish_days):'May be running low',btn('mini','Add',function(){return remindAnswer([it],'add')})))});
      cards.push(groupCard('Running out',outE.length?"Don't run out":'These may be running low',listN?'Your list has '+listN+(listN===1?' thing.':' things.'):'',rr,listN?btn('btn primary block','Open my list',function(){go('list')}):null))}
    var warn=items.filter(function(i){return i.warn&&i.qty>0}),many=items.filter(function(i){return i.unsure&&i.qty>0&&!asking(i)});
    if(warn.length||many.length){var cr=[];
      many.slice(0,2).forEach(function(it){var w=el('div');w.style.padding='8px 0';w.append(itemLine(it,['warn','How many?'],it.source==='shelf'?'I could not count these in your photo.':'You did not say how many.'),howMany(it.id,it.name,function(){refresh().catch(function(){})}));cr.push(w)});
      warn.slice(0,3).forEach(function(it){cr.push(itemLine(it,['bad','Check label'],cap(it.warn)+'.',btn('mini','Show',function(){showItem(it)})))});
      cards.push(groupCard('Check these',warn.length?'Read the label before anyone eats these':'Tell me how many','',cr,null))}
    if(!use.length&&kit){var dr=el('div','row'),dg=el('div','grow');dr.append(catIcon('Pantry'),dg);dg.append(el('div','sub','Ideas from what you have, using what goes off first.'));
      cards.push(groupCard('Dinner idea','What can I cook tonight?','',[dr],btn('btn primary block','See ideas',cookIdeas)))}
    if(!cards.length&&listN)cards.push(groupCard('Your list',listN+(listN===1?' thing to buy':' things to buy'),'',[],btn('btn primary block','Open my list',function(){go('list')})));
    return cards.slice(0,3)}
  /* The photo in the card, with a box round each thing found, coloured by what happened to it. Tap a box to find its line. */
  function lowKey(n){return String(n||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()}
  function sameThing(a,b){a=lowKey(a);b=lowKey(b);if(!a||!b)return false;if(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0)return true;
    var wa=a.split(' ').filter(function(w){return w.length>2}),wb=b.split(' ').filter(function(w){return w.length>2});return wa.some(function(w){return wb.indexOf(w)>=0||wb.indexOf(w.replace(/s$/,''))>=0})}
  function markState(m){if(!m.name)return {k:'none',label:'Not a product'};
    var c=done.filter(function(x){return x.action==='add'&&sameThing(x.name,m.name)})[0];if(c)return {k:'added',label:c.name,id:c.id};
    var dq=((doneInfo&&doneInfo.doubts)||[]).filter(function(x){return sameThing(x.name,m.name)})[0];if(dq)return {k:'asked',label:dq.name+'?',doubt:lowKey(dq.name)};
    if(items.some(function(i){return sameThing(i.name,m.name)}))return {k:'known',label:m.name};
    return {k:'none',label:m.failed?'Could not read':m.name}}
  var STATE_WORD={added:'added',asked:'I need you to check',known:'already at home',none:'left out'};
  function shotView(card){var d=doneInfo;if(!d||!d.photo||!d.boxes||!d.boxes.length)return;
    var fig=el('figure','shot'),img=el('img');img.src=d.photo;img.alt='Your photo, with a box round each thing I found';fig.append(img);
    var marks={};(d.marks||[]).forEach(function(m){marks[m.id]=m});var n={added:0,asked:0,known:0,none:0};
    d.boxes.forEach(function(b){var m=marks[b.id]||{name:''},st=markState(m),bx=el('button','bx '+st.k);bx.type='button';n[st.k]++;
      bx.style.left=(b.x*100)+'%';bx.style.top=(b.y*100)+'%';bx.style.width=(b.w*100)+'%';bx.style.height=(b.h*100)+'%';bx.dataset.box=b.id;
      bx.setAttribute('aria-label',st.label+', '+STATE_WORD[st.k]);if(st.k!=='none'){var t=el('span','',st.label);bx.append(t)}
      bx.onclick=function(){Array.prototype.forEach.call(card.querySelectorAll('.hl'),function(e){e.classList.remove('hl')});bx.classList.add('hl');
        var row=st.id?card.querySelector('li[data-id="'+st.id+'"]'):st.doubt?card.querySelector('li[data-doubt="'+st.doubt+'"]'):null;
        if(row){row.classList.add('hl');row.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}};
      fig.append(bx)});
    var key=el('figcaption','sub');
    key.textContent=[n.added?n.added+' added':'',n.asked?n.asked+' to check':'',n.known?n.known+' already at home':'',n.none?n.none+' left out':''].filter(Boolean).join(' · ');
    var lg=el('div','legend');[['added','Added'],['asked','Check'],['known','At home'],['none','Left out']].forEach(function(p){if(n[p[0]]){var s2=el('span','lg '+p[0]);s2.append(el('i'),document.createTextNode(p[1]));lg.append(s2)}});
    card.append(fig,lg,key);
    /* a line of the card lights up its box */
    card.addEventListener('click',function(ev){var li=ev.target.closest&&ev.target.closest('li[data-id],li[data-doubt]');if(!li||ev.target.closest('button,input,form'))return;
      Array.prototype.forEach.call(card.querySelectorAll('.hl'),function(e){e.classList.remove('hl')});li.classList.add('hl');
      var key2=li.dataset.id||li.dataset.doubt;d.boxes.some(function(b){var st=markState(marks[b.id]||{name:''});if((st.id&&st.id===key2)||(st.doubt&&st.doubt===key2)){var e=fig.querySelector('[data-box="'+b.id+'"]');if(e)e.classList.add('hl');return true}return false})})}
  function doneCard(v){if(!doneInfo||(!done.length&&!(doneInfo.doubts&&doneInfo.doubts.length)))return;
    var c=el('div','need'),hd=el('div','row'),g=el('div','grow');hd.append(g);g.append(el('h3','',doneInfo.title),el('div','sub',doneInfo.sub));c.append(hd);
    if(doneInfo.heard){var hp=el('p','heard',doneInfo.heard);c.append(hp)}
    shotView(c);var ul=el('ul','list');doneRows(ul);c.append(ul);doubtRows(c);
    var acts=el('div','acts'),ok=btn('btn primary','Done',function(){if(doneInfo&&doneInfo.photo)URL.revokeObjectURL(doneInfo.photo);doneInfo=null;done=[];renderToday()}),un=btn('btn','Undo all',undoAll);acts.append(ok);if(done.length)acts.append(un);c.append(acts);v.append(c)}
  function welcome(v){
    var w=el('div','card welcome');
    var sn=el('label','btn primary block filebtn'),fi=el('input');fi.type='file';fi.accept='image/*';fi.setAttribute('aria-label','Photograph your fridge or a shelf');sn.append(icon('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7'),document.createTextNode('Snap your fridge'),fi);
    var terms=el('p','sub','I list what I can see; you fix anything I got wrong. Starting accepts the photo reader’s terms once, so I will not ask again.'),rt=el('button','link','Read the terms');rt.type='button';rt.style.minHeight='44px';rt.style.alignSelf='flex-start';rt.style.marginTop='-10px';rt.onclick=function(){lastScan=null;$('licDlg').showModal()};
    var row=el('div','acts'),rc=el('label','btn filebtn','Scan a receipt'),ri=el('input');ri.type='file';ri.accept='image/*';ri.setAttribute('aria-label','Photograph a receipt');rc.append(ri);rc.style.flex='1';
    var tm=btn('btn','Just tell me',function(){openChat()});tm.style.flex='1';row.append(rc,tm);
    [[fi,'shelf'],[ri,'bill']].forEach(function(x){x[0].addEventListener('change',function(){var f=x[0].files&&x[0].files[0];x[0].value='';if(!f)return;
      (async function(){try{await api('/api/agree',{method:'POST'})}catch(e){if(e.code==='locked')return}
        scan(async function(){return api('/api/scan/'+x[1],{method:'POST',body:JSON.stringify({image:await shrink(f)})})},x[1]==='shelf'?'Looking at the shelf':'Reading the bill')})()})});
    w.append(sn,terms,rt,row);v.append(w);starterCard(v)}
  function renderToday(){
    var v=$('v-today');v.textContent='';
    var use=items.filter(needsUse).sort(function(a,b){return expiry(a).d-expiry(b).d}),buy=items.filter(needsBuy).sort(function(a,b){return plan(a).days-plan(b).days});
    var n=needCount(),hero=el('div','hero'),top=el('div');
    var part=profile?(profile.members||[]).filter(function(m){return m.when}):[];
    top.append(el('span','hpill',!items.length?'Hello':buddy()+' is keeping watch'));top.lastChild.style.minHeight='0';top.lastChild.style.padding='4px 12px';top.lastChild.style.fontSize='.7813rem';top.lastChild.style.display='inline-block';
    var words=['','One thing','Two things','Three things'];
    top.append(el('h2','',!items.length?'Hi'+(me?' '+me:'')+', I’m '+buddy()+'.':n?(words[n]||n+' things')+(n===1?' needs':' need')+' you':"Nothing urgent today"));top.lastChild.style.marginTop='8px';
    top.append(el('p','says',!items.length?'Let’s see what you have. One photo is enough to start.':toteLine(use,buy,n)));
    var hr=el('div','herorow'),th=el('div','totehost');th.id='toteHome';hr.append(top,th);hero.append(hr);
    if(window.Tote&&!$('chatDlg').open){Tote.onTap=openChat;Tote.mood(!items.length?'happy':use.some(function(i){return expiry(i).d<=0})||buy.some(function(i){return i.essential&&i.qty<=0})?'alert':'happy');Tote.mount(th,112,buddy()+', your helper. Tap to talk.')}
    v.append(hero);
    doneCard(v);
    if(handoff){var hc=el('div','card'),ha=el('div','acts'),hs=el('label','btn primary filebtn','Scan the order'),hi=el('input'),hn=btn('btn','Not now',async function(){handoff=null;renderToday();try{await api('/api/handoff',{method:'DELETE'})}catch(er){}});
      hi.type='file';hi.accept='image/*';hi.setAttribute('aria-label','Pick a screenshot of your '+handoff.store+' order');hs.append(hi);hs.style.flex=hn.style.flex='1';
      hi.addEventListener('change',function(){var f=hi.files&&hi.files[0];hi.value='';if(!f)return;scan(async function(){return api('/api/scan/bill',{method:'POST',body:JSON.stringify({image:await shrink(f)})})},'Reading the order')});
      hc.append(el('h3','','Has your '+handoff.store+' order arrived?'),el('p','sub','Take a screenshot of the order and I will put everything away. No typing.'));ha.append(hs,hn);hc.append(ha);v.append(hc)}
    if(!items.length){welcome(v);return}
    if(part.length){var wh=el('div','card'),wc=el('div','wrapchips');wh.append(el('h3','',"Who's home this week?"),el('p','sub','Tap anyone who is away. I stretch how long things last and plan dinners for who is here.'));
      part.forEach(function(m){var b=el('button','chip',m.name+(m.away?', away':', home'));b.type='button';b.setAttribute('aria-pressed',m.away?'false':'true');b.setAttribute('aria-label',m.name+(m.away?', away this week':', home this week'));
        b.onclick=async function(){m.away=!m.away;render();try{var r=await api('/api/profile',{method:'POST',body:JSON.stringify(profile)});profile=r.profile;render();toast(m.away?m.name+' is away this week.':m.name+' is home this week.')}
          catch(e){m.away=!m.away;render();if(e.code!=='locked')toast(why(e,'Could not save that.'))}};wc.append(b)});
      wh.append(wc);v.append(wh)}
    todayCards(use,buy).forEach(function(c){v.append(c)});
  }

  var stat='all';
  /* who an item can belong to: everyone, or one of the people added to the home */
  function owners(){var o=[''];if(profile)(profile.members||[]).forEach(function(m){o.push(m.name)});if(me&&o.indexOf(me)<0)o.push(me);return o.length>2||(profile&&profile.members&&profile.members.length)?o:['']}
  function ownerFill(sel,cur){sel.textContent='';var o=owners();if(cur&&o.indexOf(cur)<0)o.push(cur);o.forEach(function(n){var op=el('option','',n||'Everyone');op.value=n;sel.append(op)});sel.value=cur||''}
  function fullName(it){return it.name+(it.note?', '+it.note:'')}
  function howMany(id,name,after){var w=el('div','wrapchips');w.setAttribute('role','group');w.setAttribute('aria-label','How many '+name);
    [1,2,3,4,6].forEach(function(n){var b=el('button','mini',String(n));b.type='button';b.setAttribute('aria-label',n+' of '+name);
      b.onclick=async function(){w.querySelectorAll('button').forEach(function(x){x.disabled=true});try{await api('/api/items/'+id,{method:'PATCH',body:JSON.stringify({qty:n})});after(n)}
        catch(er){w.querySelectorAll('button').forEach(function(x){x.disabled=false});if(er.code!=='locked')toast(why(er,'Could not save that.'))}};w.append(b)});
    var ok=el('button','mini','Skip');ok.type='button';ok.onclick=async function(){try{var cur=items.filter(function(i){return i.id===id})[0];await api('/api/items/'+id,{method:'PATCH',body:JSON.stringify({qty:cur?cur.qty:1})});after(cur?cur.qty:1)}catch(er){}};w.append(ok);return w}
  function itemBlock(it){
    var wrap=el('div','it'),e=expiry(it),p=plan(it),isOpen=!!open[it.id];
    var head=el('button','ihead'),g=el('span','grow'),sub=el('span','sub');head.type='button';head.setAttribute('aria-expanded',isOpen?'true':'false');
    if(it.qty<=0)sub.append(el('span','pill bad','Out'));
    else if(it.low)sub.append(el('span','pill warn','Running low'));
    else if(e&&e.cls)sub.append(el('span','pill '+e.cls,e.text));
    else if(it.expiry)sub.append(document.createTextNode(it.expiry_est&&daysFrom(it.expiry)>=150&&areaOf(it)!=='Health'?'Keeps a long time':'Best before '+fmt(it.expiry)));
    if(it.learned&&it.qty>0&&!it.low){var lp=el('span','','You buy it about every '+every(it.finish_days));lp.style.color='var(--accent)';lp.style.fontWeight='600';sub.append(lp)}
    if(it.warn)sub.append(el('span','pill bad','Check label: '+it.warn));
    if(it.unsure&&it.qty>0)sub.append(el('span','pill warn','How many?'));
    if(it.frozen)sub.append(el('span','pill plain','Frozen'));
    if(it.essential)sub.append(el('span','pill plain','Essential'));
    if(it.owner)sub.append(el('span','pill plain',it.owner+"'s"));
    g.append(el('span','name',fullName(it)),sub);
    head.append(iconFor(it),g,el('span','q',amt(it)),icon('M6 9l6 6 6-6'));
    if(turned===it.id){head.classList.add(isOpen?'in':'out')}head.onclick=function(){open[it.id]=!open[it.id];turned=it.id;renderPantry();turned=null};wrap.append(head);
    if(!isOpen)return wrap;
    var panel=el('div','ipanel'+(turned===it.id?' in':'')),q2=el('span','qty'),minus=el('button','','\u2212'),plus=el('button','','+');minus.type=plus.type='button';
    minus.setAttribute('aria-label','Use some '+it.name);plus.setAttribute('aria-label','Add more '+it.name);
    var step=it.qty>=100?50:(it.unit==='kg'||it.unit==='L'||it.unit==='lb')?0.5:1;
    minus.onclick=function(){setQty(it,Math.max(0,it.qty-step))};plus.onclick=function(){setQty(it,it.qty+step)};
    q2.append(minus,el('span','',it.qty<=0?'0':amount(it.qty,it.unit)),plus);panel.append(q2);
    var acts=el('div','acts'),outB=el('button','mini','Ran out'),essB=el('button','mini',it.essential?'Essential':'Make essential');
    outB.type=essB.type='button';outB.disabled=it.qty<=0;essB.setAttribute('aria-pressed',it.essential?'true':'false');
    outB.onclick=async function(){try{var u=await useUp(it,true);toast(it.name+' is on your shopping list.','Undo',u)}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    essB.onclick=async function(){it.essential=it.essential?0:1;render();try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({essential:!!it.essential})});
      toast(it.essential?it.name+' is an essential. I will warn you earlier.':it.name+' is no longer an essential.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    var frB=el('button','mini',it.frozen?'In the freezer':'Put in freezer'),binB=el('button','mini','Threw it away');frB.type=binB.type='button';frB.setAttribute('aria-pressed',it.frozen?'true':'false');
    frB.onclick=async function(){it.frozen=it.frozen?0:1;render();try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({frozen:!!it.frozen})});toast(it.frozen?it.name+' is frozen. I will stop counting down its date.':it.name+' is out of the freezer.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    binB.onclick=async function(){try{var u=await binIt(it,true);toast('It happens. I have noted the '+it.name.toLowerCase()+' and will not nag you to rebuy it.','Undo',u)}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    var quiet=learnt.muted.indexOf(it.name_key)>-1,remB=el('button','mini',quiet?'Reminders off':'Reminders on');remB.type='button';remB.setAttribute('aria-pressed',quiet?'true':'false');remB.setAttribute('aria-label',(quiet?'Turn reminders back on for ':'Stop reminders for ')+it.name);
    remB.onclick=async function(){remB.disabled=true;try{await remindAnswer([it],quiet?'start':'stop')}catch(er){remB.disabled=false;if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    acts.append(outB,essB);if(areaOf(it)==='Kitchen'&&(it.frozen||(['Pantry','Drinks','Snacks'].indexOf(kindOf(it))<0&&freezes(it))))acts.append(frB);acts.append(binB,remB);panel.append(acts);
    /* filed in the wrong place: one pick moves it to the right room and kind */
    var mv=el('select','mini');mv.setAttribute('aria-label','Move '+it.name+' to another room');Object.keys(ROOM_CATS).forEach(function(r){var g=document.createElement('optgroup');g.label=r;ROOM_CATS[r].concat('Other').forEach(function(k){var o=document.createElement('option');o.value=r+'|'+k;o.textContent=r+' \u00b7 '+kindLabel(k);if(areaOf(it)===r&&kindOf(it)===k)o.selected=true;g.append(o)});mv.append(g)});
    mv.onchange=async function(){var v=mv.value.split('|');try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({area:v[0],category:v[1]})});await refresh();toast('Moved '+it.name+' to '+v[0]+', '+kindLabel(v[1]).toLowerCase()+'.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not move that.'))}};
    var mvr=el('label','sub','Kept in ');mvr.style.display='flex';mvr.style.gap='8px';mvr.style.alignItems='center';mvr.style.marginTop='8px';mvr.append(mv);panel.append(mvr);
    var det=el('div','meta'),nl=el('label','','Size or brand'),ni=el('input');ni.type='text';ni.maxLength=40;ni.value=it.note||'';ni.placeholder='Optional';nl.append(ni);det.append(nl);
    var saveDet=async function(body){try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify(body)});await refresh();toast('Saved.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
    ni.onchange=function(){saveDet({note:ni.value.trim()})};
    if(owners().length>1||it.owner){var ol=el('label','','Whose is it'),os=el('select');ownerFill(os,it.owner||'');ol.append(os);det.append(ol);os.onchange=function(){saveDet({owner:os.value})}}
    var ll=el('label','','Lasts you about'),ls=el('select'),opts=[[4,'A few days'],[7,'A week'],[14,'Two weeks'],[30,'A month'],[60,'Two months'],[90,'Three months'],[180,'Six months']];
    if(!opts.some(function(o){return o[0]===it.finish_days}))opts.push([it.finish_days,it.finish_days+' days']);opts.sort(function(a,b){return a[0]-b[0]});
    opts.forEach(function(o){ls.append(new Option(o[1],o[0]))});ls.value=String(it.finish_days);ll.append(ls);det.append(ll);ls.onchange=function(){saveDet({finishDays:Number(ls.value)})};
    panel.append(det);
    var f=fresh(it);
    if(f!=null){var bar=el('div','bar'),fill=el('i',e&&e.cls?e.cls:'');fill.style.width=Math.max(4,Math.round((1-f)*100))+'%';bar.append(fill);bar.setAttribute('role','img');
      bar.setAttribute('aria-label',Math.round((1-f)*100)+' percent of shelf life left');panel.append(bar)}
    var m=el('div','more'),txt=el('span');m.style.borderTop='0';m.style.paddingTop='0';
    txt.textContent=(it.bought?'Bought '+fmt(it.bought):'Purchase date not recorded')+(it.store?' at '+it.store:'')+'. '+
      (it.expiry?(it.expiry_est&&daysFrom(it.expiry)>=150?'':'Best before '+fmt(it.expiry)+(it.expiry_est?' (my estimate). ':'. ')):'')+
      (needsBuy(it)?'On your shopping list.':it.frozen?'In the freezer, so the date is on hold.':needsUse(it)?'Use it up before then.':p.days<0?'By my guess this should be nearly gone.':'My guess: you will run out around '+fmt(p.date)+', '+p.why+'.');
    var rm=el('button','danger','Remove');rm.type='button';rm.setAttribute('aria-label','Remove '+it.name);
    rm.onclick=async function(){var copy=Object.assign({},it);try{await api('/api/items/'+it.id,{method:'DELETE'});items=items.filter(function(i){return i!==it});render();toast('Removed '+it.name+'.','Undo',restoreItem(copy,false))}catch(er){if(er.code!=='locked')toast(why(er,'Could not remove it.'))}};
    m.append(txt,rm);panel.append(m);wrap.append(panel);return wrap;
  }
  /* At home: pick a room, then a kind of thing within it */
  var sub='All';
  var ROOM_CATS={Kitchen:['Produce','Dairy','Meat','Bakery','Frozen','Pantry','Drinks','Snacks'],Bathroom:['Dental','Hair','Skin and body','Paper and tissue'],
    Cleaning:['Laundry','Dishes','Surfaces','Bags and wraps'],Kids:['Diapering','Feeding','Kids care'],Pets:['Pet food','Pet care'],Health:['Medicine','Vitamins','First aid'],Home:['Batteries and bulbs','Stationery','General']};
  var ROOM_HINT={Kitchen:'the fridge or a cupboard',Bathroom:'the bathroom cabinet',Cleaning:'the cleaning cupboard',Kids:"the kids' shelf or changing table",Pets:'the pet shelf',Health:'the medicine cabinet',Home:'the drawer with batteries and bulbs'};
  var ROOM_IN={Kitchen:'the kitchen',Bathroom:'the bathroom',Cleaning:'cleaning supplies',Kids:"the kids' things",Pets:'pet supplies',Health:'the medicine cabinet',Home:'general supplies'};
  function roomLabel(a){return a==='Home'?'General':a}
  function kindOf(it){return ROOM_CATS[areaOf(it)].indexOf(it.category)>-1?it.category:'Other'}
  function kindLabel(k){return k==='Pantry'?'Cupboard staples':k==='Meat'?'Meat and fish':k}
  function fillKinds(room,kind){var k=$('addKind');k.textContent='';ROOM_CATS[room].concat(['Other']).forEach(function(c){k.append(new Option(kindLabel(c),c))});
    k.value=ROOM_CATS[room].indexOf(kind)>-1?kind:(room==='Kitchen'?'Pantry':'Other')}
  var addPicked=false;
  function openAdd(room,kind){
    var r=$('addRoom'),u=$('addUnit');if(!r.options.length){Object.keys(AREA).forEach(function(a){r.append(new Option(roomLabel(a),a))});UNITS.forEach(function(x){u.append(new Option(x,x))});
      r.onchange=function(){addPicked=true;fillKinds(r.value,'')}}
    r.value=AREA[room]?room:'Kitchen';fillKinds(r.value,kind);ownerFill($('addOwner'),'');$('addOwnerL').hidden=owners().length<2;$('addNote').value='';$('addName').value='';$('addQty').value='1';$('addEss').checked=false;
    addPicked=cat!=='All';$('addKind').onchange=function(){addPicked=true};
    $('addH').textContent=addPicked?'Add to '+ROOM_IN[r.value]:'Add something';$('addDlg').showModal();$('addName').focus();
  }
  $('addForm').addEventListener('submit',async function(ev){ev.preventDefault();
    var name=$('addName').value.trim(),room=$('addRoom').value;if(!name)return;$('addGo').disabled=true;
    try{var res=await api('/api/apply',{method:'POST',body:JSON.stringify({source:'hand',auto:!addPicked,bought:iso(today()),actions:[{action:'add',name:name,quantity:Number($('addQty').value)||1,unit:$('addUnit').value,
        area:room,category:$('addKind').value,expiry:'',shelfLifeDays:0,finishDays:room==='Kitchen'?10:45}]})});
      var extra={},nt=$('addNote').value.trim(),ow=$('addOwner').value;if($('addEss').checked)extra.essential=true;if(nt)extra.note=nt;if(ow)extra.owner=ow;
      if(Object.keys(extra).length&&res.changes&&res.changes[0])await api('/api/items/'+res.changes[0].id,{method:'PATCH',body:JSON.stringify(extra)});
      var went=res.changes&&res.changes[0]&&AREA[res.changes[0].area]?res.changes[0].area:room;
      await refresh();toast('Added '+name+' to '+ROOM_IN[went]+'. Add another, or tap Done.');$('addName').value='';$('addNote').value='';$('addEss').checked=false;$('addName').focus()}
    catch(e){if(e.code!=='locked')toast(why(e,'Could not add that.'))}finally{$('addGo').disabled=false}});
  function cash(n,cur){if(!cur)return String(Math.round(n*100)/100);try{return new Intl.NumberFormat(undefined,{style:'currency',currency:cur,maximumFractionDigits:n%1?2:0}).format(n)}catch(e){return String(n)}}
  function savedLine(){if(!saved||!saved.n)return '';return 'Used in time this month: '+saved.n+(saved.n===1?' thing':' things')+(saved.amount?', about '+cash(saved.amount,saved.currency):'')+'.'}
  function freshCard(){var fb=$('freshBar');if(!fb){fb=el('div');fb.id='freshBar';$('rooms').parentNode.insertBefore(fb,$('rooms'))}
    /* redrawn only when what it says changes, so the page under a finger does not move when something else is edited */
    var n=shelf?shelf.fresh+shelf.soon+shelf.past:0,sig=!n||(cat!=='All'&&cat!=='Kitchen')?'':[shelf.fresh,shelf.soon,shelf.past,savedLine()].join('|');
    if(fb.getAttribute('data-sig')===sig&&(sig===''||fb.firstChild))return;fb.setAttribute('data-sig',sig);if(!sig){fb.textContent='';return}
    var c=el('div','card'),bar=el('div','fresh'),fx=el('div','facts');bar.setAttribute('role','img');
    bar.setAttribute('aria-label',shelf.fresh+' fresh, '+shelf.soon+' to use soon, '+shelf.past+' past the date');
    [['f',shelf.fresh],['s',shelf.soon],['p',shelf.past]].forEach(function(x){if(!x[1])return;var i=el('i',x[0]);i.style.flex=String(x[1]);bar.append(i)});
    fx.style.alignItems='center';if(shelf.fresh){var a=el('span');a.append(el('b','',String(shelf.fresh)),document.createTextNode(' fresh'));fx.append(a)}
    if(shelf.soon){var b=btn('link',shelf.soon+' to use soon',function(){stat='use';renderPantry()});b.style.minHeight='44px';fx.append(b)}
    if(shelf.past){var p2=btn('link',shelf.past+' past the date',function(){stat='use';renderPantry()});p2.style.minHeight='44px';fx.append(p2)}
    c.append(el('div','sub','Dated food in the kitchen'),bar,fx);var sl=savedLine();if(sl)c.append(el('p','sub',sl));fb.replaceChildren(c)}
  function renderPantry(){
    var rooms=$('rooms');rooms.textContent='';freshCard();
    [['All','Whole home',[160,'M4 11l8-7 8 7v9h-5v-6H9v6H4z']]].concat(Object.keys(AREA).map(function(a){return [a,roomLabel(a),AREA[a]]})).forEach(function(r){
      var list=r[0]==='All'?items:items.filter(function(i){return areaOf(i)===r[0]}),att=list.filter(function(i){return needsUse(i)||needsBuy(i)}).length;
      var b=el('button','room'),ic=el('span','ico');b.type='button';b.setAttribute('aria-pressed',cat===r[0]?'true':'false');ic.style.setProperty('--h',r[2][0]);ic.append(icon(r[2][1]));
      b.append(ic,el('b','',r[1]),el('span','',list.length?list.length+(list.length===1?' thing':' things'):'Nothing yet'));
      if(att)b.append(el('span','pill warn',att+' to check'));
      b.onclick=function(){cat=r[0];sub='All';renderPantry()};rooms.append(b)});
    if(cat!=='All'&&!AREA[cat])cat='All';
    var scope=cat==='All'?items:items.filter(function(i){return areaOf(i)===cat});
    var kinds=cat==='All'?[]:ROOM_CATS[cat].concat(['Other']).filter(function(k){return scope.some(function(i){return kindOf(i)===k})}),c2=$('chips2');
    c2.textContent='';c2.hidden=kinds.length<2;if(kinds.indexOf(sub)<0)sub='All';
    if(kinds.length>=2)[['All','All '+scope.length]].concat(kinds.map(function(k){return [k,kindLabel(k)+' '+scope.filter(function(i){return kindOf(i)===k}).length]})).forEach(function(k){
      var b=el('button','chip',k[1]);b.type='button';b.setAttribute('aria-pressed',sub===k[0]?'true':'false');b.onclick=function(){sub=k[0];renderPantry()};c2.append(b)});
    var use=scope.filter(needsUse).length,buy=scope.filter(needsBuy).length,ess=scope.filter(function(i){return i.essential}).length,chips=$('chips');
    chips.textContent='';chips.hidden=!scope.length;
    [['all','Everything',''],['use','Use soon',use],['buy','Out or low',buy],['ess','Essentials',ess]].forEach(function(c){
      var b=el('button','chip',c[1]+(c[2]===''?'':' '+c[2]));b.type='button';b.setAttribute('aria-pressed',stat===c[0]?'true':'false');b.onclick=function(){stat=c[0];renderPantry()};chips.append(b)});
    var q=query.toLowerCase(),shown=scope.filter(function(it){return (sub==='All'||kindOf(it)===sub)&&(!q||it.name.toLowerCase().indexOf(q)>-1)&&
      (stat==='all'||(stat==='use'?needsUse(it):stat==='buy'?needsBuy(it):!!it.essential))});
    $('addHere').textContent=cat==='All'?'+ Add something':'+ Add to '+ROOM_IN[cat];$('addHere').onclick=function(){openAdd(cat==='All'?'Kitchen':cat,sub==='All'?'':sub)};
    $('pantryCount').textContent=scope.length?shown.length+(shown.length===1?' thing':' things')+(shown.length!==scope.length?' of '+scope.length:'')+(cat==='All'?' at home':' in '+ROOM_IN[cat]):'';
    var ul=$('pantryList');ul.textContent='';
    if(!scope.length){var li0=el('li');li0.append(cat==='All'?emptyCard('Pantry','Nothing here yet','Tap the plus button to add your first items.'):
      emptyCard('Other','Nothing in '+ROOM_IN[cat]+' yet','Photograph '+ROOM_HINT[cat]+' and I will list what is there, or just tell me.','Add things',function(){$('capDlg').showModal()}));
      li0.querySelector('.ico').replaceWith((function(){var s=el('span','ico');var A=cat==='All'?AREA.Kitchen:AREA[cat];s.style.setProperty('--h',A[0]);s.append(icon(A[1]));return s})());ul.append(li0);return}
    if(!shown.length){var li1=el('li');li1.append(emptyCard('Pantry','Nothing matches','Try a different search or filter.'));ul.append(li1);return}
    var rorder=Object.keys(AREA);
    function gkey(it){var a=areaOf(it),k=kindOf(it);return cat==='All'?(k==='Other'?roomLabel(a):roomLabel(a)+' \u00b7 '+kindLabel(k)):kindLabel(k)}
    function gord(it){var a=areaOf(it),ki=ROOM_CATS[a].indexOf(it.category);return rorder.indexOf(a)*100+(ki<0?99:ki)}
    function rank(it){return it.qty<=0?0:it.low?1:needsUse(it)?2:3}
    shown.sort(function(a,b){return gord(a)-gord(b)||rank(a)-rank(b)||a.name.localeCompare(b.name)});
    var card=null,last=null;
    shown.forEach(function(it){var gn=gkey(it);
      if(gn!==last){last=gn;var li=el('li','sec'),hd=el('div','sechead'),n=shown.filter(function(x){return gkey(x)===gn}).length;
        hd.append(el('h2','',gn),el('span','sub',String(n)));card=el('div','card tight');li.append(hd,card);ul.append(li)}
      card.append(itemBlock(it))});
  }

  function renderList(){
    var v=$('v-list');v.textContent='';
    var buy=items.filter(needsBuy).sort(function(a,b){return plan(a).days-plan(b).days});
    var badge=$('listBadge'),count=buy.length+extras.length;badge.hidden=!count;badge.textContent=String(count);drawBell();
    var f=el('form','row'),inp=el('input'),add=el('button','btn primary','Add');
    inp.type='text';inp.id='extraText';inp.maxLength=80;inp.style.flex='1';inp.placeholder='Add anything, like birthday candles';inp.setAttribute('aria-label','Add something to the list');
    add.type='submit';f.append(inp,add);
    f.addEventListener('submit',async function(ev){ev.preventDefault();var t=inp.value.trim();if(!t)return;
      try{var how=await addToList(t);await refresh();if(how!=='added'&&how!=='many')listSaid(t,how);var n=$('extraText');if(n)n.focus()}
      catch(er){if(er.code!=='locked')toast(er.code==='full'?'The list is full. Tick a few things off first.':'Could not add that. Check your connection.')}});
    v.append(f);
    /* Before the next shop: what may run out before this home shops again, by my guess. Up to three at the top of the list, where
       the decision is made; the rest behind "Show more". When I do not know how often this home shops, it is what is due by tomorrow, as before. */
    function suggest(){
      var sug=items.filter(ahead).sort(function(a,b){return plan(a).days-plan(b).days});
      if(!sug.length)return;
      var known=!!(shop&&shop.known&&shop.days>1),ss=el('div','sec'),cs=el('div','card'),more=null;ss.id='soonLow';
      ss.append(el('h2','',known?'Before your next shop':'Might be running low'),el('p','sub',(known?'My guess: these may run out before you shop again. You shop about every '+every(shop.days)+'. ':'Going by your own pace where I know it, and a typical one where I do not. ')+'None of these are on your list unless you add them.'),cs);
      sug.forEach(function(it,n){if(n>=3&&!moreLow)return;var wrap=el('div','sec'),r=el('div','row'),g=el('div','grow'),acts=el('div','acts'),ad=el('button','mini','Add to list'),no=el('button','mini','Still have it'),p=plan(it);
        g.append(el('div','name',it.name),el('div','sub',(p.days<=0?'My guess: about to run out':'My guess: out by '+fmt(p.date))+'. Bought '+fmt(it.bought||it.added)+(it.learned?', and you buy it about every '+every(it.finish_days):', and it usually lasts about '+it.finish_days+' days')));r.append(iconFor(it),g);
        ad.type=no.type='button';ad.setAttribute('aria-label','Add '+it.name+' to the list');no.setAttribute('aria-label','Still have '+it.name);
        ad.onclick=async function(){ad.disabled=no.disabled=true;try{await remindAnswer([it],'add')}catch(er){ad.disabled=no.disabled=false;if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
        no.onclick=async function(){ad.disabled=no.disabled=true;try{await remindAnswer([it],'still',true)}catch(er){ad.disabled=no.disabled=false;if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
        acts.append(ad,no);wrap.style.gap='8px';wrap.append(r,acts);cs.append(wrap)});
      if(sug.length>3&&!moreLow){more=btn('link','Show '+(sug.length-3)+' more',function(){moreLow=true;renderList()});more.style.minHeight='44px';cs.append(more)}
      v.append(ss)}
    suggest();
    if(!count)v.append(emptyCard('Pantry','Nothing to buy','Things land here when you run out, say they are low, or add them yourself.'));
    function tick(label,fn){var ck=el('button','check');ck.type='button';ck.setAttribute('aria-label',label);ck.onclick=function(){if(!ck.firstChild)ck.append(icon('M6 12l4 4 8-9'));fn()};return ck}
    if(count){var top=el('div','acts'),so=el('button','btn primary',shops.length?'Shop at '+shopName():'Order online'),cp=el('button','btn','Copy the list');so.type=cp.type='button';so.style.flex=cp.style.flex='1';
      so.onclick=function(){openShop(extras.map(function(x){return x.text}).concat(buy.map(function(i){return i.name})))};
      cp.onclick=function(){var text='Shopping list\n'+extras.map(function(x){return '- '+x.text}).concat(buy.map(function(i){return '- '+i.name+(i.store?' ('+i.store+')':'')})).join('\n');
        try{navigator.clipboard.writeText(text).then(function(){toast('Shopping list copied.')},function(){toast(text.replace(/\n/g,'  '))})}catch(e){toast(text.replace(/\n/g,'  '))}};
      top.append(so,cp);v.append(top);
      var known=buy.concat(extras).filter(function(q){return q.paid&&q.paid.amount>0}),cur0=known.length?known[0].paid.currency:'';known=known.filter(function(q){return q.paid.currency===cur0});
      if(known.length)v.append(el('p','sub','About '+cash(known.reduce(function(t,q){return t+q.paid.amount},0),cur0)+' last time for '+(known.length===count?'everything here':known.length+' of these '+count)+', from receipts and orders you scanned.'))}
    var order=Object.keys(AREA);
    function aisle(it){var a=areaOf(it),k=kindOf(it);return a==='Kitchen'?(k==='Other'?'Kitchen':kindLabel(k)):roomLabel(a)}
    function aord(it){var a=areaOf(it),ki=ROOM_CATS[a].indexOf(it.category);return order.indexOf(a)*100+(ki<0?99:ki)}
    buy.sort(function(a,b){return aord(a)-aord(b)||plan(a).days-plan(b).days});
    var c=null,last=null;
    buy.forEach(function(it){var p=plan(it),ai=aisle(it);
      if(ai!==last){last=ai;var sec=el('div','sec');c=el('div','card tight');sec.append(el('p','grp',ai),c);v.append(sec)}
      var why=it.qty<=0?(it.learned?'You ran out. You buy it about every '+every(it.finish_days):"You're out"):it.low?'Running low':p.days<=0?'My guess: about to run out':'My guess: out by '+fmt(p.date);
      var r=el('div','row'),g=el('button','grow rowbtn');g.type='button';g.setAttribute('aria-label','Change or remove '+it.name);r.style.minHeight='64px';g.append(el('div','name',fullName(it)),el('div','sub',(it.owner?it.owner+"'s. ":'')+why+(it.store?', last bought at '+it.store:'')+(it.paid?'. '+cash(it.paid.amount,it.paid.currency)+' last time':'')));
      if(it.warn)g.append(el('span','pill bad','Check label: '+it.warn));g.onclick=function(){openRow(null,it)};
      r.append(iconFor(it),g,tick('Mark '+it.name+' as bought',function(){restock(it)}));c.append(r)});
    if(extras.length){var se=el('div','sec'),ce=el('div','card tight');se.append(el('p','grp','Added by you'),ce);
      extras.forEach(function(x){var r=el('div','row'),g=el('button','grow rowbtn');g.type='button';g.setAttribute('aria-label','Change or remove '+x.text);r.style.minHeight='64px';g.append(el('div','name',x.text),el('div','sub',(x.who?'Added by '+x.who:'Added by hand')+(x.paid?'. '+cash(x.paid.amount,x.paid.currency)+' last time':'')));
        if(x.warn)g.append(el('span','pill bad','Check label: '+x.warn));g.onclick=function(){openRow(x,null)};
        r.append(catIcon(x.kind||'Other'),g,tick('Mark '+x.text+' as bought',async function(){try{await api('/api/extras/'+x.id,{method:'DELETE'});await refresh();toast('Ticked off '+x.text+'.','Undo',putBack(x.text))}catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}}));ce.append(r)});
      v.append(se)}
    if(count)v.append(el('p','sub','Tick something when you buy it. Tap its name to change or remove it. Tracked items are restocked at home.'));
  }
  /* one row of the list: rename it, change how many, or take it off. Every change can be undone. */
  function putBack(text){return async function(){try{await api('/api/extras',{method:'POST',body:JSON.stringify({text:text.replace(/ \u00d7\d+$/,''),whole:true})});var n=Number((text.match(/ \u00d7(\d+)$/)||[])[1]||1);
    if(n>1){var d=await api('/api/items'),row=(d.extras||[]).filter(function(e){return e.text===text.replace(/ \u00d7\d+$/,'')})[0];if(row)await api('/api/extras/'+row.id,{method:'PATCH',body:JSON.stringify({count:n})})}
    await refresh();toast(text+' is back on your list.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not undo that.'))}}}
  var rowAt=null;
  function openRow(x,it){rowAt={x:x,it:it,n:x?Number((x.text.match(/ \u00d7(\d+)$/)||[])[1]||1):1};var mine=!!x;
    $('rowH').textContent=mine?'Change this':it.name;$('rowEdit').hidden=!mine;$('rowSave').hidden=!mine;$('rowHome').hidden=mine;
    $('rowSub').textContent=mine?'Rename it, change how many, or take it off your list.':(it.qty<=0?'On your list because you are out.':it.low?'On your list because it is running low.':'On your list because it is an essential that is about to run out.')+' Taking it off the list changes nothing at home.';
    if(mine){$('rowText').value=x.text.replace(/ \u00d7\d+$/,'');$('rowN').textContent=String(rowAt.n)}
    $('rowDlg').showModal()}
  $('rowLess').onclick=function(){rowAt.n=Math.max(1,rowAt.n-1);$('rowN').textContent=String(rowAt.n)};
  $('rowMore').onclick=function(){rowAt.n=Math.min(99,rowAt.n+1);$('rowN').textContent=String(rowAt.n)};
  $('rowForm').addEventListener('submit',async function(ev){ev.preventDefault();if(!rowAt||!rowAt.x)return;var t=$('rowText').value.trim();if(!t)return;
    try{await api('/api/extras/'+rowAt.x.id,{method:'PATCH',body:JSON.stringify({text:t,count:rowAt.n})});$('rowDlg').close();await refresh();toast('Saved.')}
    catch(er){if(er.code!=='locked')toast(er.code==='already'?'That is already on your list.':why(er,'Could not save that.'))}});
  $('rowOff').onclick=async function(){if(!rowAt)return;var x=rowAt.x,it=rowAt.it;
    try{if(x){await api('/api/extras/'+x.id,{method:'DELETE'});$('rowDlg').close();await refresh();toast('Took '+x.text+' off your list.','Undo',putBack(x.text))}
      else{var low=!!it.low;await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({offList:true})});$('rowDlg').close();await refresh();
        toast('Took '+it.name+' off your list. It will come back the next time you run out.','Undo',async function(){try{await api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({offList:false,low:low})});await refresh()}catch(er){if(er.code!=='locked')toast(why(er,'Could not undo that.'))}})}}
    catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
  $('rowHome').onclick=function(){var it=rowAt&&rowAt.it;if(!it)return;afterClose($('rowDlg'),function(){showItem(it)})};
  /* Handing the list to a store. No store lets another app fill a basket, so each thing opens as a search in that store,
     and one tap copies the whole list and opens the store. Links are built here from the list; nothing is sent by Tote. */
  var STORES={Amazon:'https://www.amazon.com/s?k={q}',Instacart:'https://www.instacart.com/store/s?k={q}',Walmart:'https://www.walmart.com/search?q={q}'},store='';
  function shopMap(){var m={};(shops.length?shops:Object.keys(STORES).map(function(k){return {name:k,url:STORES[k]}})).forEach(function(x){m[x.name]=x.url});return m}
  function shopName(){var m=shopMap(),k=store;try{k=k||localStorage.getItem('stocker.store')||''}catch(e){}return m[k]?k:Object.keys(m)[0]}
  function bareName(n){return String(n).replace(/ \u00d7\d+$/,'').replace(/\s*\([^)]*\)\s*$/,'').trim()}
  function handed(k){if(!shops.some(function(x){return x.name===k}))return;handoff={store:k};api('/api/handoff',{method:'POST',body:JSON.stringify({store:k})}).catch(function(){})}
  function openShop(names){
    var m=shopMap();store=shopName();
    function draw(){
      var ch=$('shopStores');ch.textContent='';Object.keys(m).forEach(function(k){var b=el('button','chip',k);b.type='button';b.setAttribute('aria-pressed',k===store?'true':'false');
        b.onclick=function(){store=k;try{localStorage.setItem('stocker.store',k)}catch(e){}draw();renderList()};ch.append(b)});
      $('shopSub').textContent='Tap a thing to find it at '+store+'. Each opens in a new tab, and you add it to your basket there.';
      var go1=$('shopGo');go1.textContent='Copy the list and open '+store;go1.hidden=!names.length;
      go1.onclick=function(){var text=names.map(bareName).join('\n');try{navigator.clipboard.writeText(text)}catch(e){}handed(store);window.open(m[store].replace('{q}',encodeURIComponent(bareName(names[0]))),'_blank','noopener');toast('List copied. '+store+' is open at '+bareName(names[0])+'.')};
      var ul=$('shopList');ul.textContent='';names.forEach(function(n){var li=el('li'),a=el('a','btn block','Find '+bareName(n)+' at '+store);a.href=m[store].replace('{q}',encodeURIComponent(bareName(n)));a.target='_blank';a.rel='noopener';
        a.style.textDecoration='none';a.style.justifyContent='flex-start';a.addEventListener('click',function(){handed(store);a.textContent='Opened: '+bareName(n)});li.append(a);ul.append(li)});
    }
    draw();$('shopDlg').showModal();
  }
  async function restock(it){
    var s=parse(it.bought||it.added),e=parse(it.expiry),shelf=s&&e&&e>s?Math.round((e-s)/DAY):0;
    var q=it.unit==='g'||it.unit==='ml'?500:it.unit==='oz'?16:1;
    try{var res=await api('/api/apply',{method:'POST',body:JSON.stringify({source:'hand',store:it.store||'',bought:iso(today()),
      actions:[{action:'add',name:it.name,quantity:q,unit:it.unit,category:it.category,area:areaOf(it),expiry:'',shelfLifeDays:shelf,finishDays:it.finish_days,restock:true}]})});
      await refresh();var ch=(res.changes||[])[0],ll=learntLine(res.changes);if(ll)say(ll.trim());
      toast('Restocked '+it.name+(ch?' with '+amount(ch.added,ch.unit):'')+'.','Undo',async function(){try{if(ch)await takeBack(ch);await refresh();toast(it.name+' is back on your list.')}catch(er){if(er.code!=='locked')toast(why(er,'Could not undo that.'))}})}
    catch(er){if(er.code!=='locked')toast(why(er,'Could not save that.'))}
  }

  var POT='M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 10h18M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2';
  var SRC={cook:['Cooked',POT,20],bill:['Receipt','M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',165],shelf:['Shelf photo','M4 7h3l2-3h6l2 3h3v13H4z',205],voice:['Voice note','M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3',355],
    barcode:['Barcode','M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12',265],text:['Typed note','M4 20h4L19 9l-4-4L4 16z',35],hand:['By hand','M6 12l4 4 8-9',135]};
  /* curated kits: checklists for real situations, checked against what is already at home */
  var KITS=[
    {t:'School lunchbox week',s:'Five days of lunches, sorted',p:['mom','dad','family4','big'],i:['Bread','Cheese slices','Yogurt','Apples','Carrots','Crackers','Granola bars','Juice boxes','Sandwich bags']},
    {t:'New baby basics',s:'What you reach for ten times a day',p:['mom','dad','newparents'],i:['Diapers','Baby wipes','Diaper cream','Formula','Baby wash','Baby laundry detergent','Infant fever medicine']},
    {t:'Meal-prep Sunday',s:'A week of high-protein meals',p:['gym','fit','pro'],i:['Chicken breast','Rice','Broccoli','Sweet potatoes','Eggs','Oats','Greek yogurt','Frozen berries','Olive oil']},
    {t:'Dorm room starter',solo:1,s:'Everything for a first week away',p:['student'],i:['Instant noodles','Cereal','Milk','Coffee','Snacks','Laundry pods','Dish soap','Toilet paper','Trash bags','Paper towels']},
    {t:'Plant-based pantry',s:'The staples a vegan kitchen runs on',p:['vegan'],i:['Tofu','Lentils','Chickpeas','Oat milk','Nutritional yeast','Quinoa','Peanut butter','Canned tomatoes','Vitamin B12']},
    {t:'Friday taco night',s:'One dinner everyone agrees on',p:['mom','dad','family4','big'],i:['Taco shells','Ground beef','Salsa','Cheese','Lettuce','Tomatoes','Sour cream','Limes']},
    {t:'Sick day kit',s:'So nobody goes out at 9pm',p:[],i:['Fever medicine','Cough syrup','Throat lozenges','Tissues','Electrolyte drink','Chicken soup','Honey','Tea']},
    {t:'Guests this weekend',s:'Ready before the doorbell rings',p:['host','couple'],i:['Coffee','Milk','Eggs','Bread','Fruit','Snacks','Sparkling water','Toilet paper','Hand soap','Paper towels']},
    {t:'Easy breakfasts',s:'Mornings on autopilot',p:['pro','solo'],i:['Eggs','Bread','Oats','Bananas','Yogurt','Butter','Coffee','Orange juice']},
    {t:'Deep clean day',s:'Every surface, one trip',p:[],i:['All-purpose cleaner','Dish soap','Sponges','Trash bags','Paper towels','Laundry detergent','Toilet cleaner','Glass cleaner']},
    {t:'Storm shelf',s:'Three days without the shops',p:[],i:['Bottled water','Canned soup','Pasta','Peanut butter','Crackers','Batteries','Candles','First aid supplies']},
    {t:'Pet essentials',s:'For the family member who cannot ask',p:['petparent'],i:['Pet food','Pet treats','Poop bags','Cat litter','Flea treatment']},
    {t:'Flat share staples',solo:1,s:'The things everyone uses and nobody buys',p:['roommates','student'],i:['Toilet paper','Dish soap','Trash bags','Cooking oil','Rice','Salt','Sponges','Paper towels','Laundry detergent']},
    {t:'Medicine cabinet check',s:'In date and in stock before you need it',p:['empty','carer','newparents'],i:['Pain reliever','Antacid','Bandages','Antiseptic','Thermometer','Allergy tablets','Cough syrup','Electrolyte drink']},
    {t:'Grandkids are coming',s:'Stocked before they arrive',p:['empty'],i:['Milk','Cereal','Juice boxes','Fruit','Snacks','Pasta','Ice cream','Cheese']},
    {t:'Dinner for friends',s:'A proper meal without a second trip',p:['host','couple'],i:['Olive oil','Pasta','Parmesan','Garlic','Lemons','Butter','Fresh herbs','Sparkling water','Chocolate']},
    {t:'Five-minute dinners',s:'For the nights cooking is not happening',p:['pro','solo','student'],i:['Eggs','Frozen meals','Instant noodles','Canned soup','Tortillas','Cheese','Salad kits','Frozen vegetables']}];
  function words(n){return n.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(function(w){return w.length>3?w.replace(/(es|s)$/,''):w})}
  function same(a,b){var x=words(a),y=words(b);if(x.length>y.length){var t=x;x=y;y=t}return x.length>0&&x.every(function(w){return y.indexOf(w)>-1})}
  function kitState(n){
    if(items.some(function(i){return i.qty>0&&!i.low&&same(i.name,n)}))return 'home';
    if(extras.some(function(x){return same(x.text,n)})||items.some(function(i){return needsBuy(i)&&same(i.name,n)}))return 'list';
    return 'need';
  }
  function kitItems(k){return k.i.filter(fits)}
  function openKit(k){
    function draw(){
      var list=kitItems(k),need=list.filter(function(n){return kitState(n)==='need'}),ul=$('kitList');ul.textContent='';
      var atHome=list.filter(function(n){return kitState(n)==='home'}).length,listed=list.length-need.length-atHome;
      $('kitH').textContent=k.t;$('kitSub').textContent=k.s+'. '+(atHome===list.length?'You have everything.':'You have '+atHome+' of '+list.length+' at home'+(listed?', and '+listed+(listed===1?' is':' are')+' on your list.':'.'));
      list.forEach(function(n){var st=kitState(n),li=el('li','row'),g=el('span','grow');g.append(el('span','name',n));li.append(g);
        if(st==='home')li.append(el('span','pill ok','At home'));else if(st==='list')li.append(el('span','pill warn','On your list'));
        else{var b=el('button','mini','+ Add');b.type='button';b.setAttribute('aria-label','Add '+n+' to the shopping list');b.onclick=async function(){b.disabled=true;
          try{var how=await addToList(n);await refresh();draw();if(how!=='added')listSaid(n,how)}catch(e){b.disabled=false;if(e.code!=='locked')toast(why(e,'Could not add that.'))}};li.append(b)}
        ul.append(li)});
      var all=$('kitAll');all.hidden=!need.length;all.textContent='Add all '+need.length+' missing to my list';
      all.onclick=async function(){all.disabled=true;try{var kept=0;for(var i=0;i<need.length;i++)if((await addToList(need[i],true))==='kept')kept++;await refresh();draw();toast((need.length-kept)+' added to your shopping list.'+(kept?' '+kept+(kept===1?' was':' were')+' already there.':''))}
        catch(e){if(e.code!=='locked')toast(why(e,'Could not add everything.'))}finally{all.disabled=false}};
    }
    draw();$('kitDlg').showModal();
  }
  function renderLog(){
    var v=$('v-log');v.textContent='';
    var ps=pers().map(function(k){return ALIAS[k]||k}),mine=function(k){if(k.solo&&profile&&profile.kids>0)return false;return k.p.some(function(x){return ps.indexOf(x)>-1})},kits=KITS.filter(function(k){return kitItems(k).length>=3&&(!k.p.length||!ps.length||mine(k)||ps.indexOf('other')>-1)})
      .sort(function(a,b){return mine(b)-mine(a)});
    var kn=items.filter(function(i){return i.learned}).sort(function(a,b){return a.finish_days-b.finish_days}),sl=el('div','sec'),cl=el('div','card');
    sl.append(el('h2','','What I have learned'),el('p','sub','Only from what you do: what you buy, what runs out, and how you answer me. Tap Fix on a habit if I have it wrong.'));
    if(!kn.length&&!learnt.dishes.length)cl.append(el('p','sub','Nothing yet. Once you have bought the same thing twice I will know your pace, and remind you when it is due.'));
    kn.slice(0,8).forEach(function(i){var r=el('div','row'),g=el('div','grow'),fx=el('button','mini','Fix');fx.type='button';fx.setAttribute('aria-label','Fix what I learned about '+i.name);
      fx.onclick=function(){showItem(i)};
      g.append(el('div','name','You buy '+i.name.toLowerCase()+' about every '+every(i.finish_days)),el('div','sub',learnt.muted.indexOf(i.name_key)>-1?'Reminders off':'From your own shops'));r.append(iconFor(i),g,fx);cl.append(r)});
    if(kn.length>8)cl.append(el('p','sub','And '+(kn.length-8)+' more.'));
    if(learnt.dishes.length)cl.append(el('p','sub','Your dishes: '+learnt.dishes.slice(0,8).join(', ')+(learnt.dishes.length>8?' and '+(learnt.dishes.length-8)+' more':'')+'.'));
    var rr=el('div','row'),rg=el('div','grow'),rb=el('button','mini',pushOn?'Turn off':'Turn on');rb.type='button';rb.id='pushBtn';rb.setAttribute('aria-label',(pushOn?'Turn off':'Turn on')+' reminders on this phone');
    rg.append(el('div','name','Reminders on this phone'),el('div','sub',pushOn?'On. Around '+hourText(learnt.hour)+(learnt.hourLearned?', when you usually answer me':'')+', once a day at most, and only when something is due.':pushWhy()||'Off. I can tell you when something you buy regularly is due.'));
    rb.onclick=async function(){rb.disabled=true;try{if(pushOn)await pushDisable();else await pushEnable()}catch(er){if(er.code!=='locked')toast(why(er,'Could not change reminders.'))}rb.disabled=false};
    rr.append(rg);if(pushOn||pushCan)rr.append(rb);cl.append(rr);var sc=el('div','row'),sg=el('div','grow'),sb=el('button','mini','Open');sb.type='button';sb.setAttribute('aria-label','Open how I am tested');sg.append(el('div','name','How I am doing'),el('div','sub','How I score on my tests, week by week, and where I still go wrong.'));sb.onclick=function(){location.href='/scorecard.html'};sc.append(sg,sb);if(owner)cl.append(sc);sl.append(cl);v.append(sl);
    var sk=el('div','sec'),hd=el('div','sechead');hd.append(el('h2','',profile?(ps.length===1&&ps[0]!=='other'?'Curated for a '+PERSONA[ps[0]][0].toLowerCase():'Curated for your home'):'Curated kits'));
    if(!profile){var mk=el('button','link','Make it yours');mk.type='button';mk.onclick=openProfile;hd.append(mk)}
    sk.append(hd,el('p','sub','Checklists for real situations, checked against what you already have.'));
    var grid=el('div','tiles');kits.forEach(function(k){var list=kitItems(k),have=list.filter(function(n){return kitState(n)==='home'}).length,onl=list.filter(function(n){return kitState(n)==='list'}).length,b=el('button','tile');b.type='button';b.style.minHeight='0';
      if(mine(k))b.append(el('span','pill ok','For you'));
      b.append(el('b','',k.t),el('span','',k.s));var bar=el('div','bar'),fill=el('i');bar.style.width='100%';fill.style.width=Math.round(have/list.length*100)+'%';bar.append(fill);
      b.append(bar,el('span','',have===list.length?'All set':'Have '+have+' of '+list.length+(onl?', '+onl+' on your list':'')));b.onclick=function(){openKit(k)};grid.append(b)});
    sk.append(grid);v.append(sk);
    starterCard(v);spendCard(v);
    if(saved&&saved.n){var sv=el('div','card');sv.append(el('div','sub','Used in time this month'),el('div','name',saved.n+(saved.n===1?' thing':' things')+(saved.amount?', about '+cash(saved.amount,saved.currency):'')),el('p','sub','Food finished in its last three days instead of being thrown away'+(saved.names&&saved.names.length?': '+saved.names.slice(0,4).join(', ').toLowerCase()+'.':'.')));v.append(sv)}
    if(waste){var wc2=el('div','card');wc2.append(el('div','sub','Thrown away this month'),el('div','name',waste+(waste===1?' thing':' things')),el('p','sub','Tap Threw it away on anything you bin. I use it to suggest buying less of what gets wasted.'));v.append(wc2)}
    var sa=el('div','sec');sa.append(el('h2','','Recent activity'));
    if(!log.length){sa.append(el('p','sub','Every change is recorded here, with who made it and when.'));v.append(sa);return}
    var c=el('div','card'),ul=el('ul','tl');
    log.forEach(function(l){var s=SRC[l.source]||SRC.hand,li=el('li'),ic=el('span','ico'),g=el('div'),d=new Date(l.at);ic.style.setProperty('--h',s[2]);ic.append(icon(s[1]));
      g.append(el('div','name',(l.who?l.who+' ':'')+(l.who?l.summary:l.summary.charAt(0).toUpperCase()+l.summary.slice(1))+'.'),
        el('div','sub',s[0]+(isNaN(d)?'':', '+d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))));
      li.append(ic,g);ul.append(li)});
    c.append(ul);sa.append(c);v.append(sa);
  }
  var TITLES={today:'Today',pantry:'At home',list:'Your list',log:'Tote'};
  function render(){renderToday();renderPantry();renderList();renderLog();
    $('barDate').textContent=today().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});$('barTitle').textContent=tab==='log'?buddy():TITLES[tab];
    $('menuBtn').textContent=initial();$('tellText').textContent='Tell '+buddy()+' what changed';$('toteTab').textContent=buddy();
    /* the helper's own name everywhere it is mentioned */
    $('tellMic').setAttribute('aria-label','Talk to '+buddy());$('menuScoreT').textContent='How '+buddy()+' is doing';if(tab==='log')document.title=buddy()+' \u00b7 Stocker AI';
    if($('nudgeDlg').open)drawNudges()}
  var TABS=['today','pantry','list','log'],TITLE={today:'Today',pantry:'At home',list:'Your list',log:'Tote'},scrollAt={},skipPop=0,byPop=false;
  function go(t,how){if(TABS.indexOf(t)<0)t='today';var same=t===tab;if(!same)scrollAt[tab]=window.scrollY;tab=t;TABS.forEach(function(k){$('v-'+k).hidden=k!==t});
    document.querySelectorAll('.tab').forEach(function(b){if(b.dataset.tab===t)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
    document.title=(t==='log'?buddy():TITLE[t])+' \u00b7 Stocker AI';
    try{if(how==='start'||same)history.replaceState({tab:t},'','#'+t);else if(how!=='pop')history.pushState({tab:t},'','#'+t)}catch(e){}
    render();window.scrollTo(0,how==='pop'||how==='start'?(scrollAt[t]||0):same?0:(scrollAt[t]||0))}
  /* the back button closes a sheet first, then steps back through tabs, and only then leaves */
  document.querySelectorAll('dialog').forEach(function(d){var open=d.showModal.bind(d);
    d.showModal=function(){open();try{history.pushState({dlg:d.id,tab:tab},'')}catch(e){}};
    d.addEventListener('close',function(){if(!byPop&&history.state&&history.state.dlg===d.id){skipPop++;history.back()}})});
  window.addEventListener('popstate',function(ev){if(skipPop){skipPop--;return}
    var top=[].slice.call(document.querySelectorAll('dialog[open]')).pop();if(top){byPop=true;top.close();byPop=false;if(document.querySelector('dialog[open]'))return}
    var st=ev.state||{};if(!$('app').hidden)go(st.tab||(location.hash||'').slice(1)||'today','pop')});
  /* coming back to the app refreshes it, so another person's changes and an expired sign-in both show up */
  var lastFresh=Date.now();document.addEventListener('visibilitychange',function(){if(!document.hidden&&!$('app').hidden&&!busy&&Date.now()-lastFresh>20000){lastFresh=Date.now();refresh().catch(function(){})}});
  window.addEventListener('focus',function(){if(!$('app').hidden&&!busy&&Date.now()-lastFresh>20000){lastFresh=Date.now();refresh().catch(function(){})}});
  document.querySelectorAll('.tab').forEach(function(b){b.onclick=function(){go(b.dataset.tab)}});
  $('search').addEventListener('input',function(){query=$('search').value.trim();renderPantry()});
  var qtyTimer={};
  function setQty(it,q){it.qty=q;render();clearTimeout(qtyTimer[it.id]);
    qtyTimer[it.id]=setTimeout(function(){api('/api/items/'+it.id,{method:'PATCH',body:JSON.stringify({qty:q})}).catch(function(e){if(e.code!=='locked')toast(why(e,'Could not save that change.'))})},500)}
  async function refresh(){var before=items.filter(needsBuy).length+extras.length;var d=await api('/api/items');items=d.items||[];log=d.log||[];extras=d.extras||[];waste=d.waste||0;shelf=d.shelf||null;saved=d.saved||null;shops=d.shops||[];handoff=d.handoff||null;shop=d.shop||null;spend=d.spend||null;profile=d.profile||null;me=d.me||'';owner=d.owner!==false;signup=!!d.signup;pipe=!!d.pipe;learnt=d.learnt||learnt;reviewN=d.review||0;render();
    if(before>0&&items.filter(needsBuy).length+extras.length===0)say('List done. Nicely shopped.','party')}

  /* ---- sheets follow the finger ----
     Drag the handle: the sheet moves with the finger from wherever it is, even mid-flight. On release it keeps the finger's speed;
     where it would come to rest decides whether it closes or returns, so a short flick is enough. Pulled up past its place, it resists. */
  (function(){var calm=window.matchMedia('(prefers-reduced-motion: reduce)');
    function project(v){return v/1000*.998/(1-.998)}
    function band(over,dim){return over*dim*.55/(dim+.55*Math.abs(over))}
    document.querySelectorAll('dialog.sheet').forEach(function(d){var g=d.querySelector('.grab');if(!g)return;
      var y=0,v=0,h=1,raf=0,hold=null,hist=[];
      function put(){d.style.transform=y?'translateY('+y.toFixed(1)+'px)':'none';d.style.setProperty('--bd',String(Math.max(0,Math.min(1,1-y/h))))}
      function rest(){cancelAnimationFrame(raf);raf=0;hold=null;y=0;v=0;d.classList.remove('held');d.style.transform='';d.style.removeProperty('--bd')}
      function spring(to,damp,resp,then){var k=Math.pow(2*Math.PI/resp,2),c=4*Math.PI*damp/resp,last=0;cancelAnimationFrame(raf);
        raf=requestAnimationFrame(function tick(now){var dt=last?Math.min(.034,(now-last)/1000):.016;last=now;
          for(var n=0;n<4;n++){v+=(-k*(y-to)-c*v)*dt/4;y+=v*dt/4}
          if(Math.abs(y-to)<.5&&Math.abs(v)<25){y=to;v=0;put();raf=0;then();return}
          put();raf=requestAnimationFrame(tick)})}
      function shut(){d.close();requestAnimationFrame(function(){requestAnimationFrame(function(){if(!d.open)rest()})})}
      g.addEventListener('pointerdown',function(e){if(e.button||!d.open)return;h=d.getBoundingClientRect().height||1;
        try{y=new DOMMatrixReadOnly(getComputedStyle(d).transform).m42||0}catch(er){y=0}
        cancelAnimationFrame(raf);raf=0;v=0;d.classList.add('held');put();try{g.setPointerCapture(e.pointerId)}catch(er){}
        hold={id:e.pointerId,from:y-e.clientY};hist=[{t:e.timeStamp,y:e.clientY}];e.preventDefault()});
      g.addEventListener('pointermove',function(e){if(!hold||e.pointerId!==hold.id)return;var raw=hold.from+e.clientY;y=raw>=0?raw:-band(-raw,h);put();
        hist.push({t:e.timeStamp,y:e.clientY});while(hist.length>2&&e.timeStamp-hist[0].t>90)hist.shift()});
      function drop(e){if(!hold||e.pointerId!==hold.id)return;hold=null;var a=hist[0],b=hist[hist.length-1];
        v=b.t>a.t&&e.timeStamp-b.t<90?(b.y-a.y)/((b.t-a.t)/1000):0;
        var away=e.type==='pointerup'&&y+project(v)>h*.5;
        if(calm.matches){if(away)shut();else rest();return}
        if(away)spring(h+12,1,.3,shut);else spring(0,Math.abs(v)>300?.8:1,.3,rest)}
      g.addEventListener('pointerup',drop);g.addEventListener('pointercancel',drop);
      d.addEventListener('close',function(){if(hold||raf||d.classList.contains('held')){cancelAnimationFrame(raf);raf=0;hold=null;requestAnimationFrame(function(){if(!d.open)rest()})}})})})();
  /* switching between light and dark: transitions are off for that frame, so colours change at once instead of all moving together */
  (function(){var q=window.matchMedia('(prefers-color-scheme: dark)'),r=document.documentElement;
    function swap(){r.classList.add('swap');requestAnimationFrame(function(){requestAnimationFrame(function(){r.classList.remove('swap')})})}
    if(q.addEventListener)q.addEventListener('change',swap);else if(q.addListener)q.addListener(swap)})();
  /* ---- strips that scroll sideways stretch past their ends ----
     Dragged past the first or last chip, the strip follows the finger with resistance (the same rubber band as a sheet), and on
     release springs back from the finger's speed. Where the phone already bounces the strip itself (iOS), it is left to the phone. */
  (function(){var calm=window.matchMedia('(prefers-reduced-motion: reduce)');
    function band(over,dim){return over*dim*.55/(dim+.55*Math.abs(over))}
    document.querySelectorAll('.rooms,.chips').forEach(function(s){var x=0,v=0,raf=0,t=null,hist=[];
      function put(){s.style.transform=Math.abs(x)>.01?'translateX('+x.toFixed(1)+'px)':''}
      function home(){cancelAnimationFrame(raf);raf=0;x=0;v=0;put()}
      function spring(damp){var k=Math.pow(2*Math.PI/.4,2),c=4*Math.PI*damp/.4,last=0;cancelAnimationFrame(raf);
        raf=requestAnimationFrame(function tick(now){var dt=last?Math.min(.034,(now-last)/1000):.016;last=now;
          for(var n=0;n<4;n++){v+=(-k*x-c*v)*dt/4;x+=v*dt/4}
          if(Math.abs(x)<.5&&Math.abs(v)<20){home();return}put();raf=requestAnimationFrame(tick)})}
      s.addEventListener('touchstart',function(e){if(e.touches.length!==1){t=null;return}var p=e.touches[0];cancelAnimationFrame(raf);raf=0;v=0;
        var w=s.clientWidth||1;t={x0:p.clientX,y0:p.clientY,sl:s.scrollLeft,axis:null,r0:x?x*w/(.55*(w-Math.abs(x))):0};hist=[{t:e.timeStamp,x:x}]},{passive:true});
      s.addEventListener('touchmove',function(e){if(!t)return;var p=e.touches[0],dx=p.clientX-t.x0,dy=p.clientY-t.y0;
        if(!t.axis){if(!t.r0&&Math.abs(dx)+Math.abs(dy)<8)return;t.axis=t.r0||Math.abs(dx)>Math.abs(dy)?'x':'y'}
        if(t.axis!=='x')return;var max=s.scrollWidth-s.clientWidth,sl=s.scrollLeft,w=s.clientWidth||1,raw=0;
        if(sl<-.5||sl>max+.5){t=null;home();return}
        /* how far the finger has gone past what the scroll could take: past the start is positive, past the end negative.
           Caught while it was springing back, it carries on from where it was */
        if(t.r0){raw=t.r0+dx;if(raw*t.r0<0)raw=0}
        else if(sl<=.5&&dx>t.sl)raw=dx-t.sl;else if(sl>=max-.5&&dx<-(max-t.sl))raw=dx+(max-t.sl);
        x=raw>0?band(raw,w):raw<0?-band(-raw,w):0;put();
        hist.push({t:e.timeStamp,x:x});while(hist.length>2&&e.timeStamp-hist[0].t>90)hist.shift()},{passive:true});
      function end(e){if(!t)return;t=null;if(!x)return;var a=hist[0],b=hist[hist.length-1];
        v=b.t>a.t&&e.timeStamp-b.t<90?(b.x-a.x)/((b.t-a.t)/1000):0;
        if(calm.matches){home();return}spring(Math.abs(v)>300?.8:1)}
      s.addEventListener('touchend',end);s.addEventListener('touchcancel',end)})})();
  /* iOS only shows the pressed state of a control when something listens for touches */
  document.addEventListener('touchstart',function(){},{passive:true});

  /* ---- capture ---- */
  document.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){b.closest('dialog').close()}});
  document.querySelectorAll('dialog.sheet').forEach(function(d){d.addEventListener('click',function(ev){if(ev.target===d)d.close()})});
  $('tellOpen').onclick=function(){if(!busy)openChat()};
  $('tellSnap').onclick=function(){if(!busy)$('capDlg').showModal()};
  $('tellMic').onclick=function(){if(busy)return;openChat(true);startRec()};
  $('chatSnap').onclick=function(){$('chatDlg').close();$('capDlg').showModal()};
  $('chatTalk').onclick=function(){startRec()};
  $('chatCode').onclick=function(){$('chatDlg').close();$('capCode').click()};
  var draft=null,mem=null,memAt=-1,ui={more:{},adding:''},helloAt=-1,sortBack='';
  function redraw(){if(helloAt>-1)drawHello();else drawProfile();if(mem)drawMember()}
  /* a chip group: suggested options, anything the household added, and a plus chip to add their own */
  /* a food's picture where there is a plain one, and a few words for the names many people do not know (from the 1,000-household test) */
  var EMO={Peanuts:'\u{1F95C}','Tree nuts':'\u{1F330}',Milk:'\u{1F95B}',Eggs:'\u{1F95A}',Wheat:'\u{1F33E}',Soy:'\u{1FAD8}',Fish:'\u{1F41F}',Shellfish:'\u{1F990}',Corn:'\u{1F33D}',Celery:'\u{1F96C}',Sulphites:'\u{1F377}',
    Vegetarian:'\u{1F966}',Vegan:'\u{1F331}',Pescatarian:'\u{1F41F}',Eggetarian:'\u{1F95A}','High protein':'\u{1F357}',Keto:'\u{1F951}',Mediterranean:'\u{1FAD2}'};
  var HINT={'Tree nuts':'almonds, cashews',Sesame:'til, tahini',Soy:'tofu',Sulphites:'in wine, dried fruit',Celery:'and celeriac',Pescatarian:'fish, no meat',Eggetarian:'veg and eggs',
    Jain:'no root vegetables',Kosher:'Jewish food laws','Gluten-free':'no wheat',Keto:'very low carb','Low carb':'less bread and rice',Paleo:'no grains, dairy or beans',Mediterranean:'veg, fish, olive oil','Low FODMAP':'for IBS, a sensitive gut'};
  var INDIA=(function(){var z='',l='';try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}try{l=(navigator.languages||[navigator.language||'']).join(',')}catch(e){}return /Kolkata|Calcutta/.test(z)||/-IN\b|^(hi|te|ta|kn|mr|bn|gu|ml)\b/.test(l)})();
  /* the usual choices where the phone is, first; the rest keep their order behind "More" */
  function placeFirst(all,first){return first.filter(function(n){return all.indexOf(n)>-1}).concat(all.filter(function(n){return first.indexOf(n)<0}))}
  function allergyChoices(){return placeFirst(ALLERGENS,INDIA?['Peanuts','Milk','Eggs','Wheat','Tree nuts','Fish','Shellfish','Soy','Sesame']:[])}
  function dietChoices(){return placeFirst(DIETS,INDIA?['Vegetarian','Eggetarian','Jain','No onion or garlic','No beef','Halal','Vegan']:['Vegetarian','Vegan','Gluten-free','Dairy-free','Pescatarian','Halal','Kosher'])}
  function chipBox(box,all,obj,key,o){o=o||{};box.textContent='';var id=box.id,sel=obj[key],low=function(x){return x.toLowerCase()};
    var shown=o.show&&!ui.more[id]?all.filter(function(n,i){return i<o.show||sel.indexOf(n)>-1}):all;
    shown.concat(sel.filter(function(n){return all.indexOf(n)<0})).forEach(function(n){var on=sel.indexOf(n)>-1,b=el('button','chip');b.type='button';b.dataset.v=n;b.setAttribute('aria-pressed',on?'true':'false');
      if(o.rich&&EMO[n]){var e=el('span','e',EMO[n]);e.setAttribute('aria-hidden','true');b.append(e)}
      b.append(document.createTextNode(n));if(o.rich&&HINT[n]){b.append(el('span','h',HINT[n]));b.setAttribute('aria-label',n+', '+HINT[n])}
      b.onclick=function(){obj[key]=on?sel.filter(function(x){return x!==n}):sel.concat([n]);redraw()};box.append(b)});
    var more=shown.length<all.length;
    if(ui.adding===id){var w=el('span','addin'),inp=el('input'),ok=el('button','mini','Add');inp.type='text';inp.maxLength=24;inp.placeholder=o.ph||'Type it here';inp.setAttribute('aria-label',o.add||'Add your own');ok.type='button';
      var done=function(){var v=inp.value.replace(/\s+/g,' ').trim();ui.adding='';if(v){var k=all.filter(function(x){return low(x)===low(v)})[0]||v;if(!obj[key].some(function(x){return low(x)===low(k)}))obj[key]=obj[key].concat([k])}redraw()};
      ok.onclick=done;inp.onkeydown=function(ev){if(ev.key==='Enter'){ev.preventDefault();done()}else if(ev.key==='Escape'){ev.preventDefault();ui.adding='';redraw()}};
      w.append(inp,ok);box.append(w);setTimeout(function(){inp.focus()},0)}
    else if(!o.fixed){var a=el('button','chip add','+ '+(o.add||'Add your own'));a.type='button';a.onclick=function(){ui.adding=id;redraw()};box.append(a)}
    if(more){var m=el('button','chip add','More');m.type='button';m.onclick=function(){ui.more[id]=1;redraw()};box.append(m)}}
  function oneOf(box,pairs,obj,key,clear){box.textContent='';pairs.forEach(function(pr){var b=el('button','chip',pr[1]);b.type='button';b.setAttribute('aria-pressed',obj[key]===pr[0]?'true':'false');
    b.onclick=function(){obj[key]=clear&&obj[key]===pr[0]?'':pr[0];redraw()};box.append(b)})}
  function memLine(m){var k=KINDS.filter(function(x){return x[0]===m.kind})[0][1];return [k].concat(m.when?['here '+m.when]:[],m.allergies.map(function(a){return 'no '+a.toLowerCase()}),m.rules,m.diet,m.avoid.map(function(a){return 'no '+a.toLowerCase()}),(m.house||[]).map(function(a){return a.toLowerCase()})).join(', ')}
  function drawProfile(){
    [['profHome','home'],['profStyle','style']].forEach(function(g){var pp=$(g[0]);pp.textContent='';Object.keys(PERSONA).filter(function(k){return PERSONA[k][5]===g[1]}).forEach(function(k){var P=PERSONA[k],b=el('button','tile'),on=draft.personas.indexOf(k)>-1;b.type='button';
      b.setAttribute('aria-pressed',on?'true':'false');b.append(el('b','',P[0]),el('span','',P[1]));
      b.onclick=function(){if(on){draft.personas=draft.personas.filter(function(x){return x!==k});
          /* a way of eating that came with this pick goes when the pick goes, unless another pick brings it too */
          P[4].forEach(function(d){if(!draft.personas.some(function(x){return PERSONA[x][4].indexOf(d)>-1}))draft.diet=draft.diet.filter(function(y){return y!==d})})}
        else{if(draft.personas.length>=3){$('profPick').textContent='Three picked. Tap one to swap it.';$('profPick').style.color='var(--accent)';return}
          draft.personas.push(k);if(P[2]&&!draft.counted){draft.adults=P[2];draft.kids=P[3]}P[4].forEach(function(d){if(draft.diet.indexOf(d)<0)draft.diet.push(d)})}
        drawProfile()};pp.append(b)})});
    $('profPick').textContent=draft.personas.length?draft.personas.length+' of 3 picked':'Suggestions. Pick any, or none';$('profPick').style.color='';
    var pe=$('profPeople');pe.textContent='';[['adults','Adults',1],['kids','Children',0]].forEach(function(f){var l=el('label','',f[1]),q=el('span','qty'),m=el('button','','\u2212'),pl=el('button','','+');
      m.type=pl.type='button';m.setAttribute('aria-label','Fewer '+f[1].toLowerCase());pl.setAttribute('aria-label','More '+f[1].toLowerCase());
      m.onclick=function(){draft.counted=true;draft[f[0]]=Math.max(f[2],draft[f[0]]-1);drawProfile()};pl.onclick=function(){draft.counted=true;draft[f[0]]=Math.min(10,draft[f[0]]+1);drawProfile()};
      q.append(m,el('span','',String(draft[f[0]])),pl);l.append(q);pe.append(l)});
    var pm=$('profMembers');pm.textContent='';draft.members.forEach(function(m,i){var b=el('button','person'),g=el('span');b.type='button';g.style.display='flex';g.style.flexDirection='column';
      g.append(el('b','',m.name),el('span','',memLine(m)));b.append(g,el('span','','Edit'));b.onclick=function(){openMember(i)};pm.append(b)});
    if(draft.members.length<8){var ap=el('button','chip add','+ Add a person');ap.type='button';ap.style.alignSelf='flex-start';ap.onclick=function(){openMember(-1)};pm.append(ap)}
    chipBox($('profPets'),['Dog','Cat'],draft,'pets',{add:'Add a pet',ph:'Rabbit, fish, bird'});
    chipBox($('profAll'),allergyChoices(),draft,'allergies',{show:9,add:'Add an allergy',ph:'Avocado, kiwi',rich:true});
    chipBox($('profRules'),RULES,draft,'rules',{add:'Add a rule',ph:'Low cholesterol'});
    chipBox($('profHouse'),HOUSE,draft,'house',{show:5,fixed:true});
    chipBox($('profDiet'),dietChoices(),draft,'diet',{show:9,add:'Add your own',ph:'Whole30, no red meat',rich:true});
    chipBox($('profAvoid'),AVOID,draft,'avoid',{add:'Add your own',ph:'Bell peppers'});
    oneOf($('profGoal'),GOALS,draft,'goal',true);
    chipBox($('profCui'),CUISINES,draft,'cuisines',{add:'Add your own',ph:'Ethiopian, Filipino'});
    oneOf($('profCook'),[['quick','20 minutes or less'],['medium','About half an hour'],['any','No rush']],draft,'cook');
    oneOf($('profDay'),[['','No fixed day']].concat(DAYS.map(function(d,i){return [d,DAYNAMES[i]]})),draft,'shopDay');
    chipBox($('profStores'),[],draft,'stores',{add:'Add a store',ph:'Costco'});
    var po=$('profOut');po.textContent='';var oq=el('span','qty'),om=el('button','','\u2212'),op=el('button','','+');om.type=op.type='button';om.setAttribute('aria-label','Fewer nights out');op.setAttribute('aria-label','More nights out');
    om.onclick=function(){draft.eatOut=Math.max(0,draft.eatOut-1);drawProfile()};op.onclick=function(){draft.eatOut=Math.min(7,draft.eatOut+1);drawProfile()};oq.append(om,el('span','',String(draft.eatOut)),op);po.append(oq);
    $('profSave').disabled=false;
  }
  function drawMember(){
    oneOf($('memKind'),KINDS,mem,'kind');
    chipBox($('memAll'),allergyChoices(),mem,'allergies',{show:9,add:'Add an allergy',ph:'Avocado, kiwi',rich:true});
    chipBox($('memRules'),RULES,mem,'rules',{add:'Add a rule',ph:'Low cholesterol'});
    chipBox($('memHouse'),HOUSE,mem,'house',{show:5,fixed:true});
    chipBox($('memDiet'),dietChoices(),mem,'diet',{show:9,add:'Add your own',ph:'No red meat',rich:true});
    chipBox($('memAvoid'),AVOID,mem,'avoid',{add:'Add your own',ph:'Bell peppers'});
  }
  function openMember(i){memAt=i;var m=i>-1?draft.members[i]:null;ui.adding='';
    mem=m?{name:m.name,kind:m.kind,when:m.when,away:!!m.away,diet:m.diet.slice(),allergies:m.allergies.slice(),rules:m.rules.slice(),avoid:m.avoid.slice(),house:(m.house||[]).slice()}:{name:'',kind:'adult',when:'',diet:[],allergies:[],rules:[],avoid:[],house:[]};
    $('memH').textContent=m?'Edit '+m.name:'Add a person';$('memName').value=mem.name;$('memName').setCustomValidity('');$('memName').oninput=function(){$('memName').setCustomValidity('')};$('memWhen').value=mem.when;$('memDel').hidden=!m;drawMember();$('memDlg').showModal()}
  $('memDlg').addEventListener('close',function(){mem=null;ui.adding='';if(draft)drawProfile()});
  $('memSave').onclick=function(){var n=$('memName').value.replace(/\s+/g,' ').trim();if(!n){$('memName').setCustomValidity('Give them a name first.');$('memName').reportValidity();return}
    mem.name=n;mem.when=$('memWhen').value.replace(/\s+/g,' ').trim();if(memAt>-1)draft.members[memAt]=mem;else draft.members.push(mem);$('memDlg').close()};
  $('memDel').onclick=function(){if(memAt>-1)draft.members.splice(memAt,1);$('memDlg').close()};
  function newDraft(p){var cp=function(a){return (a||[]).slice()};
    return p?{had:true,counted:true,personas:cp(p.personas||[p.persona]),adults:p.adults,kids:p.kids,members:(p.members||[]).map(function(m){return {name:m.name,kind:m.kind,when:m.when,away:!!m.away,diet:cp(m.diet),allergies:cp(m.allergies),rules:cp(m.rules),avoid:cp(m.avoid),house:cp(m.house)}}),
        pets:cp(p.pets),diet:cp(p.diet),allergies:cp(p.allergies),rules:cp(p.rules),avoid:cp(p.avoid),house:cp(p.house),cuisines:cp(p.cuisines),goal:p.goal||'',eatOut:p.eatOut||0,cook:p.cook||'any',shopDay:p.shopDay||'',stores:cp(p.stores)}:
      {personas:[],adults:2,kids:0,members:[],pets:[],diet:[],allergies:[],rules:[],avoid:[],house:[],cuisines:[],goal:'',eatOut:0,cook:'any',shopDay:'',stores:[]}}
  function openProfile(sec,key){sortBack='';document.querySelectorAll('dialog[open]').forEach(function(d){d.close()});var p=profile;ui={more:{},adding:''};draft=newDraft(p);sec=typeof sec==='string'?sec:'';
    $('profBuddy').value=p&&p.buddy||'';$('profBudget').value=p&&p.budget?p.budget:'';$('profAbout').value=p&&p.about||'';
    $('profMore').open=!!(p&&(p.avoid&&p.avoid.length||p.goal||p.eatOut||p.buddy||p.cuisines&&p.cuisines.length||p.cook!=='any'||p.shopDay||p.stores&&p.stores.length||p.budget));
    if(/^sec(Shop|Cook|Helper)$/.test(sec))$('profMore').open=true;
    drawProfile();$('profDlg').showModal();$('profH').tabIndex=-1;$('profH').focus();$('profDlg').scrollTop=0;
    /* opened from the list: straight to that section, and back to the list afterwards */
    if(sec&&$(sec)){sortBack=key||'';var t=$(sec);t.scrollIntoView({block:'start'});t.classList.remove('here');void t.offsetWidth;t.classList.add('here')}}
  $('profDlg').addEventListener('close',function(){if(sortBack){sortBack='';setTimeout(openSort,0)}});

  /* ---- the first run: three short steps in Tote's voice, then a guided list for the rest ---- */
  var NUM=['no','one','two','three','four','five','six','seven','eight','nine','ten'];
  function cnt(n,one,many){return NUM[n]+' '+(n===1?one:many)}
  function capFirst(t){return t.charAt(0).toUpperCase()+t.slice(1)}
  function listOf(a){return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]}
  /* nothing picked: the plainest kind of home that fits who lives there */
  function autoType(d){return d.kids?(d.adults+d.kids>=5?'big':'family4'):d.adults===1?'solo':d.adults===2?'couple':'other'}
  function helloLine(){var d=draft,a=d.adults,k=d.kids;
    if(helloAt===0)return k?capFirst(cnt(a,'adult','adults'))+' and '+cnt(k,'child','children')+'. '+(a+k>=6?'A full house. I will keep a close eye on the staples.':'I will plan for a busy table.'):a===1?'Just you. I will keep the portions small.':a===2?'Two of you. Easy to plan for.':capFirst(cnt(a,'adult','adults'))+'. I will expect things to go quickly.';
    if(helloAt===1){var al=d.allergies.map(function(x){return x.toLowerCase()});
      if(al.length)return 'No '+listOf(al).replace(/ and ([^,]+)$/,' or $1')+'. I will keep '+(al.length>1?'them':'it')+' out of dinner ideas. I can miss things, so check the label.';
      return d.diet.length?listOf(d.diet)+'. I will suggest dinners that fit.':'Tap anything that applies. If nothing does, carry on.'}
    if(helloAt===2)return pushOn?'Reminders are on for this phone. One a day at most, the day before something runs out.':pushCan?'One a day at most, the day before something runs out. You can turn them off any time.':pushWhy();
    /* what Tote learnt about an allergy the home typed in, said once */
    var hid=(profile&&profile.hidden)||{},also=[];Object.keys(hid).forEach(function(k){if(hid[k].length)also.push(hid[k].slice(0,2).join(' and ')+' (they usually have '+k+' in them)')});
    return (also.length?'I will also watch for '+listOf(also)+'. ':'')+'Snap a receipt or tell me what you bought, and I will do the rest.'}
  function drawHello(dir){var s=helloAt,box=$('helloIn');box.textContent='';
    $('helloH').textContent=['Who is at home?','Anything off the table?','A nudge before things run out?','You are all set'+(me?', '+me:'')+'.'][s];
    $('helloStep').textContent=s<3?(s+1)+' of 3':'';$('helloDots').style.visibility=s<3?'':'hidden';
    [].forEach.call($('helloDots').children,function(i,n){i.classList.toggle('on',n<=s)});
    if(s===0){var pe=el('div','people');[['adults','Adults',1],['kids','Children',0]].forEach(function(f){var l=el('label','',f[1]),q=el('span','qty'),m=el('button','','\u2212'),pl=el('button','','+');
      m.type=pl.type='button';m.setAttribute('aria-label','Fewer '+f[1].toLowerCase());pl.setAttribute('aria-label','More '+f[1].toLowerCase());
      m.onclick=function(){draft[f[0]]=Math.max(f[2],draft[f[0]]-1);drawHello()};pl.onclick=function(){draft[f[0]]=Math.min(10,draft[f[0]]+1);drawHello()};
      q.append(m,el('span','',String(draft[f[0]])),pl);l.append(q);pe.append(l)});box.append(pe)}
    if(s===1){var a=el('div','wrapchips'),di=el('div','wrapchips');a.id='helloAll';di.id='helloDiet';a.setAttribute('role','group');a.setAttribute('aria-label','Allergies');di.setAttribute('role','group');di.setAttribute('aria-label','How you eat');
      box.append(el('h3','','Allergies at home'),a,el('h3','','How you eat'),di);
      chipBox(a,allergyChoices(),draft,'allergies',{show:6,add:'Add an allergy',ph:'Avocado, kiwi',rich:true});chipBox(di,dietChoices(),draft,'diet',{show:4,add:'Your own',ph:'Sattvic, no red meat',rich:true})}
    $('helloSay').textContent=helloLine();
    $('helloBack').hidden=s<1||s>2;$('helloSkip').hidden=s>2;$('helloSkip').textContent=s===2?'Maybe later':'Not now';$('helloSort').hidden=s<3;$('helloNext').textContent=s===2&&pushCan&&!pushOn?'Turn on reminders':s<3?'Next':'Start using Stocker';
    if(dir){var body=$('helloBody');body.classList.remove('step-f','step-b');void body.offsetWidth;body.classList.add(dir==='b'?'step-b':'step-f');$('helloDlg').scrollTop=0;$('helloH').focus()}}
  function openHello(){document.querySelectorAll('dialog[open]').forEach(function(d){d.close()});ui={more:{},adding:''};draft=newDraft(null);draft.counted=true;helloAt=0;drawHello();$('helloDlg').showModal();$('helloH').focus()}
  $('helloDlg').addEventListener('close',function(){helloAt=-1});
  $('helloBack').onclick=function(){if(helloAt>0&&helloAt<3){helloAt--;drawHello('b')}};
  $('helloSkip').onclick=function(){if(helloAt===2){helloAt=3;drawHello('f');return}try{localStorage.setItem('stocker.profSkip','1')}catch(e){}$('helloDlg').close()};
  $('helloSort').onclick=function(){openSort()};
  $('helloNext').onclick=async function(){var b=$('helloNext');
    if(helloAt===0){helloAt=1;drawHello('f');return}
    if(helloAt>2){$('helloDlg').close();return}
    b.disabled=true;
    if(helloAt===2){try{if(pushCan&&!pushOn)await pushEnable()}catch(e){if(e.code!=='locked')toast(why(e,'Could not turn on reminders.'))}finally{b.disabled=false}
      if(pushOn)sortMark(['remind']);helloAt=3;drawHello('f');return}
    /* saved after "anything off the table", so the home is set even if the person stops at reminders */
    var body=JSON.parse(JSON.stringify(draft));body.personas=[autoType(draft)];body.budget=0;body.about='';body.buddy='';
    try{var r=await api('/api/profile',{method:'POST',body:JSON.stringify(body)});profile=r.profile;try{localStorage.removeItem('stocker.starterHide')}catch(e2){}
      sortMark(['allergies','diet']);helloAt=2;drawHello('f');render();say('Nice to meet you'+(me?', '+me:'')+'. I will keep an eye on things from here.','party')}
    catch(e){if(e.code!=='locked')$('helloSay').textContent=why(e,'I could not save that. Try again.')}
    finally{b.disabled=false}};

  /* "Get everything sorted": one row for each thing a home can set. A row is ticked when the home has something there, or when
     that section was opened from here and saved. Which rows were answered is remembered on this phone only. */
  var SORT=[['people','Set your people','Names, and anyone who eats differently','secPeople',function(p){return p.members&&p.members.length}],
    ['pets','Set your pets','So their food is watched too','profPets',function(p){return p.pets&&p.pets.length}],
    ['allergies','Set your allergies','A hard rule in dinner ideas and on every receipt','secAll',function(p){return p.allergies&&p.allergies.length}],
    ['rules','Set your health rules','Celiac, low salt, diabetic and more','secRules',function(p){return p.rules&&p.rules.length}],
    ['house','Set your House rules','What your home chooses to keep to','secHouse',function(p){return p.house&&p.house.length}],
    ['diet','Set how you eat','Vegetarian, halal, high protein and more','secDiet',function(p){return p.diet&&p.diet.length}],
    ['type','Describe your home','Suggestions to pick from, or your own words','secType',function(p){return p.about}],
    ['shop','Set your shopping','Your day, your stores, your budget','secShop',function(p){return p.shopDay||p.stores&&p.stores.length||p.budget}],
    ['cook','Set your cooking','Food you like, weeknight time, things nobody eats','secCook',function(p){return p.avoid&&p.avoid.length||p.cuisines&&p.cuisines.length||p.goal||p.eatOut||p.cook&&p.cook!=='any'}],
    ['helper','Name your helper','Tote answers to any name you like','secHelper',function(p){return p.buddy}],
    ['remind','Turn on reminders','One a day at most, the day before something runs out','',function(){return pushOn}]];
  function sortGot(){try{return JSON.parse(localStorage.getItem('stocker.sorted')||'{}')||{}}catch(e){return {}}}
  function sortMark(keys){var g=sortGot();keys.forEach(function(k){g[k]=1});try{localStorage.setItem('stocker.sorted',JSON.stringify(g))}catch(e){}}
  function sortRows(){var g=sortGot();return SORT.map(function(r){return {key:r[0],title:r[1],hint:r[2],sec:r[3],done:!!(g[r[0]]||r[4]&&(r[0]==='remind'||profile)&&r[4](profile||{}))}})}
  function sortLine(){var rows=sortRows(),n=rows.filter(function(r){return r.done}).length;return {n:n,of:rows.length,text:n+' of '+rows.length+' sorted'}}
  function drawSort(){var rows=sortRows(),c=sortLine(),box=$('sortList');box.textContent='';
    $('sortSub').textContent=c.text+(c.n===c.of?'. Your home is all set.':'. Each one takes a few taps, in any order.');$('sortBar').style.transform='scaleX('+(c.n/c.of).toFixed(3)+')';
    rows.forEach(function(r){var b=el('button','sortrow'+(r.done?' done':'')),t=el('span','t'),k=el('span','tick');b.type='button';b.dataset.key=r.key;k.setAttribute('aria-hidden','true');
      t.append(el('b','',r.title),el('small','',r.hint));b.append(k,t);b.setAttribute('aria-label',r.title+(r.done?', sorted':', not set yet'));
      b.onclick=function(){if(r.key==='remind'){$('sortDlg').close();go('log')}else openProfile(r.sec,r.key)};box.append(b)})}
  function openSort(){document.querySelectorAll('dialog[open]').forEach(function(d){d.close()});drawSort();$('sortDlg').showModal()}
  $('menuSort').onclick=openSort;
  $('profSkip').onclick=function(){$('profDlg').close()};
  $('profBudget').oninput=function(){$('profBudget').setCustomValidity('')};
  $('profSave').onclick=async function(){if(!draft.personas.length)draft.personas=[autoType(draft)]; /* nothing picked: go by who is at home */
    var bud=$('profBudget').value.trim();if(bud&&!(Number(bud)>=0)){$('profMore').open=true;$('profBudget').setCustomValidity('A budget cannot be below zero. Leave it empty for no budget.');$('profBudget').reportValidity();return}
    $('profSave').disabled=true;
    draft.budget=Number($('profBudget').value)||0;draft.about=$('profAbout').value;draft.buddy=$('profBuddy').value;
    try{var r=await api('/api/profile',{method:'POST',body:JSON.stringify(draft)});profile=r.profile;try{localStorage.removeItem('stocker.starterHide')}catch(e){}var firstTime=!draft.had;if(sortBack)sortMark([sortBack]);$('profDlg').close();render();if(firstTime)say('Nice to meet you'+(me?', '+me:'')+'. I will keep an eye on things from here.','party');toast('Saved. Stocker is set up for '+(pers().length===1&&pers()[0]!=='other'?'a '+PERSONA[pers()[0]][0].toLowerCase():'your home')+'.')}
    catch(e){if(e.code!=='locked')toast(why(e,'Could not save that.'))}finally{$('profSave').disabled=false}};
  $('shareProf').onclick=openProfile;
  function setBig(on){document.documentElement.classList.toggle('big',on);$('bigText').setAttribute('aria-pressed',on?'true':'false');$('bigSub').textContent=on?'On':'Off'}
  try{setBig(localStorage.getItem('stocker.big')==='1')}catch(e){}
  $('bigText').onclick=function(){var on=!document.documentElement.classList.contains('big');setBig(on);try{localStorage.setItem('stocker.big',on?'1':'0')}catch(e){}};
  function initial(){return (me||'?').trim().charAt(0).toUpperCase()||'?'}
  $('menuBtn').onclick=function(){$('menuMe').textContent=initial();$('menuH').textContent=me?me+'’s home':'Your home';$('menuSub').textContent=profileLine();
    $('menuRemSub').textContent=pushOn?'Reminders are on':'Reminders are off';$('menuHomes').hidden=!owner;$('menuScore').hidden=!owner;$('menuChecks').hidden=!owner;$('menuScoreS').textContent=reviewN?reviewN+(reviewN===1?' miss':' misses')+' to review, and test scores':'Test scores, week by week';$('menuDelete').hidden=owner;var sl=sortLine();$('menuSortSub').textContent=sl.n===sl.of?'Everything is sorted':sl.text;$('menuOutAll').hidden=!signup;$('menuShare').hidden=signup;$('lockBtn').querySelector('b').textContent=signup?'Sign out':'Lock Stocker';$('lockSub').textContent=signup?'On this phone':'Ask for your code again';$('menuDlg').showModal()};
  $('menuEdit').onclick=openProfile;
  $('menuRemind').onclick=function(){$('menuDlg').close();go('log')};
  $('menuScore').onclick=function(){location.href=reviewN?'/evals.html#real':'/scorecard.html'};
  $('menuChecks').onclick=function(){location.href='/checks.html'};
  /* Friends testing (the owner only): a personal code per friend, and each code opens a home of its own */
  function inviteText(d){return 'Hi '+d.name+', I am building Stocker, an app that keeps track of what you have at home so you do not run out. Would you try it for a few days?\n\n1. Open '+(d.link||location.origin)+' on your phone.\n2. Type your name and this code: '+d.code+'\n3. Add it to your home screen from the Share menu, so it opens like an app.\n\nThree things to try: paste or snap a grocery receipt, tell it what you used ("used 2 eggs", "we are out of rice"), and ask "what should I use first?"\n\nYour home is private: nobody else sees your things. I can see what you type to the app, so I can fix its mistakes. Replies can take 20 seconds for now. If something looks wrong, tap Undo or "Not right?" and send me a screenshot.'}
  function showInvite(d){$('homesNew').style.display='flex';$('homesNewMsg').textContent='Code for '+d.name+': '+d.code+'. I show it only this once, so copy the invitation now.';$('homesInvite').textContent=inviteText(d)}
  function seenText(h){if(h.off)return 'Turned off. Nothing was deleted.';if(!h.seen)return 'Not opened yet';var t=new Date().toISOString().slice(0,10);return 'Opened '+(h.seen===t?'today':fmt(h.seen))+' · '+h.items+' at home · '+h.turns+(h.turns===1?' message':' messages')+' this week'}
  /* what happened is said inside the sheet: a toast would sit underneath it, where it cannot be read or tapped */
  function homesSay(t){$('homesSay').textContent=t||''}
  async function loadHomes(){var d=await api('/api/homes'),box=$('homesList');box.textContent='';
    $('homesCount').textContent=d.max?d.homes.length+' of '+d.max+' homes taken'+(d.waiting?' · '+d.waiting+(d.waiting===1?' person':' people')+' waiting for a place':'')+'.':'';
    if(!d.homes.length){box.append(el('p','sub','Nobody yet. Make a code to invite your first friend.'));return}
    d.homes.forEach(function(h){var r=el('div','row'),g=el('div','grow'),sub=el('div','sub',seenText(h)),nb=el('button','mini','New code'),ob=el('button','mini',h.off?'Turn on':'Turn off'),armed=0;
      g.append(el('div','name',h.name+(h.signup?' · signed up':'')),sub);sub.setAttribute('role','status');nb.hidden=!!h.signup;nb.type=ob.type='button';nb.setAttribute('aria-label','New code for '+h.name);ob.setAttribute('aria-label',(h.off?'Turn on ':'Turn off ')+h.name+'’s code');
      /* a new code locks the phones using the old one, so it takes a second tap; what will happen is said in the row itself */
      nb.onclick=async function(){if(Date.now()-armed>6000){armed=Date.now();nb.textContent='Tap again';sub.textContent='A new code locks '+h.name+'’s phone until the new one is typed in.';setTimeout(function(){if(nb.isConnected&&!nb.disabled){nb.textContent='New code';sub.textContent=seenText(h)}},6000);return}
        nb.disabled=true;try{showInvite(await api('/api/homes/code',{method:'POST',body:JSON.stringify({id:h.id})}));await loadHomes();$('homesDlg').scrollTop=0}catch(er){nb.disabled=false;if(er.code!=='locked')sub.textContent=why(er,'Could not make a new code.')}};
      /* turning a code off deletes nothing; the row then says so, and the same button turns it back on */
      ob.onclick=async function(){ob.disabled=true;try{await api('/api/homes/off',{method:'POST',body:JSON.stringify({id:h.id,off:!h.off})});await loadHomes()}catch(er){ob.disabled=false;if(er.code!=='locked')sub.textContent=why(er,'Could not change that.')}};
      r.append(g,nb,ob);box.append(r)})}
  $('menuHomes').onclick=async function(){$('menuDlg').close();$('homesNew').style.display='none';$('homesName').value='';homesSay('');$('homesDlg').showModal();try{await loadHomes()}catch(er){if(er.code!=='locked')homesSay(why(er,'Could not load that.'))}};
  $('homesForm').addEventListener('submit',async function(e){e.preventDefault();var b=$('homesMake');b.disabled=true;homesSay('');
    try{showInvite(await api('/api/homes',{method:'POST',body:JSON.stringify({name:$('homesName').value})}));$('homesName').value='';await loadHomes()}
    catch(er){if(er.code!=='locked'){$('homesNew').style.display='none';homesSay(er.code==='full'?'That is as many friends as I can keep apart for now.':why(er,'Could not make a code.'))}}b.disabled=false});
  $('homesCopy').onclick=function(){var t=$('homesInvite').textContent,b=$('homesCopy'),done=function(m){b.textContent=m;setTimeout(function(){b.textContent='Copy the invitation'},2500)};try{navigator.clipboard.writeText(t).then(function(){done('Copied')},function(){done('Select the text above and copy it')})}catch(e){done('Select the text above and copy it')}};
  $('menuShare').onclick=function(){$('menuDlg').close();$('shareLink').textContent=location.origin;$('shareHow').textContent='Send this link to anyone at home, and tell them '+(owner?'the passcode':'your code')+'. Each person types their own name, so the activity shows who did what. Everyone sees the same list.';$('shareMe').textContent=me?'You are signed in as '+me+'.':'';$('shareDlg').showModal()};
  $('shareCopy').onclick=function(){try{navigator.clipboard.writeText(location.origin).then(function(){toast('Link copied.')},function(){toast('Select the link and copy it.')})}catch(e){toast('Select the link and copy it.')}};
  try{$('who').value=localStorage.getItem('stocker.who')||''}catch(e){}
  var COPY={licence:'I need the vision model\u2019s licence accepted once before I can read photos.',
    ai_failed:'I could not make sense of that one. Nothing was changed. Try again in a moment.',bad_image:'I could not use that photo. Try another, a little closer and flatter.',
    bad_audio:'That recording was too long for me. Keep voice notes under a minute.',silent:"I couldn't hear anything in that. Try again a little closer to the phone.",
    unknown_product:"I don't know that barcode. Tell me what it is instead, or type it.",bad_code:"That doesn't look like a barcode number.",
    ai_quota:'I have used up today\u2019s free AI allowance, so I cannot read photos or listen until it resets at '+new Date(Date.UTC(2000,0,1,0,0)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Typed messages like \u201cadd milk\u201d, barcodes, your list and adding by hand still work.',
    slow_down:'That is a lot at once. Give me a few minutes to catch up, then try again.',
    empty:'Write something first.',owner_only:'That part belongs to the person who set Stocker up.',offline:'You seem to be offline. Nothing was changed.',server:'Something went wrong on my side. Nothing was changed. Try again.'};
  var lastScan=null;
  async function scan(doFetch,waitMsg){
    if(busy)return;lastScan=[doFetch,waitMsg];setBusy(waitMsg);
    try{var d=await doFetch(),r=await commit(d);setBusy(null);showResult(d,r)}
    catch(e){setBusy(null);if(e.code==='locked')return;
      if(e.code==='licence')$('licDlg').showModal();
      else oops(COPY[e.code]||COPY.server)}
  }
  $('licOk').onclick=async function(){
    $('licOk').disabled=true;
    try{await api('/api/agree',{method:'POST'});$('licDlg').close();if(lastScan)scan(lastScan[0],lastScan[1])}
    catch(er){if(er.code!=='locked'){$('licDlg').close();toast('Could not accept the licence. Try again.')}}
    finally{$('licOk').disabled=false}
  };
  function shrink(file){return new Promise(function(res,rej){var img=new Image(),u=URL.createObjectURL(file);
    img.onload=function(){var s=Math.min(1,1400/Math.max(img.width,img.height)),c=document.createElement('canvas');
      c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',0.85))};
    img.onerror=function(){URL.revokeObjectURL(u);rej({code:'bad_image'})};img.src=u})}
  /* The photo pipeline: Tote finds each pack, the phone cuts each one out at full size, and each cut-out is read on its own.
     The photo stays on this phone: it is shown in the card afterwards and never stored. */
  function loadPhoto(file){return new Promise(function(res,rej){var img=new Image(),u=URL.createObjectURL(file);
    img.onload=function(){var W=img.naturalWidth||img.width,H=img.naturalHeight||img.height,big=Math.min(1,2400/Math.max(W,H)),c=document.createElement('canvas');
      c.width=Math.round(W*big);c.height=Math.round(H*big);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      var sm=Math.min(1,1400/Math.max(c.width,c.height)),c2=document.createElement('canvas');c2.width=Math.round(c.width*sm);c2.height=Math.round(c.height*sm);c2.getContext('2d').drawImage(c,0,0,c2.width,c2.height);
      res({url:u,full:c,small:c2.toDataURL('image/jpeg',0.85),w:c2.width,h:c2.height})};
    img.onerror=function(){URL.revokeObjectURL(u);rej({code:'bad_image'})};img.src=u})}
  function cropOf(ph,b){var W=ph.full.width,H=ph.full.height,px=b.w*0.08,py=b.h*0.08;
    var x=Math.max(0,(b.x-px)*W),y=Math.max(0,(b.y-py)*H),w=Math.min(W-x,(b.w+2*px)*W),h=Math.min(H-y,(b.h+2*py)*H),k=Math.min(1,640/Math.max(w,h)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));c.getContext('2d').drawImage(ph.full,x,y,w,h,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.85)}
  async function pipeScan(f){var ph;
    try{ph=await loadPhoto(f)}catch(e){oops(COPY.bad_image||COPY.server);return}
    scan(async function(){
      var fd=await api('/api/scan/shelf/find',{method:'POST',body:JSON.stringify({image:ph.small,w:ph.w,h:ph.h})});
      if(!fd.boxes||!fd.boxes.length){var d0=await api('/api/scan/shelf',{method:'POST',body:JSON.stringify({image:ph.small})});URL.revokeObjectURL(ph.url);return d0}
      $('busyMsg').textContent='Reading '+fd.boxes.length+(fd.boxes.length===1?' thing':' things')+' one by one';
      var d=await api('/api/scan/shelf/read',{method:'POST',body:JSON.stringify({image:ph.small,boxes:fd.boxes,crops:fd.boxes.map(function(b){return {id:b.id,image:cropOf(ph,b)}})})});
      d.photo=ph.url;return d},'Looking at the shelf')}
  function photo(input,kind){input.addEventListener('change',function(){var f=input.files&&input.files[0];input.value='';if(!f)return;$('capDlg').close();
    if(kind==='shelf'&&pipe){pipeScan(f);return}
    scan(async function(){return api('/api/scan/'+kind,{method:'POST',body:JSON.stringify({image:await shrink(f)})})},kind==='shelf'?'Looking at the shelf':'Reading the bill')})}
  photo($('billFile'),'bill');photo($('shelfFile'),'shelf');
  /* paste a screenshot of an order (or a photo of a receipt) anywhere in the app and I read it */
  document.addEventListener('paste',function(ev){if($('app').hidden||busy)return;var fs=ev.clipboardData&&ev.clipboardData.files,f=null;for(var i=0;fs&&i<fs.length;i++)if(/^image\//.test(fs[i].type)){f=fs[i];break}
    if(!f)return;ev.preventDefault();Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'),function(d){d.close()});
    scan(async function(){return api('/api/scan/bill',{method:'POST',body:JSON.stringify({image:await shrink(f)})})},'Reading the order')});

  /* voice: talk to Tote right in the conversation. The phone's own speech-to-text when it has one (free, the words appear as you
     speak); otherwise a short recording that Tote transcribes. Either way it sends by itself when you pause, and the cross cancels. */
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition,vo=null,srBroken=false;
  $('capVoice').onclick=function(){$('capDlg').close();startRec()};
  function waveTo(levels){var bars=$('recWave').children;for(var i=0;i<bars.length;i++)bars[i].style.transform='scaleY('+Math.max(.12,Math.min(1,levels(i))).toFixed(2)+')'}
  function voiceUI(on){$('chatForm').classList.toggle('listening',on);$('chatDlg').classList.toggle('listening',on);$('recBar').hidden=!on;if(!on)waveTo(function(){return .12});
    $('recHint').textContent='Listening. I send when you pause.';$('recClock').textContent='0:00';if(window.Tote)Tote.mood(on?'think':'happy')}
  function voiceTick(){if(!vo)return;var s=Math.floor((Date.now()-vo.t0)/1000);$('recClock').textContent=Math.floor(s/60)+':'+pad(s%60);
    if(vo.level)vo.level();else{var hot=Date.now()-vo.heard<350;waveTo(function(i){return hot?.25+.75*Math.abs(Math.sin(Date.now()/120+i*.9))*Math.random():.12})}
    if(s>=60){finishVoice(true);return}vo.raf=requestAnimationFrame(voiceTick)}
  function finishVoice(send){if(!vo)return;var v=vo;v.send=send;cancelAnimationFrame(v.raf);if(v.sr){try{send?v.sr.stop():v.sr.abort()}catch(e){}}if(v.rec&&v.rec.state!=='inactive')v.rec.stop()}
  function voiceDone(v){if(vo!==v)return;vo=null;voiceUI(false);if(v.ctx)try{v.ctx.close()}catch(e){}if(v.stream)v.stream.getTracks().forEach(function(t){t.stop()})}
  async function startRec(){
    if(vo||chatBusy)return;if(!$('chatDlg').open)openChat(true);$('chatText').blur();
    if(SR&&!srBroken)return startSpeech();
    if(!navigator.mediaDevices||!window.MediaRecorder){toast('This browser cannot listen. Type it instead.');return}
    var stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){toast('Microphone access was blocked. Allow it in your browser settings.');return}
    var v={t0:Date.now(),heard:0,spoke:false,stream:stream,chunks:[],send:false};vo=v;voiceUI(true);
    try{var AC=window.AudioContext||window.webkitAudioContext;v.ctx=new AC();var an=v.ctx.createAnalyser();an.fftSize=512;v.ctx.createMediaStreamSource(stream).connect(an);var buf=new Uint8Array(an.fftSize),hist=[];
      v.level=function(){an.getByteTimeDomainData(buf);var sum=0;for(var i=0;i<buf.length;i++){var x=(buf[i]-128)/128;sum+=x*x}var rms=Math.sqrt(sum/buf.length);
        hist.push(rms);if(hist.length>24)hist.shift();waveTo(function(i){var h=hist[hist.length-24+i];return h==null?.12:h*9});
        if(rms>.04){v.heard=Date.now();v.spoke=true}else if(v.spoke&&Date.now()-v.heard>1600)finishVoice(true)}}catch(e){v.level=null}
    var rec=v.rec=new MediaRecorder(stream);rec.ondataavailable=function(e){if(e.data&&e.data.size)v.chunks.push(e.data)};
    rec.onstop=function(){var blob=new Blob(v.chunks,{type:rec.mimeType||'audio/webm'});voiceDone(v);if(!v.send)return;
      if(blob.size<800||!v.spoke&&v.level){toast("I didn't catch anything. Try again a little closer to the phone.");return}
      var fr=new FileReader();fr.onload=function(){chatSend({audio:String(fr.result).split(',')[1]},'Voice note')};fr.onerror=function(){toast('Could not read that recording. Try again.')};fr.readAsDataURL(blob)};
    rec.start();v.raf=requestAnimationFrame(voiceTick)}
  function startSpeech(){
    var r=new SR(),v={t0:Date.now(),heard:0,sr:r,send:true,said:'',final:''},live=null;vo=v;voiceUI(true);
    r.lang=navigator.language||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
    r.onresult=function(e){var t='',f='';for(var i=0;i<e.results.length;i++){t+=e.results[i][0].transcript;if(e.results[i].isFinal)f+=e.results[i][0].transcript}
      v.said=t.trim();v.final=f.trim();v.heard=Date.now();if(!live)live=bubble('me live','');live.textContent=v.said;$('recHint').textContent=v.said||'Listening. I send when you pause.'};
    r.onspeechstart=function(){v.heard=Date.now()};r.onsoundstart=function(){v.heard=Date.now()};
    r.onerror=function(e){v.err=e.error};
    r.onend=function(){if(live)live.remove();voiceDone(v);var t=v.final||v.said;
      if(v.err==='not-allowed'||v.err==='service-not-allowed'||v.err==='network'||v.err==='audio-capture'||v.err==='language-not-supported'){
        if(v.err==='not-allowed'){toast('Microphone access was blocked. Allow it in your browser settings.');return}
        srBroken=true;if(v.send)startRec();return}
      if(!v.send)return;if(t)chatSend({text:t},t);else toast("I didn't catch anything. Try again a little closer to the phone.")};
    try{r.start()}catch(e){voiceDone(v);srBroken=true;startRec();return}
    v.raf=requestAnimationFrame(voiceTick)}
  $('recX').onclick=function(){finishVoice(false)};
  $('recGo').onclick=function(){finishVoice(true)};
  $('chatDlg').addEventListener('close',function(){finishVoice(false)});

  /* barcode */
  var qr=null;
  async function stopQr(){if(qr){var q=qr;qr=null;try{await q.stop()}catch(e){}try{q.clear()}catch(e){}}}
  var codeEmpty=false;
  function lookup(code){var em=codeEmpty;$('codeDlg').close();scan(function(){return api('/api/scan/barcode?code='+encodeURIComponent(code)+(em?'&empty=1':''))},em?'Reading the empty pack':'Looking up that product')}
  $('capCode').addEventListener('click',function(){codeEmpty=false;$('codeH').textContent='Scan a barcode'});
  /* the pack is empty: scanning it is not a purchase. It goes on the list with its brand and size. */
  $('capEmpty').onclick=function(){var open=$('capCode').onclick;if(open)open.call($('capCode'));codeEmpty=true;$('codeH').textContent='Scan the empty pack';
    if(window.Html5Qrcode)$('codeNote').textContent='Point the camera at the barcode before you bin it. I put it on your list with its brand and size.'};
  $('capCode').onclick=async function(){$('capDlg').close();$('codeDlg').showModal();$('codeNote').textContent='Point the camera at the barcode on the pack.';
    if(!window.Html5Qrcode){$('codeNote').textContent='Camera scanning is not available here. Type the number under the barcode.';return}
    try{var F=window.Html5QrcodeSupportedFormats,cfg={verbose:false};if(F)cfg.formatsToSupport=[F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E];
      qr=new Html5Qrcode('reader',cfg);
      await qr.start({facingMode:'environment'},{fps:10,qrbox:{width:260,height:150}},function(text){var code=String(text).replace(/\D/g,'');if(code.length>=6&&qr){stopQr();lookup(code)}},function(){});
    }catch(e){qr=null;$('codeNote').textContent='The camera could not start. Allow camera access, or type the number under the barcode.'}};
  $('codeDlg').addEventListener('close',stopQr);
  $('codeForm').addEventListener('submit',function(ev){ev.preventDefault();var c=$('codeInput').value.replace(/\D/g,'');$('codeInput').value='';if(c)lookup(c)});

  /* type */
  $('capType').onclick=function(){$('capDlg').close();$('typeDlg').showModal()};
  $('typeForm').addEventListener('submit',function(ev){ev.preventDefault();var t=$('typeText').value.trim();if(!t)return;$('typeDlg').close();$('typeText').value='';
    scan(function(){return api('/api/scan/text',{method:'POST',body:JSON.stringify({text:t})})},'Reading your note')});

  /* a scan is saved straight away; the summary lets you take back anything that's wrong */
  var done=[];
  async function commit(d){
    var acts=(d&&d.actions)||[];if(!acts.length)return null;
    var r=await api('/api/apply',{method:'POST',body:JSON.stringify({source:d.kind,store:d.store||'',bought:d.bought||(d.kind==='shelf'?'':iso(today())),currency:d.currency||'',actions:acts})});
    var had=items.length;await refresh();
    if(r&&r.added)say(!had?'My first things to look after. Thank you.':'Put away '+r.added+(r.added===1?' thing.':' things.')+(r.used?' Updated '+r.used+' more.':''),!had?'party':'hop');
    return r;
  }
  async function takeBack(c){
    if(c.action==='list'){if(c.created)await api('/api/extras/'+c.id,{method:'DELETE'});return}
    if(c.action==='unlist'&&c.item){await api('/api/items/'+c.id,{method:'PATCH',body:JSON.stringify({offList:false,low:!!c.prevLow})});return}
    if(c.action==='unlist'){for(var i=0;i<(c.removed||[]).length;i++)await putBack(c.removed[i])();return}
    if(c.created)await api('/api/items/'+c.id+'?undo=1',{method:'DELETE'});
    else if(c.action==='low')await api('/api/items/'+c.id,{method:'PATCH',body:JSON.stringify({low:!!c.prevLow,takeBack:true})});
    else await api('/api/items/'+c.id,{method:'PATCH',body:JSON.stringify(c.action==='add'?{qty:c.prevQty,undo:true}:{qty:c.prevQty,takeBack:true})});
    /* a purchase that cleared a list entry puts the entry back when it is undone */
    for(var j=0;j<(c.cleared||[]).length;j++)await api('/api/extras',{method:'POST',body:JSON.stringify({text:c.cleared[j].text.replace(/ \u00d7\d+$/,''),whole:true})});
  }
  /* conversation: say what happened in plain words; changes are applied straight away and each can be undone */
  var chatHist=[],chatBusy=false;
  function bubble(cls,text){var m=el('div','msg '+cls,text);$('chatLog').append(m);$('chatLog').scrollTop=$('chatLog').scrollHeight;return m}
  function chatKeep(){try{var rows=[].slice.call($('chatLog').children).slice(-40).map(function(m){var t=m.firstChild&&m.firstChild.nodeType===3?m.firstChild.textContent:'';return {c:m.classList.contains('me')?'me':'bot',t:t}}).filter(function(r){return r.t});
    sessionStorage.setItem('stocker.chat',JSON.stringify({day:iso(today()),rows:rows,hist:chatHist.slice(-4)}))}catch(e){}}
  function chatBack(){try{var k=JSON.parse(sessionStorage.getItem('stocker.chat')||'null');if(!k||k.day!==iso(today())||!k.rows||!k.rows.length)return false;k.rows.forEach(function(r){bubble(r.c==='me'?'me':'bot',r.t)});chatHist=k.hist||[];return true}catch(e){return false}}
  function chatChanges(host,changes){changes.forEach(function(c){var row=el('div','chg'),t=el('span','',c.action==='unlist'?'Off your list: '+c.name:c.action==='set'?c.name+': now '+(c.qty<=0?'none':amount(c.qty,c.unit))+' (was '+amount(c.prevQty,c.unit)+')':c.action==='list'?'On your list: '+c.name+(c.note?' ('+c.note+')':''):c.name+': '+(c.action==='low'?'running low':amount(c.prevQty,c.unit)+' \u2192 '+(c.qty<=0?'none':amount(c.qty,c.unit)))),u=el('button','mini','Undo');u.type='button';
      u.setAttribute('aria-label','Undo the change to '+c.name);if(c.action==='list'&&!c.created){t.textContent='Already on your list: '+c.name;var more=el('button','mini','Add another');more.type='button';more.setAttribute('aria-label','Add another '+c.name+' to the list');
        more.onclick=async function(){more.disabled=true;try{var r2=await api('/api/extras',{method:'POST',body:JSON.stringify({text:c.name,again:true})});t.textContent='On your list: '+(r2.text||c.name);more.remove();await refresh()}catch(er){more.disabled=false;if(er.code!=='locked')toast(why(er,'Could not add that.'))}};
        row.append(t,more);host.append(row);return}
      u.onclick=async function(){u.disabled=true;try{await takeBack(c);tell('undo',{said:(lastTurn&&lastTurn.text)||'',reply:t.textContent,route:'update'});cookUsed=cookUsed.filter(function(a){return a.name!==c.name});await refresh();var st=el('s','',t.textContent);t.textContent='';t.append(st);u.textContent='Undone'}catch(er){u.disabled=false;if(er.code!=='locked')toast(why(er,'Could not undo that.'))}};
      row.append(t,u);host.append(row)})}
  /* suggestions: built from what is at home, the time of day and the last reply, never the same few lines twice */
  var tipSeen={},lastTurn=null,sent={},pending=null,cookUsed=[],wanted=null;
  function tell(kind,o){try{fetch('/api/feedback',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({kind:kind},o||{}))}).catch(function(){})}catch(e){}}
  function teachDish(){var dish=sent.__cooked;if(!dish||dish==='it'||!cookUsed.length)return;var seen={},list=cookUsed.filter(function(a){var k=a.name.toLowerCase();if(seen[k])return false;seen[k]=1;return true});
    api('/api/dish',{method:'POST',body:JSON.stringify({dish:dish,items:list})}).catch(function(){});cookUsed=[]}
  var COOKED=/\b(cook|cooking|cooked|made|making|ate|eating|had)\b/i;
  function dishOf(t){var m=String(t||'').match(/\b(?:cooking|cooked|making|made|had|ate|eating)\s+(?:some\s+|a\s+|an\s+|the\s+)?([a-z][a-z ]{2,24}?)(?:\s+(?:tonight|today|for|with|again)\b|[.,!?]|$)/i);return m?m[1].trim().toLowerCase():''}
  function chatTips(){
    var box=$('chatTips');box.textContent='';
    if(pending){var used=pending.pr.map(function(a){return a.name.toLowerCase()}),also=items.filter(function(i){return i.qty>0&&areaOf(i)==='Kitchen'&&!i.frozen&&used.indexOf(i.name.toLowerCase())<0}).sort(function(a,b){var x=expiry(a),y=expiry(b);return (x?x.d:99)-(y?y.d:99)}).slice(0,2);
      var act=function(t,fn){var b=el('button','mini',t);b.type='button';b.onclick=fn;box.append(b)};
      if(pending.pr.length)act("Yes, that's right",pending.yes);
      also.filter(function(i){return !sent[('i also used '+i.name).toLowerCase().replace(/\b(now|the|a|an|please)\b|[^a-z ]/g,'').replace(/\s+/g,' ').trim()]}).forEach(function(i){var t='I also used the '+i.name.toLowerCase();act(t,function(){chatSend({text:t},t)})});
      act('No, none of those',pending.no);return}
    var lc=function(x){return x.toLowerCase()},by=function(a,b){return a.p-b.p},pool=[],key=function(t){return t.toLowerCase().replace(/\b(now|the|a|an|please)\b|[^a-z ]/g,'').replace(/\s+/g,' ').trim()},add=function(t,p){if(t&&!pool.some(function(x){return key(x.t)===key(t)}))pool.push({t:t,p:p+(tipSeen[t]||0)*5+Math.random()})};
    var have=items.filter(function(i){return i.qty>0}),kit=have.filter(function(i){return areaOf(i)==='Kitchen'&&!i.frozen}),other=have.filter(function(i){return areaOf(i)!=='Kitchen'});
    var soon=items.filter(needsUse).sort(function(a,b){return expiry(a).d-expiry(b).d}),low=items.filter(maybeLow);
    var listN=items.filter(needsBuy).length+extras.length,h=today().getHours(),quick=profile&&profile.cook==='quick',ps=pers().map(function(k){return ALIAS[k]||k});
    var pick=function(a){return a[Math.floor(Math.random()*a.length)]};
    // 1. follow-ups to what was just said
    if(lastTurn&&lastTurn.resolved){
      add('What should I cook tomorrow?',0);if(lastTurn.out&&lastTurn.out.length)add("What's on my list now?",1);
    }
    if(lastTurn&&!lastTurn.resolved&&COOKED.test(lastTurn.text||'')&&!(lastTurn.changes||[]).length){
      var said=items.filter(function(i){return i.qty>0&&areaOf(i)==='Kitchen'&&lc(lastTurn.reply||'').indexOf(lc(i.name))>-1}).slice(0,2);
      said.forEach(function(i,k){add('I used the '+lc(i.name),k)});
      var dish=dishOf(lastTurn.text);if(dish&&/do not see|don'?t see|not (tracked|at home)|isn'?t tracked/i.test(lastTurn.reply||''))add('Add '+dish+' to the list',2);
    }
    if(sent.__cooked&&lastTurn&&!lastTurn.resolved&&(lastTurn.changes||[]).length&&(lastTurn.changes||[]).every(function(c){return c.action==='use'})){
      add("That's everything",0);
      var named2=items.filter(function(i){return i.qty>0&&areaOf(i)==='Kitchen'&&!(lastTurn.changes||[]).some(function(c){return lc(c.name)===lc(i.name)})}).sort(function(a,b){var x=expiry(a),y=expiry(b);return (x?x.d:99)-(y?y.d:99)}).slice(0,1);
      named2.forEach(function(i){add('I also used the '+lc(i.name),1)});
    }
    if(lastTurn&&!lastTurn.resolved){
      var ch=lastTurn.changes||[],named=items.filter(function(i){return lastTurn.text&&lc(lastTurn.text).indexOf(lc(i.name).split(' ').pop())>-1})[0];
      if(ch.some(function(c){return c.action==='use'&&c.qty<=0}))add(sent.__cooked?"What's on my list now?":'What can I cook tonight?',0);
      if(ch.some(function(c){return c.action==='list'}))add("What's on my list now?",1);
      if(ch.some(function(c){return c.action==='add'}))add('What should I use up first?',2);
      if(named&&named.qty>0&&areaOf(named)==='Kitchen'&&!named.warn&&!ch.length)add('What can I make with the '+lc(named.name)+'?',0);
      if(named&&!ch.length&&(named.qty<=0||named.low||maybeLow(named)))add('Add '+lc(named.name)+' to the list',1);
      if(/not tracked|isn'?t tracked|don'?t (see|have)/i.test(lastTurn.reply||'')){var w=(lastTurn.text||'').replace(/^.*\b(have|got)\s+(any\s+)?/i,'').replace(/[?.!]+$/,'').trim();if(w&&w.split(' ').length<=4)add('Add '+lc(w)+' to the list',0)}
    }
    // 2. what the home needs right now
    var cookable=soon.filter(function(i){return !i.warn&&areaOf(i)==='Kitchen'})[0];if(cookable)add('What can I make with the '+lc(cookable.name)+'?',3);
    if(soon[1])add('I used the '+lc(soon[1].name),6);
    if(low[0])add('We ran out of '+lc(pick(low).name),5);
    if(low[0])add('Are we low on '+lc(pick(low).name)+'?',7);
    if(listN)add("What's on my list?",6);
    if(profile&&profile.shopDay===DAYS[today().getDay()])add('What do I need for today’s shop?',2);
    // 3. the time of day and the kind of home
    if(kit.length>=2&&!sent.__cooked){
      if(h>=5&&h<11)add(pick(['What could I have for breakfast?','Breakfast ideas from what we have?']),4);
      else if(h<15)add(pick(['What can I have for lunch?','Lunch ideas from what is here?']),4);
      else if(h<22)add(quick?'What can I make in 20 minutes?':pick(['What can I cook tonight?','Dinner ideas from what we have?']),3);
      else add('Anything quick to eat right now?',4);
      add("I'm cooking "+pick(['pasta','a stir fry','tacos','curry','soup','omelettes','fried rice'])+' tonight',8);
    }
    if(ps.indexOf('mom')>-1||ps.indexOf('dad')>-1||ps.indexOf('family4')>-1||ps.indexOf('big')>-1)add('What can I pack for lunchboxes tomorrow?',7);
    if(ps.indexOf('gym')>-1||ps.indexOf('fit')>-1)add('What high-protein meal can I make?',6);
    if(ps.indexOf('host')>-1)add('Do we have enough for 6 guests?',7);
    if(ps.indexOf('newparents')>-1)add('How many diapers are left?',5);
    if(other.length)add('Do we have '+lc(pick(other).name)+'?',9);
    if(kit.length)add('Is there any '+lc(pick(kit).name)+' left?',10);
    // 4. a fresh home
    if(!items.length){add('I bought milk, eggs and bread',0);add('Add coffee to the list',1);add('What can you help with?',2)}
    pool=pool.filter(function(x){return !sent[key(x.t)]&&!(sent.__cooked&&/^(i'?m cooking|what can i cook tonight|dinner ideas|what can i make in 20)/i.test(x.t))});
    pool.sort(by).slice(0,3).forEach(function(x){tipSeen[x.t]=(tipSeen[x.t]||0)+1;var b=el('button','mini',x.t);b.type='button';b.onclick=function(){chatSend({text:x.t},x.t)};box.append(b)})}
  function buddy(){return profile&&profile.buddy||'Tote'}
  function openChat(quiet){if($('chatDlg').open)return;if(!$('chatLog').firstChild){sent={};lastTurn=null;pending=null;cookUsed=[];wanted=null}$('chatH').textContent='What changed?';
    if(!$('chatLog').firstChild&&!chatBack())bubble('bot','Hi'+(me?' '+me:'')+", I'm "+buddy()+'. I keep an eye on the house. Tell me what you cooked, used or bought and I will keep everything up to date, or ask me what you have.');
    chatTips();$('chatDlg').showModal();if(window.Tote&&Tote.mount($('toteChat'),84,buddy())){Tote.onTap=null;Tote.mood('happy');Tote.wave()}if(!quiet)$('chatText').focus()}
  $('chatDlg').addEventListener('close',function(){if(window.Tote)Tote.talk(false);render()});
  window.addEventListener('tote-ready',function(){if(!$('app').hidden)render()});
  async function chatSend(payload,label){
    if(chatBusy)return;var kk=String(payload.text||label||'').toLowerCase().replace(/\b(now|the|a|an|please)\b|[^a-z ]/g,'').replace(/\s+/g,' ').trim();if(kk)sent[kk]=1;if(COOKED.test(payload.text||'')&&!/^i also used/i.test(payload.text||''))sent.__cooked=dishOf(payload.text)||'it';if(!/^i also used/i.test(payload.text||''))pending=null;chatBusy=true;$('chatGo').disabled=true;$('chatTips').textContent='';
    var mine=bubble('me',label),wait=bubble('bot','Thinking\u2026');payload.history=chatHist.slice(-4);if(window.Tote)Tote.talk(true);
    var part=false;
    try{var r=null;
      /* a long message: what I am certain of is done at once, and only the rest waits for the slower read */
      if(payload.text&&!payload.audio&&/[.!?]\s+\S/.test(payload.text)){var f1=null;try{f1=await api('/api/chat',{method:'POST',body:JSON.stringify({text:payload.text,fast:true})})}catch(e1){if(e1.code==='locked')throw e1}
        if(f1&&f1.reply){if(f1.blocked||!f1.rest)r=f1;
          else{wait.textContent=f1.reply;chatChanges(wait,f1.changes||[]);chatHist.push({role:'user',text:payload.text},{role:'assistant',text:f1.reply});
            if(f1.changes&&f1.changes.length){if(window.Tote)Tote.hop();await refresh()}
            part=true;payload={text:f1.rest,spent:f1.spent,history:chatHist.slice(-4)};wait=bubble('bot','Reading the rest\u2026');$('chatLog').scrollTop=$('chatLog').scrollHeight}}}
      if(!r)r=await api('/api/chat',{method:'POST',body:JSON.stringify(payload)});
      if(r.heard)mine.textContent=r.heard;wait.textContent=r.reply;if(window.Tote)Tote.mood(r.blocked?'oops':'happy');
      chatChanges(wait,r.changes||[]);
      if(r.proposal&&r.proposal.length){var pr=r.proposal.slice(),box=el('div');wait.append(box);
        var drawP=function(){box.textContent='';pr.forEach(function(a){var row=el('div','chg'),t=el('span','',a.name+': '+amount(a.quantity,a.unit)),x=el('button','mini','Not this');x.type='button';x.setAttribute('aria-label','I did not use '+a.name);
            x.onclick=function(){tell('rejected',{said:(lastTurn&&lastTurn.text)||'',reply:a.name,route:'update',detail:'not this item'});pr=pr.filter(function(k){return k!==a});drawP();chatTips()};row.append(t,x);box.append(row)});
          var bar=el('div','chg'),yes=el('button','mini',pr.length?'Yes, update':'None of these'),no=el('button','mini','No');yes.type=no.type='button';
          yes.onclick=async function(){yes.disabled=no.disabled=true;if(!pr.length){box.textContent='';pending=null;bubble('bot','No problem. What went into it? You can tap one below or tell me.');lastTurn={text:'cooked',reply:'',changes:[]};chatTips();return}
            try{var res=await api('/api/apply',{method:'POST',body:JSON.stringify({source:'text',actions:pr.map(function(a){return {action:'use',name:a.name,quantity:a.quantity,unit:a.unit}})})});
              box.textContent='';pending=null;var out=(res.changes||[]).filter(function(c){return c.qty<=0}).map(function(c){return c.name});
              var done=bubble('bot','Done, I took those off.'+(out.length?' You are now out of '+out.join(' and ')+', so it is on your list.':'')+' Enjoy your meal.');chatChanges(done,res.changes||[]);if(window.Tote)Tote.hop();
              (res.changes||[]).forEach(function(c){if(c.action==='use')cookUsed.push({name:c.name,quantity:Math.max(0.01,c.prevQty-c.qty)})});teachDish();
              lastTurn={resolved:'yes',out:out,text:'',reply:'',changes:res.changes||[]};await refresh();chatTips()}
            catch(er){yes.disabled=no.disabled=false;if(er.code!=='locked')toast(why(er,'Could not save that.'))}};
          no.onclick=function(){tell('rejected',{said:(lastTurn&&lastTurn.text)||'',reply:pr.map(function(a){return a.name}).join(', '),route:'update',detail:'said no to the guess'});box.textContent='';pending=null;bubble('bot','No problem, I have not changed anything. What went into it? You can tap one below or tell me.');lastTurn={text:'cooked',reply:'',changes:[]};chatTips();$('chatText').focus()};
          if(pr.length)bar.append(yes,no);else bar.append(yes);box.append(bar);pending={pr:pr,yes:function(){yes.click()},no:function(){no.click()}}};drawP()}
      chatHist.push({role:'user',text:r.heard||payload.text||''},{role:'assistant',text:r.reply});
      lastTurn={text:r.heard||payload.text||'',reply:r.reply,changes:r.changes||[]};
      var saidNow=r.heard||payload.text||'';
      if(wanted){tell('wanted',{said:wanted.said,reply:wanted.reply,route:wanted.route,detail:saidNow});wanted=null}
      if(sent.__cooked)(r.changes||[]).forEach(function(c){if(c.action==='use')cookUsed.push({name:c.name,quantity:Math.max(0.01,c.prevQty-c.qty)})});
      if(/^that'?s (everything|all|it)\b/i.test(saidNow))teachDish();
      if(!(r.proposal&&r.proposal.length)){var fb=el('button','fb','Not right?');fb.type='button';fb.setAttribute('aria-label','Tell '+buddy()+' this reply was not right');
        fb.onclick=function(){fb.remove();tell('down',{said:saidNow,reply:r.reply,route:r.route||''});wanted={said:saidNow,reply:r.reply,route:r.route||''};bubble('bot','Thanks for telling me. I have noted it so I can do better. What should I have done?');$('chatText').focus()};wait.append(fb)}
      if(r.changes&&r.changes.length){if(window.Tote)Tote.hop();await refresh()}
    }catch(e){if(window.Tote)Tote.mood('oops');wait.textContent=part&&e.code!=='ai_quota'&&e.code!=='locked'?'I could not read the rest just now. What I listed above is done.':e.code==='ai_quota'?COPY.ai_quota:e.code==='slow_down'?COPY.slow_down:e.code==='silent'?"I couldn't hear anything in that. Try again a little closer to the phone.":e.code==='offline'?'You seem to be offline. Nothing was changed.':e.code==='locked'?'':'I could not work that out just now. Nothing was changed. Try again in a moment.'}
    if(window.Tote)Tote.talk(false);chatBusy=false;$('chatGo').disabled=false;chatTips();chatKeep();$('chatLog').scrollTop=$('chatLog').scrollHeight}
  $('chatForm').addEventListener('submit',function(ev){ev.preventDefault();var t=$('chatText').value.trim();if(!t)return;$('chatText').value='';chatSend({text:t},t)});
  $('chatMic').onclick=function(){startRec()};
  /* dinner ideas: suggestions come from what is at home; "I cooked this" deducts the ingredients */
  async function cookIdeas(){
    if(busy)return;setBusy('Thinking about dinner');var d;
    try{d=await api('/api/meals',{method:'POST'})}catch(e){setBusy(null);if(e.code!=='locked')toast(e.code==='offline'?COPY.offline:'I could not come up with ideas just now. Try again in a moment.');return}
    setBusy(null);
    if(d.simple&&d.meals&&d.meals.length)toast('Simple ideas from what needs using first, while my AI allowance resets.');
    if(!d.meals||!d.meals.length){toast(d.few?'Add a few more kitchen items first, then I can suggest dinners.':'I could not find a dinner in what you have. Try again after your next shop.');return}
    var ul=$('mealList');ul.textContent='';
    d.meals.forEach(function(m){
      var li=el('li','card'),acts=el('div','acts'),yes=el('button','btn primary','I cooked this');li.style.boxShadow='none';li.style.border='1px solid var(--line)';
      li.append(el('h3','',m.name),el('p','sub',m.minutes+' min'+(m.why?'. '+m.why:'')));
      var u=el('p');u.append(el('b','','Uses '),document.createTextNode(m.uses.map(function(x){return x.name+' ('+amount(x.quantity,x.unit)+')'}).join(', ')));li.append(u);
      if(m.missing.length){var need=el('p','sub','You would also need '+m.missing.join(', ')+'.');li.append(need);
        var ad=el('button','mini','Add those to my list');ad.type='button';ad.onclick=async function(){ad.disabled=true;
          try{var kept=0;for(var i=0;i<m.missing.length;i++)if((await addToList(m.missing[i],true))==='kept')kept++;await refresh();ad.textContent=kept===m.missing.length?'Already on your list':'Added to your list'}
          catch(e){ad.disabled=false;if(e.code!=='locked')toast(why(e,'Could not add those.'))}};acts.append(ad)}
      yes.type='button';yes.style.minHeight='40px';yes.style.padding='8px 16px';
      yes.onclick=async function(){yes.disabled=true;
        try{var r=await api('/api/apply',{method:'POST',body:JSON.stringify({source:'cook',actions:m.uses.map(function(x){return {action:'use',name:x.name,quantity:x.quantity,unit:x.unit}})})});
          await refresh();$('mealDlg').close();showResult({kind:'cook',heard:'',store:''},r)}
        catch(e){yes.disabled=false;if(e.code!=='locked')toast(why(e,'Could not save that.'))}};
      acts.prepend(yes);li.append(acts);ul.append(li)});
    $('mealDlg').showModal();
  }
  /* after a scan: a card on Today and a message with Undo, instead of a sheet in the way */
  function doneRows(ul){
    done.slice(0,6).forEach(function(c){
      var li=el('li','row'),g=el('div','grow'),x=el('button','iconbtn');li.dataset.id=c.id||'';
      g.append(el('div','name',c.name));if(c.warn)g.append(el('span','pill bad','Check label: '+c.warn));
      g.append(el('div','sub',c.action==='list'?(c.kept?'Already on your shopping list':'Added to your shopping list'+(c.note?', note: '+c.note:'')):c.action==='low'?'Marked as running low, added to your list':c.action==='use'?(c.qty<=0?'Marked as finished':'Now '+amount(c.qty,c.unit)+' left'):
        (c.unsure?'I could not count these. How many?':amount(c.added,c.unit))+(c.expiry?' · best before '+(c.est?'about ':'')+fmt(c.expiry):'')));
      if(c.unsure&&c.created)g.append(howMany(c.id,c.name,function(n){c.unsure=false;c.added=c.qty=n;refresh().catch(function(){})}));
      x.type='button';x.setAttribute('aria-label',"That's wrong, take back "+c.name);x.append(icon('M6 6l12 12M18 6L6 18'));
      x.onclick=async function(){x.disabled=true;try{await takeBack(c);done=done.filter(function(k){return k!==c});if(!done.length)doneInfo=null;await refresh();if(!done.length)toast('Taken back. Nothing was changed.')}
        catch(e){x.disabled=false;if(e.code!=='locked')toast('Could not undo that. Try again.')}};
      var ed=null;if(c.action==='add'){ed=el('button','iconbtn');ed.type='button';ed.setAttribute('aria-label','Edit '+c.name);ed.append(icon('M4 20h4L19 9l-4-4L4 16zM13 7l4 4'));ed.onclick=function(){editDone(c,li)}}
      li.append(iconFor(c),g);if(ed)li.append(ed);li.append(x);ul.append(li)});
    if(done.length>6){var li2=el('li'),more=btn('link','See all '+done.length+' at home',function(){doneInfo=null;go('pantry')});more.style.minHeight='44px';li2.append(more);ul.append(li2)}
  }
  /* Edit a line of the card: the name and how many. The old line is taken back and the corrected one saved, so the cross
     still takes back the corrected one. */
  function editDone(c,li){
    var f=el('form','editrow'),nm=el('input'),qn=el('input'),sv=el('button','mini','Save'),cn=el('button','mini','Cancel');
    nm.value=c.name;nm.setAttribute('aria-label','Name');nm.maxLength=60;nm.autocomplete='off';
    qn.type='number';qn.min='1';qn.max='999';qn.step='1';qn.inputMode='numeric';qn.value=String(Math.max(1,Math.round(c.added||c.qty||1)));qn.setAttribute('aria-label','How many');
    sv.type='submit';cn.type='button';cn.onclick=function(){renderToday()};
    var row=el('div','acts');row.append(sv,cn);f.append(nm,qn,row);li.textContent='';li.append(f);nm.focus();
    f.addEventListener('submit',async function(ev){ev.preventDefault();var name=nm.value.replace(/\s+/g,' ').trim(),n=Math.round(Number(qn.value));
      if(!name||!(n>=1)){toast('Give it a name and a number.');return}
      if(name===c.name&&n===Math.round(c.added||c.qty||1)){renderToday();return}
      sv.disabled=true;
      try{await takeBack(c);
        var r=await api('/api/apply',{method:'POST',body:JSON.stringify({source:(doneInfo&&doneInfo.kind)||'shelf',auto:true,actions:[{action:'add',name:name,quantity:n,unit:c.unit==='pcs'||name!==c.name?'pcs':c.unit,sure:true}]})});
        var nc=r&&r.changes&&r.changes[0];var i=done.indexOf(c);if(nc&&i>=0)done[i]=nc;else if(i>=0)done.splice(i,1);
        await refresh();toast('Changed to '+amountName(n,name)+'.')}
      catch(e){sv.disabled=false;if(e.code!=='locked')toast(why(e,'Could not change that.'));try{await refresh()}catch(er){}}})}
  function amountName(n,name){return n===1?name:n+' '+name}
  /* What the camera was not sure of is asked, not added: one tap to keep it, name it, or leave it out. */
  function doubtRows(c){var ds=(doneInfo&&doneInfo.doubts)||[];if(!ds.length)return;
    var box=el('div','doubts');box.append(el('div','kicker','Check these'),el('h3','','Did I see these right?'));var ul=el('ul','list');
    ds.forEach(function(dq){var li=el('li','row'),g=el('div','grow');li.dataset.doubt=lowKey(dq.name);g.append(el('div','name',dq.why==='label'?dq.name:dq.name+'?'),el('div','sub',dq.why==='label'?'I could not tell what is in it.':'My guess. Is this right?'));li.append(g);
      var drop=function(){doneInfo.doubts=doneInfo.doubts.filter(function(x){return x!==dq});renderToday()};
      var keep=async function(name){var r=await api('/api/apply',{method:'POST',body:JSON.stringify({source:(doneInfo&&doneInfo.kind)||'shelf',auto:true,actions:[{action:'add',name:name,quantity:1,unit:'pcs',sure:true}]})});
        if(r&&r.changes&&r.changes[0])done.push(r.changes[0]);doneInfo.doubts=doneInfo.doubts.filter(function(x){return x!==dq});await refresh();toast('Added '+name+'.')};
      var acts=el('div','acts');
      if(dq.why!=='label')acts.append(btn('mini','Yes',function(){return keep(dq.name).catch(function(e){if(e.code!=='locked')toast(why(e,'Could not add that.'))})}));
      acts.append(btn('mini',dq.why==='label'?'Name it':'Edit',function(){var f=el('form','editrow'),nm=el('input'),sv=el('button','mini','Add');nm.value=dq.why==='label'?'':dq.name;nm.placeholder='What is it?';nm.setAttribute('aria-label','What is it?');nm.maxLength=60;sv.type='submit';
        f.append(nm,sv);acts.replaceWith(f);nm.focus();f.addEventListener('submit',async function(ev){ev.preventDefault();var v=nm.value.replace(/\s+/g,' ').trim();if(!v)return;sv.disabled=true;try{await keep(v)}catch(e){sv.disabled=false;if(e.code!=='locked')toast(why(e,'Could not add that.'))}})}));
      acts.append(btn('mini','No',function(){drop()}));
      g.append(acts);ul.append(li)});
    box.append(ul);c.append(box)}
  async function undoAll(){
    try{for(var i=0;i<done.length;i++)await takeBack(done[i]);done=[];doneInfo=null;await refresh();toast('Undone. Everything is back to how it was.')}
    catch(e){if(e.code!=='locked')toast('Could not undo everything. Check the At home tab.');try{await refresh()}catch(er){}}
  }
  function showResult(d,r){
    var dz=(d&&d.doubts)||[];
    if((!r||!r.changes||!r.changes.length)&&dz.length){done=[];doneInfo={kind:d.kind,title:'I need a hand',sub:'I was not sure of these. Nothing was changed yet.',heard:'',doubts:dz.slice(),photo:d.photo||null,boxes:d.boxes||null,marks:d.marks||null};go('today');window.scrollTo(0,0);return}
    if(!r||!r.changes||!r.changes.length){
      toast(r&&r.missed&&r.missed.length?"I couldn't find "+r.missed.join(', ')+' in your things.':
        d&&d.kind==='voice'&&d.heard?'I heard “'+d.heard+'” but found nothing to add or use.':"I couldn't find any items in that. Try a clearer photo, or tell me instead.");return}
    done=r.changes.slice();
    var parts=[];if(r.added)parts.push('I added '+r.added+(r.added===1?' thing':' things'));if(r.used||r.low)parts.push((r.added?'updated ':'I updated ')+((r.used||0)+(r.low||0)));
    var title=parts.join(', ')||'Done';
    if(d.empty)title='On your list: '+r.changes[0].name+(d.pack?' ('+d.pack+')':'');
    doneInfo={kind:d.kind,doubts:dz.slice(),photo:d.photo||null,boxes:d.boxes||null,marks:d.marks||null,title:title,sub:(d.store?'From '+d.store+'. ':'')+'Saved. Tap the cross on anything I got wrong.'+(r.priceNote?' '+r.priceNote:'')+(r.missed&&r.missed.length?" I couldn't find "+r.missed.join(', ')+'.':'')+learntLine(r.changes),
      heard:d.heard?'“'+d.heard+'”':d.label?d.label.text:''};
    go('today');window.scrollTo(0,0);toast(title+(d.store?' from '+d.store:'')+'.','Undo',undoAll);
  }

  async function start(){
    try{await refresh();$('gate').hidden=true;$('app').hidden=false;$('tabbar').hidden=false;go((location.hash||'').slice(1)||tab,'start');pushSync();
      if(/[?&]n=1\b/.test(location.search)){try{history.replaceState(null,'',location.pathname+location.hash)}catch(e2){}openNudges()}
      var skip=false;try{skip=localStorage.getItem('stocker.profSkip')==='1'}catch(e){}if(!profile&&!skip)openHello()}
    catch(e){if(e.code==='setup')showGate('There is no passcode yet. Set one in the Worker settings as a secret named APP_PIN.');
      else if(e.code==='locked')showGate();else showGate('Could not reach Stocker. Check your connection and reload.')}
  }
  start();
})();
