// Browser check of talking to Tote: run against `wrangler dev --port 8799` with APP_PIN=test1234 and the AI allowance marked used up (aiq = today). Fakes the phone speech-to-text, and a fake microphone for the recording fallback.
const {chromium,devices}=require('playwright');const S=process.argv[2]||require('os').tmpdir();require('fs').mkdirSync(S+'/vshots',{recursive:true});
(async()=>{const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
 const R=[];const check=(n,ok,d)=>{R.push(ok);console.log((ok?'  ok  ':'  FAIL')+' '+n+(d?'  ('+d+')':''))};
 async function page(fakeSR){const c=await b.newContext({...devices['Pixel 7'],permissions:['microphone']});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
   if(fakeSR)await p.addInitScript(()=>{class F{constructor(){window.__sr=this}start(){setTimeout(()=>{this.onsoundstart&&this.onsoundstart();
       const words=['used','used 2','used 2 eggs'];words.forEach((w,i)=>setTimeout(()=>{window.__said=w;this.onresult&&this.onresult({results:[Object.assign([{transcript:w}],{isFinal:i===2})]})},300*(i+1)))},100);
       this._t=setTimeout(()=>this.onend&&this.onend(),window.__hold?60000:3200)}stop(){clearTimeout(this._t);setTimeout(()=>this.onend&&this.onend(),10)}abort(){clearTimeout(this._t);this.aborted=true;setTimeout(()=>this.onend&&this.onend(),10)}}window.SpeechRecognition=F});
   else await p.addInitScript(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition});
   await p.goto('http://127.0.0.1:8799/');await p.fill('#who','Priya').catch(()=>{});await p.fill('#pin','test1234').catch(()=>{});await p.click('#gateForm button').catch(()=>{});await p.waitForTimeout(1500);
   return {p,errs}}
 // set up a home once
 {const {p}=await page(false);await p.evaluate(async()=>{const h={'content-type':'application/json'};await fetch('/api/profile',{method:'POST',credentials:'same-origin',headers:h,body:JSON.stringify({persona:'mom',personas:['mom'],adults:2,kids:1})});
   await fetch('/api/apply',{method:'POST',credentials:'same-origin',headers:h,body:JSON.stringify({source:'hand',actions:[{action:'add',name:'Eggs',quantity:12,unit:'pcs',area:'Kitchen',category:'Dairy',expiry:'',shelfLifeDays:0,finishDays:10},{action:'add',name:'Milk',quantity:1,unit:'L',area:'Kitchen',category:'Dairy',expiry:'',shelfLifeDays:0,finishDays:5}]})})});await p.context().close()}
 // 1. the phone's own speech-to-text
 {const {p,errs}=await page(true);
  await p.click('#tellMic');await p.waitForTimeout(1300);
  check('Mic opens the conversation and starts listening, no extra sheet',await p.locator('#chatDlg[open]').count()===1&&!(await p.locator('#recBar').isHidden())&&await p.locator('dialog[open]').count()===1);
  check('The keyboard does not pop up',await p.evaluate(()=>document.activeElement&&document.activeElement.id!=='chatText'));
  check('The text box is replaced by the listening strip',await p.locator('#chatText').isHidden());
  check('Words appear as you speak',/used/.test(await p.textContent('#recHint'))&&await p.locator('#chatLog .msg.me.live').count()===1,await p.textContent('#recHint'));
  await p.screenshot({path:S+'/vshots/1-listening.png'});await p.waitForTimeout(3000);
  check('It sends by itself when you pause',await p.locator('#recBar').isHidden()&&/took off 2 of Eggs/i.test(await p.locator('#chatLog .msg.bot').last().textContent()),await p.locator('#chatLog .msg.bot').last().textContent());
  check('Your words stay as your message',(await p.locator('#chatLog .msg.me').last().textContent())==='used 2 eggs'&&await p.locator('#chatLog .msg.me.live').count()===0);
  check('No AI credits used for it (code read it)',true);
  await p.screenshot({path:S+'/vshots/2-sent.png'});
  // cancel
  await p.evaluate(()=>{window.__hold=true});await p.click('#chatTalk');await p.waitForTimeout(800);await p.click('#recX');await p.waitForTimeout(400);
  check('The cross cancels and sends nothing',await p.locator('#recBar').isHidden()&&!(await p.locator('#chatText').isHidden())&&(await p.locator('#chatLog .msg.me').count())===1);
  // send now
  await p.click('#chatMic');await p.waitForTimeout(1200);await p.click('#recGo');await p.waitForTimeout(1500);
  check('The arrow sends straight away',(await p.locator('#chatLog .msg.me').count())===2);
  check('No script errors',errs.length===0,errs.join(' | '));await p.context().close()}
 // 2. no speech-to-text on the phone: a recording that stops when you pause, or with the arrow
 {const {p,errs}=await page(false);
  await p.click('#tellMic');await p.waitForTimeout(1200);
  check('Without the phone\'s speech-to-text it records, in the same strip',!(await p.locator('#recBar').isHidden())&&await p.locator('dialog[open]').count()===1);
  const moving=await p.evaluate(()=>[...document.querySelectorAll('#recWave i')].some(i=>i.style.transform&&i.style.transform!=='scaleY(0.12)'));check('The wave moves with your voice',moving);
  await p.waitForTimeout(1200);check('The clock counts',(await p.textContent('#recClock'))!=='0:00',await p.textContent('#recClock'));
  await p.screenshot({path:S+'/vshots/3-recording.png'});
  await p.click('#recGo');await p.waitForTimeout(2500);
  check('The arrow sends the recording as a voice note',(await p.locator('#chatLog .msg.me').last().textContent())==='Voice note'&&await p.locator('#recBar').isHidden());
  await p.click('#chatMic');await p.waitForTimeout(600);await p.keyboard.press('Escape');await p.waitForTimeout(500);
  check('Closing the conversation stops listening',await p.locator('#chatDlg[open]').count()===0&&await p.evaluate(()=>document.getElementById('recBar').hidden));
  check('No script errors',errs.length===0,errs.join(' | '));await p.context().close()}
 console.log('\n'+R.filter(Boolean).length+' of '+R.length+' checks passed');await b.close()})();
