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
            attributes:{}, setAttribute(name,value){this.attributes[name]=value;}, classList:{values:new Set(), add(name){this.values.add(name);}, remove(name){this.values.delete(name);}, toggle(name,enabled){if(enabled)this.values.add(name);else this.values.delete(name);}}, addEventListener(name, callback){this.events[name]=callback;},
            focus(){}, matches(){return false;}, querySelector:node, querySelectorAll(){return [];},
            showModal(){this.open=true;}, close(){this.open=false; this.events.close?.();}};
        nodes.set(selector, element);
        return element;
    }
    const timers = [{textContent:''}];
    let requests = 0;
    const context = vm.createContext({document:{querySelector:node, querySelectorAll(selector){return selector==='[data-focus-timer]'?timers:[];},
        getElementById(id){return node('#'+id);}, addEventListener(name,callback){events[name]=callback;}, body:node('body'), activeElement:null},
        window:{addEventListener(){}, isSecureContext:true}, navigator:{onLine:true}, location:{hash:''},
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
