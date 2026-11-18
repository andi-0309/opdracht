'use strict';

const screen = document.querySelector('#screen');
const notice = document.querySelector('#notice');
const editor = document.querySelector('#editor');
const editorForm = document.querySelector('#editor-form');
const confirmDialog = document.querySelector('#confirm-dialog');
const csrf = document.querySelector('meta[name="csrf-token"]').content;
let state = null;
let page = 'focus';
let weekOffset = 0;
let showCompletedQuests = false;
let selectedTaskId = null;
let editorSave = null;
let refreshSequence = 0;
let mutationPending = false;
let serverClockOffset = 0;
let immersive = false;
let taskDrag = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function icon(name) {
    const id=/^[a-z-]+$/.test(name) ? name : 'target';
    return `<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="/icons/ui.svg?v=6#${id}"></use></svg>`;
}
const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#789469';
const planningColors = [
    {name:'Salbei', value:'#789469'},
    {name:'Ozean', value:'#6289a6'},
    {name:'Lavendel', value:'#9180ad'},
    {name:'Beere', value:'#ad738c'},
    {name:'Terrakotta', value:'#b87960'},
    {name:'Honig', value:'#b69a52'},
    {name:'Petrol', value:'#578f89'},
    {name:'Schiefer', value:'#7c8794'},
];
function colorChoices(value) {
    const requested=color(value).toLowerCase();
    const selected=planningColors.some(choice=>choice.value===requested) ? requested : planningColors[0].value;
    const choices=planningColors;
    return `<fieldset class="color-palette"><legend>Farbe</legend><div class="color-options">${choices.map(choice=>`<label class="color-choice"><input type="radio" name="color" value="${choice.value}" ${choice.value===selected?'checked':''} required><span class="color-option"><span class="color-swatch" style="--choice-color:${choice.value}" aria-hidden="true"></span><span>${choice.name}</span><span class="color-check" aria-hidden="true">✓</span></span></label>`).join('')}</div></fieldset>`;
}
const dateValue = value => value ? String(value).slice(0, 10) : null;
const localDate = value => new Date(`${dateValue(value)}T12:00:00`);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dayLabel = value => localDate(value).toLocaleDateString('de-DE', {day:'numeric',month:'short'});
const taskQuest = task => state.quests.find(q => q.id === task.quest_id);
const duration = value => {const minutes = Math.floor(Number(value || 0) / 60); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')}`;};
const tag = quest => quest ? `<span class="tag" style="--tag:${color(quest.color)}"><i></i>${escapeHtml(quest.title)}</span>` : '<span class="tag">Ohne Quest</span>';

async function api(path, method = 'GET', body) {
    const response = await fetch(path, {method, credentials:'same-origin', headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-TOKEN':csrf}, ...(body === undefined ? {} : {body:JSON.stringify(body)})}).catch(() => { throw new Error('Dein Server ist nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.'); });
    if (response.status === 401 || response.status === 419) { location.href = '/login'; throw new Error('Bitte melde dich erneut an.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { throw new Error(data.errors ? Object.values(data.errors).flat().join(' ') : data.message || 'Die Änderung konnte nicht gespeichert werden.'); }
    return data;
}
function showError(message) {
    notice.hidden = false; notice.textContent = message;
}
async function refresh(quiet = false, afterMutation = false) {
    if (taskDrag || (mutationPending && !afterMutation)) return false;
    const sequence = ++refreshSequence;
    try {
        const data = await api('/api/state');
        if (sequence !== refreshSequence || taskDrag) return false;
        state = data;
        if (data.server_now) serverClockOffset = Date.parse(data.server_now) - Date.now();
        state.tasks = data.tasks || [];
        state.quests = data.quests || [];
        state.weekly = data.weekly || {seconds:0, completed:0};
        notice.hidden = true;
        setConnection('Verbunden', false);
        render();
        return true;
    } catch (error) {
        setConnection(navigator.onLine ? 'Server nicht erreichbar' : 'Offline', true);
        showError((navigator.onLine ? error.message : 'Du bist offline. Verbinde dich erneut, um deine Aufgaben zu laden.') + (state ? ' Angezeigte Daten können veraltet sein.' : ''));
        if (!state) screen.innerHTML = '<div class="empty"><div class="empty-symbol">↻</div><h1>Server nicht erreichbar.</h1><p>Prüfe die Verbindung zu deinem Server.</p><button class="button primary" data-action="retry">Erneut versuchen</button></div>';
        return false;
    }
}
async function mutate(path, method, body) {
    if (mutationPending) throw new Error('Eine Änderung wird gerade gespeichert. Bitte versuche es gleich erneut.');
    if (!navigator.onLine) throw new Error('Du bist offline. Änderungen benötigen eine Verbindung zu deinem Server.');
    mutationPending = true;
    ++refreshSequence;
    try {
        await api(path, method, body);
        const updated = await refresh(false, true);
        if (!updated) showError('Deine Änderung wurde gespeichert. Die Ansicht konnte anschließend nicht aktualisiert werden. Bitte lade sie erneut; angezeigte Daten können veraltet sein.');
        return true;
    }
    catch (error) { showError(error.message); throw error; }
    finally { mutationPending = false; }
}
function header(title, action = '') {
    return `<header class="page-header"><h1>${title}</h1>${action}</header>`;
}
function stats() {
    const todayTasks = state.tasks.filter(t => dateValue(t.scheduled_for) === state.today);
    const done = todayTasks.filter(t => t.completed_at).length;
    const active = state.quests.filter(q => !q.completed_at).length;
    return `<div class="stats-strip"><div class="stat"><span class="stat-label">Heute geschafft <span class="stat-decoration">✓</span></span><span class="stat-value">${done}<small>/ ${todayTasks.length}</small></span></div><div class="stat"><span class="stat-label">Fokus diese Woche <span class="stat-decoration">◷</span></span><span class="stat-value">${escapeHtml(duration(state.weekly.seconds))}</span></div><div class="stat"><span class="stat-label">Aktive Quests <span class="stat-decoration">◇</span></span><span class="stat-value">${active}</span></div></div>`;
}
function taskRow(task, compact = false) {
    const running = state.focus?.task_id === task.id;
    return `<li class="task ${task.completed_at ? 'done' : ''}" data-task-id="${task.id}"><button class="task-handle" data-action="reorder-task" data-id="${task.id}" aria-label="${escapeHtml(task.title)} verschieben" aria-describedby="reorder-help" aria-keyshortcuts="ArrowUp ArrowDown" title="Ziehen oder mit Pfeiltasten verschieben"><span aria-hidden="true">⠿</span></button><button class="task-check" role="checkbox" aria-checked="${Boolean(task.completed_at)}" aria-label="${escapeHtml(task.completed_at ? 'Wieder öffnen: ' : 'Erledigen: ')}${escapeHtml(task.title)}" data-action="toggle-task" data-id="${task.id}"><span class="task-check-box">${icon('check')}</span></button><div class="task-body"><button class="task-title" data-action="edit-task" data-id="${task.id}">${escapeHtml(task.title)}</button><div class="task-meta">${tag(taskQuest(task))}${!compact && task.scheduled_for && dateValue(task.scheduled_for) !== state.today ? `<span>${dayLabel(task.scheduled_for)}</span>` : ''}${task.focus_seconds ? `<span>${duration(task.focus_seconds)}</span>` : ''}</div></div><div class="task-actions">${!task.completed_at ? `<button class="icon-button" data-action="focus-task" data-id="${task.id}" aria-label="Fokus für ${escapeHtml(task.title)}" title="Fokus">${icon(running ? 'timer' : 'play')}</button>` : ''}<button class="icon-button delete-task" data-action="delete-task" data-id="${task.id}" aria-label="${escapeHtml(task.title)} löschen" title="Löschen">${icon('trash')}</button></div></li>`;
}
function taskSection(title, tasks, emptyText, addDate) {
    return `<section class="section"><div class="section-heading"><h2>${title}<span class="count">${tasks.length}</span></h2></div>${tasks.length ? `<ul class="task-list">${tasks.map(t => taskRow(t)).join('')}</ul>` : `<p class="empty-small">${emptyText}</p>`}${addDate !== undefined ? `<form class="quick-add" data-date="${addDate || ''}"><input name="title" aria-label="Neue Aufgabe für ${title}" placeholder="Neue Aufgabe" maxlength="200" required autocomplete="off"><button class="button subtle" type="submit" aria-label="Aufgabe hinzufügen">+</button></form>` : ''}</section>`;
}
function todayScreen() {
    const today = state.tasks.filter(t => dateValue(t.scheduled_for) === state.today && !t.completed_at);
    const overdue = state.tasks.filter(t => t.scheduled_for && dateValue(t.scheduled_for) < state.today && !t.completed_at);
    const inbox = state.tasks.filter(t => !t.scheduled_for && !t.completed_at);
    const completed = state.tasks.filter(t => t.completed_at);
    return header('Heute', '<button class="button primary" data-action="new-task">+ Aufgabe hinzufügen</button>') + stats() + `<div class="today-tasks">${overdue.length ? taskSection('Überfällig',overdue,'') : ''}${taskSection('Für heute',today,'Keine Aufgaben für heute.',state.today)}${taskSection('Ohne Termin',inbox,'Keine Aufgaben ohne Termin.',null)}${completed.length ? `<details class="section"><summary>Erledigt (${completed.length})</summary><ul class="task-list">${completed.map(t => taskRow(t)).join('')}</ul></details>` : ''}</div>`;
}
function weekStart() {const date = localDate(state.today); date.setDate(date.getDate() - (date.getDay()+6)%7 + weekOffset*7); return date;}
function weekScreen() {
    const start = weekStart();
    const end = new Date(start); end.setDate(end.getDate()+6);
    const days = Array.from({length:7},(_,i) => {const d=new Date(start); d.setDate(d.getDate()+i); return d;});
    return header('Woche', `<div class="week-nav"><button class="icon-button" data-action="previous-week" aria-label="Vorherige Woche">${icon('chevron-left')}</button><span class="week-title">${dayLabel(dateKey(start))} – ${dayLabel(dateKey(end))}</span><button class="icon-button" data-action="next-week" aria-label="Nächste Woche">${icon('chevron-right')}</button><button class="button small subtle" data-action="current-week">Heute</button></div>`) + `<div class="week-grid" role="region" aria-label="Wochenplanung, bei Bedarf seitlich scrollen" tabindex="0">${days.map(d => {const key=dateKey(d);const tasks=state.tasks.filter(t=>dateValue(t.scheduled_for)===key);return `<section class="day ${key===state.today?'current':''}"><div class="day-heading"><span>${d.toLocaleDateString('de-DE',{weekday:'short'})}</span><strong>${d.getDate()}</strong></div>${tasks.length?`<ul class="task-list">${tasks.map(t=>taskRow(t,true)).join('')}</ul>`:'<p class="empty-small">Keine Aufgaben.</p>'}<button class="day-add" data-action="new-task" data-date="${key}">+ Aufgabe</button></section>`;}).join('')}</div><p class="review-note">Aufgabe anklicken, um den Termin zu ändern.</p>`;
}
function questsScreen() {
    const quests=state.quests.filter(q=>Boolean(q.completed_at)===showCompletedQuests);
    return header('Quests', '<button class="button primary" data-action="new-quest">+ Neue Quest</button>') + `<div class="tabs" role="group" aria-label="Quests filtern"><button class="${!showCompletedQuests?'active':''}" data-action="active-quests" aria-pressed="${!showCompletedQuests}">Aktiv · ${state.quests.filter(q=>!q.completed_at).length}</button><button class="${showCompletedQuests?'active':''}" data-action="completed-quests" aria-pressed="${showCompletedQuests}">Abgeschlossen · ${state.quests.filter(q=>q.completed_at).length}</button></div>` + (quests.length ? `<div class="quest-grid">${quests.map(q=>{const tasks=state.tasks.filter(t=>t.quest_id===q.id);const done=tasks.filter(t=>t.completed_at).length;return `<article class="quest-card" style="--quest-color:${color(q.color)}"><div class="quest-top"><span class="quest-icon" aria-hidden="true">${icon('target')}</span><div><button class="icon-button" data-action="edit-quest" data-id="${q.id}" aria-label="${escapeHtml(q.title)} bearbeiten">${icon('pencil')}</button><button class="icon-button" data-action="delete-quest" data-id="${q.id}" aria-label="${escapeHtml(q.title)} löschen">${icon('trash')}</button></div></div><h2>${escapeHtml(q.title)}</h2>${q.description ? `<p>${escapeHtml(q.description)}</p>` : ''}<div class="quest-progress"><span style="width:${tasks.length?Math.round(done/tasks.length*100):0}%"></span></div><div class="quest-footer"><span>${done} / ${tasks.length} Aufgaben</span><span>${duration(tasks.reduce((sum,t)=>sum+Number(t.focus_seconds||0),0))} Fokus</span></div></article>`;}).join('')}</div>` : `<div class="empty"><div class="empty-symbol">◇</div><h2>${showCompletedQuests?'Keine abgeschlossenen Quests.':'Keine Quests vorhanden.'}</h2>${!showCompletedQuests?'<button class="button primary" data-action="new-quest">Quest erstellen</button>':''}</div>`);
}
function focusTask() {
    return state.tasks.find(t=>t.id===state.focus?.task_id) || state.tasks.find(t=>t.id===selectedTaskId && !t.completed_at) || state.tasks.find(t=>!t.completed_at);
}
function focusPanel() {
    const activeTask=state.tasks.find(t=>t.id===state.focus?.task_id);
    const selected=focusTask();
    const available=state.tasks.filter(t=>!t.completed_at);
    return `<section class="focus-view"><p class="focus-eyebrow">EINE AUFGABE. DEIN FOKUS.</p>${selected?`${tag(taskQuest(selected))}<h2>${escapeHtml(selected.title)}</h2>`:`<h2>${available.length?'Worauf möchtest du dich konzentrieren?':'Platz für deinen nächsten Schritt.'}</h2>`}${!state.focus && available.length?`<label class="focus-choose">Aufgabe<select id="focus-select"><option value="">Aufgabe auswählen …</option>${available.map(t=>`<option value="${t.id}" ${t.id===selected?.id?'selected':''}>${escapeHtml(t.title)}</option>`).join('')}</select></label>`:''}<div data-focus-timer class="timer" role="timer" aria-live="off" aria-label="Verstrichene Fokuszeit">00:00</div><p class="timer-label" role="status">${state.focus?'FOKUS LÄUFT':'BEREIT FÜR FOKUS'}</p><div class="focus-controls">${state.focus?`<button class="button primary" data-action="stop-focus">${icon('square')} Timer stoppen &amp; Zeit speichern</button>${activeTask?`<button class="button subtle" data-action="finish-focus" data-id="${activeTask.id}">${icon('check')} Aufgabe abschließen</button>`:''}`:available.length?`<button class="button primary" data-action="start-focus" ${selected?'':'disabled'}>${icon('play')} Fokus starten</button>`:'<button class="button primary" data-action="new-task">+ Aufgabe erstellen</button>'}</div><p class="intro">${state.focus?'Der Timer läuft serverseitig weiter – auch beim Verlassen dieser Ansicht oder Schließen der App.':'Beim Stoppen wird die Zeit auf deinem Server gespeichert.'}</p></section>`;
}
function focusScreen() {
    return `<section id="focus-workspace" class="focus-workspace"><header class="focus-toolbar"><h1>Fokus</h1><button id="focus-fullscreen" class="button subtle" data-action="toggle-immersive" aria-controls="focus-workspace" aria-pressed="false">${icon('maximize')} Vollbild</button></header><p id="focus-exit-hint" class="focus-exit-hint" hidden>Esc oder „Vollbild verlassen“ blendet die Navigation wieder ein. Der Timer läuft unverändert weiter.</p>${focusPanel()}</section>`;
}
function syncImmersive() {
    document.body.classList.toggle('immersive-open', immersive);
    const button=document.querySelector('#focus-fullscreen');
    if(button) {
        button.setAttribute('aria-pressed',String(immersive));
        button.innerHTML=icon(immersive?'x':'maximize')+(immersive?' Vollbild verlassen':' Vollbild');
    }
    const hint=document.querySelector('#focus-exit-hint');
    if(hint) hint.hidden=!immersive;
}
function setImmersive(enabled) {
    immersive=Boolean(enabled && page==='focus');
    syncImmersive();
}
document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && immersive && !editor.open && !confirmDialog.open) {
        event.preventDefault();
        setImmersive(false);
        document.querySelector('#focus-fullscreen')?.focus({preventScroll:true});
    }
});
function reviewScreen() {
    const quests=state.quests.map(q=>({...q,seconds:state.tasks.filter(t=>t.quest_id===q.id).reduce((sum,t)=>sum+Number(t.focus_seconds||0),0)})).filter(q=>q.seconds>0).sort((a,b)=>b.seconds-a.seconds);
    const total=quests.reduce((sum,q)=>sum+q.seconds,0);
    return header('Rückblick') + `<div class="stats-strip"><div class="stat"><span class="stat-label">Fokus diese Woche</span><span class="stat-value">${duration(state.weekly.seconds)}</span></div><div class="stat"><span class="stat-label">DIESE WOCHE ERLEDIGT</span><span class="stat-value">${state.weekly.completed}<small>Aufgaben</small></span></div><div class="stat"><span class="stat-label">QUESTS ABGESCHLOSSEN</span><span class="stat-value">${state.quests.filter(q=>q.completed_at).length}</span></div></div><section class="review-panel"><h2>Fokuszeit nach Quest</h2><p class="review-note">Gesamtzeit der vorhandenen Aufgaben.</p>${quests.length?quests.map(q=>`<div class="review-row">${tag(q)}<strong>${duration(q.seconds)}</strong></div><div class="review-bar"><span style="width:${Math.round(q.seconds/total*100)}%;background:${color(q.color)}"></span></div>`).join(''):'<p class="empty-small">Noch keine Fokuszeit gespeichert.</p>'}</section>`;
}
function render() {
    if(!state) return;
    page=['today','week','quests','focus','review'].includes(location.hash.slice(1))?location.hash.slice(1):'focus';
    document.querySelectorAll('[data-page]').forEach(link=>{const active=link.dataset.page===page;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.querySelector('#date-label').textContent=localDate(state.today).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const focused=document.activeElement;
    const focusedAction=focused?.dataset.action;
    const focusedSelect=focused?.id;
    cancelTaskDrag();
    document.body.classList.toggle('focus-page',page==='focus');
    screen.dataset.page=page;
    screen.innerHTML=({today:todayScreen,week:weekScreen,quests:questsScreen,focus:focusScreen,review:reviewScreen})[page]();
    if(page!=='focus') immersive=false;
    syncImmersive();
    if(focusedAction) {
        const scope=screen;
        const target=Array.from(scope.querySelectorAll('[data-action]')).find(button=>button.dataset.action===focusedAction && button.dataset.id===focused.dataset.id);
        target?.focus({preventScroll:true});

    } else if(focusedSelect==='focus-select') document.getElementById(focusedSelect)?.focus({preventScroll:true});
    updateTimer();
}
function updateTimer() {
    const timers=document.querySelectorAll('[data-focus-timer]');
    if(!timers.length) return;
    const elapsed=state?.focus ? Math.max(0,Math.floor((Date.now()+serverClockOffset-Date.parse(state.focus.started_at))/1000)) : 0;
    const hours=Math.floor(elapsed/3600);
    timers.forEach(timer=>timer.textContent=(hours?`${String(hours).padStart(2,'0')}:`:'')+`${String(Math.floor(elapsed/60)%60).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`);
}
function openEditor(title, fields, onSave) {
    document.querySelector('#editor-title').textContent=title;
    document.querySelector('#editor-fields').innerHTML=fields;
    document.querySelector('#editor-error').hidden=true;
    editorSave=onSave;editor.showModal();
}
function taskEditor(task, date=state.today) {
    openEditor(task?'Aufgabe bearbeiten':'Neue Aufgabe',`<label>Aufgabe<input name="title" value="${escapeHtml(task?.title)}" maxlength="200" required autofocus></label><div class="form-row"><label>Tag<input type="date" name="scheduled_for" value="${escapeHtml(dateValue(task?task.scheduled_for:date))}"></label><label>Quest<select name="quest_id"><option value="">Ohne Quest</option>${state.quests.filter(q=>!q.completed_at || q.id===task?.quest_id).map(q=>`<option value="${q.id}" ${q.id===task?.quest_id?'selected':''}>${escapeHtml(q.title)}</option>`).join('')}</select></label></div><label>Notizen<textarea name="notes" maxlength="10000">${escapeHtml(task?.notes)}</textarea></label>${task?`<label class="check-label"><input type="checkbox" name="completed" ${task.completed_at?'checked':''}> Aufgabe abgeschlossen</label><button type="button" class="text-button" data-action="delete-task" data-id="${task.id}">Aufgabe löschen</button>`:''}`,async data=>{await mutate(task?`/api/tasks/${task.id}`:'/api/tasks',task?'PATCH':'POST',{title:data.get('title'),notes:data.get('notes'),scheduled_for:data.get('scheduled_for')||null,quest_id:data.get('quest_id')?Number(data.get('quest_id')):null,...(task?{completed:data.has('completed')}:{})});});
}
function questEditor(quest) {
    openEditor(quest?'Quest bearbeiten':'Neue Quest',`<label>Titel<input name="title" value="${escapeHtml(quest?.title)}" maxlength="200" required autofocus></label><label>Beschreibung<textarea name="description" maxlength="10000">${escapeHtml(quest?.description)}</textarea></label>${colorChoices(quest?.color)}${quest?`<label class="check-label"><input type="checkbox" name="completed" ${quest.completed_at?'checked':''}> Quest abgeschlossen</label>`:''}`,async data=>{await mutate(quest?`/api/quests/${quest.id}`:'/api/quests',quest?'PATCH':'POST',{title:data.get('title'),description:data.get('description'),color:data.get('color'),...(quest?{completed:data.has('completed')}:{})});});
}
function confirmDelete(text) {
    return new Promise(resolve=>{document.querySelector('#confirm-text').textContent=text;confirmDialog.returnValue='cancel';confirmDialog.addEventListener('close',()=>resolve(confirmDialog.returnValue==='delete'),{once:true});confirmDialog.showModal();});
}
document.addEventListener('click',async event=>{
    if(event.target.closest('[data-close]')){editor.close();return;}
    const button=event.target.closest('[data-action]');if(!button) return;
    const action=button.dataset.action,id=Number(button.dataset.id);
    const task=state?.tasks.find(t=>t.id===id),quest=state?.quests.find(q=>q.id===id);
    try {
        if(action==='toggle-immersive'&&state) return setImmersive(!immersive);
        if(action==='retry') return await refresh();
        if(action==='reorder-task') return;
        if(!state) return;
        if(action==='new-task') return taskEditor(null,button.dataset.date||state.today);
        if(action==='edit-task'&&task) return taskEditor(task);
        if(action==='new-quest') return questEditor(null);
        if(action==='edit-quest'&&quest) return questEditor(quest);
        if(action==='previous-week'){weekOffset--;return render();}
        if(action==='next-week'){weekOffset++;return render();}
        if(action==='current-week'){weekOffset=0;return render();}
        if(action==='active-quests'||action==='completed-quests'){showCompletedQuests=action==='completed-quests';return render();}
        if(action==='focus-task'){selectedTaskId=id;location.hash='focus';return render();}
        button.disabled=true;
        if(action==='toggle-task'&&task) await mutate(`/api/tasks/${id}`,'PATCH',{completed:!task.completed_at});
        if(action==='delete-task'&&task&&await confirmDelete(`„${task.title}“ wird dauerhaft gelöscht. Bereits gespeicherte Fokuszeiten bleiben im Rückblick erhalten.`)){await mutate(`/api/tasks/${id}`,'DELETE');editor.close();}
        if(action==='delete-quest'&&quest&&await confirmDelete(`„${quest.title}“ löschen? Die Aufgaben bleiben erhalten und werden keiner Quest mehr zugeordnet.`)) await mutate(`/api/quests/${id}`,'DELETE');
        if(action==='start-focus'&&focusTask()) await mutate('/api/focus','POST',{task_id:focusTask().id});
        if(action==='stop-focus'&&state.focus) await mutate('/api/focus/stop','POST',{session_id:state.focus.id});
        if(action==='finish-focus'&&state.focus){await mutate(`/api/tasks/${id}`,'PATCH',{completed:true});selectedTaskId=null;render();}
    } catch(error) { showError(error.message); }
    finally { button.disabled=false; }
});
// Only replace this list's slots: hidden tasks and other days stay in place.
function reorderedTaskIds(allIds, visibleIds, movedId, targetId) {
    if (movedId===targetId || !visibleIds.includes(movedId) || !visibleIds.includes(targetId)) return allIds.slice();
    const reordered=visibleIds.slice();
    reordered.splice(reordered.indexOf(movedId),1);
    reordered.splice(visibleIds.indexOf(targetId),0,movedId);
    let index=0;
    return allIds.map(id=>visibleIds.includes(id)?reordered[index++]:id);
}
async function persistTaskOrder(visibleIds, movedId, targetId) {
    const allIds=state.tasks.map(task=>task.id);
    const orderedIds=reorderedTaskIds(allIds,visibleIds,movedId,targetId);
    if(orderedIds.every((id,index)=>id===allIds[index])) return;
    await mutate('/api/tasks/reorder','POST',{task_ids:orderedIds});
    document.querySelector('#reorder-status').textContent='Aufgabenreihenfolge gespeichert.';
}
function listTaskIds(list) { return Array.from(list.querySelectorAll('[data-task-id]'),row=>Number(row.dataset.taskId)); }
function cancelTaskDrag() {
    if(!taskDrag) return;
    taskDrag.row.classList.remove('dragging');
    taskDrag.target?.classList.remove('drop-target');
    const handle=taskDrag.handle,pointerId=taskDrag.pointerId;
    taskDrag=null;
    if(handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
}
document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.task-handle');
    if(!handle || mutationPending || event.button!==0) return;
    const row=handle.closest('[data-task-id]'),list=row.closest('.task-list');
    taskDrag={handle,row,list,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,target:null};
    ++refreshSequence;
    handle.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
    if(!taskDrag || taskDrag.pointerId!==event.pointerId) return;
    if(!taskDrag.active && Math.hypot(event.clientX-taskDrag.startX,event.clientY-taskDrag.startY)<6) return;
    taskDrag.active=true;
    taskDrag.row.classList.add('dragging');
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-task-id]');
    taskDrag.target?.classList.remove('drop-target');
    taskDrag.target=target?.closest('.task-list')===taskDrag.list?target:null;
    taskDrag.target?.classList.add('drop-target');
    event.preventDefault();
});
document.addEventListener('pointerup',async event=>{
    if(!taskDrag || taskDrag.pointerId!==event.pointerId) return;
    const drag=taskDrag,ids=listTaskIds(drag.list);
    cancelTaskDrag();
    if(!drag.active || !drag.target) return;
    try { await persistTaskOrder(ids,Number(drag.row.dataset.taskId),Number(drag.target.dataset.taskId)); }
    catch(error) { showError(error.message); }
});
document.addEventListener('pointercancel',cancelTaskDrag);
document.addEventListener('lostpointercapture',cancelTaskDrag);
document.addEventListener('keydown',async event=>{
    if(event.key==='Escape' && taskDrag) {cancelTaskDrag();return;}
    const handle=event.target?.closest?.('.task-handle');
    if(!handle || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if(mutationPending || taskDrag) return;
    const ids=listTaskIds(handle.closest('.task-list')),id=Number(handle.dataset.id);
    const target=ids[ids.indexOf(id)+(event.key==='ArrowUp'?-1:1)];
    if(target===undefined) return;
    try { await persistTaskOrder(ids,id,target); }
    catch(error) { showError(error.message); }
});
document.addEventListener('submit',async event=>{
    const form=event.target.closest('.quick-add');if(!form)return;
    event.preventDefault();const input=form.elements.title,title=input.value.trim();if(!title)return;
    const submit=form.querySelector('button');submit.disabled=true;
    try {await mutate('/api/tasks','POST',{title,scheduled_for:form.dataset.date||null});}
    catch(error){showError(error.message);}finally{submit.disabled=false;}
});
editorForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!editorSave)return;
    const submit=editorForm.querySelector('[type="submit"]');submit.disabled=true;
    try {await editorSave(new FormData(editorForm));editor.close();}
    catch(error){const output=document.querySelector('#editor-error');output.textContent=error.message;output.hidden=false;}
    finally{submit.disabled=false;}
});
document.addEventListener('change',event=>{if(event.target.id==='focus-select'){selectedTaskId=Number(event.target.value)||null;render();}});
function setConnection(label, unavailable) { document.querySelector('.connection').classList.toggle('offline', unavailable); document.querySelector('#connection-text').textContent=label; }
function connectionChanged(){const online=navigator.onLine;setConnection(online?'Verbinde …':'Offline',!online);if(!online)showError('Du bist offline. Angezeigte Daten können veraltet sein. Änderungen benötigen eine Verbindung.');else if(state)refresh();}
window.addEventListener('online',connectionChanged);window.addEventListener('offline',connectionChanged);
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!editor.open&&!confirmDialog.open&&!document.activeElement?.matches('input, textarea, select'))refresh(true);});
setInterval(updateTimer,1000);
setInterval(()=>{if(!document.hidden&&!editor.open&&!confirmDialog.open&&!mutationPending&&!document.activeElement?.matches('input, textarea, select'))refresh(true);},30000);
let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#install').hidden=false;});
document.querySelector('#install').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;document.querySelector('#install').hidden=true;});
function pwaError(error) {
    console.error('Opdracht service worker:', error);
    const output = document.querySelector('#pwa-notice');
    output.textContent = 'Die Offline-Ansicht ist nicht verfügbar. Lade die Seite bei bestehender Verbindung erneut.';
    output.hidden = false;
}
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=8').then(registration => {
        const watch = () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
                if (worker.state === 'redundant' && !registration.active) pwaError('Installation fehlgeschlagen.');
                if (worker.state === 'activated') document.querySelector('#pwa-notice').hidden = true;
            });
        };
        watch();
        registration.addEventListener('updatefound', watch);
    }).catch(pwaError);
} else if (!window.isSecureContext) {
    const output = document.querySelector('#pwa-notice');
    output.textContent = 'Für die App-Installation und Offline-Ansicht ist HTTPS erforderlich.';
    output.hidden = false;
}
connectionChanged();refresh();
