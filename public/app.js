'use strict';

const state = {
  token: localStorage.getItem('orbit_token') || '',
  user: null,
  presence: null,
  settings: null,
  notifications: [],
  activity: [],
  sessions: [],
  unreadNotificationCount: 0,
  organizations: [],
  workspaceAccess: null,
  onboardingDeferred: localStorage.getItem('orbit_onboarding_deferred') === '1',
  organizationId: Number(localStorage.getItem('orbit_organization_id')) || null,
  organization: null,
  members: [],
  invitations: [],
  myInvitations: [],
  projects: [],
  projectId: Number(localStorage.getItem('orbit_project_id')) || null,
  project: null,
  tasks: [],
  risks: [],
  decisions: [],
  changes: [],
  suggestions: [],
  report: null,
  channels: [],
  channelId: Number(localStorage.getItem('orbit_channel_id')) || null,
  messages: [],
  memberSearch: '',
  memberDepartment: 'all',
  memberPresence: 'all',
  aiStatus: { enabled: false, provider: 'local_fallback', model: 'local-rule-engine', mode: 'local_fallback' },
  view: 'chat'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const authScreen = $('#authScreen');
const setupScreen = $('#setupScreen');
const appShell = $('#appShell');
const mainContent = $('#mainContent');
const organizationSelect = $('#organizationSelect');
const mobileOrganizationSelect = $('#mobileOrganizationSelect');
const projectSelect = $('#projectSelect');
const presenceSelect = $('#presenceSelect');
const mobileNavToggle = $('#mobileNavToggle');
const sidebarBackdrop = $('#sidebarBackdrop');
let heartbeatTimer = null;
let activeRequests = 0;
let lastDialogTrigger = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const badge = value => `<span class="badge ${escapeHtml(value)}">${escapeHtml(String(value || '').replaceAll('_', ' '))}</span>`;
const initials = name => String(name || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const presenceLabel = status => ({ online: 'Online', away: 'Away', dnd: 'Do not disturb', offline: 'Offline' }[status] || 'Offline');
const statusPresets = {
  available: { label: 'Available', emoji: '🟢' }, busy: { label: 'Busy', emoji: '🔴' },
  on_leave: { label: 'On Leave', emoji: '🏖️' }, remote: { label: 'Remote', emoji: '🏠' },
  in_meeting: { label: 'In a Meeting', emoji: '🟡' }, focus: { label: 'Focus Time', emoji: '🎯' },
  travelling: { label: 'Travelling', emoji: '✈️' }, custom: { label: 'Custom', emoji: '💬' }
};
const roleIsManager = role => ['ceo', 'admin', 'moderator'].includes(role);
const roleCanApproveMembers = role => ['ceo', 'admin'].includes(role);
const currentRole = () => state.organization?.membership?.role || '';
const canManage = () => roleIsManager(currentRole());

function resolvedTheme(preference) {
  if (preference === 'dark' || preference === 'light') return preference;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>',
  atSign: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
  history: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
};

function updateThemeToggleButtons() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const nextLabel = current === 'dark' ? 'Light' : 'Dark';
  const nextIcon = current === 'dark' ? ICONS.sun : ICONS.moon;
  $$('[data-theme-toggle]').forEach(button => {
    button.innerHTML = `${nextIcon} <span>${nextLabel}</span>`;
    button.setAttribute('aria-label', `Switch to ${nextLabel.toLowerCase()} mode`);
    button.setAttribute('title', `Switch to ${nextLabel.toLowerCase()} mode`);
  });
}

function applyTheme(preference = 'light') {
  const safePreference = resolvedTheme(preference);
  localStorage.setItem('orbit_theme', safePreference);
  document.documentElement.dataset.themePreference = safePreference;
  document.documentElement.dataset.theme = safePreference;
  updateThemeToggleButtons();
}

async function toggleTheme() {
  const previous = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = previous === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  state.settings = { ...(state.settings || {}), theme: next };
  if (!state.token) return;
  try {
    state.settings = await api('/api/users/me/settings', { method: 'PATCH', body: JSON.stringify({ theme: next }) });
  } catch (error) {
    applyTheme(previous);
    state.settings = { ...(state.settings || {}), theme: previous };
    toast(error.message, true);
  }
}

function statusMarkup(person, compact = false) {
  const key = person?.status_key || 'available';
  const preset = statusPresets[key] || statusPresets.available;
  const emoji = person?.status_emoji || preset.emoji;
  const label = person?.status_label || preset.label;
  return `<span class="workspace-status ${escapeHtml(key)} ${compact ? 'compact' : ''}" title="${escapeHtml(person?.custom_status || label)}"><span>${escapeHtml(emoji)}</span>${compact ? '' : `<b>${escapeHtml(label)}</b>`}</span>`;
}

function memberForUser(userId) {
  return state.members.find(member => Number(member.user_id) === Number(userId));
}

function notificationIcon(type) {
  return ({ invitation: ICONS.mail, mention: ICONS.atSign, activity: ICONS.history, workspace: ICONS.bell }[type] || ICONS.bell);
}

function personNameWithStatus(userId, fallbackName) {
  const member = memberForUser(userId);
  return `<span class="name-with-inline-status"><span>${escapeHtml(fallbackName || 'Unassigned')}</span>${member ? statusMarkup(member, true) : ''}</span>`;
}

function avatarMarkup(person, className = '') {
  const image = person?.avatar_url ? `<img src="${escapeHtml(person.avatar_url)}" alt="" loading="lazy">` : '';
  return `<div class="avatar member-avatar ${escapeHtml(className)}">${image}<span>${escapeHtml(initials(person?.full_name))}</span><i class="presence-dot ${escapeHtml(person?.current_status || 'offline')}" aria-label="${escapeHtml(presenceLabel(person?.current_status))}"></i></div>`;
}

function relativeTime(value) {
  if (!value) return 'Never active';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return String(value);
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Active just now';
  if (seconds < 3600) return `Active ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Active ${Math.floor(seconds / 3600)}h ago`;
  return `Active ${Math.floor(seconds / 86400)}d ago`;
}

function sessionDevice(userAgent = '') {
  const value = String(userAgent);
  const browser = /Edg\//.test(value) ? 'Microsoft Edge' : /Chrome\//.test(value) ? 'Chrome' : /Firefox\//.test(value) ? 'Firefox' : /Safari\//.test(value) ? 'Safari' : 'Browser';
  const platform = /Windows/i.test(value) ? 'Windows' : /Android/i.test(value) ? 'Android' : /iPhone|iPad/i.test(value) ? 'iOS' : /Mac OS/i.test(value) ? 'macOS' : /Linux/i.test(value) ? 'Linux' : 'Unknown device';
  return `${browser} on ${platform}`;
}

function announce(message) {
  const element = $('#appStatus');
  if (!element) return;
  element.textContent = '';
  requestAnimationFrame(() => { element.textContent = message; });
}

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', isError);
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.classList.add('show');
  announce(message);
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 4500);
}

function setGlobalLoading(isLoading) {
  activeRequests = Math.max(0, activeRequests + (isLoading ? 1 : -1));
  const loading = activeRequests > 0;
  const element = $('#globalLoading');
  if (!element) return;
  element.classList.toggle('active', loading);
  element.setAttribute('aria-hidden', String(!loading));
}

function setWorkspaceBusy(isBusy, message = 'Loading workspace…') {
  mainContent.setAttribute('aria-busy', String(Boolean(isBusy)));
  if (isBusy && !mainContent.children.length) {
    mainContent.innerHTML = `<div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span><strong>${escapeHtml(message)}</strong><span>Please wait while Orbit prepares your workspace.</span></div>`;
  }
}

function setButtonBusy(button, busy, label = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.previousLabel = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.previousLabel) button.innerHTML = button.dataset.previousLabel;
    delete button.dataset.previousLabel;
  }
}

function updateNetworkStatus() {
  const offline = !navigator.onLine;
  $('#networkBanner')?.classList.toggle('hidden', !offline);
  document.body.classList.toggle('is-offline', offline);
  if (offline) announce('You are offline.');
}

function toggleMobileNavigation(open) {
  const shouldOpen = open ?? !document.body.classList.contains('mobile-nav-open');
  document.body.classList.toggle('mobile-nav-open', shouldOpen);
  mobileNavToggle?.setAttribute('aria-expanded', String(shouldOpen));
  mobileNavToggle?.setAttribute('aria-label', shouldOpen ? 'Close navigation' : 'Open navigation');
  sidebarBackdrop?.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) $('#mainNav button.active')?.focus();
}

function closeDialog(overlay) {
  if (!overlay) return;
  overlay.remove();
  if (!document.querySelector('.dialog-backdrop')) document.body.classList.remove('dialog-open');
  lastDialogTrigger?.focus?.();
  lastDialogTrigger = null;
}

