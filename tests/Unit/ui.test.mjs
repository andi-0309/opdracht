import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
function app() {
    const nodes = new Map();
    const events = {};
    function node(selector) {
        if (nodes.has(selector)) return nodes.get(selector);
        const element = {innerHTML:'', textContent:'', hidden:false, open:false, dataset:{}, content:'test-csrf', events:{},
            style:{}, append(child){this.child=child;}, remove(){this.removed=true;}, before(child){this.beforeChild=child;}, removeAttribute(name){delete this.attributes[name];}, getBoundingClientRect(){return {left:100,top:100,width:200,height:80,bottom:180,right:300};}, cloneNode(){return node('clone');}, attributes:{}, setAttribute(name,value){this.attributes[name]=value;}, classList:{values:new Set(), add(name){this.values.add(name);}, remove(name){this.values.delete(name);}, toggle(name,enabled){if(enabled)this.values.add(name);else this.values.delete(name);}}, addEventListener(name, callback){this.events[name]=callback;},
            focus(){}, closest(){return null;}, matches(){return false;}, querySelector:node, querySelectorAll(){return [];},
            showModal(){this.open=true;}, close(){this.open=false; this.events.close?.();}};
        nodes.set(selector, element);
        return element;
    }
    const timers = [{textContent:''}];
    let requests = 0;
    const context = vm.createContext({document:{querySelector:node, querySelectorAll(selector){return selector==='[data-focus-timer]'?timers:[];},
        createElement(tag){return node('created-'+tag);}, elementFromPoint(){return node('hit');}, getElementById(id){return node('#'+id);}, addEventListener(name,callback){const previous=events[name];events[name]=event=>{previous?.(event);return callback(event);};}, body:node('body'), activeElement:null},
        requestAnimationFrame(){return 42;}, cancelAnimationFrame(id){node('raf').cancelled=id;}, window:{innerWidth:1200,innerHeight:800,scrollBy(){},addEventListener(){}, isSecureContext:true}, navigator:{onLine:true}, location:{hash:''},
        fetch(){requests++;return new Promise(()=>{});}, setTimeout(callback){node("hold").callback=callback;return 7;}, clearTimeout(id){if(id===7)node("hold").callback=null;}, setInterval(){}, console, Date});
    vm.runInContext(source, context);
    return {run:code=>vm.runInContext(code, context), node, timers, events, requests:()=>requests};
}

