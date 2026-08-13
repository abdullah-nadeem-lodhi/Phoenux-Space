'use strict';

const config = require('./config');
const provider = require('./aiProvider');

function clean(value) {
  return String(value || '').trim();
}

function chooseOwner(members, keywords = []) {
  if (!members.length) return null;
  const scored = members.map(member => {
    const haystack = `${member.full_name || ''} ${member.username || ''} ${member.role || ''}`.toLowerCase();
    const score = keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
    return { id: member.user_id || member.id, score };
  }).sort((a, b) => b.score - a.score || a.id - b.id);
  return scored[0]?.id || null;
}

function proposePlan(project, members, brief = '') {
  const objective = clean(project.objective) || clean(brief) || `Deliver ${project.name}`;
  const pm = chooseOwner(members, ['ceo', 'admin', 'moderator', 'project']);
  const builder = chooseOwner(members, ['developer', 'engineer', 'backend', 'frontend', 'member']);
  const reviewer = chooseOwner(members, ['moderator', 'admin', 'quality', 'test']);
  const tasks = [
    ['Discovery', 'Confirm objectives and success measures', `Confirm the intended outcome for: ${objective}`, pm, 'high', 'Objectives, success measures, constraints, and unresolved questions are documented and approved.', []],
    ['Discovery', 'Validate scope and assumptions', `Review the stored scope, constraints, assumptions, and source brief for ${project.name}.`, pm, 'high', 'Scope boundaries and assumptions are traceable to approved records.', [0]],
    ['Planning', 'Create delivery milestones', 'Convert the approved scope into sequenced milestones with owners and measurable outcomes.', pm, 'high', 'Milestones, owners, dependencies, and review points are recorded.', [1]],
    ['Design', 'Prepare solution and user workflow', 'Define the proposed workflow, data needs, permissions, and acceptance criteria.', builder, 'medium', 'The proposed design is reviewed and covers the approved scope.', [1]],
    ['Build', 'Implement approved project scope', 'Build only the approved requirements and record implementation evidence.', builder, 'high', 'Approved requirements are implemented and linked to verification evidence.', [2, 3]],
    ['Quality', 'Verify acceptance criteria', 'Test the implemented work against stored acceptance criteria and record defects.', reviewer, 'high', 'Verification results and unresolved defects are recorded.', [4]],
    ['Launch', 'Complete launch readiness review', 'Review security, support, documentation, communications, and rollback readiness.', pm, 'high', 'Launch readiness is approved by an authorized workspace manager.', [5]],
    ['Operations', 'Publish factual project update', 'Generate a status update from stored task, risk, decision, and change records.', pm, 'medium', 'The update contains no unsupported completion claims.', [6]]
  ];
  return tasks.map(([phase, title, description, ownerId, priority, acceptanceCriteria, depends]) => ({
    phase,
    title,
    description,
    owner_id: ownerId,
    priority,
    status: 'not_started',
    progress: 0,
    acceptance_criteria: acceptanceCriteria,
    due_date: null,
    depends_on_proposal_indexes: depends
  }));
}

function parseMeetingNotes(notes, members) {
  const memberNames = members.map(member => member.full_name).filter(Boolean);
  const sentences = String(notes).split(/(?<=[.!?])\s+|\n+/).map(value => value.trim()).filter(value => value.length >= 5);
  const suggestions = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const ownerName = memberNames.find(name => lower.includes(name.toLowerCase())) || '';
    if (/\b(decided|decision|agreed|approved)\b/.test(lower)) {
      suggestions.push({
        suggestion_type: 'decision',
        payload: { title: sentence.slice(0, 120), detail: sentence, owner: ownerName },
        rationale: 'Decision-oriented language was detected.',
        evidence: sentence
      });
    } else if (/\b(blocked|blocker|waiting|cannot|dependency|risk)\b/.test(lower)) {
      suggestions.push({
        suggestion_type: 'risk',
        payload: { risk_type: 'meeting_note', severity: /critical|urgent/.test(lower) ? 'high' : 'medium', title: sentence.slice(0, 120), description: sentence },
        rationale: 'Risk or blocker language was detected.',
        evidence: sentence
      });
    } else if (/\b(will|must|needs? to|action|follow[- ]?up|todo|assign)\b/.test(lower)) {
      suggestions.push({
        suggestion_type: 'task',
        payload: {
          phase: 'Meeting Follow-up',
          title: sentence.slice(0, 120),
          description: sentence,
          owner_name: ownerName,
          priority: /urgent|critical|must/.test(lower) ? 'high' : 'medium',
          acceptance_criteria: 'The stated follow-up is completed and supporting evidence is recorded.'
        },
        rationale: 'Action-oriented language was detected.',
        evidence: sentence
      });
    }
  }
  if (!suggestions.length) {
    suggestions.push({
      suggestion_type: 'clarification',
      payload: { question: 'No explicit action, decision, or blocker was detected. Please review the notes manually.' },
      rationale: 'The notes did not contain sufficiently explicit project language.',
      evidence: String(notes).slice(0, 300)
    });
  }
  return suggestions;
}

