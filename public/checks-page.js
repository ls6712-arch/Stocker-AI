(function(){
  var $=function(i){return document.getElementById(i)},el=function(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
  var KEYS=['understood','home','reply','safe'],SHORT={understood:'Understood',home:'Home right',reply:'Reply right',safe:'Safe'};
  var SHOULD={'':'What should have happened? (optional)',update:'Should have updated the home',nothing:'Should have changed nothing',list:'Should have gone on the list'};
  var data=null,show='todo',who='';
  function api(m,u,b){return fetch(u,{method:m,credentials:'same-origin',headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(function(r){if(r.status===401||r.status===403)throw new Error('locked');if(!r.ok)throw new Error('failed');return r.json()})}
  function when(t){var d=new Date(t);return d.toLocaleDateString([],{day:'numeric',month:'short'})+', '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
  function pct(a,b){return b?Math.round(100*a/b)+'%':'–'}
  function card(label,big,small){var d=el('div');d.append(el('small','',label),el('b','',big));if(small)d.append(el('small','',small));return d}
  function drawSum(){var s=data.summary,box=$('sum');box.textContent='';
    box.append(card('Fully right',pct(s.right,s.marked),s.right+' of '+s.marked+' you checked'),card('To check',String(s.toDo),'last '+data.days+' days'),
      card('Claude has doubts',String(s.guessedWrong),'not checked by you yet'),card('Claude agrees with you',pct(s.agree,s.compared),s.compared?s.agree+' of '+s.compared:'nothing to compare yet'));
    if(s.unsafe)box.append(card('Safety',String(s.unsafe),s.unsafe===1?'turn failed the safety check':'turns failed the safety check'));
    var fk=Object.keys(s.fails||{});if(fk.length)box.append(card('Most often wrong',SHORT[fk.sort(function(a,b){return s.fails[b]-s.fails[a]})[0]],fk.map(function(k){return SHORT[k]+' '+s.fails[k]}).join(', ')));
    (s.perHome||[]).forEach(function(p){box.append(card(p.from,pct(p.right,p.marked),p.right+' of '+p.marked+' right'))})}
  function pick(t){if(who&&t.from!==who)return false;if(show==='todo')return !t.mark;if(show==='doubt')return !t.mark&&t.guess&&t.guess.right===false;if(show==='wrong')return (t.mark&&!t.mark.right)||(!t.mark&&t.guess&&t.guess.right===false);return true}
  function yn(k,val,set){var g=el('div','yn');g.setAttribute('role','group');g.setAttribute('aria-label',SHORT[k]);
    [['yes','Yes','y'],['no','No','n']].concat(k==='safe'?[['na','Not needed','x']]:[]).forEach(function(o){var b=el('button',o[2],o[1]);b.type='button';b.setAttribute('aria-pressed',val===o[0]?'true':'false');b.onclick=function(){set(o[0])};g.append(b)});return g}
  function turnCard(t){
    var c=el('article','turn'),m=el('div','meta'),ans={};
    var start=t.mark||t.guess||{};KEYS.forEach(function(k){ans[k]=start[k]||(k==='safe'?'na':'')});
    m.append(el('span','',t.from+' · '+when(t.at)),t.mark?el('span','pill '+(t.mark.right?'ok':'bad'),t.mark.right?'Right':'Wrong'):t.guess?el('span','pill warn','Claude: '+(t.guess.right?'looks right':'doubts it')):el('span','pill','Not checked'));
    c.append(m,el('div','said','“'+(t.said||'')+'”'));
    var did=el('div','did');did.append(el('b','','What Tote did: '),document.createTextNode(t.did||'changed nothing'));c.append(did);
    var rep=el('div','reply');rep.append(el('b','','What Tote said: '),document.createTextNode(t.reply||''));c.append(rep);
    if(t.outcome&&t.outcome!=='ok')c.append(el('div','did','They then: '+({down:'tapped "Not right?"',undo:'undid it',rejected:'rejected the guess',corrected:'corrected Tote',repeated:'said it again',missed:'Tote could not find it'}[t.outcome]||t.outcome)));
    if(t.guess){var g=el('div','guess');var bad=KEYS.filter(function(k){return t.guess[k]==='no'}).map(function(k){return SHORT[k]});
      g.textContent='Claude’s guess: '+(t.guess.right?'right':'wrong'+(bad.length?' ('+bad.join(', ')+')':''))+(t.guess.note?'. '+t.guess.note:'')+(t.guess.should?' '+SHOULD[t.guess.should]+'.':'');c.append(g)}
    var qs=el('div');function drawQs(){qs.textContent='';KEYS.forEach(function(k){var q=el('div','q');q.append(el('span','',SHORT[k]),yn(k,ans[k],function(v){ans[k]=v;drawQs();sync()}));qs.append(q)})}
    drawQs();c.append(qs);
    var more=el('div','row'),sh=el('select'),note=el('input'),item=el('input');sh.setAttribute('aria-label','What should have happened');
    Object.keys(SHOULD).forEach(function(k){var o=el('option','',SHOULD[k]);o.value=k;sh.append(o)});
    sh.value=(t.mark&&t.mark.should)||(t.guess&&t.guess.should)||'';note.placeholder='Note (optional)';note.setAttribute('aria-label','Note');note.value=(t.mark&&t.mark.note)||'';
    item.placeholder='Which item? (optional)';item.setAttribute('aria-label','Which item');item.value=(t.mark&&t.mark.item)||'';
    more.append(sh,item,note);c.append(more);
    var row=el('div','row'),all=el('button','','All right'),save=el('button','ghost','Save'),st=el('span','',' ');st.setAttribute('role','status');all.type=save.type='button';
    function wrong(){return KEYS.some(function(k){return ans[k]==='no'})}
    function sync(){more.hidden=!wrong();save.disabled=KEYS.some(function(k){return !ans[k]})}
    async function send(a){save.disabled=all.disabled=true;st.textContent='Saving';
      try{var r=await api('POST','/api/checks',{home:t.home,turn:t.id,answers:a,should:wrong()?sh.value:'',item:item.value,note:note.value});t.mark=r.mark;await load(true)}
      catch(e){st.textContent=e.message==='locked'?'Sign in to Stocker as the owner first.':'Could not save that.';save.disabled=all.disabled=false}}
    all.onclick=function(){KEYS.forEach(function(k){ans[k]=k==='safe'&&ans.safe!=='yes'?'na':'yes'});send(ans)};
    save.onclick=function(){send(ans)};
    row.append(all,save,st);
    if(t.mark){var undo=el('button','ghost','Clear my answer');undo.type='button';undo.onclick=async function(){try{await api('DELETE','/api/checks?home='+encodeURIComponent(t.home)+'&turn='+t.id);await load(true)}catch(e){st.textContent='Could not clear that.'}};row.append(undo)}
    c.append(row);sync();return c}
  function draw(){var box=$('list');box.textContent='';var list=data.turns.filter(pick);
    if(!list.length){box.append(el('p','empty',show==='todo'?'Nothing left to check. Well done.':'Nothing here.'));return}
    list.slice(0,80).forEach(function(t){box.append(turnCard(t))});if(list.length>80)box.append(el('p','empty','Showing 80 of '+list.length+'. Check these first.'))}
  async function load(keep){try{data=await api('GET','/api/checks?days=14')}catch(e){$('list').textContent='';$('list').append(el('p','empty',e.message==='locked'?'Sign in to Stocker as the owner in this browser to see this.':'Could not load the checklist.'));return}
    if(!keep){var r=$('rules');r.textContent='';KEYS.forEach(function(k){r.append(el('li','',data.checklist[k]))});
      var homes={};data.turns.forEach(function(t){homes[t.from]=1});Object.keys(homes).forEach(function(h){var o=el('option','',h);o.value=h;$('who').append(o)})}
    drawSum();draw()}
  document.querySelectorAll('[data-show]').forEach(function(b){b.onclick=function(){show=b.dataset.show;document.querySelectorAll('[data-show]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});draw()}});
  $('who').onchange=function(){who=$('who').value;draw()};
  load(false);
})();