test('palette offers named colors without a free picker or visible hex fields', () => {
    const ui=app(); const html=ui.run('colorChoices(null)');
    assert.equal((html.match(/type="radio"/g)||[]).length, 8);
    assert.equal((html.match(/ checked/g)||[]).length, 1);
    assert.match(html, /value="#789469" checked/);
    assert.doesNotMatch(html.replace(/<[^>]*>/g,''), /#[a-f0-9]{6}/i);
    assert.doesNotMatch(source, /type="color"/);
});
test('only the eight palette colors are offered, even for unexpected stored values', () => {
    const ui=app();
    for(const value of ['#123ABC','" onfocus="evil','#6289a6']) {
        const html=ui.run('colorChoices('+JSON.stringify(value)+')');
        assert.equal((html.match(/type="radio"/g)||[]).length,8);
        assert.equal((html.match(/ checked/g)||[]).length,1);
        assert.doesNotMatch(html,/Bisherige Farbe|onfocus/);
    }
    assert.match(ui.run('colorChoices("#123abc")'),/value="#789469" checked/);
});
test('fullscreen only hides chrome and Escape preserves the same timer, form and session', () => {
    const ui=app();
    ui.run('state={tasks:[{id:1,title:"<script>evil</script>",quest_id:null}],quests:[],focus:{id:9,task_id:1,started_at:new Date(Date.now()-65000).toISOString()}};selectedTaskId=1;');
    const html=ui.run('focusScreen()');ui.node('#screen').innerHTML=html;
    assert.match(html,/&lt;script&gt;/);
    assert.equal((html.match(/data-focus-timer/g)||[]).length,1);
    const before=ui.requests(),timer=ui.timers[0];
    ui.run('updateTimer();setImmersive(true)');
    assert.equal(ui.node('body').classList.values.has('immersive-open'),true);
    assert.equal(ui.node('#focus-fullscreen').attributes['aria-pressed'],'true');
    assert.equal(ui.node('#screen').innerHTML,html);
    assert.equal(timer.textContent,'01:05');
    let prevented=false;ui.events.keydown({key:'Escape',preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(ui.node('body').classList.values.has('immersive-open'),false);
    assert.equal(ui.node('#screen').innerHTML,html);assert.equal(ui.timers[0],timer);
    assert.equal(ui.run('state.focus.id'),9);assert.equal(ui.requests(),before);
    assert.equal(ui.node('#focus-fullscreen').attributes['aria-pressed'],'false');
});
test('normal and fullscreen focus share the same task selector without a duplicate dialog', () => {
    const ui=app();ui.run('state={tasks:[{id:1,title:"Test"}],quests:[],focus:null};');
    const html=ui.run('focusScreen()');
    assert.equal((html.match(/id="focus-select"/g)||[]).length,1);
    ui.node('#focus-select').value='1';ui.run('setImmersive(true);setImmersive(false);updateTimer()');
    assert.equal(ui.node('#focus-select').value,'1');
    assert.equal(ui.timers[0].textContent,'00:00');
    const view=fs.readFileSync(new URL('../../resources/views/app.blade.php',import.meta.url),'utf8');
    assert.doesNotMatch(view,/id="focus-dialog"/);
});
test('Escape in an open editor does not change fullscreen or timer state', () => {
    const ui=app();ui.run('setImmersive(true)');ui.node('#editor').open=true;
    let prevented=false;ui.events.keydown({key:'Escape',preventDefault(){prevented=true;}});
    assert.equal(prevented,false);
    assert.equal(ui.node('body').classList.values.has('immersive-open'),true);
});
test('theme follows system initially and on changes, ignoring stored preferences', () => {
    const code=fs.readFileSync(new URL('../../public/theme.js',import.meta.url),'utf8');
    const listeners={};const media={matches:true,addEventListener(name,callback){listeners[name]=callback;}};
    const root={dataset:{},style:{}};let themeColor;
    vm.runInNewContext(code,{window:{matchMedia(){return media;}},document:{documentElement:root,addEventListener(){},querySelector(){return {setAttribute(name,value){themeColor=value;}};}},
        get localStorage(){throw new Error('System theme must not read stored overrides');}});
    assert.equal(root.dataset.theme,'dark');assert.equal(themeColor,'#171d19');
    media.matches=false;listeners.change();assert.equal(root.dataset.theme,'light');assert.equal(root.style.colorScheme,'light');
});
test('all static SVG references exist and both pages omit the theme switcher', () => {
    const sprite=fs.readFileSync(new URL('../../public/icons/ui.svg',import.meta.url),'utf8');
    const ids=new Set([...sprite.matchAll(/<symbol id="([a-z-]+)"/g)].map(match=>match[1]));
    const view=fs.readFileSync(new URL('../../resources/views/app.blade.php',import.meta.url),'utf8');
    const login=fs.readFileSync(new URL('../../resources/views/login.blade.php',import.meta.url),'utf8');
    for (const match of view.matchAll(/ui.svg\?v=6#([a-z-]+)/g)) assert.ok(ids.has(match[1]),match[1]);
    for (const match of source.matchAll(/icon\('([a-z-]+)'\)/g)) assert.ok(ids.has(match[1]),match[1]);
    assert.ok(ids.has('timer')&&ids.has('play'));
    assert.doesNotMatch(view+login,/data-theme-select/);
});

test('focus defaults to saved first incomplete task, preserves explicit choice and running focus', () => {
    const ui=app();
    ui.run('state={tasks:[{id:9,completed_at:"done"},{id:3,title:"First"},{id:1,title:"Second"}],quests:[]};');
    assert.equal(ui.run('focusTask().id'),3);
    assert.match(ui.run('focusPanel()'),/value="3" selected/);
    ui.run('selectedTaskId=1;');assert.equal(ui.run('focusTask().id'),1);
    ui.run('state.focus={id:8,task_id:3};');assert.equal(ui.run('focusTask().id'),3);
    ui.run('state.tasks.reverse();');assert.equal(ui.run('focusTask().id'),3);
    ui.run('state.focus=null;selectedTaskId=999;');assert.equal(ui.run('focusTask().id'),1);
});
test('filtered reorder retains all hidden slots, completed tasks and other dates', () => {
    const ui=app();
    assert.deepEqual(Array.from(ui.run('reorderedTaskIds([1,2,3,4,5],[1,3,5],1,5)')),[3,2,5,4,1]);
    assert.deepEqual(Array.from(ui.run('reorderedTaskIds([1,2,3,4,5],[1,3,5],5,1)')),[5,2,1,4,3]);
    assert.deepEqual(Array.from(ui.run('reorderedTaskIds([1,2,3],[1,3],1,2)')),[1,2,3]);
});
test('reorder posts every task ID, refreshes authoritative order and never mutates focus', async () => {
    const ui=app();
    ui.run('state={tasks:[{id:1},{id:2,completed_at:"done"},{id:3}],focus:{id:7,task_id:1}};');
    ui.run('calls=[];api=async (path,method,body)=>{calls.push({path,method,body});};refresh=async()=>true;');
    await ui.run('persistTaskOrder([1,3],3,1)');
    assert.equal(ui.run('calls[0].path'),'/api/tasks/reorder');
    assert.equal(ui.run('calls[0].method'),'POST');
    assert.deepEqual(Array.from(ui.run('calls[0].body.task_ids')),[3,2,1]);
    assert.equal(ui.run('state.focus.id'),7);
    assert.equal(ui.run('state.tasks[0].id'),1);
});
test('failed reorder leaves original order and exposes actionable error', async () => {
    const ui=app();ui.run('state={tasks:[{id:1},{id:2}]};api=async()=>{throw new Error("Nicht gespeichert");};');
    await assert.rejects(ui.run('persistTaskOrder([1,2],1,2)'),/Nicht gespeichert/);
    assert.equal(ui.run('state.tasks[0].id'),1);
    assert.equal(ui.node('#notice').textContent,'Nicht gespeichert');
    assert.equal(ui.run('mutationPending'),false);
});
test('refresh ignores stale responses and cannot redraw an active drag', async () => {
    const ui=app();ui.run('state={tasks:[{id:1}]};api=()=>new Promise(resolve=>{resolveState=resolve;});');
    const pending=ui.run('refresh()');ui.run('++refreshSequence;resolveState({tasks:[{id:2}]});');await pending;
    assert.equal(ui.run('state.tasks[0].id'),1);
    ui.run('taskDrag={};');const count=ui.requests();await ui.run('refresh(true)');assert.equal(ui.requests(),count);
});
test('completion remains an accessible checkbox with a compact square check icon', () => {
    const ui=app();ui.run('state={quests:[],focus:null};');
    const html=ui.run('taskRow({id:1,title:"Test",completed_at:null})');
    assert.match(html,/role="checkbox" aria-checked="false"/);
    assert.match(html,/task-check-box.*ui.svg\?v=6#check/);
    assert.match(html,/aria-keyshortcuts="ArrowUp ArrowDown"/);
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/task-check-box { width: 24px; height: 24px;.*border-radius: 4px/);
    assert.match(css,/touch-action: auto/);
    assert.doesNotMatch(html,/task-handle|reorder-task/);
    assert.match(html,/data-task-id="1" tabindex="0"/);
});
test('mobile focus uses dynamic viewport and safe areas in both orientations without body clipping', () => {
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/focus-page \.app-layout main { height: 100vh; height: 100dvh/);
    assert.match(css,/orientation: landscape/);
    assert.match(css,/env\(safe-area-inset-left\)/);
    assert.doesNotMatch(css,/body[^{}]*{[^}]*overflow:\s*hidden/);
    const sw=fs.readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8');
    assert.match(sw,/opdracht-static-v14/);assert.match(sw,/app.js\?v=14/);assert.match(sw,/ui.svg\?v=6/);
});

function dragFixture() {
    const ui=app(),row=ui.node('row'),list=ui.node('list'),title=ui.node('title'),zone=ui.node('zone');
    row.dataset.taskId='1';title.dataset.id='1';zone.dataset.dropDate='2026-11-19';
    row.closest=selector=>selector==='.task-list'?list:selector==='[data-task-id]'?row:null;
    title.closest=selector=>selector==='[data-task-id]'?row:selector==='button, input, select, textarea, a, [contenteditable]'||selector==='[data-action]'?title:null;
    title.dataset.action='edit-task';title.matches=selector=>selector==='.task-title';
    row.setPointerCapture=()=>{row.captured=true;};row.hasPointerCapture=()=>row.captured;row.releasePointerCapture=()=>{row.captured=false;};
    list.querySelectorAll=()=>[row];zone.querySelectorAll=()=>[];zone.querySelector=()=>null;
    zone.querySelector=selector=>selector==='.empty-small'?ui.node('empty'):null;
    ui.node('hit').closest=selector=>selector==='[data-drop-date]'?zone:null;
    ui.node('#screen').querySelectorAll=()=>[zone];ui.node('#screen').querySelector=()=>null;
    ui.run('state={tasks:[{id:1,scheduled_for:"2026-11-18"},{id:2,scheduled_for:null}],quests:[],focus:{id:9,task_id:1,started_at:new Date(Date.now()-65000).toISOString()}};calls=[];api=async(path,method,body)=>calls.push({path,method,body});refresh=async()=>true;');
    const event=(x=120,y=120,pointerType='mouse')=>({target:title,button:0,isPrimary:true,pointerId:5,clientX:x,clientY:y,pointerType,preventDefault(){}});
    return {ui,row,list,title,zone,event};
}
test('floating clone is exactly 50%, ignores hit testing, keeps grab offset and cleans every cancel path', async()=>{
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/task\.task-drag-ghost \{[^}]*position: fixed;[^}]*opacity: \.5;[^}]*pointer-events: none;/);
    for(const cancel of ['pointercancel','lostpointercapture','Escape']) {
        const {ui,row,title,zone,event}=dragFixture();
        ui.events.pointerdown(event());ui.events.pointermove(event(123,122));assert.equal(ui.run('taskDrag.active'),false);
        ui.events.pointermove(event(420,220,'touch'));
        assert.equal(ui.node('clone').style.transform,'translate3d(400px,200px,0)');
        assert.equal(ui.node('clone').style.width,'200px');assert.equal(ui.node('clone').attributes['aria-hidden'],'true');
        assert.ok(row.classList.values.has('drag-placeholder'));assert.ok(zone.classList.values.has('drop-day-active'));
        assert.equal(ui.node('empty').beforeChild,ui.node('created-li'));
        if(cancel==='Escape') await ui.events.keydown({key:'Escape'});else ui.events[cancel](event());
        assert.equal(ui.run('taskDrag'),null);assert.equal(ui.node('clone').removed,true);assert.equal(ui.node('created-li').removed,true);
        assert.equal(ui.node('raf').cancelled,42);assert.equal(row.captured,false);assert.equal(row.classList.values.has('drag-placeholder'),false);
        assert.equal(zone.classList.values.has('drop-day-active'),false);assert.equal(ui.run('calls.length'),0);
        assert.equal(ui.run('state.focus.id'),9);ui.run('updateTimer()');assert.equal(ui.timers[0].textContent,'01:05');
    }
});
test('pointer drop on empty other date posts date and all IDs atomically for mouse and touch',async()=>{
    for(const pointerType of ['mouse','touch']) {
        const {ui,event}=dragFixture();ui.events.pointerdown(event(120,120,pointerType));if(pointerType==='touch')ui.node('hold').callback();ui.events.pointermove(event(420,220,pointerType));
        await ui.events.pointerup(event(420,220,pointerType));
        assert.equal(ui.run('calls.length'),1);assert.equal(ui.run('calls[0].method'),'POST');assert.equal(ui.run('calls[0].path'),'/api/tasks/reorder');
        assert.deepEqual(JSON.parse(ui.run('JSON.stringify(calls[0].body)')),{task_ids:[2,1],moved_task_id:1,scheduled_for:'2026-11-19'});
        assert.equal(ui.run('state.tasks[0].scheduled_for'),'2026-11-18');assert.equal(ui.run('taskDrag'),null);
    }
});
test('midpoint marker selects before/after and same-day order preserves hidden slots',async()=>{
    const {ui,event,zone,row}=dragFixture();zone.dataset.dropDate='2026-11-18';
    const other=ui.node('other');other.dataset.taskId='3';other.getBoundingClientRect=()=>({top:200,height:80});
    const list=ui.node('destination-list');zone.querySelector=()=>list;zone.querySelectorAll=()=>[row,other];
    ui.run('state.tasks.push({id:3,scheduled_for:"2026-11-18"});');
    ui.events.pointerdown(event());ui.events.pointermove(event(420,239));assert.equal(ui.run('taskDrag.beforeId'),3);
    assert.equal(other.beforeChild,ui.node('created-li'));
    ui.events.pointermove(event(420,240));assert.equal(ui.run('taskDrag.beforeId'),null);assert.equal(list.child,ui.node('created-li'));
    await ui.events.pointerup(event(420,260));
    assert.deepEqual(JSON.parse(ui.run('JSON.stringify(calls[0].body)')),{task_ids:[3,2,1]});
});
test('outside drop and unrelated pointer cancellation never save',async()=>{
    const {ui,event}=dragFixture();ui.events.pointerdown(event());ui.events.pointermove(event(420,220));
    ui.events.pointercancel({...event(),pointerId:99});assert.equal(ui.run('taskDrag.active'),true);
    ui.node('hit').closest=()=>null;await ui.events.pointerup(event(900,600));assert.equal(ui.run('calls.length'),0);assert.equal(ui.run('taskDrag'),null);
});
test('failed cross-day save restores UI with no local date/order mutation; inbox uses null',async()=>{
    const {ui,event,zone,row}=dragFixture();zone.dataset.dropDate='';
    ui.run('api=async(path,method,body)=>{calls.push({path,method,body});throw new Error("Nicht gespeichert");};');
    ui.events.pointerdown(event());ui.events.pointermove(event(420,220));await ui.events.pointerup(event(420,220));
    assert.equal(ui.run('calls[0].body.scheduled_for'),null);assert.equal(ui.run('state.tasks[0].scheduled_for'),'2026-11-18');
    assert.equal(ui.run('state.tasks[0].id'),1);assert.equal(ui.node('#notice').textContent,'Nicht gespeichert');assert.equal(ui.run('mutationPending'),false);
    assert.equal(row.classList.values.has('drag-placeholder'),false);
});
test('week has seven dated drop zones even empty; today and inbox are explicit but overdue is not',()=>{
    const ui=app();ui.run('state={today:"2026-11-18",tasks:[],quests:[],weekly:{}};');
    assert.equal((ui.run('weekScreen()').match(/data-drop-date=/g)||[]).length,7);
    assert.match(ui.run('taskSection("Heute",[],"Leer","2026-11-18")'),/data-drop-date="2026-11-18"/);
    assert.match(ui.run('taskSection("Inbox",[],"Leer",null)'),/data-drop-date=""/);
    assert.doesNotMatch(ui.run('taskSection("Überfällig",[],"Leer")'),/data-drop-date/);
});

test('whole card blank/body/meta/title initiate drag while a plain title click still edits',async()=>{
    for(const targetName of ['row','body','meta','title']) {
        const {ui,row,title,event}=dragFixture();
        const target=targetName==='row'?row:targetName==='title'?title:ui.node(targetName);
        if(target!==row&&target!==title) target.closest=selector=>selector==='[data-task-id]'?row:null;
        ui.events.pointerdown({...event(),target});
        assert.equal(ui.run('taskDrag.active'),false);assert.equal(row.captured,undefined);
        ui.events.pointermove(event(140,150));assert.equal(ui.run('taskDrag.active'),true);
        ui.events.pointercancel(event());
    }
    for(const pointerType of ['mouse','touch']) {
        const {ui,title,event}=dragFixture();
        ui.events.pointerdown(event(120,120,pointerType));
        ui.events.pointermove(event(122,121,pointerType));await ui.events.pointerup(event(122,121,pointerType));
        await ui.events.click({target:title,detail:1});assert.equal(ui.node('#editor').open,true);
        assert.equal(ui.run('calls.length'),0);
    }
});
test('checkbox focus and delete controls never start drag, including nested icon targets',async()=>{
    for(const action of ['toggle-task','focus-task','delete-task']) {
        const {ui,row,event}=dragFixture(),button=ui.node('control'),icon=ui.node('control-icon');
        button.dataset={id:'1',action};button.closest=selector=>selector==='[data-action]'?button:null;
        icon.closest=selector=>selector==='[data-task-id]'?row:selector==='button, input, select, textarea, a, [contenteditable]'||selector==='[data-action]'?button:null;
        ui.events.pointerdown({...event(),target:icon});ui.events.pointermove(event(400,200));
        assert.equal(ui.run('taskDrag'),null);
        const clicked=ui.events.click({target:icon,detail:1});
        if(action==='delete-task') assert.equal(ui.node('#confirm-dialog').open,false);
        await clicked;
        if(action==='toggle-task')assert.equal(ui.run('calls[0].body.completed'),true);
        if(action==='focus-task')assert.equal(ui.run('selectedTaskId'),1);
    }
});
test('real completed cancelled and outside drags suppress trailing edit but not next deliberate click',async()=>{
    for(const end of ['drop','pointercancel','lostpointercapture','Escape','outside']) {
        const {ui,event,title}=dragFixture();ui.events.pointerdown(event());ui.events.pointermove(event(420,220));
        if(end==='Escape')await ui.events.keydown({key:'Escape'});
        else if(end==='outside'){ui.node('hit').closest=()=>null;await ui.events.pointerup(event(900,600));}
        else if(end==='drop')await ui.events.pointerup(event(420,220));
        else ui.events[end](event());
        let prevented=false;
        await ui.events.click({target:title,detail:1,preventDefault(){prevented=true;},stopImmediatePropagation(){}});
        assert.equal(prevented,true);assert.equal(ui.node('#editor').open,false);
        ui.events.pointerdown(event());await ui.events.pointerup(event());await ui.events.click({target:title,detail:1});
        assert.equal(ui.node('#editor').open,true);
    }
});
test('touch swipes scroll in both axes; only hold then movement drags and blocks native pan',()=>{
    for(const [x,y] of [[200,120],[120,200]]) {
        const {ui,event}=dragFixture();let prevented=false;
        ui.events.pointerdown(event(120,120,'touch'));
        ui.events.touchmove({cancelable:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);
        ui.events.pointermove(event(x,y,'touch'));assert.equal(ui.run('taskDrag'),null);
        assert.equal(ui.node('hold').callback,null);
    }
    const {ui,event}=dragFixture();ui.events.pointerdown(event(120,120,'touch'));ui.node('hold').callback();
    assert.equal(ui.run('taskDrag.active'),false);
    let prevented=false;ui.events.touchmove({cancelable:true,preventDefault(){prevented=true;}});assert.equal(prevented,true);
    ui.events.pointermove(event(150,140,'touch'));assert.equal(ui.run('taskDrag.active'),true);
    ui.events.pointercancel(event());
});
test('row keyboard reorders in both directions and ignores arrows bubbling from child controls',async()=>{
    for(const key of ['ArrowUp','ArrowDown']) {
        const {ui,row,list,title}=dragFixture(),other=ui.node('other');other.dataset.taskId='2';
        list.querySelectorAll=()=>key==='ArrowDown'?[row,other]:[other,row];
        if(key==='ArrowUp')ui.run('state.tasks.reverse();');let prevented=false;
        await ui.events.keydown({key,target:title,preventDefault(){prevented=true;}});
        assert.equal(prevented,false);assert.equal(ui.run('calls.length'),0);
        await ui.events.keydown({key,target:row,preventDefault(){prevented=true;}});
        assert.equal(prevented,true);assert.equal(ui.run('calls.length'),1);
        assert.deepEqual(Array.from(ui.run('calls[0].body.task_ids')),key==='ArrowDown'?[2,1]:[1,2]);
    }
});

test('week columns keep a 336px minimum at every breakpoint and desktop main is unrestricted',()=>{
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    const grids=[...css.matchAll(/\.week-grid\s*\{([^}]+)\}/g)].map(match=>match[1]);
    assert.ok(grids.some(rule=>/overflow-x: auto/.test(rule)));
    for(const rule of grids.filter(rule=>rule.includes('grid-template-columns'))) assert.match(rule,/repeat\(7, minmax\(336px, 1fr\)\)/);
    assert.match(css,/\.app-layout main \{[^}]*max-width: none; width: 100%/);
    assert.match(css,/\.task-list \{[^}]*display: grid; gap: 12px/);
    assert.match(css,/\.task \{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 12px; background: var\(--paper\); box-shadow:/);
    assert.match(css,/:root\[data-theme="dark"\] \.task \{ box-shadow:/);
});
test('Today and each week day split completed cards into closed editable/reopenable details only',()=>{
    const ui=app();ui.run('state={today:"2026-11-18",quests:[],weekly:{},tasks:[{id:1,title:"Open",scheduled_for:"2026-11-18"},{id:2,title:"Done",scheduled_for:"2026-11-18",completed_at:"done"},{id:3,title:"Next done",scheduled_for:"2026-11-19",completed_at:"done"}]};');
    for(const html of [ui.run('todayScreen()'),ui.run('weekScreen()')]) {
        const completed=[...html.matchAll(/<details class="section completed-tasks">([\s\S]*?)<\/details>/g)];
        assert.ok(completed.length);
        for(const [whole,contents] of completed) {
            assert.doesNotMatch(whole,/<details[^>]*\sopen(?:\s|>)/);
            assert.match(contents,/data-action="edit-task"/);
            if(html.includes('week-grid')) assert.doesNotMatch(contents,/toggle-task|role="checkbox"/);
            else assert.match(contents,/Wieder öffnen:/);
            assert.doesNotMatch(contents,/active-task-list|aria-keyshortcuts| verschieben"/);
        }
        const active=html.replace(/<details[\s\S]*?<\/details>/g,'');
        assert.match(active,/data-task-id="1"/);assert.doesNotMatch(active,/data-task-id="[23]"/);
    }
});
test('task and quest deletion is absent on cards and offered only in existing editors',()=>{
    const ui=app();ui.run('state={today:"2026-11-18",tasks:[{id:1,title:"Task"}],quests:[{id:2,title:"Quest"}],weekly:{}};');
    assert.doesNotMatch(ui.run('taskRow(state.tasks[0])+questsScreen()'),/data-action="delete-(?:task|quest)"|#trash/);
    ui.run('taskEditor(state.tasks[0])');assert.match(ui.node('#editor-fields').innerHTML,/data-action="delete-task"/);
    ui.run('questEditor(state.quests[0])');assert.match(ui.node('#editor-fields').innerHTML,/data-action="delete-quest"/);
    ui.run('questEditor(null)');assert.doesNotMatch(ui.node('#editor-fields').innerHTML,/data-action="delete-quest"/);
});
test('both deletion actions require matching open editor, ask confirmation, cancel safely and close on success',async()=>{
    for(const type of ['task','quest']) {
        const ui=app(),button=ui.node('delete');button.dataset={action:'delete-'+type,id:'1'};
        button.closest=selector=>selector==='[data-action]'?button:selector==='#editor'?ui.node('#editor'):null;
        ui.run('state={today:"2026-11-18",tasks:[{id:1,title:"Task"}],quests:[{id:1,title:"Quest"}]};calls=[];mutate=async(...args)=>{calls.push(args);};');
        await ui.events.click({target:button,detail:0});assert.equal(ui.node('#confirm-dialog').open,false);
        ui.run(type+'Editor(state.'+(type==='task'?'tasks':'quests')+'[0])');
        const pending=ui.events.click({target:button,detail:0});assert.equal(ui.node('#confirm-dialog').open,true);
        ui.node('#confirm-dialog').returnValue='cancel';ui.node('#confirm-dialog').close();await pending;assert.equal(ui.run('calls.length'),0);
        ui.run('editorTarget.id=2');await ui.events.click({target:button,detail:0});assert.equal(ui.node('#confirm-dialog').open,false);
        ui.run('editorTarget.id=1');const accepted=ui.events.click({target:button,detail:0});
        ui.node('#confirm-dialog').returnValue='delete';ui.node('#confirm-dialog').close();await accepted;
        assert.equal(ui.run('calls[0][0]'),'/api/'+(type==='task'?'tasks':'quests')+'/1');assert.equal(ui.run('calls[0][1]'),'DELETE');assert.equal(ui.node('#editor').open,false);
    }
});
test('drop ignores completed rows even in open details and ignores hits on the completed section',async()=>{
    const {ui,row,zone,event}=dragFixture(),done=ui.node('done'),other=ui.node('other');
    done.dataset.taskId='2';done.closest=selector=>selector==='.completed-tasks'?ui.node('details'):null;
    other.dataset.taskId='3';other.getBoundingClientRect=()=>({top:200,height:80});
    zone.querySelectorAll=()=>[row,done,other];zone.querySelector=selector=>selector==='.active-task-list'?ui.node('active-list'):null;
    ui.run('state.tasks[1].completed_at="done";state.tasks.push({id:3,scheduled_for:"2026-11-19"});');
    ui.events.pointerdown(event());ui.events.pointermove(event(420,220));assert.equal(ui.run('taskDrag.beforeId'),3);
    await ui.events.pointerup(event(420,260));
    assert.deepEqual(Array.from(ui.run('calls[0].body.task_ids')),[2,3,1]);assert.equal(ui.run('calls[0].body.scheduled_for'),'2026-11-19');
    const second=dragFixture();second.ui.events.pointerdown(second.event());second.ui.events.pointermove(second.event(420,220));
    second.ui.node('hit').closest=selector=>selector==='.completed-tasks'?second.ui.node('details'):selector==='[data-drop-date]'?second.zone:null;
    await second.ui.events.pointerup(second.event(420,220));assert.equal(second.ui.run('calls.length'),0);
});
test('completed cards cannot initiate drag or reorder; completed-only day receives active insertion',async()=>{
    const {ui,row,zone,event}=dragFixture(),done=ui.node('done');done.dataset.taskId='2';
    done.closest=selector=>selector==='.completed-tasks'?ui.node('details'):null;
    zone.querySelectorAll=()=>[done];zone.querySelector=selector=>selector==='.empty-small'?ui.node('empty'):null;
    const closest=row.closest;row.closest=selector=>selector==='.completed-tasks'?ui.node('details'):closest(selector);
    ui.events.pointerdown(event());assert.equal(ui.run('taskDrag'),null);
    await ui.events.keydown({key:'ArrowDown',target:row,preventDefault(){throw Error('must ignore');}});
    row.closest=closest;ui.events.pointerdown(event());ui.events.pointermove(event(420,220));assert.equal(ui.run('taskDrag.beforeId'),null);
    assert.equal(ui.node('empty').beforeChild,ui.node('created-li'));await ui.events.pointerup(event(420,220));
    assert.deepEqual(Array.from(ui.run('calls[0].body.task_ids')),[2,1]);
});
test('page motion runs only on navigation, completion motion on changes, and reduced-motion disables JS and CSS',()=>{
    const ui=app();let count=0;ui.node('#screen').animate=()=>count++;
    ui.run('state={today:"2026-11-18",tasks:[],quests:[],weekly:{}};location.hash="#today";render();');assert.equal(count,1);
    ui.run('render();setImmersive(true);setImmersive(false);render();');assert.equal(count,1);
    ui.run('location.hash="#week";render();');assert.equal(count,2);
    ui.run('weekOffset++;render();');assert.equal(count,3);
    ui.run('window.matchMedia=()=>({matches:true});location.hash="#quests";render();');assert.equal(count,3);
    ui.run('animateChange(screen,[{opacity:0},{opacity:1}]);');assert.equal(count,3);
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none !important; transition: none !important/);
    assert.match(css,/task\.task-drag-ghost \{[^}]*transition: none; animation: none;/);
    assert.match(css,/dialog\[open\]::backdrop \{ animation:/);
    assert.doesNotMatch(css,/(?:^|\n)\.task\s*\{[^}]*animation:/);
});
test('cache 14 references agree across worker and Blade views while icon version stays 6',()=>{
    for(const file of ['public/sw.js','resources/views/app.blade.php','resources/views/login.blade.php']) {
        const contents=fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8');assert.match(contents,/app.css\?v=14/);assert.doesNotMatch(contents,/app\.(css|js)\?v=13/);
    }
    assert.match(source,/sw.js\?v=14/);assert.match(source,/ui.svg\?v=6/);
    assert.match(fs.readFileSync(new URL('../../resources/views/login.blade.php',import.meta.url),'utf8'),/sw.js\?v=14/);
});
test('completion and reopening animate once without changing dates/focus or animating every refresh',()=>{
    const ui=app(),row=ui.node('motion-row'),details=ui.node('motion-details'),summary=ui.node('motion-summary');let cards=0,summaries=0;
    row.animate=()=>cards++;summary.animate=()=>summaries++;row.closest=selector=>selector==='details'?details:null;details.querySelector=()=>summary;
    ui.node('#screen').querySelector=()=>row;
    ui.run('state={today:"2026-11-18",tasks:[{id:1,title:"Test",scheduled_for:"2026-11-18"}],quests:[],weekly:{},focus:{id:9,task_id:1}};location.hash="#today";render();');
    ui.run('state.tasks[0].completed_at="done";render();render();');assert.equal(summaries,1);assert.equal(cards,0);
    ui.run('state.tasks[0].completed_at=null;render();render();');assert.equal(cards,1);assert.equal(summaries,1);
    assert.equal(ui.run('state.tasks[0].scheduled_for'),'2026-11-18');assert.equal(ui.run('state.focus.id'),9);
    ui.run('window.matchMedia=()=>({matches:true});state.tasks[0].completed_at="done";render();');assert.equal(summaries,1);
});
test('progress width motion compares old/new values rather than replaying on identical refresh',()=>{
    const ui=app(),bar=ui.node('progress');bar.dataset.progressId='quest-1';bar.style.width='25%';let count=0;
    bar.animate=()=>count++;ui.node('#screen').querySelectorAll=selector=>selector==='[data-progress-id]'?[bar]:[];
    let html='';Object.defineProperty(ui.node('#screen'),'innerHTML',{get(){return html;},set(value){html=value;bar.style.width='50%';}});
    ui.run('state={today:"2026-11-18",tasks:[],quests:[],weekly:{}};location.hash="#quests";render();');assert.equal(count,1);
    ui.run('render();');assert.equal(count,1);
    bar.style.width='25%';ui.run('render();');assert.equal(count,2);
    ui.run('window.matchMedia=()=>({matches:true});');bar.style.width='25%';ui.run('render();');assert.equal(count,2);
});

test('simple Markdown formats text, lists and safe links while raw HTML and script URLs stay inert',()=>{
    const ui=app();
    const html=ui.run('markdown("**wichtig** und *ruhig*\\n- Eins\\n- Zwei\\n1. Nummer\\n[Website](https://example.org?a=1&b=2)\\n<script>alert(1)</script>\\n[bad](javascript:alert)\\n`Code`")');
    assert.match(html,/<strong>wichtig<\/strong>/);assert.match(html,/<em>ruhig<\/em>/);
    assert.match(html,/<ul><li>Eins<\/li><li>Zwei<\/li><\/ul><ol>/);
    assert.match(html,/href="https:\/\/example.org\?a=1&amp;b=2"/);
    assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/&lt;script&gt;/);
    assert.doesNotMatch(html,/<script|href="javascript:/);
    assert.match(ui.run('markdown(\'[x](https://example.org/"onmouseover="alert)\')'),/&quot;/);
});
test('focus renders complete task notes and chooses newly available due work over stale automatic selection',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[{id:1,title:"Later",scheduled_for:"2026-11-20"},{id:2,title:"Today",scheduled_for:"2026-11-19",notes:"**All content**"}],quests:[],focus:null};');
    assert.equal(ui.run('focusTask().id'),2);assert.match(ui.run('focusPanel()'),/<strong>All content<\/strong>/);
    ui.run('state.focus={id:9,task_id:1}');assert.equal(ui.run('focusTask().id'),1);
});
test('weekly cards show Markdown preview without quick-start and Today uses one modal creation button',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[],quests:[{id:1,title:"Quest"}],weekly:{},focus:null};');
    const card=ui.run('taskRow({id:1,title:"Work",notes:"- First\\n- Second"},true)');
    assert.match(card,/task-preview/);assert.match(card,/<li>First<\/li>/);assert.doesNotMatch(card,/data-action="focus-task"/);
    const today=ui.run('todayScreen()');
    assert.equal((today.match(/data-action="new-task"/g)||[]).length,1);
    assert.match(today,/>Aufgabe hinzufügen<\/button>/);
    assert.doesNotMatch(today,/quick-add|<input|<textarea|<select/);
    ui.run('taskEditor(null)');
    const form=ui.node('#editor-fields').innerHTML;assert.match(form,/name="notes"/);assert.match(form,/name="quest_id"/);
    const view=fs.readFileSync(new URL('../../resources/views/app.blade.php',import.meta.url),'utf8');
    assert.deepEqual([...view.matchAll(/data-page="([a-z]+)"/g)].map(m=>m[1]),['focus','today','week','review','quests']);
});
test('logbook splits midnight sessions between days and keeps titles escaped in calendar',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[],quests:[],weekly:{}};reviewData={week_start:"2026-11-16",seconds:3600,quest_seconds:0,review:"<script>bad</script>",sessions:[{id:1,title:"<b>Title</b>",started_at:"2026-11-18T23:30:00",ended_at:"2026-11-19T00:30:00",seconds:3600}]};');
    const days=ui.run('sessionDays(reviewData.sessions,"2026-11-16")');assert.equal(days[2].entries[0].seconds,1800);assert.equal(days[3].entries[0].seconds,1800);
    const html=ui.run('reviewScreen()');assert.match(html,/&lt;b&gt;Title/);assert.match(html,/&lt;script&gt;bad/);assert.equal((html.match(/class="log-day"/g)||[]).length,7);
    ui.run('reviewDrafts.set("2026-11-16","Unsaved draft")');assert.match(ui.run('reviewScreen()'),/Unsaved draft/);
});

test('week completion is modal-only for active and completed cards, while Today retains checkboxes',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[{id:1,title:"Work",scheduled_for:"2026-11-19"},{id:2,title:"Done",scheduled_for:"2026-11-19",completed_at:"done"}],quests:[],weekly:{}}');
    assert.doesNotMatch(ui.run('weekScreen()'),/toggle-task|role="checkbox"/);
    assert.match(ui.run('todayScreen()'),/toggle-task/);
    ui.run('taskEditor(state.tasks[0])');assert.match(ui.node('#editor-fields').innerHTML,/name="completed"/);
});
test('task modal defaults to today and places title, description, quest and date in keyboard order',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[],quests:[{id:1,title:"Quest"}],focus:null};taskEditor(null)');
    const html=ui.node('#editor-fields').innerHTML;
    assert.match(html,/name="title"[^>]*required autofocus autocomplete="off"/);
    assert.match(html,/name="scheduled_for" value="2026-11-19"/);
    assert.ok(html.indexOf('name="title"')<html.indexOf('name="notes"'));
    assert.ok(html.indexOf('name="notes"')<html.indexOf('name="quest_id"'));
    assert.ok(html.indexOf('name="quest_id"')<html.indexOf('name="scheduled_for"'));
    assert.doesNotMatch(html,/name="completed"|delete-task/);
});
test('modal Ctrl/Cmd Enter submits once, leaves plain textarea Enter alone and ignores composition',()=>{
    const ui=app(),form=ui.node('#editor-form');let submissions=0,prevented=0;form.requestSubmit=()=>submissions++;
    for(const modifiers of [{ctrlKey:true},{metaKey:true}]) form.events.keydown({key:'Enter',...modifiers,preventDefault(){prevented++;}});
    form.events.keydown({key:'Enter',preventDefault(){throw Error('Textarea newline blocked');}});
    form.events.keydown({key:'Enter',ctrlKey:true,isComposing:true,preventDefault(){throw Error('Composition blocked');}});
    ui.run('editorSubmitting=true');form.events.keydown({key:'Enter',ctrlKey:true,preventDefault(){prevented++;}});
    assert.equal(submissions,2);assert.equal(prevented,3);
});
test('modal prevents duplicate saves and cancellation while pending, preserves fields on error',async()=>{
    const ui=app(),form=ui.node('#editor-form');let focused=0;
    ui.node('#editor-error').focus=()=>focused++;
    const title=ui.node('title');title.value='Task';form.querySelector=()=>title;
    ui.run('FormData=class {};editorSave=()=>new Promise((resolve,reject)=>{failSave=reject;});');
    const saving=form.events.submit({preventDefault(){}});
    assert.equal(ui.run('editorSubmitting'),true);assert.equal(form.attributes['aria-busy'],'true');
    let cancelled=false;ui.node('#editor').events.cancel({preventDefault(){cancelled=true;}});assert.equal(cancelled,true);
    await form.events.submit({preventDefault(){}});
    ui.run('failSave(new Error("Nicht gespeichert"))');await saving;
    assert.equal(ui.node('#editor-error').textContent,'Nicht gespeichert');assert.equal(focused,1);
    assert.equal(title.value,'Task');assert.equal(ui.run('editorSubmitting'),false);assert.equal(form.attributes['aria-busy'],undefined);
});
test('modal close restores keyboard focus to opener and clears stale edit state',()=>{
    const ui=app(),opener=ui.node('opener');let focused=0;opener.isConnected=true;opener.focus=()=>focused++;
    ui.run('editorReturnFocus=document.querySelector("opener");editorTarget={type:"task",id:1};editorSave=()=>{};');
    ui.node('#editor').events.close();assert.equal(focused,1);assert.equal(ui.run('editorTarget'),null);assert.equal(ui.run('editorSave'),null);
});
test('visible screens omit redundant instructions but retain accessible reorder help and error notices',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[],quests:[],focus:null,weekly:{}}');
    assert.doesNotMatch(ui.run('weekScreen()+focusScreen()'),/Aufgabenkarte ziehen|serverseitig|Beim Stoppen|EINE AUFGABE|Navigation wieder ein/);
    const view=fs.readFileSync(new URL('../../resources/views/app.blade.php',import.meta.url),'utf8');
    assert.match(view,/id="reorder-help" class="sr-only"/);assert.match(view,/id="editor-error"[^>]*role="alert"/);
});

