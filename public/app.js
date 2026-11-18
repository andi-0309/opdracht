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
let editorTarget = null;
let renderedPageKey = null;
let renderedTasks = new Map();
let refreshSequence = 0;
let mutationPending = false;
let serverClockOffset = 0;
let immersive = false;
let taskDrag = null;
let suppressTaskClickUntil = 0;
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
    return `<li class="task ${task.completed_at ? 'done' : ''}" data-task-id="${task.id}" ${!task.completed_at ? `tabindex="0" aria-label="${escapeHtml(task.title)} verschieben" aria-describedby="reorder-help" aria-keyshortcuts="ArrowUp ArrowDown"` : ''}><button class="task-check" role="checkbox" aria-checked="${Boolean(task.completed_at)}" aria-label="${escapeHtml(task.completed_at ? 'Wieder öffnen: ' : 'Erledigen: ')}${escapeHtml(task.title)}" data-action="toggle-task" data-id="${task.id}"><span class="task-check-box">${icon('check')}</span></button><div class="task-body"><button class="task-title" data-action="edit-task" data-id="${task.id}">${escapeHtml(task.title)}</button><div class="task-meta">${tag(taskQuest(task))}${!compact && task.scheduled_for && dateValue(task.scheduled_for) !== state.today ? `<span>${dayLabel(task.scheduled_for)}</span>` : ''}${task.focus_seconds ? `<span>${duration(task.focus_seconds)}</span>` : ''}</div></div><div class="task-actions">${!task.completed_at ? `<button class="icon-button" data-action="focus-task" data-id="${task.id}" aria-label="Fokus für ${escapeHtml(task.title)}" title="Fokus">${icon(running ? 'timer' : 'play')}</button>` : ''}</div></li>`;
}
function taskSection(title, tasks, emptyText, addDate) {
    return `<section class="section" ${addDate !== undefined ? `data-drop-date="${addDate || ''}"` : ''}><div class="section-heading"><h2>${title}<span class="count">${tasks.length}</span></h2></div>${tasks.length ? `<ul class="task-list active-task-list">${tasks.map(t => taskRow(t)).join('')}</ul>` : `<p class="empty-small">${emptyText}</p>`}${addDate !== undefined ? `<form class="quick-add" data-date="${addDate || ''}"><input name="title" aria-label="Neue Aufgabe für ${title}" placeholder="Neue Aufgabe" maxlength="200" required autocomplete="off"><button class="button subtle" type="submit" aria-label="Aufgabe hinzufügen">+</button></form>` : ''}</section>`;
}
function completedSection(tasks, compact = false) {
    return tasks.length ? `<details class="section completed-tasks"><summary>Erledigt (${tasks.length})</summary><ul class="task-list">${tasks.map(task=>taskRow(task,compact)).join('')}</ul></details>` : '';
}
function todayScreen() {
    const today = state.tasks.filter(t => dateValue(t.scheduled_for) === state.today && !t.completed_at);
    const overdue = state.tasks.filter(t => t.scheduled_for && dateValue(t.scheduled_for) < state.today && !t.completed_at);
    const inbox = state.tasks.filter(t => !t.scheduled_for && !t.completed_at);
    const completed = state.tasks.filter(t => t.completed_at);
    return header('Heute', '<button class="button primary" data-action="new-task">+ Aufgabe hinzufügen</button>') + stats() + `<div class="today-tasks">${overdue.length ? taskSection('Überfällig',overdue,'') : ''}${taskSection('Für heute',today,'Keine Aufgaben für heute.',state.today)}${taskSection('Ohne Termin',inbox,'Keine Aufgaben ohne Termin.',null)}${completedSection(completed)}</div>`;
}
function weekStart() {const date = localDate(state.today); date.setDate(date.getDate() - (date.getDay()+6)%7 + weekOffset*7); return date;}
function weekScreen() {
    const start = weekStart();
    const end = new Date(start); end.setDate(end.getDate()+6);
    const days = Array.from({length:7},(_,i) => {const d=new Date(start); d.setDate(d.getDate()+i); return d;});
    return header('Woche', `<div class="week-nav"><button class="icon-button" data-action="previous-week" aria-label="Vorherige Woche">${icon('chevron-left')}</button><span class="week-title">${dayLabel(dateKey(start))} – ${dayLabel(dateKey(end))}</span><button class="icon-button" data-action="next-week" aria-label="Nächste Woche">${icon('chevron-right')}</button><button class="button small subtle" data-action="current-week">Heute</button></div>`) + `<div class="week-grid" role="region" aria-label="Wochenplanung, bei Bedarf seitlich scrollen" tabindex="0">${days.map(d => {const key=dateKey(d);const dayTasks=state.tasks.filter(t=>dateValue(t.scheduled_for)===key);const tasks=dayTasks.filter(t=>!t.completed_at);const completed=dayTasks.filter(t=>t.completed_at);return `<section class="day ${key===state.today?'current':''}" data-drop-date="${key}"><div class="day-heading"><span>${d.toLocaleDateString('de-DE',{weekday:'short'})}</span><strong>${d.getDate()}</strong></div>${tasks.length?`<ul class="task-list active-task-list">${tasks.map(t=>taskRow(t,true)).join('')}</ul>`:'<p class="empty-small">Keine Aufgaben.</p>'}<button class="day-add" data-action="new-task" data-date="${key}">+ Aufgabe</button>${completedSection(completed,true)}</section>`;}).join('')}</div><p class="review-note">Aufgabenkarte ziehen, um zu sortieren oder auf einen anderen Tag zu verschieben. Auf Touchscreens kurz halten, dann ziehen. Zum Bearbeiten den Titel antippen.</p>`;
}
function questsScreen() {
    const quests=state.quests.filter(q=>Boolean(q.completed_at)===showCompletedQuests);
    return header('Quests', '<button class="button primary" data-action="new-quest">+ Neue Quest</button>') + `<div class="tabs" role="group" aria-label="Quests filtern"><button class="${!showCompletedQuests?'active':''}" data-action="active-quests" aria-pressed="${!showCompletedQuests}">Aktiv · ${state.quests.filter(q=>!q.completed_at).length}</button><button class="${showCompletedQuests?'active':''}" data-action="completed-quests" aria-pressed="${showCompletedQuests}">Abgeschlossen · ${state.quests.filter(q=>q.completed_at).length}</button></div>` + (quests.length ? `<div class="quest-grid">${quests.map(q=>{const tasks=state.tasks.filter(t=>t.quest_id===q.id);const done=tasks.filter(t=>t.completed_at).length;return `<article class="quest-card" style="--quest-color:${color(q.color)}"><div class="quest-top"><span class="quest-icon" aria-hidden="true">${icon('target')}</span><div><button class="icon-button" data-action="edit-quest" data-id="${q.id}" aria-label="${escapeHtml(q.title)} bearbeiten">${icon('pencil')}</button></div></div><h2>${escapeHtml(q.title)}</h2>${q.description ? `<p>${escapeHtml(q.description)}</p>` : ''}<div class="quest-progress"><span data-progress-id="quest-${q.id}" style="width:${tasks.length?Math.round(done/tasks.length*100):0}%"></span></div><div class="quest-footer"><span>${done} / ${tasks.length} Aufgaben</span><span>${duration(tasks.reduce((sum,t)=>sum+Number(t.focus_seconds||0),0))} Fokus</span></div></article>`;}).join('')}</div>` : `<div class="empty"><div class="empty-symbol">◇</div><h2>${showCompletedQuests?'Keine abgeschlossenen Quests.':'Keine Quests vorhanden.'}</h2>${!showCompletedQuests?'<button class="button primary" data-action="new-quest">Quest erstellen</button>':''}</div>`);
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
    return header('Rückblick') + `<div class="stats-strip"><div class="stat"><span class="stat-label">Fokus diese Woche</span><span class="stat-value">${duration(state.weekly.seconds)}</span></div><div class="stat"><span class="stat-label">DIESE WOCHE ERLEDIGT</span><span class="stat-value">${state.weekly.completed}<small>Aufgaben</small></span></div><div class="stat"><span class="stat-label">QUESTS ABGESCHLOSSEN</span><span class="stat-value">${state.quests.filter(q=>q.completed_at).length}</span></div></div><section class="review-panel"><h2>Fokuszeit nach Quest</h2><p class="review-note">Gesamtzeit der vorhandenen Aufgaben.</p>${quests.length?quests.map(q=>`<div class="review-row">${tag(q)}<strong>${duration(q.seconds)}</strong></div><div class="review-bar"><span data-progress-id="review-${q.id}" style="width:${Math.round(q.seconds/total*100)}%;background:${color(q.color)}"></span></div>`).join(''):'<p class="empty-small">Noch keine Fokuszeit gespeichert.</p>'}</section>`;
}
function animateChange(element, frames, options = {}) {
    if(!element || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !element.animate) return;
    element.animate(frames,{duration:180,easing:'ease-out',...options});
}
function render() {
    if(!state) return;
    page=['today','week','quests','focus','review'].includes(location.hash.slice(1))?location.hash.slice(1):'focus';
    document.querySelectorAll('[data-page]').forEach(link=>{const active=link.dataset.page===page;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.querySelector('#date-label').textContent=localDate(state.today).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const focused=document.activeElement;
    const focusedAction=focused?.dataset.action;
    const focusedSelect=focused?.id;
    const previousProgress=new Map(Array.from(screen.querySelectorAll('[data-progress-id]'),bar=>[bar.dataset.progressId,bar.style.width]));
    cancelTaskDrag();
    document.body.classList.toggle('focus-page',page==='focus');
    const pageKey=page+':'+(page==='week'?weekOffset:page==='quests'?showCompletedQuests:'');
    const pageChanged=renderedPageKey!==pageKey;
    const previousTasks=renderedTasks;
    renderedTasks=new Map(state.tasks.map(task=>[task.id,Boolean(task.completed_at)]));
    renderedPageKey=pageKey;
    screen.dataset.page=page;
    screen.innerHTML=({today:todayScreen,week:weekScreen,quests:questsScreen,focus:focusScreen,review:reviewScreen})[page]();
    screen.querySelectorAll('[data-progress-id]').forEach(bar=>{
        const from=pageChanged ? '0%' : previousProgress.get(bar.dataset.progressId);
        if(from!==undefined && from!==bar.style.width) animateChange(bar,[{width:from},{width:bar.style.width}],{duration:260});
    });
    if(pageChanged) animateChange(screen,[{opacity:.45},{opacity:1}],{duration:220});
    else state.tasks.forEach(task=>{
        if(previousTasks.get(task.id)===Boolean(task.completed_at)) return;
        const row=screen.querySelector('[data-task-id="'+task.id+'"]');
        const target=task.completed_at ? row?.closest('details')?.querySelector('summary') : row;
        animateChange(target,[{opacity:.4},{opacity:1}]);
    });
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
    editorTarget=task?{type:'task',id:task.id}:null;
    openEditor(task?'Aufgabe bearbeiten':'Neue Aufgabe',`<label>Aufgabe<input name="title" value="${escapeHtml(task?.title)}" maxlength="200" required autofocus></label><div class="form-row"><label>Tag<input type="date" name="scheduled_for" value="${escapeHtml(dateValue(task?task.scheduled_for:date))}"></label><label>Quest<select name="quest_id"><option value="">Ohne Quest</option>${state.quests.filter(q=>!q.completed_at || q.id===task?.quest_id).map(q=>`<option value="${q.id}" ${q.id===task?.quest_id?'selected':''}>${escapeHtml(q.title)}</option>`).join('')}</select></label></div><label>Notizen<textarea name="notes" maxlength="10000">${escapeHtml(task?.notes)}</textarea></label>${task?`<label class="check-label"><input type="checkbox" name="completed" ${task.completed_at?'checked':''}> Aufgabe abgeschlossen</label><button type="button" class="text-button" data-action="delete-task" data-id="${task.id}">Aufgabe löschen</button>`:''}`,async data=>{await mutate(task?`/api/tasks/${task.id}`:'/api/tasks',task?'PATCH':'POST',{title:data.get('title'),notes:data.get('notes'),scheduled_for:data.get('scheduled_for')||null,quest_id:data.get('quest_id')?Number(data.get('quest_id')):null,...(task?{completed:data.has('completed')}:{})});});
}
function questEditor(quest) {
    editorTarget=quest?{type:'quest',id:quest.id}:null;
    openEditor(quest?'Quest bearbeiten':'Neue Quest',`<label>Titel<input name="title" value="${escapeHtml(quest?.title)}" maxlength="200" required autofocus></label><label>Beschreibung<textarea name="description" maxlength="10000">${escapeHtml(quest?.description)}</textarea></label>${colorChoices(quest?.color)}${quest?`<label class="check-label"><input type="checkbox" name="completed" ${quest.completed_at?'checked':''}> Quest abgeschlossen</label><button type="button" class="text-button" data-action="delete-quest" data-id="${quest.id}">Quest löschen</button>`:''}`,async data=>{await mutate(quest?`/api/quests/${quest.id}`:'/api/quests',quest?'PATCH':'POST',{title:data.get('title'),description:data.get('description'),color:data.get('color'),...(quest?{completed:data.has('completed')}:{})});});
}
function editorAllowsDelete(button, type, id) {
    return editor.open && button.closest('#editor')===editor && editorTarget?.type===type && editorTarget.id===id;
}
function confirmDelete(text) {
    return new Promise(resolve=>{document.querySelector('#confirm-text').textContent=text;confirmDialog.returnValue='cancel';confirmDialog.addEventListener('close',()=>resolve(confirmDialog.returnValue==='delete'),{once:true});confirmDialog.showModal();});
}
document.addEventListener('click',async event=>{
    if(Date.now()<suppressTaskClickUntil && event.detail!==0) {
        event.preventDefault();event.stopImmediatePropagation();return;
    }
    if(event.target.closest('[data-close]')){editor.close();return;}
    const button=event.target.closest('[data-action]');if(!button) return;
    const action=button.dataset.action,id=Number(button.dataset.id);
    const task=state?.tasks.find(t=>t.id===id),quest=state?.quests.find(q=>q.id===id);
    try {
        if(action==='toggle-immersive'&&state) return setImmersive(!immersive);
        if(action==='retry') return await refresh();
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
        if(action==='delete-task'&&task&&editorAllowsDelete(button,'task',id)&&await confirmDelete(`„${task.title}“ wird dauerhaft gelöscht. Bereits gespeicherte Fokuszeiten bleiben im Rückblick erhalten.`)){await mutate(`/api/tasks/${id}`,'DELETE');editor.close();}
        if(action==='delete-quest'&&quest&&editorAllowsDelete(button,'quest',id)&&await confirmDelete(`„${quest.title}“ löschen? Die Aufgaben bleiben erhalten und werden keiner Quest mehr zugeordnet.`)){await mutate(`/api/quests/${id}`,'DELETE');editor.close();}
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
function openTaskRows(scope) {
    return Array.from(scope.querySelectorAll('[data-task-id]')).filter(row=>!row.closest('.completed-tasks') && !row.closest('details:not([open])'));
}
function listTaskIds(list) { return openTaskRows(list).map(row=>Number(row.dataset.taskId)); }
// Destination insertion keeps every task ID and does not change local state before saving.
function droppedTaskIds(allIds, destinationIds, movedId, beforeId) {
    const ids=allIds.filter(id=>id!==movedId);
    const destination=destinationIds.filter(id=>id!==movedId);
    let index=beforeId===null ? -1 : ids.indexOf(beforeId);
    if(index<0) index=destination.length ? ids.indexOf(destination[destination.length-1])+1 : ids.length;
    ids.splice(index,0,movedId);
    return ids;
}
async function persistTaskDrop(drag) {
    const movedId=Number(drag.row.dataset.taskId);
    const task=state.tasks.find(task=>task.id===movedId);
    if(!task || task.completed_at) return;
    const scheduledFor=drag.zone ? drag.zone.dataset.dropDate || null : dateValue(task.scheduled_for);
    const allIds=state.tasks.map(task=>task.id);
    const destinationIds=listTaskIds(drag.zone || drag.list);
    const sameDate=dateValue(task.scheduled_for)===scheduledFor;
    let orderedIds;
    if(sameDate && destinationIds.includes(movedId)) {
        const visible=destinationIds.filter(id=>id!==movedId);
        const index=drag.beforeId===null ? visible.length : visible.indexOf(drag.beforeId);
        visible.splice(index<0?visible.length:index,0,movedId);
        let slot=0;
        orderedIds=allIds.map(id=>destinationIds.includes(id)?visible[slot++]:id);
    } else orderedIds=droppedTaskIds(allIds,destinationIds,movedId,drag.beforeId);
    if(sameDate && orderedIds.every((id,index)=>id===allIds[index])) return;
    await mutate('/api/tasks/reorder','POST',{task_ids:orderedIds,...(!sameDate?{moved_task_id:movedId,scheduled_for:scheduledFor}:{})});
    document.querySelector('#reorder-status').textContent=sameDate?'Aufgabenreihenfolge gespeichert.':'Aufgabe verschoben und Reihenfolge gespeichert.';
}
function cancelTaskDrag() {
    if(!taskDrag) return;
    const drag=taskDrag;
    taskDrag=null;
    clearTimeout(drag.holdTimer);
    if(drag.active) suppressTaskClickUntil=Date.now()+800;
    cancelAnimationFrame(drag.raf);
    drag.ghost?.remove();
    drag.marker?.remove();
    drag.row.classList.remove('drag-placeholder');
    drag.zone?.classList.remove('drop-day-active');
    document.body.classList.remove('task-drag-active');
    screen.querySelectorAll('[data-drop-date]').forEach(zone=>zone.classList.remove('drop-day-available'));
    if(drag.row.hasPointerCapture?.(drag.pointerId)) drag.row.releasePointerCapture(drag.pointerId);
}
function updateTaskDrop(drag) {
    const hit=document.elementFromPoint(drag.x,drag.y);
    const inCompleted=hit?.closest('.completed-tasks');
    const zone=inCompleted ? null : hit?.closest('[data-drop-date]');
    const sameList=!inCompleted && hit?.closest('.task-list')===drag.list;
    drag.zone?.classList.remove('drop-day-active');
    drag.zone=zone || null;
    drag.valid=Boolean(zone || sameList);
    drag.zone?.classList.add('drop-day-active');
    drag.marker.remove();
    drag.beforeId=null;
    if(!drag.valid) return;
    const scope=zone || drag.list;
    const rows=openTaskRows(scope).filter(row=>row!==drag.row);
    const before=rows.find(row=>{const rect=row.getBoundingClientRect();return drag.y<rect.top+rect.height/2;});
    drag.beforeId=before ? Number(before.dataset.taskId) : null;
    const list=scope.matches('.task-list')?scope:scope.querySelector('.active-task-list');
    if(before) before.before(drag.marker);
    else if(list) list.append(drag.marker);
    else scope.querySelector('.empty-small').before(drag.marker);
}
function taskDragFrame() {
    const drag=taskDrag;
    if(!drag?.active) return;
    drag.ghost.style.transform='translate3d('+(drag.x-drag.offsetX)+'px,'+(drag.y-drag.offsetY)+'px,0)';
    const edgeSpeed=(position,start,end)=>position<start+48?-Math.ceil((start+48-position)/4):position>end-48?Math.ceil((position-end+48)/4):0;
    if(drag.x>=0 && drag.x<=window.innerWidth && drag.y>=0 && drag.y<=window.innerHeight) {
        const week=screen.querySelector('.week-grid');
        if(week) {
            const rect=week.getBoundingClientRect();
            if(drag.y>=rect.top && drag.y<=rect.bottom) week.scrollLeft+=Math.max(-16,Math.min(16,edgeSpeed(drag.x,Math.max(0,rect.left),Math.min(window.innerWidth,rect.right))));
        }
        window.scrollBy(0,Math.max(-16,Math.min(16,edgeSpeed(drag.y,0,window.innerHeight))));
    }
    updateTaskDrop(drag);
    drag.raf=requestAnimationFrame(taskDragFrame);
}
function startTaskDrag(drag) {
    drag.row.setPointerCapture(drag.pointerId);
    drag.active=true;
    const rect=drag.row.getBoundingClientRect();
    drag.ghost=drag.row.cloneNode(true);
    drag.ghost.removeAttribute('data-task-id');
    drag.ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    drag.ghost.classList.add('task-drag-ghost');
    if(drag.row.closest('.day')) drag.ghost.classList.add('task-drag-compact');
    drag.ghost.style.width=rect.width+'px';
    drag.ghost.style.height=rect.height+'px';
    drag.ghost.setAttribute('aria-hidden','true');
    drag.ghost.inert=true;
    document.body.append(drag.ghost);
    drag.marker=document.createElement('li');
    drag.marker.className='task-insertion-marker';
    drag.marker.setAttribute('aria-hidden','true');
    drag.row.classList.add('drag-placeholder');
    document.body.classList.add('task-drag-active');
    screen.querySelectorAll('[data-drop-date]').forEach(zone=>zone.classList.add('drop-day-available'));
    taskDragFrame();
}
document.addEventListener('pointerdown',event=>{
    if(!taskDrag && event.isPrimary!==false) suppressTaskClickUntil=0;
    const row=event.target.closest('[data-task-id]');
    const control=event.target.closest('button, input, select, textarea, a, [contenteditable]');
    if(!row || row.closest('.completed-tasks') || (control && !control.matches('.task-title')) || mutationPending || taskDrag || event.button!==0 || event.isPrimary===false) return;
    const list=row.closest('.task-list'),rect=row.getBoundingClientRect();
    taskDrag={row,list,pointerId:event.pointerId,pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,active:false,armed:event.pointerType!=='touch',zone:null,valid:false,raf:null};
    const drag=taskDrag;
    if(!drag.armed) drag.holdTimer=setTimeout(()=>{if(taskDrag===drag) drag.armed=true;},450);
    ++refreshSequence;
});
document.addEventListener('pointermove',event=>{
    const drag=taskDrag;
    if(!drag || drag.pointerId!==event.pointerId) return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active) {
        if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6) return;
        if(!drag.armed) {cancelTaskDrag();return;}
        startTaskDrag(drag);
    } else {
        drag.ghost.style.transform='translate3d('+(drag.x-drag.offsetX)+'px,'+(drag.y-drag.offsetY)+'px,0)';
        updateTaskDrop(drag);
    }
    event.preventDefault();
});
// Native page/weekly panning stays available until a deliberate long press.
// Changing touch-action after pointerdown cannot cancel an already-started pan.
document.addEventListener('touchmove',event=>{
    if(taskDrag?.pointerType==='touch' && taskDrag.armed && event.cancelable) event.preventDefault();
},{passive:false});
document.addEventListener('contextmenu',event=>{
    if(taskDrag?.pointerType==='touch' && taskDrag.armed) event.preventDefault();
});
document.addEventListener('pointerup',async event=>{
    if(!taskDrag || taskDrag.pointerId!==event.pointerId) return;
    const drag=taskDrag;
    if(drag.active) {drag.x=event.clientX;drag.y=event.clientY;updateTaskDrop(drag);}
    cancelTaskDrag();
    if(!drag.active || !drag.valid) return;
    try { await persistTaskDrop(drag); }
    catch(error) { showError(error.message); }
});
const cancelPointerDrag=event=>{if(taskDrag?.pointerId===event.pointerId) cancelTaskDrag();};
document.addEventListener('pointercancel',cancelPointerDrag);
document.addEventListener('lostpointercapture',cancelPointerDrag);
window.addEventListener('blur',cancelTaskDrag);
document.addEventListener('keydown',async event=>{
    if(event.key==='Escape' && taskDrag) {cancelTaskDrag();return;}
    const row=event.target?.closest?.('[data-task-id]');
    if(!row || row.closest('.completed-tasks') || event.target!==row || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if(mutationPending || taskDrag) return;
    const ids=listTaskIds(row.closest('.task-list')),id=Number(row.dataset.taskId);
    const target=ids[ids.indexOf(id)+(event.key==='ArrowUp'?-1:1)];
    if(target===undefined) return;
    try {
        await persistTaskOrder(ids,id,target);
        screen.querySelector('[data-task-id="'+id+'"]')?.focus();
    }
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
    navigator.serviceWorker.register('/sw.js?v=11').then(registration => {
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