function mountDialog(overlay, titleId) {
  lastDialogTrigger = document.activeElement;
  overlay.setAttribute('role', 'presentation');
  const dialog = overlay.querySelector('.dialog-card');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (titleId) dialog.setAttribute('aria-labelledby', titleId);
  document.body.appendChild(overlay);
  document.body.classList.add('dialog-open');
  const focusable = () => [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')];
  requestAnimationFrame(() => { enhanceAiFields(dialog); (dialog.querySelector('[autofocus]') || focusable()[0])?.focus(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(overlay); return; }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

const aiFieldNames = new Set(['name','objective','scope','constraints','assumptions','brief','notes','title','description','acceptance_criteria','body','topic','phase','custom_status','status_label','proposed_department']);
let aiFieldCounter = 0;

function enhanceAiFields(root = document) {
  root.querySelectorAll('input[name], textarea[name]').forEach(field => {
    if (field.dataset.aiEnhanced === '1' || field.disabled || field.readOnly || !aiFieldNames.has(field.name)) return;
    if (['password','email','url','number','date','hidden'].includes(field.type)) return;
    field.dataset.aiEnhanced = '1';
    if (!field.id) field.id = `ai-field-${++aiFieldCounter}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-assist-button';
    button.dataset.action = 'ai-assist-field';
    button.dataset.targetId = field.id;
    button.innerHTML = '✨ AI Suggest';
    button.title = 'Generate an editable AI suggestion for this field';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      setButtonBusy(button, true, 'Thinking…');
      try {
        await openAiSuggestionDialog(field);
      } catch (error) {
        toast(error.message, true);
      } finally {
        setButtonBusy(button, false);
      }
    });
    field.insertAdjacentElement('afterend', button);
  });
}

function fieldLabel(field) {
  const label = field.closest('label');
  if (!label) return field.name || 'Field';
  return [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean).join(' ') || field.name || 'Field';
}

function formContextFor(field) {
  const form = field.closest('form');
  if (!form) return {};
  const context = {};
  for (const [key, value] of new FormData(form).entries()) if (typeof value === 'string' && key !== 'password') context[key] = value;
  return context;
}

async function requestAiSuggestion(field, instruction = '') {
  return api('/api/ai/suggest', { method: 'POST', timeoutMs: 55_000, body: JSON.stringify({
    project_id: state.projectId || null,
    field_name: field.name,
    field_label: fieldLabel(field),
    value: field.value,
    instruction,
    form_context: formContextFor(field)
  }) });
}

async function openAiSuggestionDialog(field) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-backdrop';
  overlay.innerHTML = `<section class="dialog-card ai-suggestion-dialog"><div class="dialog-head"><div><p class="eyebrow dark">AI WRITING ASSISTANT</p><h2 id="aiSuggestionTitle">${escapeHtml(fieldLabel(field))}</h2></div><button type="button" class="secondary" data-ai-close>Close</button></div><div class="ai-thinking"><span class="spinner"></span> Generating suggestion…</div></section>`;
  document.body.appendChild(overlay); document.body.classList.add('dialog-open');
  const card = overlay.querySelector('.dialog-card'); card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true'); card.setAttribute('aria-labelledby','aiSuggestionTitle');
  const load = async instruction => {
    card.querySelector('.ai-thinking')?.remove();
    let result;
    try { result = await requestAiSuggestion(field, instruction); }
    catch (error) { overlay.remove(); if (!document.querySelector('.dialog-backdrop')) document.body.classList.remove('dialog-open'); throw error; }
    card.innerHTML = `<div class="dialog-head"><div><p class="eyebrow dark">AI WRITING ASSISTANT</p><h2 id="aiSuggestionTitle">${escapeHtml(fieldLabel(field))}</h2></div><button type="button" class="secondary" data-ai-close>Close</button></div><div class="ai-provider-row"><span class="ai-status ${result.fallback ? 'fallback' : 'connected'}">✨ ${escapeHtml(result.provider)}</span><span class="small muted">Edit below before accepting.</span></div><textarea id="aiSuggestionText" class="ai-suggestion-text">${escapeHtml(result.suggestion)}</textarea><p class="small muted">${escapeHtml(result.rationale || '')}</p><div class="actions"><button class="primary" type="button" data-ai-accept>Accept suggestion</button><button class="secondary" type="button" data-ai-regenerate>Regenerate</button><button class="secondary" type="button" data-ai-close>Cancel</button></div>`;
    card.querySelector('#aiSuggestionText')?.focus();
  };
  overlay.addEventListener('click', async event => {
    if (event.target.closest('[data-ai-close]')) { overlay.remove(); if (!document.querySelector('.dialog-backdrop')) document.body.classList.remove('dialog-open'); field.focus(); }
    else if (event.target.closest('[data-ai-accept]')) { field.value = card.querySelector('#aiSuggestionText').value; field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true})); overlay.remove(); if (!document.querySelector('.dialog-backdrop')) document.body.classList.remove('dialog-open'); field.focus(); toast('AI suggestion added. You can still edit it.'); }
    else if (event.target.closest('[data-ai-regenerate]')) { const btn=event.target.closest('[data-ai-regenerate]'); setButtonBusy(btn,true,'Regenerating…'); try { const result=await requestAiSuggestion(field,'Generate a different, stronger version.'); card.querySelector('#aiSuggestionText').value=result.suggestion; card.querySelector('.ai-status').textContent=`✨ ${result.provider}`; } catch(e){toast(e.message,true)} finally {setButtonBusy(btn,false)} }
  });
  await load('');
}

function openGeneratePlanDialog() {
  const overlay = document.createElement('div'); overlay.className='dialog-backdrop';
  overlay.innerHTML = `<form id="aiPlanForm" class="dialog-card stack"><div class="dialog-head"><div><p class="eyebrow dark">AI PROJECT PLANNER</p><h2 id="aiPlanTitle">Generate a project-specific plan</h2></div><button type="button" class="secondary" data-action="close-dialog">Close</button></div><div class="notice">AI will use the saved objective, scope, constraints, assumptions, team members and the optional brief below. Every generated task stays pending for human review.</div><label>Extra instructions / brief<textarea name="brief" placeholder="Example: Launch MVP in 6 weeks. Prioritize authentication, payments and mobile responsiveness."></textarea></label><label class="toggle-row"><span><strong>Replace pending AI tasks</strong><small>Remove only previous unapproved AI tasks before generating a fresh plan.</small></span><input type="checkbox" name="replace_unapproved"></label><div class="actions"><button class="primary" type="submit">✨ Generate with AI</button></div></form>`;
  mountDialog(overlay,'aiPlanTitle');
  overlay.querySelector('form').addEventListener('submit', async event => { event.preventDefault(); const btn=event.submitter; const fd=new FormData(event.currentTarget); setButtonBusy(btn,true,'AI is planning…'); try { const result=await api(`/api/projects/${state.projectId}/generate-plan`,{method:'POST',timeoutMs:60_000,body:JSON.stringify({brief:fd.get('brief'),replace_unapproved:event.currentTarget.elements.replace_unapproved.checked})}); closeDialog(overlay); await loadProjectData(); render(); toast(result.fallback_used ? 'Plan created with local fallback. Add an AI API key for full AI generation.' : `AI plan created with ${result.ai_provider}.`); } catch(e){toast(e.message,true)} finally {setButtonBusy(btn,false)} });
}

function renderWorkspaceError(error, retryAction = 'retry-workspace') {
  const requestReference = error.requestId ? `<p class="small muted">Reference: ${escapeHtml(error.requestId)}</p>` : '';
  mainContent.innerHTML = `<section class="card error-state" role="alert"><div class="error-state-icon">!</div><h2>We could not load this view</h2><p>${escapeHtml(error.message || 'An unexpected error occurred.')}</p>${requestReference}<button class="primary" type="button" data-action="${escapeHtml(retryAction)}">Try again</button></section>`;
  mainContent.focus();
}

async function api(path, options = {}) {
  const { silent = false, timeoutMs = 20_000, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (fetchOptions.body !== undefined && !(fetchOptions.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (!silent) setGlobalLoading(true);
  try {
    const response = await fetch(path, { ...fetchOptions, headers, credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch {}
      const error = new Error(payload.detail || `${response.status} ${response.statusText}`);
      error.status = response.status;
      error.code = payload.code;
      error.requestId = payload.request_id || response.headers.get('x-request-id');
      if (response.status === 401 && !path.endsWith('/auth/login') && !path.endsWith('/auth/register')) logout(false);
      throw error;
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.text();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please check your connection and try again.');
    if (error instanceof TypeError) throw new Error('Unable to reach Orbit. Check your internet connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    if (!silent) setGlobalLoading(false);
  }
}

function saveToken() {
  // New sessions use an HttpOnly SameSite cookie. Remove legacy localStorage tokens.
  state.token = '';
  localStorage.removeItem('orbit_token');
}

function logout(showMessage = true) {
  stopPresenceHeartbeat();
  const token = state.token;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  fetch('/api/auth/logout', { method: 'POST', headers, credentials: 'same-origin' }).catch(() => {});
  localStorage.removeItem('orbit_token');
  localStorage.removeItem('orbit_organization_id');
  localStorage.removeItem('orbit_project_id');
  localStorage.removeItem('orbit_channel_id');
  localStorage.removeItem('orbit_onboarding_deferred');
  Object.assign(state, {
    token: '', user: null, presence: null, settings: null, notifications: [], activity: [], sessions: [], unreadNotificationCount: 0, organizations: [], workspaceAccess: null, onboardingDeferred: false, organizationId: null, organization: null,
    members: [], invitations: [], myInvitations: [], projects: [], projectId: null,
    project: null, tasks: [], risks: [], decisions: [], changes: [], suggestions: [],
    report: null, channels: [], channelId: null, messages: [], memberSearch: '', memberDepartment: 'all', memberPresence: 'all', view: 'chat'
  });
  showScreen('auth');
  if (showMessage) toast('You have been logged out.');
}

function showScreen(name) {
  authScreen.classList.toggle('hidden', name !== 'auth');
  setupScreen.classList.toggle('hidden', name !== 'setup');
  appShell.classList.toggle('hidden', name !== 'app');
}

function switchAuthTab(tab) {
  const login = tab === 'login';
  $('#authTabs').classList.remove('hidden');
  $('#forgotPasswordForm').classList.add('hidden');
  $('#loginTab').classList.toggle('active', login);
  $('#registerTab').classList.toggle('active', !login);
  $('#loginTab').setAttribute('aria-selected', String(login));
  $('#registerTab').setAttribute('aria-selected', String(!login));
  $('#loginForm').classList.toggle('hidden', !login);
  $('#registerForm').classList.toggle('hidden', login);
  requestAnimationFrame(() => $(login ? '#loginForm input' : '#registerForm input')?.focus());
}

function showForgotPassword() {
  $('#authTabs').classList.add('hidden');
  $('#loginForm').classList.add('hidden');
  $('#registerForm').classList.add('hidden');
  $('#forgotPasswordForm').classList.remove('hidden');
  $('#resetPasswordFields').classList.add('hidden');
  const resetForm = $('#forgotPasswordForm');
  resetForm.querySelector('[name="code"]').required = false;
  resetForm.querySelector('[name="password"]').required = false;
  requestAnimationFrame(() => $('#resetEmail')?.focus());
}

function clearWorkspaceSelection() {
  state.organizationId = null;
  state.organization = null;
  state.projectId = null;
  state.project = null;
  state.channelId = null;
  state.members = [];
  state.projects = [];
  state.channels = [];
  state.messages = [];
  localStorage.removeItem('orbit_organization_id');
  localStorage.removeItem('orbit_project_id');
  localStorage.removeItem('orbit_channel_id');
}

function setOnboardingDeferred(value) {
  state.onboardingDeferred = Boolean(value);
  if (state.onboardingDeferred) localStorage.setItem('orbit_onboarding_deferred', '1');
  else localStorage.removeItem('orbit_onboarding_deferred');
}

function stopPresenceHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function heartbeat(refreshDirectory = false) {
  if (!state.user) return;
  try {
    state.presence = await api('/api/presence/heartbeat', { method: 'POST', silent: true });
    if (presenceSelect) presenceSelect.value = state.presence.status_key || 'available';
    if (refreshDirectory && state.organizationId && ['members', 'admin'].includes(state.view)) {
      state.members = await api(`/api/organizations/${state.organizationId}/members`);
      render();
    }
  } catch {}
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  heartbeatTimer = setInterval(() => heartbeat(true), 60_000);
}

async function bootstrap() {
  setWorkspaceBusy(true, 'Checking your account…');
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.presence = me.presence || null;
    state.settings = me.settings || state.settings || { theme: 'light' };
    state.unreadNotificationCount = Number(me.unread_notification_count || 0);
    applyTheme(state.settings.theme || 'light');
    state.organizations = me.organizations;
    startPresenceHeartbeat();
    state.workspaceAccess = me.workspace_access || null;
    state.myInvitations = await api('/api/invitations/me');
    const activeOrganizations = state.organizations.filter(item => item.membership_status === 'active');
    const canAccessWorkspace = state.workspaceAccess
      ? state.workspaceAccess.can_access_workspace
      : activeOrganizations.length > 0;

    if (!canAccessWorkspace || !activeOrganizations.length) {
      clearWorkspaceSelection();
      showSetup();
      return;
    }

    setOnboardingDeferred(false);
    if (!activeOrganizations.some(item => Number(item.id) === Number(state.organizationId))) {
      state.organizationId = Number(activeOrganizations[0].id);
    }
    localStorage.setItem('orbit_organization_id', state.organizationId);
    showScreen('app');
    await loadWorkspace();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      showScreen('auth');
      localStorage.removeItem('orbit_token');
    } else if (state.user) {
      showSetup();
      toast(error.message, true);
    } else {
      showScreen('auth');
      toast(error.message, true);
    }
  } finally {
    setWorkspaceBusy(false);
  }
}

function showSetup() {
  showScreen('setup');
  $('#setupUser').textContent = `${state.user.full_name} (@${state.user.username})`;
  renderSetupInvitations();
  renderOnboardingState();
}

function renderOnboardingState() {
  $('#setupOptions').classList.toggle('hidden', state.onboardingDeferred);
  $('#setupDeferredState').classList.toggle('hidden', !state.onboardingDeferred);
  const pendingCount = Number(state.workspaceAccess?.pending_invitation_count || state.myInvitations.length || 0);
  $('#deferredAccessMessage').textContent = pendingCount
    ? `You have ${pendingCount} pending invitation${pendingCount === 1 ? '' : 's'}. Check approval to unlock the workspace once membership becomes active.`
    : 'Create an organization or receive an invitation from an organization manager to unlock the workspace.';
}

function renderSetupInvitations() {
  const container = $('#setupInvitations');
  const openInvitations = state.myInvitations.filter(invitation => ['invited', 'awaiting_approval'].includes(invitation.status));
  if (!openInvitations.length) {
    container.innerHTML = '<div class="empty invitation-empty"><strong>No pending invitation</strong><span>Share your registered username or email with an organization manager.</span></div>';
    return;
  }
  container.innerHTML = openInvitations.map(invitation => `
    <div class="invitation-card">
      <strong>${escapeHtml(invitation.organization_name)}</strong>
      <p class="small muted">Role: ${escapeHtml(invitation.proposed_role)} · ${escapeHtml(invitation.proposed_department || 'General')} · invited by ${escapeHtml(invitation.invited_by_name)}</p>
      <div>${badge(invitation.status)}</div>
      ${invitation.status === 'invited' ? `<div class="actions" style="margin-top:10px"><button class="primary" data-setup-action="accept-invite" data-id="${invitation.id}">Accept invitation</button><button class="secondary" data-setup-action="decline-invite" data-id="${invitation.id}">Decline</button></div>` : '<p class="small">Invitation accepted. Workspace remains locked until CEO/admin approval.</p>'}
    </div>`).join('');
}

async function loadWorkspace() {
  const organizationId = state.organizationId;
  setWorkspaceBusy(true);
  try {
    await heartbeat(false);
    [state.organization, state.members, state.projects, state.channels, state.aiStatus] = await Promise.all([
      api(`/api/organizations/${organizationId}`),
      api(`/api/organizations/${organizationId}/members`),
      api(`/api/organizations/${organizationId}/projects`),
      api(`/api/organizations/${organizationId}/channels`),
      api('/api/ai/status')
    ]);
    try {
      state.invitations = canManage() ? await api(`/api/organizations/${organizationId}/invitations`) : [];
    } catch {
      state.invitations = [];
    }
    const [notificationData, sessions] = await Promise.all([
      api('/api/users/me/notifications?limit=100'),
      api('/api/users/me/sessions')
    ]);
    state.notifications = notificationData.items || [];
    state.unreadNotificationCount = Number(notificationData.unread_count || 0);
    state.sessions = sessions || [];
    if (state.view === 'activity') state.activity = await api('/api/users/me/activity?limit=100');
    const activeOrganizations = state.organizations.filter(item => item.membership_status === 'active');
    const organizationOptions = activeOrganizations.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
    organizationSelect.innerHTML = organizationOptions;
    mobileOrganizationSelect.innerHTML = organizationOptions;
    organizationSelect.value = String(organizationId);
    mobileOrganizationSelect.value = String(organizationId);
    projectSelect.innerHTML = state.projects.length
      ? state.projects.map(project => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('')
      : '<option value="">No projects</option>';
    if (!state.projects.some(project => Number(project.id) === Number(state.projectId))) state.projectId = state.projects[0] ? Number(state.projects[0].id) : null;
    projectSelect.value = state.projectId ? String(state.projectId) : '';
    if (state.projectId) localStorage.setItem('orbit_project_id', state.projectId); else localStorage.removeItem('orbit_project_id');
    if (!state.channels.some(channel => Number(channel.id) === Number(state.channelId))) state.channelId = state.channels[0] ? Number(state.channels[0].id) : null;
    if (state.channelId) localStorage.setItem('orbit_channel_id', state.channelId); else localStorage.removeItem('orbit_channel_id');
    await Promise.all([loadProjectData(), loadMessages()]);
    updateShell();
    render();
  } catch (error) {
    renderWorkspaceError(error);
    throw error;
  } finally {
    setWorkspaceBusy(false);
  }
}

async function loadProjectData() {
  if (!state.projectId) {
    Object.assign(state, { project: null, tasks: [], risks: [], decisions: [], changes: [], suggestions: [], report: null });
    return;
  }
  const id = state.projectId;
  [state.project, state.tasks, state.risks, state.decisions, state.changes, state.suggestions, state.report] = await Promise.all([
    api(`/api/projects/${id}`), api(`/api/projects/${id}/tasks`), api(`/api/projects/${id}/risks`),
    api(`/api/projects/${id}/decisions`), api(`/api/projects/${id}/changes`),
    api(`/api/projects/${id}/suggestions`), api(`/api/projects/${id}/report`)
  ]);
}

async function loadMessages() {
  state.messages = state.channelId ? await api(`/api/channels/${state.channelId}/messages`) : [];
}

function updateShell() {
  const role = currentRole();
  const currentMember = state.members.find(member => Number(member.user_id) === Number(state.user.id)) || { ...state.user, current_status: state.presence?.current_status };
  $('#sidebarUserName').innerHTML = `${escapeHtml(state.user.full_name)} ${statusMarkup(currentMember, true)}`;
  $('#sidebarUserRole').textContent = `${role} · ${currentMember.status_label || 'Available'}`;
  $('#userAvatar').innerHTML = `${state.user.avatar_url ? `<img src="${escapeHtml(state.user.avatar_url)}" alt="">` : ''}<span>${escapeHtml(initials(state.user.full_name))}</span><i class="presence-dot ${escapeHtml(currentMember.current_status || 'offline')}"></i>`;
  $('#workspaceEyebrow').textContent = state.organization.name.toUpperCase();
  presenceSelect.value = state.presence?.status_key || 'available';
  const navBadge = $('#navNotificationBadge');
  if (navBadge) { navBadge.textContent = String(state.unreadNotificationCount); navBadge.classList.toggle('hidden', !state.unreadNotificationCount); }
  $$('[data-manager]').forEach(button => button.classList.toggle('hidden', !canManage()));
  $$('[data-admin]').forEach(button => button.classList.toggle('hidden', !canManage()));
}

const viewTitles = {
  chat: 'Channel', members: 'People', profile: 'Profile', notifications: 'Notifications', activity: 'Account Activity', settings: 'Settings',
  dashboard: 'Dashboard', intake: 'New project', work: 'Work Breakdown', meeting: 'Meeting Notes',
  risks: 'Risk & Decisions', changes: 'Change Control', report: 'Reports & export', admin: 'Admin dashboard'
};

function render() {
  try {
    $$('#mainNav button').forEach(button => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('#viewTitle').textContent = viewTitles[state.view] || 'Workspace';
    $('#projectPickerWrap').classList.toggle('hidden', ['chat', 'members', 'profile', 'notifications', 'activity', 'settings', 'admin', 'intake'].includes(state.view));
    const views = {
      chat: renderChat, members: renderMembers, profile: renderProfile, notifications: renderNotifications,
      activity: renderActivity, settings: renderSettings, dashboard: renderDashboard, intake: renderIntake,
      work: renderWork, meeting: renderMeeting, risks: renderRisks, changes: renderChanges,
      report: renderReport, admin: renderAdmin
    };
    mainContent.innerHTML = (views[state.view] || renderDashboard)();
    if (state.view === 'chat') requestAnimationFrame(() => { const feed = $('#messageFeed'); if (feed) feed.scrollTop = feed.scrollHeight; });
    if (state.view === 'members') requestAnimationFrame(applyMemberFilters);
    requestAnimationFrame(() => enhanceAiFields(mainContent));
  } catch (error) {
    renderWorkspaceError(error, 'retry-render');
  }
}

const aiStatusBadge = () => `<span class="ai-status ${state.aiStatus?.enabled ? 'connected' : 'fallback'}" title="${escapeHtml(state.aiStatus?.model || '')}">✨ ${state.aiStatus?.enabled ? 'AI connected' : 'AI local mode'}</span>`;
const pageHead = (title, subtitle, actions = '') => `<div class="page-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="actions">${aiStatusBadge()}${actions}</div></div>`;

function noProject() {
  return `<div class="card empty">No project exists in this organization. ${canManage() ? 'Use “New project” to create one.' : 'Ask a manager to create a project.'}</div>`;
}

function renderChat() {
  const channel = state.channels.find(item => Number(item.id) === Number(state.channelId));
  return `<div class="chat-layout">
    <aside class="channel-panel">
      <h3>Channels</h3>
      <div class="channel-list">
        ${state.channels.map(item => `<button data-action="select-channel" data-id="${item.id}" class="${Number(item.id) === Number(state.channelId) ? 'active' : ''}"># ${escapeHtml(item.name)} <span class="small">(${item.message_count})</span></button>`).join('') || '<div class="empty">No channels</div>'}
      </div>
      ${canManage() ? `<form id="channelForm" class="stack compact" style="margin-top:18px"><label>New channel<input name="name" placeholder="design-team" required></label><label>Topic<input name="topic" placeholder="Optional channel topic"></label><button class="secondary" type="submit">Create channel</button></form>` : ''}
    </aside>
    <section class="message-panel">
      ${channel ? `<header class="channel-head"><h2># ${escapeHtml(channel.name)}</h2><div class="small muted">${escapeHtml(channel.topic || 'Team discussion')}</div></header>
      <div id="messageFeed" class="message-feed">
        ${state.messages.map(message => { const member = state.members.find(item => Number(item.user_id) === Number(message.user_id)); return `<article class="message">${avatarMarkup({ ...message, ...(member || {}) })}<div><div class="message-meta"><strong>${escapeHtml(message.full_name)}</strong>${member ? statusMarkup(member, true) : ''}<small>@${escapeHtml(message.username)} · ${escapeHtml(new Date(message.created_at).toLocaleString())}</small></div><div class="message-body">${escapeHtml(message.body)}</div></div></article>`; }).join('') || '<div class="empty" style="margin-top:20px">No messages yet. Start the conversation.</div>'}
      </div>
      <form id="messageForm" class="message-form"><textarea name="body" required placeholder="Message #${escapeHtml(channel.name)}"></textarea><button class="primary" type="submit">Send</button></form>` : '<div class="empty">Select or create a channel.</div>'}
    </section>
  </div>`;
}

function statusOptions(selected) {
  return Object.entries(statusPresets).map(([key, item]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${escapeHtml(item.emoji)} ${escapeHtml(item.label)}</option>`).join('');
}

function renderProfile() {
  const member = memberForUser(state.user.id) || { ...state.user, role: currentRole(), department: 'General', ...state.presence };
  return `${pageHead('Your profile', 'Manage your identity and the status shown beside your name across Orbit.')}
  <div class="profile-layout">
    <section class="card profile-hero-card">
      ${avatarMarkup({ ...member, ...state.user, current_status: member.current_status || state.presence?.current_status }, 'profile-hero-avatar')}
      <div class="profile-hero-copy"><div class="name-with-status"><h2>${escapeHtml(state.user.full_name)}</h2>${statusMarkup(member)}</div><p>@${escapeHtml(state.user.username)} · ${escapeHtml(state.user.email)}</p><div class="member-card-badges">${badge(member.role || currentRole())} ${badge(member.department || 'General')}</div>${member.custom_status ? `<p class="profile-status-note">${escapeHtml(member.custom_status)}</p>` : ''}</div>
    </section>
    <form id="profilePageForm" class="card stack">
      <div><h3>Profile details</h3><p class="muted">Your name and avatar are visible to members of every organization you join.</p></div>
      <label>Full name<input name="full_name" value="${escapeHtml(state.user.full_name)}" minlength="2" maxlength="120" required></label>
      <label>Username<input value="${escapeHtml(state.user.username)}" disabled><small>Usernames cannot be changed in this iteration.</small></label>
      <label>Email<input value="${escapeHtml(state.user.email)}" disabled></label>
      <label>Avatar image URL<input name="avatar_url" type="url" value="${escapeHtml(state.user.avatar_url || '')}" placeholder="https://..."><small>Optional HTTPS image; initials are used when blank.</small></label>
      <button class="primary" type="submit">Save profile</button>
    </form>
    <form id="statusPageForm" class="card stack">
      <div><h3>Workspace status</h3><p class="muted">This badge appears beside your name in channels, member cards, task ownership, and the sidebar.</p></div>
      <label>Status<select name="status_key">${statusOptions(state.presence?.status_key || 'available')}</select></label>
      <div class="form-grid custom-status-fields ${state.presence?.status_key === 'custom' ? '' : 'hidden'}" id="customStatusFields">
        <label>Custom label<input name="status_label" maxlength="50" value="${escapeHtml(state.presence?.status_key === 'custom' ? state.presence.status_label : '')}" placeholder="e.g. Client site"></label>
        <label>Emoji<input name="status_emoji" maxlength="8" value="${escapeHtml(state.presence?.status_key === 'custom' ? state.presence.status_emoji : '💬')}" placeholder="💬"></label>
      </div>
      <label>Status note<input name="custom_status" maxlength="120" value="${escapeHtml(state.presence?.custom_status || '')}" placeholder="e.g. Available after 3 PM"></label>
      <button class="primary" type="submit">Update status</button>
    </form>
  </div>`;
}

function renderNotifications() {
  return `${pageHead('Notifications', 'Invitations, approvals, mentions, and important workspace updates.', state.unreadNotificationCount ? '<button class="secondary" data-action="read-all-notifications">Mark all as read</button>' : '')}
  <section class="notification-list">
    ${state.notifications.map(item => `<article class="card notification-item ${item.read_at ? '' : 'unread'}">
      <div class="notification-icon">${notificationIcon(item.notification_type)}</div>
      <div class="notification-copy"><div class="notification-title"><strong>${escapeHtml(item.title)}</strong>${item.organization_name ? `<span>${escapeHtml(item.organization_name)}</span>` : ''}</div><p>${escapeHtml(item.body)}</p><small>${escapeHtml(new Date(item.created_at).toLocaleString())}</small></div>
      <div class="notification-actions">${!item.read_at ? `<button class="secondary" data-action="mark-notification-read" data-id="${item.id}">Mark read</button>` : '<span class="read-label">Read</span>'}${item.action_view ? `<button class="ghost-action" data-action="open-notification" data-view="${escapeHtml(item.action_view)}" data-id="${item.id}">Open</button>` : ''}</div>
    </article>`).join('') || '<div class="card empty">No notifications yet.</div>'}
  </section>`;
}

function renderActivity() {
  return `${pageHead('Account activity', 'A private history of sign-ins, profile changes, settings, invitations, and membership events.', '<button class="secondary" data-action="refresh-activity">Refresh activity</button>')}
  <section class="card activity-timeline">
    ${state.activity.map(item => `<article class="activity-item"><div class="activity-marker">${notificationIcon(item.activity_type === 'signed_in' ? 'activity' : 'workspace')}</div><div><div class="activity-title"><strong>${escapeHtml(item.title)}</strong>${item.organization_name ? `<span>${escapeHtml(item.organization_name)}</span>` : ''}</div>${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}<small>${escapeHtml(new Date(item.created_at).toLocaleString())}</small></div></article>`).join('') || '<div class="empty">No account activity has been recorded yet.</div>'}
  </section>`;
}

function renderSettings() {
  const settings = state.settings || { theme: 'light', workspace_notifications: 1, mention_notifications: 1, invitation_notifications: 1, activity_notifications: 1 };
  const activeSessions = state.sessions || [];
  return `${pageHead('Settings', 'Control appearance, presence, notifications, and account security.')}
  <form id="settingsForm" class="settings-grid">
    <section class="card stack"><div><h3>Appearance</h3><p class="muted">Choose Light or Dark mode. You can also use the quick theme button in the top bar.</p></div><label>Theme<select name="theme"><option value="light" ${resolvedTheme(settings.theme) === 'light' ? 'selected' : ''}>☀️ Light</option><option value="dark" ${resolvedTheme(settings.theme) === 'dark' ? 'selected' : ''}>🌙 Dark</option></select></label><div class="theme-preview-row two-options"><span class="theme-preview light-preview">☀️ Light</span><span class="theme-preview dark-preview">🌙 Dark</span></div></section>
    <section class="card stack"><div><h3>Presence</h3><p class="muted">Presence is the small live dot. Your workspace status is the emoji badge beside your name.</p></div><label>Presence mode<select name="presence_mode">${[['auto','Automatic'],['online','Always online'],['away','Away'],['dnd','Do not disturb'],['offline','Appear offline']].map(([value,label]) => `<option value="${value}" ${state.presence?.presence_mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="notice">Current live presence: <strong>${escapeHtml(presenceLabel(state.presence?.current_status))}</strong></div></section>
    <section class="card stack settings-wide"><div><h3>Notification preferences</h3><p class="muted">Choose which updates appear in your private Notifications page.</p></div>
      <label class="toggle-row"><span><strong>Workspace updates</strong><small>Important organization and membership changes.</small></span><input type="checkbox" name="workspace_notifications" ${Number(settings.workspace_notifications) ? 'checked' : ''}></label>
      <label class="toggle-row"><span><strong>Mentions</strong><small>Messages containing your @username.</small></span><input type="checkbox" name="mention_notifications" ${Number(settings.mention_notifications) ? 'checked' : ''}></label>
      <label class="toggle-row"><span><strong>Invitations</strong><small>Organization invitations, approvals, and rejections.</small></span><input type="checkbox" name="invitation_notifications" ${Number(settings.invitation_notifications) ? 'checked' : ''}></label>
      <label class="toggle-row"><span><strong>Account activity</strong><small>Membership and access-related alerts.</small></span><input type="checkbox" name="activity_notifications" ${Number(settings.activity_notifications) ? 'checked' : ''}></label>
    </section>
    <div class="settings-save"><button class="primary" type="submit">Save settings</button></div>
  </form>
  <section class="card session-card">
    <div class="page-head compact-head"><div><h3>Active sessions</h3><p>Review devices signed into your account and revoke access you no longer recognize.</p></div>${activeSessions.length > 1 ? '<button class="danger" type="button" data-action="revoke-other-sessions">Sign out other devices</button>' : ''}</div>
    <div class="session-list">${activeSessions.map(session => `<article class="session-item"><div class="session-icon" aria-hidden="true">▣</div><div><strong>${escapeHtml(sessionDevice(session.user_agent))}${session.current ? ' <span class="current-session">Current</span>' : ''}</strong><p>${escapeHtml(session.ip_address || 'Unknown IP')} · ${escapeHtml(relativeTime(session.last_seen_at))}</p><small>Expires ${escapeHtml(new Date(session.expires_at).toLocaleString())}</small></div><button class="secondary" type="button" data-action="revoke-session" data-id="${escapeHtml(session.id)}">${session.current ? 'Sign out' : 'Revoke'}</button></article>`).join('') || '<div class="empty">No active sessions found.</div>'}</div>
  </section>`;
}

function renderDashboard() {
  if (!state.project || !state.report) return noProject();
  const pending = state.tasks.filter(task => task.ai_generated && !task.approved).length + state.suggestions.filter(item => item.status === 'pending').length + state.changes.filter(item => item.status === 'pending').length;
  const dashboardActions = `${canManage() ? `<button class="primary" data-action="open-intake">${ICONS.plus} New Project</button>` : ''}${canManage() ? '<button class="secondary" data-action="scan-risks">Scan risks</button>' : ''}`;
  return `${pageHead('Dashboard', 'Stored project facts, approvals, blockers, and current delivery status.', dashboardActions)}
  <div class="grid cols-4">
    <div class="card"><div class="small muted">Overall progress</div><div class="metric">${state.report.overall_progress_percent}%</div><div class="progress"><span style="width:${state.report.overall_progress_percent}%"></span></div></div>
    <div class="card"><div class="small muted">Active members</div><div class="metric">${state.members.filter(member => member.status === 'active').length}</div><div class="small muted">Organization-wide team</div></div>
    <div class="card"><div class="small muted">Open risks</div><div class="metric">${state.report.open_risks.length}</div><div class="small muted">Evidence retained for every warning</div></div>
    <div class="card"><div class="small muted">Awaiting review</div><div class="metric">${pending}</div><div class="small muted">AI proposals and changes</div></div>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <section class="card"><h3>Project snapshot</h3><div class="kv"><div>Objective</div><div>${escapeHtml(state.project.objective || 'Not recorded')}</div><div>Scope</div><div>${escapeHtml(state.project.scope || 'Not recorded')}</div><div>Constraints</div><div>${escapeHtml(state.project.constraints || 'Not recorded')}</div><div>Assumptions</div><div>${escapeHtml(state.project.assumptions || 'Not recorded')}</div></div></section>
    <section class="card"><h3>Immediate attention</h3>${state.report.blockers.length ? state.report.blockers.map(task => `<div class="notice danger"><strong>${escapeHtml(task.title)}</strong><div class="small">Stored status: blocked · ${task.progress}% progress</div></div>`).join('') : '<div class="empty">No blocked task is stored.</div>'}</section>
  </div>
  <section class="card" style="margin-top:16px"><h3>Kanban overview</h3>${renderBoard()}</section>`;
}

function renderBoard() {
  const statuses = { not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };
  return `<div class="board">${Object.entries(statuses).map(([status, label]) => `<div class="board-column"><h3>${label} (${state.tasks.filter(task => task.status === status).length})</h3>${state.tasks.filter(task => task.status === status).map(task => `<div class="task-card"><strong>${escapeHtml(task.title)}</strong><div class="small muted">${personNameWithStatus(task.owner_id, task.owner_name || 'Unassigned')} · ${escapeHtml(task.phase)}</div><div class="progress" style="margin-top:9px"><span style="width:${task.progress}%"></span></div><div class="small" style="margin-top:5px">${task.progress}% ${task.approved ? '' : '· awaiting approval'}</div></div>`).join('') || '<div class="small muted">No tasks</div>'}</div>`).join('')}</div>`;
}

function renderIntake() {
  if (!canManage()) return '<div class="notice danger">Only CEO, admin, or moderator can create a project.</div>';
  return `${pageHead('Create project', 'Projects belong to the current organization and use its approved members as assignees.')}
  <form id="projectForm" class="card form-grid">
    <label>Project name<input name="name" required></label>
    <label>Objective<input name="objective"></label>
    <label class="full">Scope<textarea name="scope"></textarea></label>
    <label>Constraints<textarea name="constraints"></textarea></label>
    <label>Assumptions<textarea name="assumptions"></textarea></label>
    <label class="full">Project brief<textarea name="brief" placeholder="Paste approved project information here..."></textarea></label>
    <div class="full notice">Team members are managed from the Admin dashboard. Only active, approved organization members can be assigned to tasks.</div>
    <div class="full actions"><button class="primary" type="submit">Create project</button></div>
  </form>`;
}

function renderWork() {
  if (!state.project) return noProject();
  const actions = `${canManage() ? '<button class="primary" data-action="generate-plan">Generate AI plan</button>' : ''}<button class="secondary" data-action="open-task">Add task</button>`;
  return `${pageHead('Work breakdown', 'Create, assign, update, approve, reject, or regenerate project tasks.', actions)}
  <div class="notice warning"><strong>Human control:</strong> AI-generated tasks remain pending until a CEO, admin, or moderator approves or edits them.</div>
  <section class="card table-wrap"><table><thead><tr><th>Phase / task</th><th>Owner</th><th>Priority</th><th>Status</th><th>Progress</th><th>Approval</th><th>Actions</th></tr></thead><tbody>
    ${state.tasks.map(task => `<tr><td><strong>${escapeHtml(task.phase)}</strong><br>${escapeHtml(task.title)}<br><span class="small muted">${escapeHtml(task.acceptance_criteria || 'No acceptance criteria')}</span></td><td>${personNameWithStatus(task.owner_id, task.owner_name || 'Unassigned')}</td><td>${badge(task.priority)}</td><td>${badge(task.status)}</td><td>${task.progress}%</td><td>${task.approved ? badge('approved') : badge('pending')}</td><td><div class="actions"><button class="secondary" data-action="open-task" data-id="${task.id}">Edit</button>${canManage() && !task.approved ? `<button class="primary" data-action="approve-task" data-id="${task.id}">Approve</button>` : ''}${canManage() ? `<button class="secondary" data-action="regenerate-task" data-id="${task.id}">Regenerate</button><button class="danger" data-action="reject-task" data-id="${task.id}">Reject</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">No tasks yet.</div></td></tr>'}
  </tbody></table></section>`;
}

function renderMeeting() {
  if (!state.project) return noProject();
  if (!canManage()) return '<div class="notice danger">Only CEO, admin, or moderator can process meeting notes.</div>';
  const pending = state.suggestions.filter(item => item.status === 'pending');
  return `${pageHead('Meeting notes', 'Convert explicit actions, decisions, and blockers into approval-ready proposals.')}
  <form id="meetingForm" class="card stack"><label>Meeting notes<textarea name="notes" required placeholder="Paste meeting notes. Explicit wording produces better proposals."></textarea></label><div class="actions"><button class="primary" type="submit">Create proposals</button></div></form>
  <section style="margin-top:16px"><h3>Pending proposals</h3>${pending.map(item => `<div class="card" style="margin-bottom:10px"><div class="actions" style="justify-content:space-between"><div>${badge(item.suggestion_type)} ${badge(item.status)}</div><div><button class="primary" data-action="approve-suggestion" data-id="${item.id}">Approve</button><button class="danger" data-action="reject-suggestion" data-id="${item.id}">Reject</button></div></div><p>${escapeHtml(item.evidence)}</p><div class="small muted">${escapeHtml(item.rationale)}</div></div>`).join('') || '<div class="empty">No meeting-note proposals await review.</div>'}</section>`;
}

function renderRisks() {
  if (!state.project) return noProject();
  return `${pageHead('Risks & decisions', 'Evidence-based warnings and approved project decisions.', canManage() ? '<button class="primary" data-action="scan-risks">Run risk scan</button>' : '')}
  <div class="grid cols-2"><section><h3>Risk register</h3>${state.risks.map(risk => `<div class="card" style="margin-bottom:10px"><div class="actions">${badge(risk.severity)} ${badge(risk.status)} ${risk.approved ? badge('approved') : badge('pending')}</div><h3 style="margin-top:10px">${escapeHtml(risk.title)}</h3><p>${escapeHtml(risk.description)}</p><div class="notice"><strong>Evidence:</strong> ${escapeHtml(risk.evidence || 'No evidence recorded')}</div>${canManage() && !risk.approved ? `<button class="primary" data-action="approve-risk" data-id="${risk.id}">Approve warning</button>` : ''}</div>`).join('') || '<div class="empty">No risks stored. Run the scan.</div>'}</section>
  <section><h3>Decision history</h3>${state.decisions.map(decision => `<div class="card" style="margin-bottom:10px"><div>${badge(decision.status)} <span class="small muted">${escapeHtml(decision.source)}</span></div><h3 style="margin-top:10px">${escapeHtml(decision.title)}</h3><p>${escapeHtml(decision.detail)}</p><div class="small muted">Owner: ${escapeHtml(decision.owner || 'Not recorded')} · ${escapeHtml(decision.created_at)}</div></div>`).join('') || '<div class="empty">No approved decisions stored.</div>'}</section></div>`;
}

function renderChanges() {
  if (!state.project) return noProject();
  return `${pageHead('Change Control', 'Analyze likely scope, effort, dependency, and workload effects before approval.')}
  <form id="changeForm" class="card form-grid"><label>Change title<input name="title" required></label><label>Requested by<input name="requested_by"></label><label class="full">Description<textarea name="description" required></textarea></label><div class="full actions"><button class="primary" type="submit">Analyze and submit</button></div></form>
  <div class="change-grid">${state.changes.map(change => `<article class="card change-card">
      <div class="change-card-head">
        <div class="change-card-title">${badge(change.status)}<strong>${escapeHtml(change.title)}</strong></div>
        ${canManage() && change.status === 'pending' ? `<div class="actions"><button class="primary" data-action="review-change" data-review="approve" data-id="${change.id}">Approve</button><button class="danger" data-action="review-change" data-review="reject" data-id="${change.id}">Reject</button></div>` : ''}
      </div>
      <p>${escapeHtml(change.description)}</p>
      <div class="kv"><div>Scope</div><div>${escapeHtml(change.impact_scope)}</div><div>Effort</div><div>${escapeHtml(change.impact_effort)}</div><div>Dependencies</div><div>${escapeHtml(change.impact_dependencies)}</div><div>Workload</div><div>${escapeHtml(change.impact_workload)}</div></div>
    </article>`).join('') || '<div class="empty">No change requests stored.</div>'}</div>`;
}

function renderReport() {
  if (!state.project || !state.report) return noProject();
  return `${pageHead('Reports & export', 'Factual project reporting assembled only from stored records.', '<button class="primary" data-action="download" data-format="json">Export JSON</button><button class="secondary" data-action="download" data-format="csv">Export CSV</button>')}
  <div class="notice">${escapeHtml(state.report.reliability_note)}</div><pre class="report">${escapeHtml(JSON.stringify(state.report, null, 2))}</pre>`;
}

function renderMembers() {
  const activeMembers = state.members.filter(member => member.status === 'active');
  const onlineMembers = activeMembers.filter(member => member.current_status === 'online');
  const departments = [...new Set(activeMembers.map(member => member.department || 'General'))].sort((a, b) => a.localeCompare(b));
  const actions = `<button class="secondary" data-action="edit-profile">Edit my profile</button>${canManage() ? '<button class="primary" data-action="open-admin">Invite & manage members</button>' : ''}`;
  return `${pageHead('People directory', 'Everyone in this organization, including their role, department, membership state, and live Slack-style presence.', actions)}
  <div class="grid cols-3 member-metrics">
    <div class="card"><div class="small muted">Active members</div><div class="metric">${activeMembers.length}</div></div>
    <div class="card"><div class="small muted">Online now</div><div class="metric">${onlineMembers.length}</div></div>
    <div class="card"><div class="small muted">Departments</div><div class="metric">${departments.length}</div></div>
  </div>
  <section class="card member-directory-card">
    <div class="member-filters">
      <label>Search<input id="memberSearch" value="${escapeHtml(state.memberSearch)}" placeholder="Name, username, email, or department"></label>
      <label>Department<select id="memberDepartment"><option value="all">All departments</option>${departments.map(department => `<option value="${escapeHtml(department.toLowerCase())}" ${state.memberDepartment === department.toLowerCase() ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}</select></label>
      <label>Presence<select id="memberPresence"><option value="all">All statuses</option>${['online','away','dnd','offline'].map(status => `<option value="${status}" ${state.memberPresence === status ? 'selected' : ''}>${presenceLabel(status)}</option>`).join('')}</select></label>
    </div>
    <div class="directory-summary"><strong id="memberResultsCount">${state.members.length}</strong> people shown</div>
    <div id="memberDirectory" class="member-grid">
      ${state.members.map(member => {
        const search = `${member.full_name} ${member.username} ${member.email} ${member.department}`.toLowerCase();
        const presenceText = member.status === 'suspended' ? 'Membership suspended' : presenceLabel(member.current_status);
        return `<article class="member-card ${member.status === 'suspended' ? 'suspended-member' : ''}" data-member-card data-search="${escapeHtml(search)}" data-department="${escapeHtml((member.department || 'General').toLowerCase())}" data-presence="${escapeHtml(member.current_status || 'offline')}">
          <div class="member-card-head">${avatarMarkup(member, 'large')}<div class="member-card-identity"><div class="name-with-status"><strong>${escapeHtml(member.full_name)}</strong>${statusMarkup(member, true)}</div><span>@${escapeHtml(member.username)}</span></div></div>
          <div class="member-card-badges">${badge(member.role)} ${member.status !== 'active' ? badge(member.status) : ''}</div>
          <dl class="member-details"><div><dt>Department</dt><dd>${escapeHtml(member.department || 'General')}</dd></div><div><dt>Current status</dt><dd><span class="presence-inline"><i class="presence-dot static ${escapeHtml(member.current_status || 'offline')}"></i>${escapeHtml(presenceText)}</span></dd></div></dl>
          ${member.custom_status ? `<p class="custom-status">“${escapeHtml(member.custom_status)}”</p>` : ''}
          <div class="member-card-footer"><span>${escapeHtml(member.email)}</span><span>${escapeHtml(relativeTime(member.last_seen_at))}</span></div>
        </article>`;
      }).join('') || '<div class="empty">No organization members yet.</div>'}
    </div>
    <div id="memberFilterEmpty" class="empty hidden">No members match these filters.</div>
  </section>`;
}

function applyMemberFilters() {
  const searchInput = $('#memberSearch');
  const departmentSelect = $('#memberDepartment');
  const presenceFilter = $('#memberPresence');
  if (!searchInput || !departmentSelect || !presenceFilter) return;
  state.memberSearch = searchInput.value.trim().toLowerCase();
  state.memberDepartment = departmentSelect.value;
  state.memberPresence = presenceFilter.value;
  let visible = 0;
  $$('[data-member-card]').forEach(card => {
    const matchesSearch = !state.memberSearch || card.dataset.search.includes(state.memberSearch);
    const matchesDepartment = state.memberDepartment === 'all' || card.dataset.department === state.memberDepartment;
    const matchesPresence = state.memberPresence === 'all' || card.dataset.presence === state.memberPresence;
    const show = matchesSearch && matchesDepartment && matchesPresence;
    card.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  const count = $('#memberResultsCount');
  if (count) count.textContent = String(visible);
  $('#memberFilterEmpty')?.classList.toggle('hidden', visible !== 0);
}

function roleOptions(member) {
  const actorRole = currentRole();
  const roles = actorRole === 'ceo' ? ['admin', 'moderator', 'member'] : ['moderator', 'member'];
  return roles.map(role => `<option value="${role}" ${member.role === role ? 'selected' : ''}>${role}</option>`).join('');
}

function renderMemberRow(member) {
  const actorRole = currentRole();
  const editable = roleCanApproveMembers(actorRole) && member.role !== 'ceo' && !(actorRole !== 'ceo' && member.role === 'admin');
  const roleCell = editable ? `<select data-member-role="${member.membership_id}">${roleOptions(member)}</select>` : badge(member.role);
  const departmentCell = editable ? `<input data-member-department="${member.membership_id}" value="${escapeHtml(member.department || 'General')}" maxlength="80">` : escapeHtml(member.department || 'General');
  const statusCell = editable ? `<select data-member-status="${member.membership_id}"><option value="active" ${member.status === 'active' ? 'selected' : ''}>active</option><option value="suspended" ${member.status === 'suspended' ? 'selected' : ''}>suspended</option></select>` : badge(member.status);
  const presenceCell = `<div class="member-presence-stack">${statusMarkup(member)}<span class="presence-inline"><i class="presence-dot static ${escapeHtml(member.current_status || 'offline')}"></i>${escapeHtml(presenceLabel(member.current_status))}</span>${member.custom_status ? `<small>${escapeHtml(member.custom_status)}</small>` : ''}</div>`;
  const actionsCell = member.role === 'ceo'
    ? '<span class="small muted">Protected CEO account</span>'
    : editable
      ? `<div class="actions"><button class="secondary" data-action="save-member" data-id="${member.membership_id}">Save</button><button class="danger" data-action="remove-member" data-id="${member.membership_id}">Remove</button></div>`
      : '<span class="small muted">Read-only for your role</span>';
  return `<tr><td><div class="member-cell">${avatarMarkup(member)}<div><div class="name-with-status"><strong>${escapeHtml(member.full_name)}</strong>${statusMarkup(member, true)}</div><small>@${escapeHtml(member.username)} · ${escapeHtml(member.email)}</small></div></div></td><td>${roleCell}</td><td>${departmentCell}</td><td>${presenceCell}</td><td>${statusCell}</td><td>${actionsCell}</td></tr>`;
}

function renderAdmin() {
  if (!canManage()) return '<div class="notice danger">This dashboard is available to CEO, admin, and moderator roles.</div>';
  const awaiting = state.invitations.filter(item => item.status === 'awaiting_approval');
  const proposedRoles = currentRole() === 'ceo' ? ['member', 'moderator', 'admin'] : currentRole() === 'admin' ? ['member', 'moderator'] : ['member'];
  const openInvitations = state.invitations.filter(item => ['invited', 'awaiting_approval'].includes(item.status));
  return `${pageHead('Member administration', 'Invite registered users, approve access, assign roles and departments, and control membership.', '<button class="secondary" data-action="open-members">View people directory</button>')}
  <div class="grid cols-4">
    <div class="card"><div class="small muted">Active members</div><div class="metric">${state.members.filter(member => member.status === 'active').length}</div></div>
    <div class="card"><div class="small muted">Online now</div><div class="metric">${state.members.filter(member => member.status === 'active' && member.current_status === 'online').length}</div></div>
    <div class="card"><div class="small muted">Open invitations</div><div class="metric">${openInvitations.length}</div></div>
    <div class="card"><div class="small muted">Your role</div><div class="metric role-metric">${escapeHtml(currentRole())}</div></div>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <form id="inviteForm" class="card stack"><h3>Invite registered user</h3><div class="notice">Enter the exact username or email. The user accepts first; CEO/admin approval then activates the membership.</div><label>Username or email<input name="identifier" required></label><label>Department<input name="proposed_department" maxlength="80" value="General" required></label><label>Proposed role<select name="proposed_role">${proposedRoles.map(role => `<option value="${role}">${role}</option>`).join('')}</select></label><button class="primary" type="submit">Send invitation</button></form>
    <section class="card"><h3>Join approvals</h3>${awaiting.map(invitation => `<div class="invitation-card"><strong>${escapeHtml(invitation.invited_name)}</strong><p class="small muted">@${escapeHtml(invitation.invited_username)} · ${escapeHtml(invitation.invited_email)}</p><p class="small muted">${escapeHtml(invitation.proposed_department || 'General')} department</p><div>${badge(invitation.proposed_role)} ${badge(invitation.status)}</div>${roleCanApproveMembers(currentRole()) ? `<div class="actions" style="margin-top:10px"><button class="primary" data-action="approve-invite" data-id="${invitation.id}">Approve access</button><button class="danger" data-action="reject-invite" data-id="${invitation.id}">Reject</button></div>` : '<p class="small">CEO or admin approval required.</p>'}</div>`).join('') || '<div class="empty">No accepted invitations await approval.</div>'}</section>
  </div>
  <section class="card table-wrap" style="margin-top:16px"><h3>Role & department management</h3><table><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Presence</th><th>Membership</th><th>Actions</th></tr></thead><tbody>
    ${state.members.map(renderMemberRow).join('')}
  </tbody></table></section>
  <section class="card table-wrap" style="margin-top:16px"><h3>Invitation history</h3><table><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Invited by</th><th>Actions</th></tr></thead><tbody>${state.invitations.map(invitation => `<tr><td>${escapeHtml(invitation.invited_name)}<br><span class="small muted">@${escapeHtml(invitation.invited_username)}</span></td><td>${badge(invitation.proposed_role)}</td><td>${escapeHtml(invitation.proposed_department || 'General')}</td><td>${badge(invitation.status)}</td><td>${escapeHtml(invitation.invited_by_name)}</td><td>${['invited','awaiting_approval'].includes(invitation.status) ? `<button class="danger" data-action="cancel-invite" data-id="${invitation.id}">Cancel</button>` : '<span class="small muted">Completed</span>'}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No invitations yet.</div></td></tr>'}</tbody></table></section>`;
}

function openTaskDialog(taskId = null) {
  const task = state.tasks.find(item => Number(item.id) === Number(taskId));
  const ownerOptions = `<option value="">Unassigned</option>${state.members.filter(member => member.status === 'active').map(member => `<option value="${member.user_id}" ${Number(task?.owner_id) === Number(member.user_id) ? 'selected' : ''}>${escapeHtml(member.full_name)} (${escapeHtml(member.role)})</option>`).join('')}`;
  const overlay = document.createElement('div');
  overlay.id = 'taskDialog';
  overlay.className = 'dialog-backdrop';
  overlay.innerHTML = `<form id="taskForm" class="dialog-card form-grid"><input type="hidden" name="id" value="${task?.id || ''}"><div class="dialog-head full"><h2 id="taskDialogTitle">${task ? 'Edit task' : 'Add task'}</h2><button type="button" class="secondary" data-action="close-dialog">Close</button></div><label>Phase<input name="phase" autofocus value="${escapeHtml(task?.phase || 'General')}"></label><label>Title<input name="title" required value="${escapeHtml(task?.title || '')}"></label><label class="full">Description<textarea name="description">${escapeHtml(task?.description || '')}</textarea></label><label>Owner<select name="owner_id">${ownerOptions}</select></label><label>Priority<select name="priority">${['low','medium','high','critical'].map(value => `<option value="${value}" ${task?.priority === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Status<select name="status">${['not_started','in_progress','blocked','done'].map(value => `<option value="${value}" ${task?.status === value ? 'selected' : ''}>${value.replaceAll('_',' ')}</option>`).join('')}</select></label><label>Progress<input name="progress" type="number" min="0" max="100" value="${task?.progress || 0}"></label><label class="full">Acceptance criteria<textarea name="acceptance_criteria">${escapeHtml(task?.acceptance_criteria || '')}</textarea></label><label>Due date<input name="due_date" type="date" value="${escapeHtml(task?.due_date || '')}"></label><div class="full actions"><button class="primary" type="submit">${task ? 'Save changes' : 'Create task'}</button></div></form>`;
  mountDialog(overlay, 'taskDialogTitle');
}

function openOrganizationDialog() {
  const overlay = document.createElement('div');
  overlay.id = 'organizationDialog';
  overlay.className = 'dialog-backdrop';
  overlay.innerHTML = `<form id="newOrganizationForm" class="dialog-card stack compact-dialog"><div class="dialog-head"><div><p class="eyebrow dark">NEW WORKSPACE</p><h2 id="organizationDialogTitle">Create another organization</h2></div><button type="button" class="secondary" data-action="close-dialog">Close</button></div><p class="muted">You will become the CEO. After creation, Orbit switches to the new organization automatically.</p><label>Organization name<input name="name" autofocus minlength="2" maxlength="120" required placeholder="e.g. Northstar Labs"></label><div class="actions"><button class="primary" type="submit">Create and switch</button></div></form>`;
  mountDialog(overlay, 'organizationDialogTitle');
  overlay.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submitter = event.submitter;
    setButtonBusy(submitter, true);
    try {
      const organization = await api('/api/organizations', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });
      const me = await api('/api/auth/me');
      state.organizations = me.organizations;
      state.workspaceAccess = me.workspace_access;
      state.organizationId = Number(organization.id);
      state.projectId = null;
      state.channelId = null;
      localStorage.setItem('orbit_organization_id', state.organizationId);
      closeDialog(overlay);
      await loadWorkspace();
      toast(`Created and switched to ${organization.name}.`);
    } catch (error) { toast(error.message, true); }
  });
}

function openProfileDialog() {
  state.view = 'profile';
  render();
}

async function refreshCurrent() {
  const me = await api('/api/auth/me');
  state.user = me.user;
  state.presence = me.presence || state.presence;
  state.settings = me.settings || state.settings;
  state.unreadNotificationCount = Number(me.unread_notification_count || 0);
  applyTheme(state.settings?.theme || 'light');
  state.organizations = me.organizations;
  state.workspaceAccess = me.workspace_access;
  const activeOrganizations = state.organizations.filter(item => item.membership_status === 'active');
  if (!activeOrganizations.some(item => Number(item.id) === Number(state.organizationId))) {
    state.organizationId = activeOrganizations[0] ? Number(activeOrganizations[0].id) : null;
  }
  if (!state.organizationId) {
    clearWorkspaceSelection();
    showSetup();
    return;
  }
  localStorage.setItem('orbit_organization_id', state.organizationId);
  await loadWorkspace();
  toast('Workspace refreshed.');
}

async function downloadExport(format) {
  const path = format === 'csv' ? `/api/projects/${state.projectId}/tasks.csv` : `/api/projects/${state.projectId}/export.json`;
  const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) throw new Error('Export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = format === 'csv' ? `project-${state.projectId}-tasks.csv` : `project-${state.projectId}-export.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

$('#loginTab').addEventListener('click', () => switchAuthTab('login'));
$('#registerTab').addEventListener('click', () => switchAuthTab('register'));
$('#forgotPasswordBtn').addEventListener('click', showForgotPassword);
$('#backToLoginBtn').addEventListener('click', () => switchAuthTab('login'));
$('#sendResetCodeBtn').addEventListener('click', async event => {
  const button = event.currentTarget;
  const formElement = $('#forgotPasswordForm');
  const email = new FormData(formElement).get('email');
  if (!email) { toast('Enter your email address first.', true); return; }
  setButtonBusy(button, true);
  try {
    const result = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    $('#resetPasswordFields').classList.remove('hidden');
    const codeInput = formElement.querySelector('[name="code"]');
    const passwordInput = formElement.querySelector('[name="password"]');
    codeInput.required = true;
    passwordInput.required = true;
    if (result.dev_reset_code) codeInput.value = result.dev_reset_code;
    toast(result.dev_reset_code ? `Development reset code: ${result.dev_reset_code}` : 'Reset code sent. Check your email.');
    codeInput.focus();
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(button, false); }
});
$('#setupLogout').addEventListener('click', () => logout());
$('#setupRefresh').addEventListener('click', () => bootstrap().then(() => toast('Approval status checked.')).catch(error => toast(error.message, true)));
$('#logoutBtn').addEventListener('click', () => logout());
$('#refreshBtn').addEventListener('click', () => refreshCurrent().catch(error => toast(error.message, true)));
$('#newOrganizationBtn').addEventListener('click', openOrganizationDialog);
$('#mobileNewOrganizationBtn').addEventListener('click', openOrganizationDialog);
mobileNavToggle?.addEventListener('click', () => toggleMobileNavigation());
sidebarBackdrop?.addEventListener('click', () => toggleMobileNavigation(false));
presenceSelect.addEventListener('change', async () => {
  if (presenceSelect.value === 'custom') {
    state.view = 'profile';
    render();
    toast('Add your custom label from Profile.');
    return;
  }
  try {
    state.presence = await api('/api/presence/me', { method: 'PATCH', body: JSON.stringify({ status_key: presenceSelect.value }) });
    if (state.organizationId) state.members = await api(`/api/organizations/${state.organizationId}/members`);
    updateShell();
    render();
    toast(`Status set to ${state.presence.status_emoji} ${state.presence.status_label}.`);
  } catch (error) { toast(error.message, true); }
});

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }) });
    saveToken(result.token);
    formElement.reset();
    await bootstrap();
    toast('Signed in successfully.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

$('#registerForm').addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  try {
    const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ full_name: form.get('full_name'), username: form.get('username'), email: form.get('email'), password: form.get('password') }) });
    saveToken(result.token);
    formElement.reset();
    await bootstrap();
    toast('Your user ID has been created.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

$('#forgotPasswordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  try {
    const result = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), code: form.get('code'), password: form.get('password') })
    });
    formElement.reset();
    $('#resetPasswordFields').classList.add('hidden');
    switchAuthTab('login');
    toast(result.message || 'Password updated. Sign in with your new password.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

$('#organizationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  try {
    const organization = await api('/api/organizations', { method: 'POST', body: JSON.stringify({ name: form.get('name') }) });
    state.organizationId = Number(organization.id);
    localStorage.setItem('orbit_organization_id', state.organizationId);
    setOnboardingDeferred(false);
    formElement.reset();
    await bootstrap();
    toast('Organization created. Workspace access is now unlocked.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

setupScreen.addEventListener('click', async event => {
  const button = event.target.closest('[data-setup-action]');
  if (!button) return;
  const action = button.dataset.setupAction;
  setButtonBusy(button, true);

  try {
    if (action === 'defer-onboarding') {
      setOnboardingDeferred(true);
      renderOnboardingState();
      toast('Organization setup skipped for now. Workspace modules remain locked.');
      return;
    }
    if (action === 'show-onboarding-options') {
      setOnboardingDeferred(false);
      renderOnboardingState();
      return;
    }
    if (action === 'refresh-membership') {
      await bootstrap();
      toast('Organization access checked.');
      return;
    }
    if (!['accept-invite', 'decline-invite'].includes(action)) return;

    await api(`/api/invitations/${button.dataset.id}/${action === 'accept-invite' ? 'accept' : 'decline'}`, { method: 'POST' });
    const me = await api('/api/auth/me');
    state.organizations = me.organizations;
    state.workspaceAccess = me.workspace_access;
    state.myInvitations = await api('/api/invitations/me');
    renderSetupInvitations();
    renderOnboardingState();
    toast(action === 'accept-invite' ? 'Accepted. Workspace stays locked until CEO/admin approval.' : 'Invitation declined.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(button, false); }
});

async function switchView(view) {
  try {
    state.view = view;
    if (state.view === 'notifications') {
      const result = await api('/api/users/me/notifications?limit=100');
      state.notifications = result.items || [];
      state.unreadNotificationCount = Number(result.unread_count || 0);
      updateShell();
    }
    if (state.view === 'activity') state.activity = await api('/api/users/me/activity?limit=100');
    render();
    toggleMobileNavigation(false);
    mainContent.focus();
  } catch (error) { toast(error.message, true); }
}

$('#mainNav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  switchView(button.dataset.view);
});

$('#headerNotificationBtn').addEventListener('click', () => switchView('notifications'));
$('#sidebarProfileBtn').addEventListener('click', () => switchView('profile'));

async function switchOrganization(organizationId) {
  state.organizationId = Number(organizationId);
  state.projectId = null;
  state.channelId = null;
  state.memberSearch = '';
  state.memberDepartment = 'all';
  state.memberPresence = 'all';
  localStorage.setItem('orbit_organization_id', state.organizationId);
  await loadWorkspace();
  toast(`Switched to ${state.organization.name}.`);
}

organizationSelect.addEventListener('change', () => switchOrganization(organizationSelect.value).catch(error => toast(error.message, true)));
mobileOrganizationSelect.addEventListener('change', () => switchOrganization(mobileOrganizationSelect.value).catch(error => toast(error.message, true)));

projectSelect.addEventListener('change', async () => {
  try {
    state.projectId = Number(projectSelect.value) || null;
    if (state.projectId) localStorage.setItem('orbit_project_id', state.projectId);
    await loadProjectData();
    render();
  } catch (error) { renderWorkspaceError(error, 'retry-workspace'); toast(error.message, true); }
});

mainContent.addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.target;
  const form = new FormData(formElement);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  try {
    if (formElement.id === 'channelForm') {
      const channel = await api(`/api/organizations/${state.organizationId}/channels`, { method: 'POST', body: JSON.stringify({ name: form.get('name'), topic: form.get('topic') }) });
      state.channelId = Number(channel.id);
      await loadWorkspace();
      toast('Channel created.');
    } else if (formElement.id === 'messageForm') {
      await api(`/api/channels/${state.channelId}/messages`, { method: 'POST', body: JSON.stringify({ body: form.get('body') }) });
      formElement.reset();
      await loadMessages();
      render();
    } else if (formElement.id === 'projectForm') {
      const project = await api(`/api/organizations/${state.organizationId}/projects`, { method: 'POST', body: JSON.stringify({ name: form.get('name'), objective: form.get('objective'), scope: form.get('scope'), constraints: form.get('constraints'), assumptions: form.get('assumptions'), brief: form.get('brief') }) });
      state.projectId = Number(project.id);
      state.view = 'work';
      await loadWorkspace();
      toast('Project created.');
    } else if (formElement.id === 'meetingForm') {
      const result = await api(`/api/projects/${state.projectId}/meeting-notes`, { method: 'POST', timeoutMs: 60_000, body: JSON.stringify({ notes: form.get('notes') }) });
      await loadProjectData();
      render();
      toast(result.fallback_used ? 'Meeting proposals created with local fallback.' : `AI analyzed meeting notes with ${result.ai_provider}.`);
    } else if (formElement.id === 'changeForm') {
      const result = await api(`/api/projects/${state.projectId}/changes`, { method: 'POST', timeoutMs: 60_000, body: JSON.stringify({ title: form.get('title'), description: form.get('description'), requested_by: form.get('requested_by') }) });
      await loadProjectData();
      render();
      toast(result.fallback_used ? 'Change analyzed with local fallback.' : `AI change analysis completed with ${result.ai_provider}.`);
    } else if (formElement.id === 'profilePageForm') {
      state.user = await api('/api/users/me/profile', { method: 'PATCH', body: JSON.stringify({ full_name: form.get('full_name'), avatar_url: form.get('avatar_url') }) });
      state.members = await api(`/api/organizations/${state.organizationId}/members`);
      updateShell();
      render();
      toast('Profile updated.');
    } else if (formElement.id === 'statusPageForm') {
      const statusKey = form.get('status_key');
      state.presence = await api('/api/presence/me', { method: 'PATCH', body: JSON.stringify({ status_key: statusKey, status_label: form.get('status_label'), status_emoji: form.get('status_emoji'), custom_status: form.get('custom_status') }) });
      state.members = await api(`/api/organizations/${state.organizationId}/members`);
      updateShell();
      render();
      toast(`Status updated to ${state.presence.status_emoji} ${state.presence.status_label}.`);
    } else if (formElement.id === 'settingsForm') {
      state.settings = await api('/api/users/me/settings', { method: 'PATCH', body: JSON.stringify({
        theme: form.get('theme'),
        workspace_notifications: formElement.elements.workspace_notifications.checked,
        mention_notifications: formElement.elements.mention_notifications.checked,
        invitation_notifications: formElement.elements.invitation_notifications.checked,
        activity_notifications: formElement.elements.activity_notifications.checked
      }) });
      state.presence = await api('/api/presence/me', { method: 'PATCH', body: JSON.stringify({ presence_mode: form.get('presence_mode') }) });
      applyTheme(state.settings.theme);
      state.members = await api(`/api/organizations/${state.organizationId}/members`);
      updateShell();
      render();
      toast('Settings saved.');
    } else if (formElement.id === 'inviteForm') {
      await api(`/api/organizations/${state.organizationId}/invitations`, { method: 'POST', body: JSON.stringify({ identifier: form.get('identifier'), proposed_role: form.get('proposed_role'), proposed_department: form.get('proposed_department') }) });
      formElement.reset();
      await loadWorkspace();
      toast('Invitation sent to the registered user.');
    }
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

mainContent.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  setButtonBusy(button, true);
  try {
    if (action === 'ai-assist-field') {
      const field = document.getElementById(button.dataset.targetId);
      if (field) await openAiSuggestionDialog(field);
    } else if (action === 'retry-workspace') {
      await loadWorkspace();
      toast('Workspace loaded.');
    } else if (action === 'retry-render') {
      render();
    } else if (action === 'revoke-other-sessions') {
      const result = await api('/api/users/me/sessions/revoke-others', { method: 'POST' });
      state.sessions = await api('/api/users/me/sessions');
      render();
      toast(`${result.revoked_count} other session(s) signed out.`);
    } else if (action === 'revoke-session') {
      const result = await api(`/api/users/me/sessions/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
      if (result.current) { logout(); return; }
      state.sessions = await api('/api/users/me/sessions');
      render();
      toast('Session revoked.');
    } else if (action === 'open-admin') {
      state.view = 'admin'; render();
    } else if (action === 'open-intake') {
      state.view = 'intake'; render();
    } else if (action === 'open-members') {
      state.view = 'members'; render();
    } else if (action === 'edit-profile') {
      state.view = 'profile'; render();
    } else if (action === 'mark-notification-read') {
      const updated = await api(`/api/notifications/${button.dataset.id}/read`, { method: 'PATCH' });
      state.notifications = state.notifications.map(item => Number(item.id) === Number(updated.id) ? { ...item, read_at: updated.read_at } : item);
      state.unreadNotificationCount = Math.max(0, state.unreadNotificationCount - 1);
      updateShell(); render();
    } else if (action === 'read-all-notifications') {
      await api('/api/users/me/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      state.notifications = state.notifications.map(item => ({ ...item, read_at: item.read_at || now }));
      state.unreadNotificationCount = 0;
      updateShell(); render(); toast('All notifications marked as read.');
    } else if (action === 'open-notification') {
      const item = state.notifications.find(notification => Number(notification.id) === Number(button.dataset.id));
      if (item && !item.read_at) {
        const updated = await api(`/api/notifications/${button.dataset.id}/read`, { method: 'PATCH' });
        item.read_at = updated.read_at;
        state.unreadNotificationCount = Math.max(0, state.unreadNotificationCount - 1);
      }
      const destination = button.dataset.view;
      state.view = destination === 'admin' && !canManage() ? 'notifications' : (viewTitles[destination] ? destination : 'notifications');
      if (state.view === 'activity') state.activity = await api('/api/users/me/activity?limit=100');
      updateShell(); render();
    } else if (action === 'refresh-activity') {
      state.activity = await api('/api/users/me/activity?limit=100');
      render(); toast('Account activity refreshed.');
    } else if (action === 'select-channel') {
      state.channelId = Number(button.dataset.id);
      localStorage.setItem('orbit_channel_id', state.channelId);
      await loadMessages();
      render();
    } else if (action === 'scan-risks') {
      const result = await api(`/api/projects/${state.projectId}/risks/scan`, { method: 'POST', timeoutMs: 60_000 });
      await loadProjectData(); render(); toast(result.fallback_used ? 'Risk scan completed with local rules.' : `AI risk scan completed with ${result.ai_provider}.`);
    } else if (action === 'generate-plan') {
      openGeneratePlanDialog();
    } else if (action === 'open-task') {
      openTaskDialog(button.dataset.id ? Number(button.dataset.id) : null);
    } else if (action === 'approve-task') {
      await api(`/api/tasks/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ approved: true, rejected: false }) });
      await loadProjectData(); render(); toast('Task approved.');
    } else if (action === 'reject-task') {
      if (!confirm('Reject this task?')) return;
      await api(`/api/tasks/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ rejected: true }) });
      await loadProjectData(); render(); toast('Task rejected.');
    } else if (action === 'regenerate-task') {
      const result = await api(`/api/tasks/${button.dataset.id}/regenerate`, { method: 'POST', timeoutMs: 60_000 });
      await loadProjectData(); render(); toast(result.fallback_used ? 'Task regenerated with local fallback.' : `Task regenerated with ${result.ai_provider}.`);
    } else if (action === 'approve-suggestion' || action === 'reject-suggestion') {
      await api(`/api/suggestions/${button.dataset.id}/${action.startsWith('approve') ? 'approve' : 'reject'}`, { method: 'POST' });
      await loadProjectData(); render(); toast(`Suggestion ${action.startsWith('approve') ? 'approved' : 'rejected'}.`);
    } else if (action === 'approve-risk') {
      await api(`/api/risks/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ approved: true }) });
      await loadProjectData(); render(); toast('Risk warning approved.');
    } else if (action === 'review-change') {
      await api(`/api/changes/${button.dataset.id}/${button.dataset.review}`, { method: 'POST' });
      await loadProjectData(); render(); toast(`Change ${button.dataset.review}d.`);
    } else if (action === 'download') {
      await downloadExport(button.dataset.format);
    } else if (action === 'approve-invite' || action === 'reject-invite' || action === 'cancel-invite') {
      const endpoint = action === 'approve-invite' ? 'approve' : action === 'reject-invite' ? 'reject' : 'cancel';
      if (action === 'cancel-invite' && !confirm('Cancel this invitation?')) return;
      await api(`/api/invitations/${button.dataset.id}/${endpoint}`, { method: 'POST' });
      await loadWorkspace();
      toast(action === 'approve-invite' ? 'Member access approved.' : action === 'reject-invite' ? 'Invitation rejected.' : 'Invitation cancelled.');
    } else if (action === 'save-member') {
      const id = button.dataset.id;
      const role = $(`[data-member-role="${id}"]`)?.value;
      const department = $(`[data-member-department="${id}"]`)?.value;
      const status = $(`[data-member-status="${id}"]`)?.value;
      await api(`/api/memberships/${id}`, { method: 'PATCH', body: JSON.stringify({ role, department, status }) });
      await loadWorkspace(); toast('Member access updated.');
    } else if (action === 'remove-member') {
      if (!confirm('Remove this member from the organization?')) return;
      await api(`/api/memberships/${button.dataset.id}`, { method: 'DELETE' });
      await loadWorkspace(); toast('Member removed.');
    }
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(button, false); }
});

document.body.addEventListener('click', event => {
  const themeButton = event.target.closest('[data-theme-toggle]');
  if (themeButton) {
    toggleTheme();
    return;
  }
  const closeButton = event.target.closest('[data-action="close-dialog"]');
  if (closeButton) {
    closeDialog(closeButton.closest('.dialog-backdrop'));
    return;
  }
  if (event.target.classList?.contains('dialog-backdrop')) closeDialog(event.target);
});

document.addEventListener('error', event => {
  if (event.target.matches?.('.avatar img')) event.target.remove();
}, true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') heartbeat(true);
});

updateThemeToggleButtons();
updateNetworkStatus();
window.addEventListener('online', () => { updateNetworkStatus(); toast('Connection restored.'); refreshCurrent().catch(() => {}); });
window.addEventListener('offline', updateNetworkStatus);
window.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('mobile-nav-open')) toggleMobileNavigation(false); });