function analyzeChange(description, taskCount, activeOwnerCounts) {
  const lower = String(description).toLowerCase();
  const overloaded = Object.entries(activeOwnerCounts).filter(([, count]) => count >= 5).map(([name]) => name);
  return {
    impact_scope: /\b(add|new|extra|include|support)\b/.test(lower) ? 'Likely scope expansion' : 'Scope effect requires review',
    impact_effort: /\b(redesign|migration|integration|replace|all users)\b/.test(lower) ? 'High' : 'Medium',
    impact_dependencies: taskCount ? 'Re-check downstream build, test, and delivery dependencies.' : 'No stored tasks exist; dependency effect cannot yet be measured.',
    impact_workload: overloaded.length ? `Potential overload for: ${overloaded.join(', ')}` : 'No current owner overload is shown by stored active-task counts.'
  };
}

function risk(type, severity, title, description, evidence) {
  return { risk_type: type, severity, title, description, evidence };
}

function scanRisks(tasks, members, dependencies) {
  const results = [];
  const memberMap = new Map(members.map(member => [Number(member.user_id || member.id), member]));
  const taskMap = new Map(tasks.map(task => [Number(task.id), task]));
  const activeByOwner = new Map();
  const today = new Date().toISOString().slice(0, 10);

  for (const task of tasks) {
    if (task.status !== 'done' && task.owner_id) {
      const list = activeByOwner.get(Number(task.owner_id)) || [];
      list.push(task);
      activeByOwner.set(Number(task.owner_id), list);
    }
    if (!task.owner_id && task.status !== 'done') results.push(risk('ownership', 'medium', `Unowned task: ${task.title}`, 'The task has no responsible owner.', `Task #${task.id} owner_id is empty.`));
    if (task.status === 'blocked') results.push(risk('blocker', 'high', `Blocked task: ${task.title}`, 'The stored task state is blocked.', `Task #${task.id} status=blocked.`));
    if (task.status === 'done' && Number(task.progress) < 100) results.push(risk('conflict', 'high', `Contradictory task record: ${task.title}`, 'A completed task has progress below 100%.', `Task #${task.id} status=done but progress=${task.progress}%.`));
    if (task.status === 'not_started' && Number(task.progress) > 0) results.push(risk('conflict', 'medium', `Contradictory task record: ${task.title}`, 'A not-started task has recorded progress.', `Task #${task.id} status=not_started but progress=${task.progress}%.`));
    if (['high', 'critical'].includes(task.priority) && !clean(task.acceptance_criteria)) results.push(risk('requirement', 'medium', `Missing completion criteria: ${task.title}`, 'A high-priority task lacks acceptance criteria.', `Task #${task.id} acceptance_criteria is empty.`));
    if (task.due_date && task.status !== 'done' && /^\d{4}-\d{2}-\d{2}$/.test(task.due_date) && task.due_date < today) results.push(risk('schedule', 'high', `Overdue task: ${task.title}`, 'The task due date has passed and it is not complete.', `Task #${task.id} due_date=${task.due_date}, status=${task.status}.`));
  }

  for (const [ownerId, ownerTasks] of activeByOwner.entries()) {
    const member = memberMap.get(ownerId);
    const capacity = Number(member?.capacity || 5);
    if (ownerTasks.length > capacity) {
      const name = member?.full_name || `User ${ownerId}`;
      results.push(risk('workload', 'high', `Owner workload exceeds capacity: ${name}`, `${ownerTasks.length} active tasks exceed the stored capacity of ${capacity}.`, `Active task IDs: ${ownerTasks.map(task => task.id).join(', ')}`));
    }
  }

  for (const dependency of dependencies) {
    const task = taskMap.get(Number(dependency.task_id));
    const prerequisite = taskMap.get(Number(dependency.depends_on_task_id));
    if (task && prerequisite && ['in_progress', 'done'].includes(task.status) && prerequisite.status !== 'done') {
      results.push(risk('dependency', 'high', `Unresolved prerequisite for: ${task.title}`, 'Work has advanced while a prerequisite is not complete.', `Task #${task.id} depends on task #${prerequisite.id} with status=${prerequisite.status}.`));
    }
  }
  return results;
}

