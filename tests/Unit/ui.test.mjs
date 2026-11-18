import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
function app() {
    const nodes = new Map();
    function node(selector) {
        if (nodes.has(selector)) return nodes.get(selector);
        const element = {innerHTML:'', textContent:'', hidden:false, open:false, dataset:{}, content:'test-csrf', events:{},
            classList:{add(){}, remove(){}, toggle(){}}, addEventListener(name, callback){this.events[name]=callback;},
            focus(){}, matches(){return false;}, querySelector:node, querySelectorAll(){return [];},
            showModal(){this.open=true;}, close(){this.open=false; this.events.close?.();}};
        nodes.set(selector, element);
        return element;
    }
    const timers = [{textContent:''}, {textContent:''}];
    let requests = 0;
    const context = vm.createContext({document:{querySelector:node, querySelectorAll(selector){return selector==='[data-focus-timer]'?timers:[];},
        getElementById(id){return node('#'+id);}, addEventListener(){}, body:node('body'), activeElement:null},
        window:{addEventListener(){}, isSecureContext:true}, navigator:{onLine:true}, location:{hash:''},
        fetch(){requests++;return new Promise(()=>{});}, setInterval(){}, console, Date});
    vm.runInContext(source, context);
    return {run:code=>vm.runInContext(code, context), node, timers, requests:()=>requests};
}

test('palette offers named colors without a free picker or visible hex fields', () => {
    const ui=app(); const html=ui.run('colorChoices(null)');
    assert.equal((html.match(/type="radio"/g)||[]).length, 8);
    assert.equal((html.match(/ checked/g)||[]).length, 1);
    assert.match(html, /value="#789469" checked/);
    assert.doesNotMatch(html.replace(/<[^>]*>/g,''), /#[a-f0-9]{6}/i);
    assert.doesNotMatch(source, /type="color"/);
});
test('saved non-palette colors are preserved and invalid colors cannot inject markup', () => {
    const ui=app(); assert.match(ui.run('colorChoices("#123ABC")'), /value="#123abc" checked/);
    assert.match(ui.run('colorChoices("#123ABC")'), /Bisherige Farbe/);
    assert.doesNotMatch(ui.run('colorChoices(' + JSON.stringify('" onfocus="evil') + ')'), /onfocus/);
});
test('immersive timer escapes titles and Escape never stops a running session', () => {
    const ui=app();
    ui.run('state={tasks:[{id:1,title:"<script>evil</script>",quest_id:null}],quests:[],focus:{id:9,task_id:1,started_at:new Date(Date.now()-65000).toISOString()}};selectedTaskId=1;');
    const before=ui.requests(); ui.run('enterImmersive()');
    assert.equal(ui.node('#focus-dialog').open,true);
    assert.match(ui.node('#immersive-content').innerHTML,/&lt;script&gt;/);
    assert.equal(ui.timers[0].textContent,'01:05'); assert.equal(ui.timers[1].textContent,'01:05');
    let prevented=false;ui.node('#focus-dialog').events.cancel({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(ui.node('#focus-dialog').open,false);
    assert.equal(ui.run('state.focus.id'),9);assert.equal(ui.requests(),before);
    assert.equal(ui.node('#immersive-content').innerHTML,'');
});
test('idle immersive view has its own task selector and zero timer', () => {
    const ui=app();ui.run('state={tasks:[{id:1,title:"Test"}],quests:[],focus:null};enterImmersive();');
    assert.match(ui.node('#immersive-content').innerHTML,/id="immersive-focus-select"/);
    assert.equal(ui.timers[0].textContent,'00:00');
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
