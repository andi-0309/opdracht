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
let reviewOffset = 0;
let reviewData = null;
let reviewSequence = 0;
const reviewDrafts = new Map();
const focusDrafts = new Map();
const focusSaveTimers = new Map();
const savingFocus = new Set();
const commentDrafts = new Map();
const postingComments = new Set();
const commentRequests = new WeakMap();
let showCompletedQuests = false;
let selectedTaskId = null;
let editorSave = null;
let editorTarget = null;
let editorReturnFocus = null;
let editorSubmitting = false;
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
    return `<fieldset class="color-palette"><legend>Farbe</legend><div class="color-options">${planningColors.map(choice=>`<label class="color-choice"><input type="radio" name="color" value="${choice.value}" ${choice.value===selected?'checked':''} required><span class="color-option"><span class="color-swatch" style="--choice-color:${choice.value}" aria-hidden="true"></span><span>${choice.name}</span><span class="color-check" aria-hidden="true">✓</span></span></label>`).join('')}</div></fieldset>`;
}
const dateValue = value => value ? String(value).slice(0, 10) : null;
const localDate = value => new Date(`${dateValue(value)}T12:00:00`);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function weekStart(offset) {
    const today = localDate(state.today);
    const daysSinceMonday = (today.getDay() + 6) % 7;
    return addDays(today, offset * 7 - daysSinceMonday);
}