mainContent.addEventListener('input', event => {
  if (['memberSearch', 'memberDepartment', 'memberPresence'].includes(event.target.id)) applyMemberFilters();
});
mainContent.addEventListener('change', event => {
  if (['memberDepartment', 'memberPresence'].includes(event.target.id)) applyMemberFilters();
  if (event.target.matches('[name="status_key"]')) $('#customStatusFields')?.classList.toggle('hidden', event.target.value !== 'custom');
});

document.body.addEventListener('submit', async event => {
  if (event.target.id !== 'taskForm') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const submitter = event.submitter;
  setButtonBusy(submitter, true);
  const id = Number(form.get('id')) || null;
  const payload = {
    phase: form.get('phase'), title: form.get('title'), description: form.get('description'),
    owner_id: form.get('owner_id') ? Number(form.get('owner_id')) : null,
    priority: form.get('priority'), status: form.get('status'), progress: Number(form.get('progress') || 0),
    acceptance_criteria: form.get('acceptance_criteria'), due_date: form.get('due_date') || null
  };
  try {
    if (id) await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api(`/api/projects/${state.projectId}/tasks`, { method: 'POST', body: JSON.stringify(payload) });
    closeDialog($('#taskDialog'));
    await loadProjectData();
    render();
    toast(id ? 'Task updated.' : 'Task created.');
  } catch (error) { toast(error.message, true); } finally { setButtonBusy(submitter, false); }
});

bootstrap();