test('focus places clock and controls before complete readable task content without slogans',()=>{
    const ui=app();ui.run('state={today:"2026-11-19",tasks:[{id:1,title:"Readable title",notes:"**Full notes**"}],quests:[],focus:{id:9,task_id:1}}');
    const html=ui.run('focusPanel()');
    assert.ok(html.indexOf('data-focus-timer')<html.indexOf('focus-task-title'));
    assert.ok(html.indexOf('focus-controls')<html.indexOf('focus-task-title'));
    assert.match(html,/<section class="focus-task"[^>]*tabindex="0" aria-labelledby="focus-task-title"/);
    assert.match(html,/<strong>Full notes<\/strong>/);
    assert.doesNotMatch(html,/EINE AUFGABE|Dein Fokus|serverseitig|Beim Stoppen/);
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/\.focus-clock { flex-shrink: 0/);
    assert.match(css,/\.focus-task {[^}]*min-height: 0; overflow: auto;/);
    assert.match(css,/\.focus-notes { max-width: 70ch; font-size: 18px; line-height: 1.65/);
    assert.doesNotMatch(css,/focus-eyebrow|focus-exit-hint|-webkit-line-clamp: 2/);
});
test('focus refresh retains content scroll and region focus for the same task, not a different task',()=>{
    const ui=app(),content=ui.node('task-content');content.dataset.contentKey='1';content.scrollTop=180;let focused=0;content.focus=()=>focused++;
    ui.node('#screen').querySelector=selector=>selector==='.focus-task'?content:null;
    ui.run('state={today:"2026-11-19",tasks:[{id:1,title:"Task"}],quests:[],weekly:{}};location.hash="#focus";document.activeElement=document.querySelector("task-content");render()');
    let html='';Object.defineProperty(ui.node('#screen'),'innerHTML',{get(){return html;},set(value){html=value;content.scrollTop=0;}});
    content.scrollTop=180;ui.run('render()');assert.equal(content.scrollTop,180);assert.equal(focused,1);
    Object.defineProperty(content.dataset,'contentKey',{get(){return html.includes('data-content-key="2"')?'2':'1';},configurable:true});
    ui.run('state.tasks=[{id:2,title:"Different"}];render()');assert.equal(content.scrollTop,0);
});