const dayLabel = value => localDate(value).toLocaleDateString('de-DE', {day:'numeric',month:'short'});
const taskQuest = task => state.quests.find(q => q.id === task.quest_id);
const duration = value => {const minutes = Math.floor(Number(value || 0) / 60); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')}`;};
const tag = quest => quest ? `<span class="tag" style="--tag:${color(quest.color)}"><i></i>${escapeHtml(quest.title)}</span>` : '<span class="tag">Ohne Quest</span>';

function inlineMarkdown(text) {
    const pattern=/(`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    let html='', offset=0;
    for(const match of String(text).matchAll(pattern)) {
        html+=escapeHtml(text.slice(offset,match.index));
        const token=match[0];
        if(token.startsWith('`')) html+='<code>'+escapeHtml(token.slice(1,-1))+'</code>';
        else if(token.startsWith('**')) html+='<strong>'+escapeHtml(token.slice(2,-2))+'</strong>';
        else if(token.startsWith('*')) html+='<em>'+escapeHtml(token.slice(1,-1))+'</em>';
        else {
            const link=token.match(/^\[([^\]]+)\]\((.+)\)$/);
            const safe=/^(https?:\/\/|mailto:)/i.test(link[2]);
            html+=safe?`<a href="${escapeHtml(link[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[1])}</a>`:escapeHtml(token);
        }
        offset=match.index+token.length;
    }
    return html+escapeHtml(text.slice(offset));
}
function markdown(value) {
    if(!value) return '';
    const lines=String(value).replace(/\r\n?/g,'\n').split('\n');
    let html='', list=null;
    for(const line of lines) {
        const item=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
        const kind=item?(item[1]?'ul':'ol'):null;
        if(list!==kind) {if(list) html+=`</${list}>`;if(kind) html+=`<${kind}>`;list=kind;}
        html+=item?`<li>${inlineMarkdown(item[2])}</li>`:line.trim()?`<p>${inlineMarkdown(line)}</p>`:'<br>';
    }
    if(list) html+=`</${list}>`;
    return html;
}
async function api(path, method = 'GET', body, options = {}) {
    const response = await fetch(path, {method, credentials:'same-origin', ...options, headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-TOKEN':csrf}, ...(body === undefined ? {} : {body:JSON.stringify(body)})}).catch(() => { throw new Error('Dein Server ist nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.'); });
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
        if(state && !data.focus) {
            const knownIds=new Set(state.tasks.map(task=>task.id));
            if((data.tasks||[]).some(task=>!knownIds.has(task.id)&&!task.completed_at)) selectedTaskId=null;
        }
        state = data;
        if (data.server_now) serverClockOffset = Date.parse(data.server_now) - Date.now();
        state.tasks = data.tasks || [];
        state.quests = data.quests || [];
        state.weekly = data.weekly || {seconds:0, completed:0};
        notice.hidden = true;
        setConnection('Verbunden', false);
        render();
        if(page==='review') await loadReview();
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
function taskRow(task, compact = false, selectable = false) {
    const running = state.focus?.task_id === task.id;
    return `<li class="task ${task.completed_at ? 'done' : ''}" ${selectable ? `data-queue-id="${task.id}" data-action="select-focus-task" data-id="${task.id}"` : `data-task-id="${task.id}"`} ${!selectable && !task.completed_at ? `tabindex="0" aria-label="${escapeHtml(task.title)} verschieben" aria-describedby="reorder-help" aria-keyshortcuts="ArrowUp ArrowDown"` : ''}>${!compact ? `<button class="task-check" role="checkbox" aria-checked="${Boolean(task.completed_at)}" aria-label="${escapeHtml(task.completed_at ? 'Wieder öffnen: ' : 'Erledigen: ')}${escapeHtml(task.title)}" data-action="toggle-task" data-id="${task.id}"><span class="task-check-box">${icon('check')}</span></button>` : ''}<div class="task-body"><button class="task-title" data-action="${selectable ? 'select-focus-task' : 'edit-task'}" data-id="${task.id}" ${selectable ? `aria-pressed="${focusTask()?.id===task.id}"` : ''}>${escapeHtml(task.title)}</button>${compact && task.notes ? `<div class="markdown task-preview">${markdown(task.notes)}</div>` : ''}<div class="task-meta">${selectable?`<span>${!task.scheduled_for?'Ohne Datum':dateValue(task.scheduled_for)===state.today?'Heute':'Morgen'}</span>`:''}${tag(taskQuest(task))}${!compact && task.scheduled_for && dateValue(task.scheduled_for) !== state.today ? `<span>${dayLabel(task.scheduled_for)}</span>` : ''}${task.focus_seconds ? `<span>${duration(task.focus_seconds)}</span>` : ''}</div></div><div class="task-actions">${!compact && !task.completed_at ? `<button class="icon-button" data-action="focus-task" data-id="${task.id}" aria-label="Fokus für ${escapeHtml(task.title)}" title="Fokus">${icon(running ? 'timer' : 'play')}</button>` : ''}</div></li>`;
}
function questOptions(selected) {
    return '<option value="">Ohne Quest</option>'+state.quests.filter(q=>!q.completed_at || q.id===selected).map(q=>`<option value="${q.id}" ${q.id===selected?'selected':''}>${escapeHtml(q.title)}</option>`).join('');
}
function taskSection(title, tasks, emptyText, addDate) {
    return `<section class="section" ${addDate !== undefined ? `data-drop-date="${addDate || ''}"` : ''}><div class="section-heading"><h2>${title}<span class="count">${tasks.length}</span></h2></div>${tasks.length ? `<ul class="task-list active-task-list">${tasks.map(t => taskRow(t)).join('')}</ul>` : `<p class="empty-small">${emptyText}</p>`}</section>`;
}
function completedSection(tasks, compact = false) {
    return tasks.length ? `<details class="section completed-tasks"><summary>Erledigt (${tasks.length})</summary><ul class="task-list">${tasks.map(task=>taskRow(task,compact)).join('')}</ul></details>` : '';
}
function todayScreen() {
    const today = state.tasks.filter(t => dateValue(t.scheduled_for) === state.today && !t.completed_at);
    const overdue = state.tasks.filter(t => t.scheduled_for && dateValue(t.scheduled_for) < state.today && !t.completed_at);
    const inbox = state.tasks.filter(t => !t.scheduled_for && !t.completed_at);
    const completed = state.tasks.filter(t => t.completed_at);
    return header('Heute', '<button class="button primary" data-action="new-task">Aufgabe hinzufügen</button>') + stats() + `<div class="today-tasks">${overdue.length ? taskSection('Überfällig',overdue,'') : ''}${taskSection('Für heute',today,'Keine Aufgaben für heute.',state.today)}${taskSection('Ohne Termin',inbox,'Keine Aufgaben ohne Termin.',null)}${completedSection(completed)}</div>`;
}
function weekDay(date) {
    const key = dateKey(date);
    const dayTasks = state.tasks.filter(task => dateValue(task.scheduled_for) === key);
    const tasks = dayTasks.filter(task => !task.completed_at);
    const completed = dayTasks.filter(task => task.completed_at);
    const taskList = tasks.length
        ? `<ul class="task-list active-task-list">${tasks.map(task => taskRow(task, true)).join('')}</ul>`
        : '<p class="empty-small">Keine Aufgaben.</p>';

    return `<section class="day ${key === state.today ? 'current' : ''}" data-drop-date="${key}">
        <div class="day-heading"><span>${date.toLocaleDateString('de-DE', {weekday:'short'})}</span><strong>${date.getDate()}</strong></div>
        ${taskList}<button class="day-add" data-action="new-task" data-date="${key}">+ Aufgabe</button>${completedSection(completed, true)}
    </section>`;
}

function weekScreen() {
    const start = weekStart(weekOffset);
    const days = Array.from({length: 7}, (_, index) => addDays(start, index));
    const weekLabel = `${dayLabel(dateKey(start))} – ${dayLabel(dateKey(days[6]))}`;
    const navigation = `<div class="week-nav">
        <button class="icon-button" data-action="previous-week" aria-label="Vorherige Woche">${icon('chevron-left')}</button>
        <span class="week-title">${weekLabel}</span>
        <button class="icon-button" data-action="next-week" aria-label="Nächste Woche">${icon('chevron-right')}</button>
        <button class="button small subtle" data-action="current-week">Heute</button>
    </div>`;
    return header('Woche', navigation) + `<div class="week-grid" role="region" aria-label="Wochenplanung, bei Bedarf seitlich scrollen" tabindex="0">${days.map(weekDay).join('')}</div>`;
}
function questsScreen() {
    const quests=state.quests.filter(q=>Boolean(q.completed_at)===showCompletedQuests);
    return header('Quests', '<button class="button primary" data-action="new-quest">+ Neue Quest</button>') + `<div class="tabs" role="group" aria-label="Quests filtern"><button class="${!showCompletedQuests?'active':''}" data-action="active-quests" aria-pressed="${!showCompletedQuests}">Aktiv · ${state.quests.filter(q=>!q.completed_at).length}</button><button class="${showCompletedQuests?'active':''}" data-action="completed-quests" aria-pressed="${showCompletedQuests}">Abgeschlossen · ${state.quests.filter(q=>q.completed_at).length}</button></div>` + (quests.length ? `<div class="quest-grid">${quests.map(q=>{const tasks=state.tasks.filter(t=>t.quest_id===q.id);const done=tasks.filter(t=>t.completed_at).length;return `<article class="quest-card" style="--quest-color:${color(q.color)}"><div class="quest-top"><span class="quest-icon" aria-hidden="true">${icon('target')}</span><div><button class="icon-button" data-action="edit-quest" data-id="${q.id}" aria-label="${escapeHtml(q.title)} bearbeiten">${icon('pencil')}</button></div></div><h2>${escapeHtml(q.title)}</h2>${q.why?`<h3>Warum ist es wichtig?</h3><p>${escapeHtml(q.why)}</p>`:''}${q.description ? `<h3>Worum geht es genau?</h3><p>${escapeHtml(q.description)}</p>` : ''}${q.weekly_minutes?`<div class="weekly-goal"><strong>Wochenziel</strong><span>${duration(state.weekly.quest_seconds?.[q.id]||0)} / ${duration(q.weekly_minutes*60)}</span><progress max="${q.weekly_minutes*60}" value="${Math.min(q.weekly_minutes*60,state.weekly.quest_seconds?.[q.id]||0)}" aria-label="Wochenzeit für ${escapeHtml(q.title)}"></progress></div>`:''}<div class="quest-progress"><span data-progress-id="quest-${q.id}" style="width:${tasks.length?Math.round(done/tasks.length*100):0}%"></span></div><div class="quest-footer"><span>${done} / ${tasks.length} Aufgaben</span><span>${duration(tasks.reduce((sum,t)=>sum+Number(t.focus_seconds||0),0))} Fokus</span></div></article>`;}).join('')}</div>` : `<div class="empty"><div class="empty-symbol">◇</div><h2>${showCompletedQuests?'Keine abgeschlossenen Quests.':'Keine Quests vorhanden.'}</h2>${!showCompletedQuests?'<button class="button primary" data-action="new-quest">Quest erstellen</button>':''}</div>`);
}
function focusQueue() {
    const tomorrow = dateKey(addDays(localDate(state.today), 1));
    const dates = [state.today, null, tomorrow];
    return dates.flatMap(date=>state.tasks.filter(task=>!task.completed_at && dateValue(task.scheduled_for)===date)).slice(0,10);
}
function focusQueuePanel() {
    if(state.focus) return '';
    const tasks=focusQueue();
    return tasks.length ? `<aside class="focus-queue" aria-labelledby="focus-queue-title"><h2 id="focus-queue-title">Nächste Aufgaben</h2><ul class="task-list" tabindex="0" aria-label="Nächste Aufgaben, seitlich scrollen">${tasks.map(task=>taskRow(task,true,true)).join('')}</ul></aside>` : '';
}
function nextTask() {
    const available=state.tasks.filter(task=>!task.completed_at);
    return focusQueue()[0] || available.find(task=>task.scheduled_for && dateValue(task.scheduled_for)<=state.today)
        || available.filter(task=>task.scheduled_for).sort((a,b)=>dateValue(a.scheduled_for).localeCompare(dateValue(b.scheduled_for)))[0]
        || available[0];
}
function focusTask() {
    return state.tasks.find(t=>t.id===state.focus?.task_id) || state.tasks.find(t=>t.id===selectedTaskId && !t.completed_at) || nextTask();
}
function taskComments(taskId, compose = false) {
    return `<section class="task-comments" data-task-comments="${taskId}">
        <h3>Kommentare</h3>
        ${compose ? `<form id="focus-comment-form" data-task="${taskId}">
            <label><span class="sr-only">Kommentar hinzufügen</span><textarea name="body" placeholder="Kommentar hinzufügen …" maxlength="10000" rows="1" required>${escapeHtml(commentDrafts.get(taskId))}</textarea></label>
            <button class="button subtle" type="submit" aria-label="Kommentar speichern" ${postingComments.has(taskId) ? 'disabled' : ''}>Speichern</button>
        </form>` : ''}
        <div data-comment-list aria-live="polite">Kommentare werden geladen …</div>
    </section>`;
}
async function loadTaskComments(section) {
    const list = section.querySelector('[data-comment-list]');
    const request = (commentRequests.get(section) || 0) + 1;
    commentRequests.set(section, request);
    try {
        const {comments} = await api(`/api/tasks/${section.dataset.taskComments}/comments`);
        if (!section.isConnected || commentRequests.get(section) !== request) return;
        list.innerHTML = comments.length ? `<ol class="task-comment-list">${comments.map(comment => {
            const created = new Date(comment.created_at);
            const label = created.toLocaleString('de-DE', {
                day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit',
            });
            return `<li><p>${escapeHtml(comment.body)}</p><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(label)}</time></li>`;
        }).join('')}</ol>` : '<p class="empty-small">Noch keine Kommentare.</p>';
    } catch {
        if (section.isConnected && commentRequests.get(section) === request) list.textContent = 'Kommentare konnten nicht geladen werden.';
    }
}
function focusTaskFields(task) {
    const draft = focusDrafts.get(task.id);
    return `<form id="focus-edit-form" data-task="${task.id}">
        <label><span id="focus-task-title" class="sr-only">Aufgabe</span><input name="title" class="focus-title-input" value="${escapeHtml(draft?.title ?? task.title)}" maxlength="200" required autocomplete="off" enterkeyhint="done"></label>
        <label><span class="sr-only">Beschreibung</span><textarea name="notes" class="focus-notes" placeholder="Beschreibung hinzufügen …" maxlength="10000" rows="2">${escapeHtml(draft?.notes ?? task.notes)}</textarea></label>
        <span class="focus-save-status" role="status"></span>
    </form>${taskComments(task.id, true)}`;
}
function focusPanel() {
    const activeTask=state.tasks.find(t=>t.id===state.focus?.task_id);
    const selected=focusTask();
    const available=state.tasks.filter(t=>!t.completed_at);
    return `<section class="focus-view"><div class="focus-clock"><div data-focus-timer class="timer" role="timer" aria-live="off" aria-label="Verstrichene Fokuszeit">00:00</div><p class="timer-label" role="status">${state.focus?'FOKUS LÄUFT':'BEREIT FÜR FOKUS'}</p><div class="focus-controls">${state.focus?`${activeTask?`<button class="button primary" data-action="finish-focus" data-id="${activeTask.id}">${icon('check')} Aufgabe abschließen</button>`:''}<button class="button subtle" data-action="stop-focus">${icon('square')} Timer stoppen &amp; Zeit speichern</button>`:available.length?`<button class="button primary" data-action="start-focus" ${selected?'':'disabled'}>${icon('play')} Fokus starten</button>`:'<button class="button primary" data-action="new-task">+ Aufgabe erstellen</button>'}</div></div><div class="focus-content">${focusQueuePanel()}<section class="focus-task" data-content-key="${selected?.id||'empty'}" tabindex="0" aria-labelledby="focus-task-title">${selected?`${tag(taskQuest(selected))}${focusTaskFields(selected)}`:'<h2 id="focus-task-title">Keine offenen Aufgaben</h2>'}</section></div></section>`;
}
function focusScreen() {
    return `<section id="focus-workspace" class="focus-workspace"><header class="focus-toolbar"><h1>Fokus</h1></header>${focusPanel()}</section>`;
}
function syncImmersive() {
    // Physical screen size excludes tablets and resized desktop windows.
    const phone = window.matchMedia?.('(pointer: coarse)').matches
        && Math.min(window.screen?.width || 9999, window.screen?.height || 9999) <= 600;
    const orientation = window.screen?.orientation?.type;
    const landscape = orientation ? orientation.startsWith('landscape')
        : typeof window.orientation === 'number' ? Math.abs(window.orientation) === 90
        : window.matchMedia?.('(orientation: landscape)').matches;
    immersive = Boolean(page === 'focus' && phone && landscape);
    document.body.classList.toggle('immersive-open', immersive);
}
window.addEventListener('resize', syncImmersive);
window.addEventListener('orientationchange', syncImmersive);
window.screen?.orientation?.addEventListener?.('change', syncImmersive);
window.matchMedia?.('(orientation: landscape)').addEventListener?.('change', syncImmersive);
function reviewStart() {
    return dateKey(weekStart(reviewOffset));
}
async function loadReview() {
    const sequence=++reviewSequence, week=reviewStart();
    try {
        const data=await api('/api/review?week='+week);
        if(sequence!==reviewSequence || reviewStart()!==week) return;
        reviewData=data;
        if(page==='review') render();
    } catch(error) {if(sequence===reviewSequence) showError(error.message);}
}
function sessionDays(sessions, start) {
    return Array.from({length:7},(_,i)=>{
        const date=localDate(start);date.setDate(date.getDate()+i);const key=dateKey(date);
        const from=new Date(key+'T00:00:00'),to=new Date(from);to.setDate(to.getDate()+1);
        const entries=sessions.flatMap(session=>{
            const a=new Date(Math.max(Date.parse(session.started_at),from.getTime())), b=new Date(Math.min(Date.parse(session.ended_at),to.getTime()));
            return b>a?[{...session,from:a,to:b,seconds:Math.round((b-a)/1000)}]:[];
        });
        return {key,date,entries};
    });
}
function logCalendar(days) {
    const entries=days.flatMap(day=>day.entries);
    const startHour=Math.min(8,...entries.map(entry=>entry.from.getHours()));
    const endHour=Math.max(18,...entries.map(entry=>entry.to.getHours()===0?24:Math.ceil(entry.to.getHours()+entry.to.getMinutes()/60)));
    const height=(endHour-startHour)*60;
    return `<div class="log-calendar" role="region" aria-label="Zeitkalender der gebuchten Fokuszeiten" tabindex="0"><div class="log-axis"><div class="log-heading">Uhrzeit</div><div class="log-hours" style="height:${height}px">${Array.from({length:endHour-startHour+1},(_,i)=>`<time style="top:${i*60}px">${String(startHour+i).padStart(2,'0')}:00</time>`).join('')}</div></div>${days.map(day=>{
        const lanes=[];let count=1;
        const positioned=day.entries.map(entry=>{
            let lane=lanes.findIndex(end=>end<=entry.from);if(lane<0)lane=lanes.length;
            lanes[lane]=entry.to;count=Math.max(count,lanes.length);
            return {...entry,lane};
        });
        return `<section class="log-day"><div class="log-heading"><h3>${day.date.toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'})}</h3><strong>${duration(day.entries.reduce((sum,s)=>sum+s.seconds,0))}</strong></div><div class="log-timeline" style="height:${height}px">${positioned.map(entry=>{
            const top=(entry.from.getHours()-startHour)*60+entry.from.getMinutes();
            const label=entry.from.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'–'+entry.to.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
            const info=label+' · '+entry.title+' · '+(entry.quest_title||'Ohne Quest')+' · '+duration(entry.seconds);
            const style = `--quest-color:${color(entry.quest_color)};top:${top}px;height:${Math.max(18,entry.seconds/60-2)}px;left:${entry.lane/count*100}%;width:${100/count}%`;
            const content = `<time>${label}</time><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.quest_title||'Ohne Quest')} · ${duration(entry.seconds)}</span>`;
            if (state.tasks.some(task => task.id === entry.task_id)) {
                return `<button type="button" class="log-entry" data-action="edit-task" data-id="${entry.task_id}" data-session-id="${entry.id}" title="${escapeHtml(info)}" aria-label="${escapeHtml(info+' – Aufgabe öffnen')}" style="${style}">${content}</button>`;
            }
            return `<article class="log-entry" tabindex="0" title="${escapeHtml(info)}" aria-label="${escapeHtml(info)}" style="${style}">${content}</article>`;
        }).join('')}</div></section>`;
    }).join('')}</div>`;
}
function reviewScreen() {
    const start = reviewStart();
    const date = localDate(start);
    const end = addDays(date, 6);
    const navigation=`<div class="week-nav"><button class="icon-button" data-action="previous-review" aria-label="Vorherige Woche">${icon('chevron-left')}</button><span>${dayLabel(start)} – ${dayLabel(dateKey(end))}</span><button class="icon-button" data-action="next-review" aria-label="Nächste Woche">${icon('chevron-right')}</button><button class="button small subtle" data-action="current-review">Diese Woche</button></div>`;
    if(!reviewData || reviewData.week_start!==start) return header('Rückblick',navigation)+'<p role="status">Arbeitslogbuch wird geladen …</p>';
    const days=sessionDays(reviewData.sessions,start);
    const questTotals=new Map();reviewData.sessions.forEach(session=>{if(session.quest_id)questTotals.set(session.quest_id,(questTotals.get(session.quest_id)||0)+session.seconds);});
    const notes=reviewDrafts.has(start)?reviewDrafts.get(start):reviewData.review;
    return header('Rückblick',navigation)+`<div class="stats-strip"><div class="stat"><span class="stat-label">Gesamte Fokuszeit</span><span class="stat-value">${duration(reviewData.seconds)}</span></div><div class="stat"><span class="stat-label">Davon Quest-Zeit</span><span class="stat-value">${duration(reviewData.quest_seconds)}</span></div></div><section class="review-panel"><h2>Arbeitslogbuch</h2>${logCalendar(days)}</section><section class="review-panel"><h2>Aktuelle Wochenziele</h2>${state.quests.filter(q=>q.weekly_minutes&&!q.completed_at).map(q=>`<div class="review-row">${tag(q)}<strong>${duration(questTotals.get(q.id)||0)} / ${duration(q.weekly_minutes*60)}</strong></div><progress class="goal-progress" max="${q.weekly_minutes*60}" value="${Math.min(q.weekly_minutes*60,questTotals.get(q.id)||0)}" aria-label="Wochenzeit ${escapeHtml(q.title)}"></progress>`).join('')||'<p class="empty-small">Keine Wochenziele.</p>'}</section><section class="review-panel"><h2>Wochenreview</h2><form id="weekly-review-form" data-week="${start}"><label>Notizen zur Woche<textarea name="notes" maxlength="20000" rows="8" placeholder="Was lief gut? Was möchtest du nächste Woche ändern?">${escapeHtml(notes)}</textarea></label><button class="button primary" type="submit">Review speichern</button><p id="review-save-status" role="status"></p></form></section>`;
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
    const previousContent=screen.querySelector('.focus-task');
    const contentPosition=previousContent ? {key:previousContent.dataset.contentKey,top:screen.querySelector('.focus-content')?.scrollTop || 0,focused:focused===previousContent} : null;
    const focusedAction=focused?.dataset.action;
    const activeForm=focused?.closest('form');
    const focusField=activeForm?.dataset.task && focused.matches('input, textarea') ? {
        form:activeForm.id, task:activeForm.dataset.task, name:focused.name,
        start:focused.selectionStart, end:focused.selectionEnd,
    } : null;
    const previousQueue=screen.querySelector('.focus-queue .task-list');
    const queueScroll=previousQueue?.scrollLeft || 0;
    const previousProgress=new Map(Array.from(screen.querySelectorAll('[data-progress-id]'),bar=>[bar.dataset.progressId,bar.style.width]));
    cancelTaskDrag();
    document.body.classList.toggle('focus-page',page==='focus');
    const pageKey=page+':'+(page==='week'?weekOffset:page==='review'?reviewOffset:page==='quests'?showCompletedQuests:'');
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
    syncImmersive();
    if(focusedAction) {
        const scope=screen;
        const target=Array.from(scope.querySelectorAll('button[data-action]')).find(button=>button.dataset.action===focusedAction && button.dataset.id===focused.dataset.id && button.dataset.sessionId===focused.dataset.sessionId);
        target?.focus({preventScroll:true});

    }
    const currentQueue=screen.querySelector('.focus-queue .task-list');
    if(!pageChanged && currentQueue) currentQueue.scrollLeft=queueScroll;
    const currentContent=screen.querySelector('.focus-task');
    if(!pageChanged && currentContent && contentPosition?.key===currentContent.dataset.contentKey) {
        const currentScroller=screen.querySelector('.focus-content');
        if(currentScroller) currentScroller.scrollTop=contentPosition.top;
        if(contentPosition.focused) currentContent.focus({preventScroll:true});
        if (focusField) {
            const form = currentContent.querySelector('#'+focusField.form);
            const field = form?.dataset.task === focusField.task ? form.elements[focusField.name] : null;
            field?.focus({preventScroll:true});
            field?.setSelectionRange(focusField.start, focusField.end);
        }
    }
    screen.querySelectorAll('[data-task-comments]').forEach(loadTaskComments);
    updateTimer();
}
function updateTimer() {
    const timers=document.querySelectorAll('[data-focus-timer]');
    if(!timers.length) return;
    const elapsed=state?.focus ? Math.max(0,Math.floor((Date.now()+serverClockOffset-Date.parse(state.focus.started_at))/1000)) : 0;
    const hours=Math.floor(elapsed/3600);
    timers.forEach(timer=>timer.textContent=(hours?`${String(hours).padStart(2,'0')}:`:'')+`${String(Math.floor(elapsed/60)%60).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`);
}
function openEditor(title, fields, onSave, secondaryAction = '') {
    document.querySelector('#editor-title').textContent=title;
    document.querySelector('#editor-fields').innerHTML=fields;
    document.querySelector('#editor-secondary-action').innerHTML=secondaryAction;
    document.querySelector('#editor-error').hidden=true;
    editorReturnFocus=document.activeElement;
    editorForm.querySelector('.dialog-actions [type="submit"]').textContent='Speichern';
    editorSave=onSave;editor.showModal();
    document.querySelector('#editor-fields').querySelector('[autofocus]')?.focus();
}
function taskEditor(task, date=state.today) {
    editorTarget=task?{type:'task',id:task.id}:null;
    const fields = `
        <label>Aufgabe<input name="title" value="${escapeHtml(task?.title)}" maxlength="200" required autofocus autocomplete="off" enterkeyhint="done"></label>
        <label>Beschreibung<textarea name="notes" maxlength="10000" rows="4">${escapeHtml(task?.notes)}</textarea></label>
        <div class="form-row">
            <label>Quest<select name="quest_id">${questOptions(task?.quest_id)}</select></label>
            <label>Tag<input type="date" name="scheduled_for" value="${escapeHtml(dateValue(task?task.scheduled_for:date))}"></label>
        </div>`;
    const status = task ? `
        <div class="task-editor-status">
            <label class="check-label"><input type="checkbox" name="completed" ${task.completed_at?'checked':''}> Aufgabe abgeschlossen</label>
            ${task.completed_at ? '' : `<button type="submit" class="button subtle" name="intent" value="focus" aria-label="Aufgabe speichern und Fokus starten">${icon('play')} Fokus starten</button>`}
        </div>` : '';
    const deleteAction = task ? `<button type="button" class="icon-button editor-delete" data-action="delete-task" data-id="${task.id}" aria-label="Aufgabe löschen" title="Aufgabe löschen">${icon('trash')}</button>` : '';

    openEditor(task?'Aufgabe bearbeiten':'Aufgabe hinzufügen', fields+status+(task ? taskComments(task.id) : ''), async data=>{
        if(!task && !state.focus) selectedTaskId=null;
        await mutate(task?`/api/tasks/${task.id}`:'/api/tasks',task?'PATCH':'POST',{
            title:data.get('title').trim(),
            notes:data.get('notes'),
            scheduled_for:data.get('scheduled_for')||null,
            quest_id:data.get('quest_id')?Number(data.get('quest_id')):null,
            ...(task?{completed:data.has('completed')}:{})
        });
    }, deleteAction);
    if(!task) editorForm.querySelector('.dialog-actions [type="submit"]').textContent='Aufgabe hinzufügen';
    editorForm.querySelectorAll('[data-task-comments]').forEach(loadTaskComments);
}
function questEditor(quest) {
    editorTarget=quest?{type:'quest',id:quest.id}:null;
    openEditor(quest?'Quest bearbeiten':'Neue Quest',`<label>Titel<input name="title" value="${escapeHtml(quest?.title)}" maxlength="200" required autofocus></label><label>Warum ist es wichtig?<textarea name="why" maxlength="10000">${escapeHtml(quest?.why)}</textarea></label><label>Worum geht es genau?<textarea name="description" maxlength="10000">${escapeHtml(quest?.description)}</textarea></label><label>Wochenziel in Stunden (optional)<input type="number" name="weekly_hours" min="0.0167" max="168" step="any" value="${quest?.weekly_minutes?quest.weekly_minutes/60:''}" placeholder="z. B. 4"></label>${colorChoices(quest?.color)}${quest?`<label class="check-label"><input type="checkbox" name="completed" ${quest.completed_at?'checked':''}> Quest abgeschlossen</label><button type="button" class="text-button" data-action="delete-quest" data-id="${quest.id}">Quest löschen</button>`:''}`,async data=>{await mutate(quest?`/api/quests/${quest.id}`:'/api/quests',quest?'PATCH':'POST',{title:data.get('title'),description:data.get('description'),why:data.get('why'),weekly_minutes:data.get('weekly_hours')?Math.round(Number(data.get('weekly_hours'))*60):null,color:data.get('color'),...(quest?{completed:data.has('completed')}:{})});});
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
    if(event.target.closest('[data-close]')){if(!editorSubmitting)editor.close();return;}
    const button=event.target.closest('[data-action]');if(!button) return;
    const action=button.dataset.action,id=Number(button.dataset.id);
    const task=state?.tasks.find(t=>t.id===id),quest=state?.quests.find(q=>q.id===id);
    try {
        if(action==='retry') return await refresh();
        if(!state) return;
        if(action==='new-task') return taskEditor(null,button.dataset.date||state.today);
        if(action==='edit-task'&&task) return taskEditor(task);
        if(action==='new-quest') return questEditor(null);
        if(action==='edit-quest'&&quest) return questEditor(quest);
        if(['previous-review','next-review','current-review'].includes(action)){reviewOffset=action==='current-review'?0:reviewOffset+(action==='previous-review'?-1:1);render();return await loadReview();}
        if(action==='previous-week'){weekOffset--;return render();}
        if(action==='next-week'){weekOffset++;return render();}
        if(action==='current-week'){weekOffset=0;return render();}
        if(action==='active-quests'||action==='completed-quests'){showCompletedQuests=action==='completed-quests';return render();}
        if(action==='select-focus-task'&&task&&!task.completed_at){
            if(event.target.closest('a')) return;
            if(state.focus && state.focus.task_id!==id) return taskEditor(task);
            selectedTaskId=id;return render();
        }
        if(action==='focus-task'){selectedTaskId=id;location.hash='focus';return render();}
        button.disabled=true;
        if(action==='toggle-task'&&task) await mutate(`/api/tasks/${id}`,'PATCH',{completed:!task.completed_at});
        if(action==='delete-task'&&task&&editorAllowsDelete(button,'task',id)&&await confirmDelete(`„${task.title}“ wird dauerhaft gelöscht. Kommentare werden ebenfalls gelöscht. Gespeicherte Fokuszeiten bleiben im Rückblick erhalten.`)){await mutate(`/api/tasks/${id}`,'DELETE');editor.close();}
        if(action==='delete-quest'&&quest&&editorAllowsDelete(button,'quest',id)&&await confirmDelete(`„${quest.title}“ löschen? Die Aufgaben bleiben erhalten und werden keiner Quest mehr zugeordnet.`)){await mutate(`/api/quests/${id}`,'DELETE');editor.close();}
        if(action==='start-focus'&&focusTask()) await mutate('/api/focus','POST',{task_id:focusTask().id});
        if(action==='stop-focus'&&state.focus) await mutate('/api/focus/stop','POST',{session_id:state.focus.id});
        if(action==='finish-focus'&&state.focus){await mutate(`/api/tasks/${id}`,'PATCH',{completed:true});selectedTaskId=null;render();}
    } catch(error) { showError(error.message); }
    finally { button.disabled=false; }
});
// Replace only this list's slots so hidden tasks and other days stay in place.
function replaceTaskSlots(allIds, visibleIds, reorderedIds) {
    const visible = new Set(visibleIds);
    let index = 0;
    return allIds.map(id => visible.has(id) ? reorderedIds[index++] : id);
}

