'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('async form handlers keep a stable form reference', () => {
  assert.doesNotMatch(appSource, /event\.currentTarget\.reset\s*\(/);
  assert.doesNotMatch(appSource, /event\.target\.reset\s*\(/);
  assert.match(appSource, /const formElement = event\.currentTarget;[\s\S]*?formElement\.reset\(\);/);
  assert.match(appSource, /const formElement = event\.target;[\s\S]*?formElement\.reset\(\);/);
});


test('no-organization users remain in onboarding until active membership exists', () => {
  assert.match(appSource, /workspace_access/);
  assert.match(appSource, /if \(!canAccessWorkspace \|\| !activeOrganizations\.length\)/);
  assert.match(appSource, /showSetup\(\);/);
  assert.match(htmlSource, /Organization creation is optional\./);
  assert.match(htmlSource, /Do this later/);
  assert.match(htmlSource, /dashboard, projects, tasks, channels, reports, team members, and analytics remain locked/);
});


test('fresh build contains no demo login or bundled workspace identity', () => {
  assert.doesNotMatch(htmlSource, /Demo:/i);
  assert.doesNotMatch(htmlSource, /Ayesha Khan|Acme Workspace|Password123!/i);
});

test('iteration 2 interface exposes people, presence, departments, invitations, and organization switching', () => {
  assert.match(htmlSource, /data-view="members"/);
  assert.match(htmlSource, /id="presenceSelect"/);
  assert.match(htmlSource, /id="newOrganizationBtn"/);
  assert.match(appSource, /function renderMembers\(\)/);
  assert.match(appSource, /proposed_department/);
  assert.match(appSource, /data-member-department/);
  assert.match(appSource, /\/api\/presence\/heartbeat/);
  assert.match(appSource, /current_status/);
});

test('iteration 3 interface exposes profile, notifications, activity, settings, themes, and workspace statuses', () => {
  assert.match(htmlSource, /data-view="profile"/);
  assert.match(htmlSource, /data-view="notifications"/);
  assert.match(htmlSource, /data-view="activity"/);
  assert.match(htmlSource, /data-view="settings"/);
  assert.match(appSource, /☀️ Light/);
  assert.match(appSource, /🌙 Dark/);
  assert.doesNotMatch(appSource, /💻 System/);
  assert.match(htmlSource, /data-theme-toggle/);
  assert.match(appSource, /function toggleTheme\(\)/);
  assert.match(htmlSource, /🟢 Available/);
  assert.match(htmlSource, /🔴 Busy/);
  assert.match(htmlSource, /🏖️ On Leave/);
  assert.match(htmlSource, /🏠 Remote/);
  assert.match(appSource, /function renderProfile\(\)/);
  assert.match(appSource, /function renderNotifications\(\)/);
  assert.match(appSource, /function renderActivity\(\)/);
  assert.match(appSource, /function renderSettings\(\)/);
  assert.match(appSource, /statusMarkup/);
  assert.match(appSource, /orbit_theme/);
});

test('iteration 4 adds accessibility, loading, offline, responsive navigation, and recoverable errors', () => {
  assert.match(htmlSource, /class="skip-link"/);
  assert.match(htmlSource, /id="globalLoading"/);
  assert.match(htmlSource, /id="networkBanner"/);
  assert.match(htmlSource, /id="mobileNavToggle"/);
  assert.match(htmlSource, /aria-busy="false"/);
  assert.match(htmlSource, /role="tablist"/);
  assert.match(appSource, /function mountDialog\(/);
  assert.match(appSource, /aria-modal/);
  assert.match(appSource, /function renderWorkspaceError\(/);
  assert.match(appSource, /AbortController/);
  assert.match(appSource, /credentials: 'same-origin'/);
  assert.match(appSource, /function updateNetworkStatus\(/);
  assert.match(appSource, /\/api\/users\/me\/sessions/);
});

test('strict CSP-compatible theme initialization uses an external script', () => {
  assert.match(htmlSource, /<script src="\/theme-init\.js"><\/script>/);
  assert.doesNotMatch(htmlSource, /<script>\s*\(\(\) =>/);
});

test('authentication screen is centered and exposes password recovery UI', () => {
  assert.doesNotMatch(htmlSource, /auth-hero/);
  assert.match(htmlSource, /id="forgotPasswordBtn"/);
  assert.match(htmlSource, /id="forgotPasswordForm"/);
  assert.match(htmlSource, /id="sendResetCodeBtn"/);
  assert.match(htmlSource, /id="resetPasswordFields"/);
  assert.match(appSource, /\/api\/auth\/forgot-password/);
  assert.match(appSource, /\/api\/auth\/reset-password/);
});

test('v2.7 exposes editable AI suggestions and AI plan dialog', () => {
  assert.match(appSource, /AI Suggest/);
  assert.match(appSource, /Accept suggestion/);
  assert.match(appSource, /Regenerate/);
  assert.match(appSource, /openGeneratePlanDialog/);
  assert.match(appSource, /\/api\/ai\/suggest/);
  assert.match(appSource, /AI connected/);
});


test('AI field assistant works inside dialogs mounted outside mainContent', () => {
  assert.match(appSource, /button\.addEventListener\('click', async event =>/);
  assert.match(appSource, /event\.stopPropagation\(\)/);
  assert.match(appSource, /await openAiSuggestionDialog\(field\)/);
  assert.match(appSource, /name="brief"/);
});
