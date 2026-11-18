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
            focus(){}, matches(){return false;}, querySelector:node, querySelectorAll(){return [];},
            showModal(){this.open=true;}, close(){this.open=false; this.events.close?.();}};
        nodes.set(selector, element);
        return element;
    }
    const timers = [{textContent:''}];
    let requests = 0;
    const context = vm.createContext({document:{querySelector:node, querySelectorAll(selector){return selector==='[data-focus-timer]'?timers:[];},
        createElement(tag){return node('created-'+tag);}, elementFromPoint(){return node('hit');}, getElementById(id){return node('#'+id);}, addEventListener(name,callback){const previous=events[name];events[name]=event=>{previous?.(event);return callback(event);};}, body:node('body'), activeElement:null},
        requestAnimationFrame(){return 42;}, cancelAnimationFrame(id){node('raf').cancelled=id;}, window:{innerWidth:1200,innerHeight:800,scrollBy(){},addEventListener(){}, isSecureContext:true}, navigator:{onLine:true}, location:{hash:''},
        fetch(){requests++;return new Promise(()=>{});}, setInterval(){}, console, Date});
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
    assert.match(css,/touch-action: none/);
});
test('mobile focus uses dynamic viewport and safe areas in both orientations without body clipping', () => {
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/focus-page \.app-layout main { height: 100vh; height: 100dvh/);
    assert.match(css,/orientation: landscape/);
    assert.match(css,/env\(safe-area-inset-left\)/);
    assert.doesNotMatch(css,/body[^{}]*{[^}]*overflow:\s*hidden/);
    const sw=fs.readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8');
    assert.match(sw,/opdracht-static-v9/);assert.match(sw,/app.js\?v=9/);assert.match(sw,/ui.svg\?v=6/);
});

function dragFixture() {
    const ui=app(),row=ui.node('row'),list=ui.node('list'),handle=ui.node('handle'),zone=ui.node('zone');
    row.dataset.taskId='1';handle.dataset.id='1';zone.dataset.dropDate='2026-11-19';
    row.closest=selector=>selector==='.task-list'?list:null;
    handle.closest=selector=>selector==='[data-task-id]'?row:selector==='.task-handle'?handle:selector==='.task-list'?list:null;
    handle.setPointerCapture=()=>{handle.captured=true;};handle.hasPointerCapture=()=>handle.captured;handle.releasePointerCapture=()=>{handle.captured=false;};
    list.querySelectorAll=()=>[row];zone.querySelectorAll=()=>[];zone.querySelector=()=>null;
    zone.querySelector=selector=>selector==='.empty-small'?ui.node('empty'):null;
    ui.node('hit').closest=selector=>selector==='[data-drop-date]'?zone:null;
    ui.node('#screen').querySelectorAll=()=>[zone];ui.node('#screen').querySelector=()=>null;
    ui.run('state={tasks:[{id:1,scheduled_for:"2026-11-18"},{id:2,scheduled_for:null}],quests:[],focus:{id:9,task_id:1,started_at:new Date(Date.now()-65000).toISOString()}};calls=[];api=async(path,method,body)=>calls.push({path,method,body});refresh=async()=>true;');
    const event=(x=120,y=120,pointerType='mouse')=>({target:handle,button:0,isPrimary:true,pointerId:5,clientX:x,clientY:y,pointerType,preventDefault(){}});
    return {ui,row,list,handle,zone,event};
}
test('floating clone is exactly 50%, ignores hit testing, keeps grab offset and cleans every cancel path', async()=>{
    const css=fs.readFileSync(new URL('../../public/app.css',import.meta.url),'utf8');
    assert.match(css,/task\.task-drag-ghost \{[^}]*position: fixed;[^}]*opacity: \.5;[^}]*pointer-events: none;/);
    for(const cancel of ['pointercancel','lostpointercapture','Escape']) {
        const {ui,row,handle,zone,event}=dragFixture();
        ui.events.pointerdown(event());ui.events.pointermove(event(123,122));assert.equal(ui.run('taskDrag.active'),false);
        ui.events.pointermove(event(420,220,'touch'));
        assert.equal(ui.node('clone').style.transform,'translate3d(400px,200px,0)');
        assert.equal(ui.node('clone').style.width,'200px');assert.equal(ui.node('clone').attributes['aria-hidden'],'true');
        assert.ok(row.classList.values.has('drag-placeholder'));assert.ok(zone.classList.values.has('drop-day-active'));
        assert.equal(ui.node('empty').beforeChild,ui.node('created-li'));
        if(cancel==='Escape') await ui.events.keydown({key:'Escape'});else ui.events[cancel](event());
        assert.equal(ui.run('taskDrag'),null);assert.equal(ui.node('clone').removed,true);assert.equal(ui.node('created-li').removed,true);
        assert.equal(ui.node('raf').cancelled,42);assert.equal(handle.captured,false);assert.equal(row.classList.values.has('drag-placeholder'),false);
        assert.equal(zone.classList.values.has('drop-day-active'),false);assert.equal(ui.run('calls.length'),0);
        assert.equal(ui.run('state.focus.id'),9);ui.run('updateTimer()');assert.equal(ui.timers[0].textContent,'01:05');
    }
});
test('pointer drop on empty other date posts date and all IDs atomically for mouse and touch',async()=>{
    for(const pointerType of ['mouse','touch']) {
        const {ui,event}=dragFixture();ui.events.pointerdown(event(120,120,pointerType));ui.events.pointermove(event(420,220,pointerType));
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