function reorderedTaskIds(allIds, visibleIds, movedId, targetId) {
    if (movedId===targetId || !visibleIds.includes(movedId) || !visibleIds.includes(targetId)) return allIds.slice();
    const reordered=visibleIds.slice();
    reordered.splice(reordered.indexOf(movedId),1);
    reordered.splice(visibleIds.indexOf(targetId),0,movedId);
    return replaceTaskSlots(allIds, visibleIds, reordered);
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
        orderedIds = replaceTaskSlots(allIds, destinationIds, visible);
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
function scheduleFocusSave(taskId) {
    clearTimeout(focusSaveTimers.get(taskId));
    focusSaveTimers.set(taskId, setTimeout(() => saveFocusTask(taskId), 600));
}
function updateFocusDraft(form, field) {
    const taskId = Number(form.dataset.task);
    const draft = focusDrafts.get(taskId) || {};
    draft[field.name] = field.value;
    focusDrafts.set(taskId, draft);
    form.querySelector('.focus-save-status').textContent = '';
    scheduleFocusSave(taskId);
}
function setFocusSaveStatus(taskId, message) {
    const form = screen.querySelector('#focus-edit-form');
    if (Number(form?.dataset.task) === taskId) form.querySelector('.focus-save-status').textContent = message;
}
async function saveFocusTask(taskId) {
    clearTimeout(focusSaveTimers.get(taskId));
    focusSaveTimers.delete(taskId);
    if (savingFocus.has(taskId)) return;

    const draft = focusDrafts.get(taskId);
    const task = state.tasks.find(item => item.id === taskId);
    if (!draft || !task) return;
    const patch = {};
    const submitted = {};
    for (const [field, value] of Object.entries(draft)) {
        const trimmed = value.trim();
        if (field === 'title' && !trimmed) continue;
        if (trimmed === (task[field] ?? '')) {
            delete draft[field];
        } else {
            patch[field] = trimmed || null;
            submitted[field] = value;
        }
    }
    const titleMessage = draft.title !== undefined && !draft.title.trim() ? 'Der Aufgabentitel darf nicht leer sein.' : '';
    setFocusSaveStatus(taskId, titleMessage);
    if (!Object.keys(draft).length) focusDrafts.delete(taskId);
    if (!Object.keys(patch).length) return;

    savingFocus.add(taskId);
    try {
        await api(`/api/tasks/${taskId}`, 'PATCH', patch, {keepalive:true});
        if (!mutationPending) ++refreshSequence;
        Object.assign(state.tasks.find(item => item.id === taskId) || task, patch);
        for (const [field, value] of Object.entries(submitted)) {
            if (draft[field] === value) delete draft[field];
        }
        if (!Object.keys(draft).length) focusDrafts.delete(taskId);
        else if (!focusSaveTimers.has(taskId) && (draft.notes !== undefined || draft.title?.trim())) scheduleFocusSave(taskId);
    } catch (error) {
        setFocusSaveStatus(taskId, 'Nicht gespeichert. ' + error.message);
        if (Number(screen.querySelector('#focus-edit-form')?.dataset.task) !== taskId) showError(error.message);
    } finally {
        savingFocus.delete(taskId);
    }
}
function flushFocusDrafts() {
    for (const taskId of focusDrafts.keys()) saveFocusTask(taskId);
}
async function postFocusComment(form) {
    const taskId = Number(form.dataset.task);
    const field = form.elements.body;
    const original = field.value;
    const body = original.trim();
    if (postingComments.has(taskId)) return;
    if (!body) {
        field.setCustomValidity('Schreibe einen Kommentar.');
        field.reportValidity();
        return;
    }
    postingComments.add(taskId);
    form.querySelector('button').disabled = true;
    try {
        await api(`/api/tasks/${taskId}/comments`, 'POST', {body});
        if (commentDrafts.get(taskId) === original) commentDrafts.delete(taskId);
        const current = screen.querySelector('#focus-comment-form');
        if (Number(current?.dataset.task) === taskId && current.elements.body.value === original) {
            current.elements.body.value = '';
        }
        document.querySelectorAll(`[data-task-comments="${taskId}"]`).forEach(loadTaskComments);
    } catch (error) {
        showError(error.message);
    } finally {
        postingComments.delete(taskId);
        const current = screen.querySelector('#focus-comment-form');
        if (Number(current?.dataset.task) === taskId) current.querySelector('button').disabled = false;
    }
}
document.addEventListener('input',event=>{
    const focusForm = event.target.closest('#focus-edit-form');
    if (focusForm) {
        if (!event.isComposing) updateFocusDraft(focusForm, event.target);
        return;
    }
    const commentForm = event.target.closest('#focus-comment-form');
    if (commentForm) {
        event.target.setCustomValidity('');
        commentDrafts.set(Number(commentForm.dataset.task), event.target.value);
        return;
    }
    const form=event.target.closest('#weekly-review-form');
    if(form) {reviewDrafts.set(form.dataset.week,form.elements.notes.value);const status=document.querySelector('#review-save-status');if(status) status.textContent='Ungespeicherter Entwurf';}
});
document.addEventListener('compositionend', event => {
    const form = event.target.closest('#focus-edit-form');
    if (form) updateFocusDraft(form, event.target);
});
document.addEventListener('focusout', event => {
    const form = event.target.closest('#focus-edit-form');
    if (form) saveFocusTask(Number(form.dataset.task));
});
document.addEventListener('submit',async event=>{
    if (event.target.id === 'focus-edit-form') {
        event.preventDefault();
        return await saveFocusTask(Number(event.target.dataset.task));
    }
    if (event.target.id === 'focus-comment-form') {
        event.preventDefault();
        return await postFocusComment(event.target);
    }
    const form=event.target.closest('#weekly-review-form');if(!form)return;
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    const week=form.dataset.week,notes=form.elements.notes.value;
    try {await api('/api/review','PUT',{week,notes});reviewDrafts.delete(week);if(reviewData?.week_start===week)reviewData.review=notes;form.querySelector('#review-save-status').textContent='Review gespeichert.';}
    catch(error) {showError(error.message);}
    finally {button.disabled=false;}
});
editor.addEventListener('close',()=>{
    editorTarget=null;editorSave=null;
    if(editorReturnFocus?.isConnected) editorReturnFocus.focus();
    else {
        const trigger=editorReturnFocus?.dataset;
        const replacement=trigger?.action ? Array.from(screen.querySelectorAll('[data-action]')).find(button=>button.dataset.action===trigger.action && button.dataset.id===trigger.id && button.dataset.date===trigger.date && button.dataset.sessionId===trigger.sessionId) : null;
        (replacement || document.querySelector('#content'))?.focus();
    }
});
editor.addEventListener('cancel',event=>{if(editorSubmitting)event.preventDefault();});
editorForm.addEventListener('keydown',event=>{
    if(event.key==='Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
        event.preventDefault();if(!editorSubmitting)editorForm.requestSubmit();
    } else if(event.key==='Enter' && event.target?.matches('input:not([type="checkbox"]):not([type="radio"])') && !event.isComposing) {
        event.preventDefault();if(!editorSubmitting)editorForm.requestSubmit();
    }
});
editorForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!editorSave || editorSubmitting)return;
    const title=editorForm.querySelector('[name="title"]');
    if(title && !title.value.trim()){title.value='';title.reportValidity();return;}
    editorSubmitting=true;editorForm.setAttribute('aria-busy','true');
    const buttons=Array.from(editorForm.querySelectorAll('button'));
    buttons.forEach(button=>button.disabled=true);
    try {
        const data=new FormData(editorForm);
        const startTask=event.submitter?.value==='focus' && editorTarget?.type==='task' ? editorTarget.id : null;
        if(startTask && data.has('completed')) throw new Error('Öffne die Aufgabe wieder, bevor du den Fokus startest.');
        await editorSave(data);
        if(startTask) {
            await mutate('/api/focus','POST',{task_id:startTask});
            selectedTaskId=startTask;location.hash='focus';render();
        }
        editor.close();
    }
    catch(error){const output=document.querySelector('#editor-error');output.textContent=error.message;output.hidden=false;output.focus();}
    finally{editorSubmitting=false;editorForm.removeAttribute('aria-busy');buttons.forEach(button=>button.disabled=false);}
});
function setConnection(label, unavailable) { document.querySelector('.connection').classList.toggle('offline', unavailable); document.querySelector('#connection-text').textContent=label; }
function connectionChanged(){const online=navigator.onLine;setConnection(online?'Verbinde …':'Offline',!online);if(!online)showError('Du bist offline. Angezeigte Daten können veraltet sein. Änderungen benötigen eine Verbindung.');else if(state)refresh();}
window.addEventListener('online', () => { connectionChanged(); flushFocusDrafts(); });window.addEventListener('offline',connectionChanged);
window.addEventListener('hashchange',()=>{render();if(page==='review'&&state)loadReview();window.scrollTo(0,0);});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushFocusDrafts();
    else if (!editor.open && !confirmDialog.open && !document.activeElement?.matches('input, textarea, select')) refresh(true);
});
window.addEventListener('pagehide', flushFocusDrafts);
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
    navigator.serviceWorker.register('/sw.js?v=27').then(registration => {
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