function externalModelEnabled() {
  return provider.enabled();
}

function aiStatus() {
  return provider.status();
}

function memberSummary(members) {
  return (members || []).map(member => ({
    user_id: Number(member.user_id || member.id),
    full_name: member.full_name || '',
    role: member.role || '',
    department: member.department || 'General',
    capacity: Number(member.capacity || 5)
  }));
}

function projectContext(project, extra = {}) {
  return {
    id: Number(project.id),
    name: clean(project.name),
    objective: clean(project.objective),
    scope: clean(project.scope),
    constraints: clean(project.constraints),
    assumptions: clean(project.assumptions),
    status: clean(project.status),
    ...extra
  };
}

const planSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phase: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          owner_id: { type: ['integer', 'null'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          acceptance_criteria: { type: 'string' },
          due_date: { type: ['string', 'null'] },
          depends_on_proposal_indexes: { type: 'array', items: { type: 'integer' } }
        },
        required: ['phase', 'title', 'description', 'owner_id', 'priority', 'acceptance_criteria', 'due_date', 'depends_on_proposal_indexes']
      }
    }
  },
  required: ['tasks']
};

async function generatePlan(project, members, brief = '') {
  if (!provider.enabled()) return { items: proposePlan(project, members, brief), provider: 'local_javascript_engine', fallback: true };
  const allowedOwners = new Set(memberSummary(members).map(member => member.user_id));
  try {
    const result = await provider.generateJson({
      system: 'You are a senior project delivery planner. Build a practical, project-specific work breakdown from the supplied facts. Never invent named people, approvals, completed work, or requirements that are not present. Tasks are proposals and must be reviewable by a human.',
      prompt: `Create 6 to 14 sequenced tasks for this project. Make titles concrete, descriptions actionable, and acceptance criteria measurable. Use only owner_id values from the provided members, or null. Dependency indexes are zero-based indexes into the returned tasks array and must only point backward. Use YYYY-MM-DD for a due date only when the supplied project information provides enough schedule information; otherwise use null.\n\nProject:\n${JSON.stringify(projectContext(project, { brief: clean(brief) }))}\n\nMembers:\n${JSON.stringify(memberSummary(members))}`,
      schema: planSchema
    });
    const items = (Array.isArray(result.tasks) ? result.tasks : []).slice(0, 14).map((task, index) => ({
      phase: clean(task.phase).slice(0, 120) || 'Planning',
      title: clean(task.title).slice(0, 220) || `Project task ${index + 1}`,
      description: clean(task.description).slice(0, 10000),
      owner_id: allowedOwners.has(Number(task.owner_id)) ? Number(task.owner_id) : null,
      priority: ['low', 'medium', 'high', 'critical'].includes(task.priority) ? task.priority : 'medium',
      status: 'not_started',
      progress: 0,
      acceptance_criteria: clean(task.acceptance_criteria).slice(0, 10000),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(clean(task.due_date)) ? clean(task.due_date) : null,
      depends_on_proposal_indexes: [...new Set((Array.isArray(task.depends_on_proposal_indexes) ? task.depends_on_proposal_indexes : [])
        .map(Number).filter(dep => Number.isInteger(dep) && dep >= 0 && dep < index))]
    })).filter(task => task.title);
    if (items.length < 3) throw new Error('AI returned too few usable tasks');
    return { items, provider: `${provider.providerName()}:${config.externalAi.model}`, fallback: false };
  } catch (error) {
    console.error('External AI plan generation failed; using local fallback:', error.message);
    return { items: proposePlan(project, members, brief), provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}

const suggestionSchema = {
  type: 'object',
  properties: {
    suggestion: { type: 'string' },
    rationale: { type: 'string' }
  },
  required: ['suggestion', 'rationale']
};

function localFieldSuggestion({ fieldName, value, formContext = {} }) {
  const current = clean(value);
  const field = clean(fieldName).toLowerCase();
  const nearby = Object.entries(formContext || {}).filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${clean(v)}`).join('; ');
  if (field.includes('objective')) return `Deliver a clear, measurable outcome for ${clean(formContext.name) || 'the project'}, with agreed scope, owners, quality checks, and completion criteria.`;
  if (field.includes('scope')) return current || `Define the included deliverables, user-facing outcomes, integrations, quality requirements, and explicit out-of-scope items${nearby ? ` based on ${nearby}` : ''}.`;
  if (field.includes('acceptance')) return current || 'The expected outcome is completed, reviewed, testable, and supported by recorded evidence with no unresolved critical issues.';
  if (field.includes('description')) return current ? `${current}\n\nClarify the expected outcome, owner, dependencies, constraints, and verification evidence before completion.` : `Describe the requested work, expected outcome, dependencies, constraints, and how completion will be verified${nearby ? `. Context: ${nearby}` : '.'}`;
  if (field.includes('meeting')) return current || 'Summarize decisions, action items with owners, blockers, risks, deadlines, and unresolved questions from the meeting.';
  if (field.includes('message') || field === 'body') return current ? `${current}\n\nPlease confirm the owner, deadline, and next step.` : 'Share the update with the key context, current status, blocker (if any), owner, and next action.';
  if (field.includes('title') || field.includes('name')) return current || 'Clear action-oriented title';
  return current || `Add concise, specific information for ${clean(fieldName) || 'this field'}${nearby ? ` using this context: ${nearby}` : ''}.`;
}

async function suggestField({ fieldName, fieldLabel, value, formContext = {}, project = null, userInstruction = '' }) {
  if (!provider.enabled()) {
    return { suggestion: localFieldSuggestion({ fieldName: fieldLabel || fieldName, value, formContext }), rationale: 'Local smart suggestion. Connect an external AI key for fully generative suggestions.', provider: 'local_javascript_engine', fallback: true };
  }
  try {
    const result = await provider.generateJson({
      system: 'You are an inline writing assistant inside a project-management application. Improve or draft only the requested field. Preserve user intent, do not invent facts, and make the text ready to paste into the field.',
      prompt: `Field name: ${clean(fieldName)}\nField label: ${clean(fieldLabel)}\nCurrent value: ${clean(value)}\nOptional user instruction: ${clean(userInstruction)}\nOther fields in the same form: ${JSON.stringify(formContext || {})}\nCurrent project context: ${JSON.stringify(project || {})}\n\nReturn one strong suggestion. Keep short fields concise and textareas appropriately detailed.`,
      schema: suggestionSchema
    });
    return {
      suggestion: clean(result.suggestion).slice(0, 20000),
      rationale: clean(result.rationale).slice(0, 1000),
      provider: `${provider.providerName()}:${config.externalAi.model}`,
      fallback: false
    };
  } catch (error) {
    console.error('External AI field suggestion failed; using local fallback:', error.message);
    return { suggestion: localFieldSuggestion({ fieldName: fieldLabel || fieldName, value, formContext }), rationale: 'External AI was unavailable, so a local fallback suggestion was generated.', provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}

const meetingSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          suggestion_type: { type: 'string', enum: ['task', 'decision', 'risk', 'clarification'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          owner_name: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          evidence: { type: 'string' },
          rationale: { type: 'string' }
        },
        required: ['suggestion_type', 'title', 'detail', 'owner_name', 'priority', 'severity', 'evidence', 'rationale']
      }
    }
  },
  required: ['suggestions']
};

async function generateMeetingSuggestions(notes, members, project = null) {
  if (!provider.enabled()) return { items: parseMeetingNotes(notes, members), provider: 'local_javascript_engine', fallback: true };
  try {
    const result = await provider.generateJson({
      system: 'You convert meeting notes into review-ready project proposals. Use only explicit or strongly supported information from the notes. Evidence must quote or closely point to the relevant note content. If ownership is unclear, leave owner_name empty. Never invent decisions or completion claims.',
      prompt: `Project context: ${JSON.stringify(project || {})}\nKnown members: ${JSON.stringify(memberSummary(members))}\nMeeting notes:\n${notes}`,
      schema: meetingSchema
    });
    const items = (result.suggestions || []).slice(0, 30).map(item => {
      const type = ['task', 'decision', 'risk', 'clarification'].includes(item.suggestion_type) ? item.suggestion_type : 'clarification';
      if (type === 'task') return { suggestion_type: 'task', payload: { phase: 'Meeting Follow-up', title: clean(item.title).slice(0, 120), description: clean(item.detail), owner_name: clean(item.owner_name), priority: ['low','medium','high','critical'].includes(item.priority) ? item.priority : 'medium', acceptance_criteria: `The follow-up is completed and evidence is recorded: ${clean(item.detail).slice(0, 500)}` }, rationale: clean(item.rationale), evidence: clean(item.evidence) };
      if (type === 'decision') return { suggestion_type: 'decision', payload: { title: clean(item.title).slice(0, 120), detail: clean(item.detail), owner: clean(item.owner_name) }, rationale: clean(item.rationale), evidence: clean(item.evidence) };
      if (type === 'risk') return { suggestion_type: 'risk', payload: { risk_type: 'meeting_note', severity: ['low','medium','high','critical'].includes(item.severity) ? item.severity : 'medium', title: clean(item.title).slice(0, 120), description: clean(item.detail) }, rationale: clean(item.rationale), evidence: clean(item.evidence) };
      return { suggestion_type: 'clarification', payload: { question: clean(item.detail) || clean(item.title) }, rationale: clean(item.rationale), evidence: clean(item.evidence) };
    }).filter(item => item.evidence || item.payload?.question);
    if (!items.length) throw new Error('AI returned no usable meeting suggestions');
    return { items, provider: `${provider.providerName()}:${config.externalAi.model}`, fallback: false };
  } catch (error) {
    console.error('External AI meeting analysis failed; using local fallback:', error.message);
    return { items: parseMeetingNotes(notes, members), provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}

const changeSchema = {
  type: 'object',
  properties: {
    impact_scope: { type: 'string' },
    impact_effort: { type: 'string' },
    impact_dependencies: { type: 'string' },
    impact_workload: { type: 'string' }
  },
  required: ['impact_scope', 'impact_effort', 'impact_dependencies', 'impact_workload']
};

async function analyzeChangeWithAi(description, taskCount, activeOwnerCounts, project = null, tasks = []) {
  if (!provider.enabled()) return { item: analyzeChange(description, taskCount, activeOwnerCounts), provider: 'local_javascript_engine', fallback: true };
  try {
    const result = await provider.generateJson({
      system: 'You are a project change-impact analyst. Analyze only the supplied project facts. Distinguish facts from likely effects and do not claim precise effort or dates without evidence.',
      prompt: `Change request: ${description}\nProject: ${JSON.stringify(project || {})}\nExisting task count: ${taskCount}\nActive owner workload counts: ${JSON.stringify(activeOwnerCounts)}\nExisting tasks: ${JSON.stringify((tasks || []).slice(0, 80).map(t => ({ id:t.id,title:t.title,status:t.status,priority:t.priority,owner_id:t.owner_id,phase:t.phase })))}`,
      schema: changeSchema
    });
    return { item: { impact_scope: clean(result.impact_scope), impact_effort: clean(result.impact_effort), impact_dependencies: clean(result.impact_dependencies), impact_workload: clean(result.impact_workload) }, provider: `${provider.providerName()}:${config.externalAi.model}`, fallback: false };
  } catch (error) {
    console.error('External AI change analysis failed; using local fallback:', error.message);
    return { item: analyzeChange(description, taskCount, activeOwnerCounts), provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}

const taskRegenerationSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    acceptance_criteria: { type: 'string' }
  },
  required: ['description', 'acceptance_criteria']
};

async function regenerateTask(task, project, members) {
  const fallback = {
    description: `Complete '${task.title}' using only approved project records. Record evidence, unresolved questions, and verification results.`,
    acceptance_criteria: task.acceptance_criteria || 'The expected outcome is complete, reviewed, and supported by stored evidence.'
  };
  if (!provider.enabled()) return { item: fallback, provider: 'local_javascript_engine', fallback: true };
  try {
    const result = await provider.generateJson({
      system: 'You improve a project task without changing its approved intent. Produce an actionable description and measurable acceptance criteria. Do not invent project facts.',
      prompt: `Project: ${JSON.stringify(projectContext(project))}\nTask: ${JSON.stringify({ id: task.id, phase: task.phase, title: task.title, description: task.description, priority: task.priority, acceptance_criteria: task.acceptance_criteria })}\nMembers: ${JSON.stringify(memberSummary(members))}`,
      schema: taskRegenerationSchema
    });
    return { item: { description: clean(result.description).slice(0,10000), acceptance_criteria: clean(result.acceptance_criteria).slice(0,10000) }, provider: `${provider.providerName()}:${config.externalAi.model}`, fallback: false };
  } catch (error) {
    console.error('External AI task regeneration failed; using local fallback:', error.message);
    return { item: fallback, provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}


const riskSchema = {
  type: 'object',
  properties: {
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk_type: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          title: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string' }
        },
        required: ['risk_type', 'severity', 'title', 'description', 'evidence']
      }
    }
  },
  required: ['risks']
};

async function scanRisksWithAi(tasks, members, dependencies, project = null) {
  const deterministic = scanRisks(tasks, members, dependencies);
  if (!provider.enabled()) return { items: deterministic, provider: 'local_javascript_engine', fallback: true };
  try {
    const result = await provider.generateJson({
      system: 'You are a cautious project risk analyst. Identify only risks supported by stored data. Evidence must reference concrete task IDs, statuses, due dates, ownership, dependencies, or explicit project constraints. Do not invent market, security, staffing, or schedule facts.',
      prompt: `Project: ${JSON.stringify(project || {})}\nMembers: ${JSON.stringify(memberSummary(members))}\nTasks: ${JSON.stringify((tasks || []).slice(0,120).map(t => ({id:t.id,phase:t.phase,title:t.title,owner_id:t.owner_id,priority:t.priority,status:t.status,progress:t.progress,acceptance_criteria:t.acceptance_criteria,due_date:t.due_date})))}\nDependencies: ${JSON.stringify((dependencies || []).slice(0,240))}\n\nReturn the most material evidence-backed risks only.`,
      schema: riskSchema
    });
    const aiItems = (result.risks || []).slice(0, 25).map(item => ({
      risk_type: clean(item.risk_type).slice(0,80) || 'ai_analysis',
      severity: ['low','medium','high','critical'].includes(item.severity) ? item.severity : 'medium',
      title: clean(item.title).slice(0,220),
      description: clean(item.description).slice(0,10000),
      evidence: clean(item.evidence).slice(0,5000)
    })).filter(item => item.title && item.evidence);
    const combined = [...deterministic];
    const seen = new Set(combined.map(item => `${item.risk_type}|${item.title}`.toLowerCase()));
    for (const item of aiItems) {
      const key = `${item.risk_type}|${item.title}`.toLowerCase();
      if (!seen.has(key)) { seen.add(key); combined.push(item); }
    }
    return { items: combined.slice(0, 40), provider: `${provider.providerName()}:${config.externalAi.model}`, fallback: false };
  } catch (error) {
    console.error('External AI risk scan failed; using local fallback:', error.message);
    return { items: deterministic, provider: 'local_javascript_engine', fallback: true, warning: error.message };
  }
}

module.exports = {
  proposePlan, parseMeetingNotes, analyzeChange, scanRisks, externalModelEnabled, aiStatus,
  generatePlan, suggestField, generateMeetingSuggestions, analyzeChangeWithAi, regenerateTask, scanRisksWithAi
};
