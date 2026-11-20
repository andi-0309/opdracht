import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dart = fs.readFileSync(new URL('../../apps/shell/lib/shell_interactions.dart', import.meta.url), 'utf8');
const script = name => dart.match(new RegExp('const '+name+' = r"""([\\s\\S]*?)""";'))[1];

function shell({android = false, host = 'opdracht.zerver.eu'} = {}) {
    const listeners = {};
    class Element {
        constructor(parent = null) { this.parentElement=parent; this.scrollLeft=0; this.scrollWidth=1000; this.clientWidth=300; this.overflowX='auto'; }
    }
    class HTMLInputElement extends Element {
        constructor() { super(); this.type='date'; this.value='2026-11-20'; this.min='2026-01-01'; this.max='2026-12-31'; this.isConnected=true; this.events=[]; }
        dispatchEvent(event) { this.events.push(event.type); }
        focus() { this.focused=true; }
    }
    const viewport={content:'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes'};
    const document={
        readyState:'complete',
        querySelector:()=>viewport,
        documentElement:{style:{}},
        addEventListener(name, listener) { (listeners[name]??=[]).push(listener); },
    };
    const window={};
    const context=vm.createContext({document,window,location:{hostname:host},Element,HTMLInputElement,
        getComputedStyle:node=>({overflowX:node.overflowX}),Event:class { constructor(type) {this.type=type;} }});
    vm.runInContext(script(android?'shellAndroidDateScript':'shellInteractionScript'),context);
    const send=async(type,data={})=>{
        const event={prevented:false,preventDefault(){this.prevented=true;},...data};
        for(const listener of listeners[type]??[]) await listener(event);
        return event;
    };
    return {send,Element,HTMLInputElement,window,document,viewport,listeners,
        reinject:()=>vm.runInContext(script(android?'shellAndroidDateScript':'shellInteractionScript'),context)};
}

test('shell blocks gesture, wheel and keyboard zoom without touching ordinary keys', async()=>{
    const app=shell();
    assert.match(app.viewport.content,/maximum-scale=1/);
    assert.doesNotMatch(app.viewport.content,/maximum-scale=5|user-scalable=yes/);
    assert.equal(app.document.documentElement.style.touchAction,'pan-x pan-y');
    for(const key of ['+','=','-','0']) {
        assert.equal((await app.send('keydown',{key,ctrlKey:true})).prevented,true);
        assert.equal((await app.send('keydown',{key,metaKey:true})).prevented,true);
        assert.equal((await app.send('keydown',{key})).prevented,false);
    }
    assert.equal((await app.send('keydown',{key:'c',ctrlKey:true})).prevented,false);
    assert.equal((await app.send('wheel',{ctrlKey:true})).prevented,true);
    assert.equal((await app.send('gesturestart')).prevented,true);
    assert.equal((await app.send('touchmove',{touches:[{},{}]})).prevented,true);
    assert.equal((await app.send('touchmove',{touches:[{}]})).prevented,false);
    app.reinject();
    assert.equal(app.listeners.wheel.length,1);
});

test('Shift+wheel scrolls nearest horizontal container, including line/page deltas', async()=>{
    const app=shell(), parent=new app.Element(), child=new app.Element(parent);
    child.overflowX='hidden';
    let event=await app.send('wheel',{target:child,shiftKey:true,deltaY:40});
    assert.equal(parent.scrollLeft,40);assert.equal(child.scrollLeft,0);assert.equal(event.prevented,true);
    await app.send('wheel',{target:child,shiftKey:true,deltaY:2,deltaMode:1});
    assert.equal(parent.scrollLeft,88);
    await app.send('wheel',{target:child,shiftKey:true,deltaY:1,deltaMode:2});
    assert.equal(parent.scrollLeft,388);
    await app.send('wheel',{target:child,shiftKey:true,deltaX:-30,deltaY:0});
    assert.equal(parent.scrollLeft,358);
    event=await app.send('wheel',{target:child,deltaY:40});
    assert.equal(parent.scrollLeft,358);assert.equal(event.prevented,false);
    parent.scrollWidth=parent.clientWidth;
    assert.equal((await app.send('wheel',{target:child,shiftKey:true,deltaY:10})).prevented,false);
});

test('app scrolling and picker bridge are not installed on the identity provider', async()=>{
    const app=shell({host:'authentik.zerver.eu'}), target=new app.Element();
    assert.equal((await app.send('wheel',{target,shiftKey:true,deltaY:10})).prevented,false);
    assert.equal(target.scrollLeft,0);
    assert.equal(shell({host:'authentik.zerver.eu',android:true}).listeners.click,undefined);
});

test('Android picker receives constraints and dispatches changes only after selection', async()=>{
    const app=shell({android:true}), input=new app.HTMLInputElement();
    let request;
    app.window.flutter_inappwebview={callHandler:async(name,args)=>{request={name,args};return '2026-11-24';}};
    assert.equal((await app.send('click',{target:input})).prevented,true);
    assert.equal(request.name,'opdrachtDatePicker');
    assert.equal(request.args.min,'2026-01-01');
    assert.equal(request.args.max,'2026-12-31');
    assert.equal(input.value,'2026-11-24');assert.deepEqual(input.events,['input','change']);
    assert.equal(input.focused,true);
});

test('picker cancellation, readonly inputs, navigation and bridge failures preserve the date', async()=>{
    const app=shell({android:true}), input=new app.HTMLInputElement();
    app.window.flutter_inappwebview={callHandler:async()=>null};
    await app.send('click',{target:input});
    assert.equal(input.value,'2026-11-20');assert.deepEqual(input.events,[]);
    input.readOnly=true;
    assert.equal((await app.send('click',{target:input})).prevented,false);
    input.readOnly=false;
    app.window.flutter_inappwebview.callHandler=async()=>{input.isConnected=false;return '2026-11-24';};
    await app.send('click',{target:input});
    assert.equal(input.value,'2026-11-20');
    input.isConnected=true;
    app.window.flutter_inappwebview.callHandler=async()=>{throw Error('unavailable');};
    await app.send('click',{target:input});
    assert.equal(input.value,'2026-11-20');assert.deepEqual(input.events,[]);
});

test('picker ignores duplicate activation and a field changed while the dialog was open', async()=>{
    const app=shell({android:true}), input=new app.HTMLInputElement();
    let resolve, calls=0;
    app.window.flutter_inappwebview={callHandler:()=>{calls++;return new Promise(done=>{resolve=done;});}};
    const first=app.send('click',{target:input});
    await app.send('click',{target:input});
    assert.equal(calls,1);
    input.value='2026-11-22';
    resolve('2026-11-24');
    await first;
    assert.equal(input.value,'2026-11-22');assert.deepEqual(input.events,[]);
});
