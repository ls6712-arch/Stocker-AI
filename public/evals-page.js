(function(){
  var $=function(i){return document.getElementById(i)},el=function(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
  // ---- the training loop: real misses, a person's verdict, a test from then on ----
  var HOME=[{name:'Whole Milk',qty:1,unit:'L',category:'Dairy'},{name:'Eggs',qty:12,unit:'pcs',category:'Dairy'},{name:'Bread',qty:1,unit:'pcs',category:'Bakery'},{name:'Spaghetti',qty:500,unit:'g',category:'Pantry'},{name:'Tomato Pasta Sauce',qty:1,unit:'pcs',category:'Pantry'},{name:'Rice',qty:2,unit:'kg',category:'Pantry'},{name:'Chicken Breast',qty:2,unit:'lb',category:'Meat'},{name:'Baby Spinach',qty:1,unit:'pack',category:'Produce'},{name:'Coffee',qty:1,unit:'pack',category:'Pantry'},{name:'Dish Soap',qty:1,unit:'pcs',area:'Cleaning',category:'Dishes'}];
  var OUTCOME={down:'Marked not right',undo:'They undid it',rejected:'They rejected the guess',corrected:'They corrected me',repeated:'They said it again',missed:'I could not find it'};
  var VERDICT={nothing:'Should have changed nothing',update:'Should have updated the home',list:'Should have gone on the list',ok:'Not a mistake'};
  var INTENT={nothing:'question',update:'stated_update',list:'list_add'},mine=[];
  var esc=function(t){return String(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')};
  function toCase(c){var has=c.name?{name:esc(c.name)}:null;
    var checks=c.expect==='nothing'?[{count:[0,0]}]:c.expect==='list'?[{has:Object.assign({action:'list'},has||{})}]:[has?{has:Object.assign({action:'add|use|set|low'},has)}:{count:[1,9]}];
    return {id:'real-'+c.id,group:'From your conversations',kind:'chat',text:c.said,inventory:HOME,note:VERDICT[c.expect]+(c.name?': '+c.name:''),checks:checks}}
  function send(method,path,body){return fetch(path,{method:method,credentials:'same-origin',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){if(!r.ok)throw r.status;return r.json()})}
  function draw(d){mine=d.cases||[];var W=$('weeks'),G=$('groups'),M=$('mine');W.textContent='';G.textContent='';M.textContent='';
    (d.weeks||[]).forEach(function(w,i){var b=el('div');b.append(el('b','',w.turns?Math.round(w.missed/w.turns*100)+'%':'–'),document.createTextNode((i===0?'missed this week':i===1?'last week':i+' weeks ago')+' ('+w.missed+' of '+w.turns+')'));W.append(b)});
    if(!(d.groups||[]).length)G.append(el('p','','Nothing needs a look. Misses from the chat will appear here.'));
    (d.groups||[]).forEach(function(g){G.append(el('h2','',g.title+' ('+g.count+')'),el('p','','Where to look: '+g.fix));
      g.examples.forEach(function(x){var c=el('div','case'),h=el('h3');h.append(el('span','',OUTCOME[x.outcome]||x.outcome),el('span','pill stretch',x.times>1?'said '+x.times+' times: '+(x.ats||[x.at]).slice().reverse().map(function(a){return String(a).slice(5,16).replace('T',' ')}).join(', ')+' (latest shown)':String(x.at).slice(0,16).replace('T',' ')));
        c.append(h,el('div','q',(x.from?x.from+' said: ':'They said: ')+x.said),el('div','q','Tote: '+(x.reply||'(nothing)')+(x.did?'\nWhat I did: '+x.did:'\nWhat I did: changed nothing')+(x.wanted?'\nThey wanted: '+x.wanted:'')));
        var name=el('input');name.type='text';name.maxLength=40;name.placeholder='Which item? Optional';name.setAttribute('aria-label','Which item it should have been about');name.className='item';
        var bar=el('div','verdicts');Object.keys(VERDICT).forEach(function(k){var b=el('button',k===g.suggest?'':'ghost',VERDICT[k]);b.type='button';
          b.onclick=function(){bar.querySelectorAll('button').forEach(function(z){z.disabled=true});send('POST','/api/review',{id:x.id,home:x.home||'',label:k,name:name.value.trim()}).then(load,function(){$('copied').textContent='Could not save that. Sign in to Stocker and try again.';bar.querySelectorAll('button').forEach(function(z){z.disabled=false})})};bar.append(b)});
        c.append(name,bar);G.append(c)})});
    if(!mine.length)M.append(el('p','','None yet.'));
    mine.forEach(function(c){var k=el('div','case'),h=el('h3'),rm=el('button','ghost','Remove');rm.type='button';rm.setAttribute('aria-label','Remove this test: '+c.said);
      rm.onclick=function(){rm.disabled=true;send('DELETE','/api/review?case='+c.id).then(load,function(){rm.disabled=false})};
      h.append(el('span','',VERDICT[c.expect]+(c.name?': '+c.name:'')),rm);k.append(h,el('div','q',c.said));M.append(k)})}
  function load(){return send('GET','/api/review').then(draw,function(){$('groups').textContent='Sign in to Stocker in this browser to see this.'})}
  load();
  $('copy').onclick=function(){var t=JSON.stringify({cases:mine.map(toCase),corpus:mine.map(function(c){return {text:c.said,persona:'real conversation',intent:INTENT[c.expect],items:c.name?[c.name]:[]}})},null,1);
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){$('copied').textContent=mine.length+' copied. Paste "cases" into public/evals/cases.json and "corpus" into evals/corpus/real.json.'},function(){var pre=el('pre','',t);$('mine').prepend(pre);$('copied').textContent='Select and copy the text below.'})};
  $('run').onclick=function(){location.href='/scorecard.html'};
})();
/* the helper's own name: a household that renamed Tote sees that name here too */
(function(){fetch('/api/items',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(d){var n=d&&d.profile&&d.profile.buddy;if(!n||n==='Tote')return;window.BUDDY=n;
  var swap=function(root){var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),t;while((t=w.nextNode()))if(/\bTote\b/.test(t.nodeValue)&&!/^(SCRIPT|STYLE)$/.test(t.parentNode.nodeName))t.nodeValue=t.nodeValue.replace(/\bTote\b/g,n)};
  swap(document.body);document.title=document.title.replace(/\bTote\b/g,n);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(x){if(x.nodeType===1)swap(x);else if(x.nodeType===3&&/\bTote\b/.test(x.nodeValue))x.nodeValue=x.nodeValue.replace(/\bTote\b/g,n)})})}).observe(document.body,{childList:true,subtree:true})}).catch(function(){})})();
