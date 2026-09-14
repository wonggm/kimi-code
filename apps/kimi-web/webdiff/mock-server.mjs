// apps/kimi-web/webdiff/mock-server.mjs
// Deterministic mock backend for the visual-comparison tool: serves a built web
// app directory and answers the REST surface with fixed fixtures, plus a
// permissive WebSocket endpoint so the client renders without socket errors.
//
// CLI:    MOCK_ROOT=<dist dir> MOCK_PORT=5399 node apps/kimi-web/webdiff/mock-server.mjs
// Module: import { startMock } from './mock-server.mjs'
//
// Switches (all optional): MOCK_ROOT, MOCK_PORT, MOCK_TOKEN (default mock-token),
// MOCK_BUSY, MOCK_EMPTY, MOCK_MANY_TURNS, MOCK_MANY_MODELS, MOCK_MEDIA.
//
// Fixture content is ON by default so a manual inspection sees every component
// populated rather than an empty state:
//   MOCK_RICH=0        bare fixture (one session, one message, nothing else)
//   MOCK_FOLD_TOOLS=0  drop the run of three consecutive tool calls
//   MOCK_GOAL=0        no active goal (on by default with the rich fixtures)
//   MOCK_GOAL_STATUS=active|paused|blocked|complete
//                      the goal's state; the apps draw a different panel per
//                      state, so each is a separate pass (default active)
//   MOCK_PENDING=1     add the pending question + approval cards to the original
//                      session. Off by default: the fork's ChatDock renders
//                      `<Composer v-else>`, so a pending card replaces the
//                      composer entirely. The two extra session rows below carry
//                      one card each unconditionally, so a pending card can be
//                      inspected without this switch.
//   MOCK_NOTICES=1     add the two warning toasts. Off by default: they anchor
//                      above the composer and overlap the goal strip.
//   MOCK_NO_TASKS=1    empty every task-bearing payload: the REST task list, the
//                      transcript page's `tasks` array and the snapshot's
//                      `messages.subagents`. Upstream's dock reads the page's
//                      `tasks`, the fork's reads the REST list and the snapshot's
//                      subagents, so this is the only way to pose a session with
//                      no background tasks for both. Both apps then render just
//                      the Plan and Progress pills.
//   MOCK_SEED=0        don't inject the boot seed into index.html
//   MOCK_SEED=force    re-write the seeded keys on every page load
//   MOCK_QUEUED=1      pose a running turn with two prompts behind it: one still
//                      in the daemon's queue, one that was steered into the
//                      running turn. Also makes the session busy (a prompt typed
//                      in either app's composer then queues instead of sending).
//                      The queue is served the way the daemon serves it: the
//                      transcript page carries both prompts (a `prompts` entry
//                      each, plus a queued `turn` item for the parked one). Off
//                      by default, because a queued prompt changes what the
//                      transcript tail renders.
//
// The session list carries three rows in one workspace: the rich fixture session
// ("Code block header probe") plus two rows that exist so either app can show a
// pending card — "Pending question (mock)" and "Pending approval (mock)". Each of
// the two serves every per-session route with the rich transcript and one pending
// card at the bottom of it, so a manual pass sees a card by opening its row.
// The comparison walk lists them too; it never enters a session by accident,
// because discovery ignores everything inside a session row (`DISCOVER_EXPR` in
// surfaces.mjs), and the two rows are opened on purpose by the pending-card
// behaviour scenes in that file.
//   MOCK_EXTRA_SESSIONS=0  list the original session alone — a manual pass that
//                      wants the composer-bearing session as the only row.
//   MOCK_LIVE_EXCHANGE=1
//                      pose a live exchange so the fork's own timing displays
//                      can be seen. An exchange that just finished would carry
//                      its elapsed time in the snapshot if the server had it —
//                      it doesn't (a message row has no duration and the
//                      snapshot has no timing at all), and neither a thinking
//                      card's span nor an exchange's is a field anywhere on the
//                      wire. The fork therefore times what it watches, so
//                      seeing it needs an exchange to watch: the snapshot serves
//                      a running turn whose thinking is still streaming, and the
//                      socket ends that turn with the duration the daemon would
//                      have reported. Off by default, because a turn that is
//                      live when the page loads and ends a few seconds later
//                      moves every capture taken after it.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.riv': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json' };

const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEKmBgQAAA9BAEDhv0eXAAAAABJRU5ErkJggg==', 'base64');

const CODE_MD = `Here is a config overview:

\`\`\`python
import os

def load_config(path: str) -> dict:
    """Load a TOML config file with env overrides."""
    with open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    return {"path": path, "env": dict(os.environ), "raw_length": len(raw)}

for key in sorted(os.environ):
    if key.startswith("KIMI_") and key not in seen_keys:
        print(key, "=", os.environ[key], "and here is a very long trailing comment that must exceed the available column width so the wrap toggle visibly changes the rendering of this line")
\`\`\`

The function above reads the config and returns a dictionary with a very long line to demonstrate wrapping behavior when the word wrap toggle is enabled or disabled by the user at will: the quick brown fox jumps over the lazy dog repeatedly until the line exceeds the available column width of the code block container element.

And a short one:

\`\`\`bash
echo hello
\`\`\`

And a previewable page:

\`\`\`html
<!DOCTYPE html>
<html>
<head><style>body { font-family: sans-serif; background: #102a43; color: #fff; display: grid; place-items: center; height: 100vh; margin: 0; }</style></head>
<body><h1>Preview runner works</h1><script>document.body.dataset.scriptRan = 'yes';</script></body>
</html>
\`\`\`
`;

const WORKSPACE_ID = 'wd_mock0000000000000000000000000';
const SESSION_ID = 'session_mock00000000000000000000000';
// The two pending-card rows. Distinct ids so each row's routes and card are its
// own; the titles are what a manual pass clicks in the sidebar.
const QUESTION_SESSION_ID = 'session_mock_question0000000000';
const APPROVAL_SESSION_ID = 'session_mock_approval0000000000';
const QUESTION_SESSION_TITLE = 'Pending question (mock)';
const APPROVAL_SESSION_TITLE = 'Pending approval (mock)';

const HEARTBEAT_MS = 30000;
const PING_INTERVAL_MS = 15000;

function json(res, data) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ code: 0, msg: 'success', data, request_id: 'mock' }));
}

/** Body the mock serves for any file the preview asks for. A fixed, short
 *  Python file is enough for the panel's file tab and the transcript's file
 *  links to render content (and for the walk to pair the pane). */
function mockFileText(path) {
  return [
    `"""${path || 'file'} — mock content served by webdiff/mock-server.mjs."""`,
    '',
    'import os',
    '',
    '',
    'def load_config(path: str) -> dict:',
    '    with open(path, "r", encoding="utf-8") as fh:',
    '        return {"path": path, "env": dict(os.environ)}',
    '',
    '',
    'TIMEOUT = 30',
    '',
  ].join('\n');
}

/** The reasoning text both transcript routes carry, so upstream's collapsible
 *  thinking block and the fork's can be compared on the same content. */
const MOCK_THINKING = [
  'Let me look at the config first.',
  '',
  'The timeout is the part that matters: the file sets 10 seconds and the',
  'check needs 30. I will raise it and re-run the check to confirm.',
].join('\n');

/** The thinking the in-flight turn of a live exchange starts with
 *  (MOCK_LIVE_EXCHANGE=1). Its own text, not the fixture's: the fork drops a
 *  reply whose content it already folded in, and a second copy of the fixture's
 *  reasoning reads as exactly that duplicate. */
const LIVE_THINKING = [
  'Now the same check on the other call sites.',
  '',
  'Three of them pass a raw timeout. I will fix the shared helper first and',
  're-run the suite before touching the callers.',
].join('\n');

/** The live exchange (MOCK_LIVE_EXCHANGE=1): the turn the daemon would report as
 *  ended, and how long it takes to do so after the page subscribes. */
const LIVE_TURN_ID = 3;
const LIVE_TURN_MS = 80_000;

/** The session's goal, in the shape both apps read. The REST route and the
 *  `GetGoal` tool result are the same object, so the goal panel a manual pass
 *  inspects on either app shows one set of numbers. `budgetUsed` / `budgetLimit`
 *  are the names upstream's goal schema takes; `tokensUsed`, `budget` and
 *  `wallClockMs` are what the fork's goal strip reads.
 *
 *  `status` is the part the apps render differently per state (active / paused /
 *  blocked / complete), so MOCK_GOAL_STATUS selects it — a manual pass or a scene
 *  run with `MOCK_GOAL_STATUS=paused` sees that state's panel. */
const GOAL_STATUSES = ['active', 'paused', 'blocked', 'complete'];

function goalMock(status = 'active') {
  return {
    goalId: 'goal_mock_1',
    objective: 'Reduce the pion-production systematic uncertainty below 3% for the CDR — refit the hadronic interaction model against the thin-target data and propagate through the full simulation chain.',
    completionCriterion: 'Fit converges with chi2/ndf < 1.5 and the propagated uncertainty band on the yield is under 3%.',
    status: GOAL_STATUSES.includes(status) ? status : 'active',
    turnsUsed: 7,
    turns_used: 7,
    tokensUsed: 182340,
    budgetUsed: 182340,
    budgetLimit: 500000,
    wallClockMs: 12 * 60 * 1000 + 34 * 1000,
    budget: { tokenBudget: 500000, remainingTokens: 317660, turnBudget: null, remainingTurns: null, wallClockBudgetMs: null, remainingWallClockMs: null, overBudget: false },
  };
}

/** The pending question card: the shape the fork reads from the snapshot's
 *  `pending_questions`. `sessionId` is stamped per session, so a session's card
 *  never names another row. */
function questionMock(sessionId, now) {
  return {
    question_id: 'q_mock_1',
    session_id: sessionId,
    turn_id: 2,
    tool_call_id: 'tc_ask_1',
    questions: [
      {
        id: 'q_mock_1_1',
        header: 'Approach',
        question: 'Which approach should the mock take?',
        options: [
          { id: 'opt_a', label: 'Approach A', description: 'The conservative one.' },
          { id: 'opt_b', label: 'Approach B', description: 'The fast one.', recommended: true },
        ],
        multi_select: false,
        allow_other: true,
      },
    ],
    created_at: now,
  };
}

/** The pending approval card: the shape the fork reads from the snapshot's
 *  `pending_approvals`. */
function approvalMock(sessionId, now) {
  return {
    approval_id: 'appr_mock_1',
    session_id: sessionId,
    turn_id: 2,
    tool_call_id: 'tc_bash_1',
    tool_name: 'Bash',
    action: 'Run the mock command `rm -rf build`',
    tool_input_display: { kind: 'bash', command: 'rm -rf build' },
    expires_at: now,
    created_at: now,
  };
}

/** The same question as an upstream transcript interaction: upstream builds its
 *  pending cards from the transcript page's `interactions` (state `pending`),
 *  reading `request.questions`, not from the snapshot. Derived from the card so
 *  the two routes cannot drift apart. */
function questionInteraction(card) {
  return {
    interactionId: card.question_id,
    interactionKind: 'question',
    toolCallId: card.tool_call_id,
    state: 'pending',
    request: { turnId: card.turn_id, questions: card.questions },
  };
}

/** The same approval as an upstream transcript interaction: upstream reads
 *  `request.toolName`, `request.action` and `request.display` off it. */
function approvalInteraction(card) {
  return {
    interactionId: card.approval_id,
    interactionKind: 'approval',
    toolCallId: card.tool_call_id,
    state: 'pending',
    request: {
      toolName: card.tool_name,
      action: card.action,
      turnId: card.turn_id,
      display: card.tool_input_display,
    },
  };
}

function buildFixtures(env) {
  const now = new Date().toISOString();
  const goal = goalMock(env.MOCK_GOAL_STATUS);
  const queuedOn = env.MOCK_QUEUED === '1';
  const liveExchange = env.MOCK_LIVE_EXCHANGE === '1';
  const busyOn = env.MOCK_BUSY === '1' || queuedOn || liveExchange;

  const session = {
    id: SESSION_ID,
    workspace_id: WORKSPACE_ID,
    title: 'Code block header probe',
    created_at: now,
    updated_at: now,
    busy: busyOn,
    main_turn_active: busyOn,
    archived: false,
    metadata: { cwd: '/tmp/mock-workspace' },
    // v2 list surface: sessions embed their workspace and a meta block; the
    // sidebar's has_prompt filter reads meta.last_prompt.
    workspace: { id: WORKSPACE_ID, cwd: '/tmp/mock-workspace', name: 'mock' },
    meta: { has_prompt: true, last_prompt: 'Show me a config example.', title: 'Code block header probe', created_at: now, updated_at: now, archived: false, archived_at: null },
    activity: { status: busyOn ? 'running' : 'idle', model: 'example/test-model' },
    agent_config: { model: 'example/test-model' },
    usage: { input_tokens: 10, output_tokens: 20, cache_read_tokens: 0, cache_creation_tokens: 0, context_tokens: 30, context_limit: 128000, turn_count: 1 },
    permission_rules: [],
    message_count: 2,
  };

  const bashTask = {
    id: 'task_bash_0000000000000000000001',
    session_id: SESSION_ID,
    kind: 'bash',
    description: 'Run the test suite',
    status: 'running',
    command: 'pytest -q',
    created_at: now,
    started_at: now,
    output_preview: 'collected 12 items\n............',
    output_bytes: 128,
    run_in_background: true,
  };

  const bashTaskExited = {
    id: 'task_bash_0000000000000000000002',
    session_id: SESSION_ID,
    kind: 'bash',
    description: 'Lint the workspace',
    status: 'completed',
    command: 'ruff check .',
    created_at: now,
    started_at: now,
    completed_at: now,
    output_preview: 'All checks passed.',
    output_bytes: 19,
    run_in_background: false,
  };

  const subagentRunning = {
    id: 'agent-2',
    session_id: SESSION_ID,
    kind: 'subagent',
    description: 'Refit the hadronic model',
    status: 'running',
    subagent_phase: 'working',
    subagent_type: 'general',
    created_at: now,
    started_at: now,
    // Upstream's task mapper throws unless run_in_background is a boolean.
    run_in_background: true,
  };

  const subagentTask = {
    id: 'agent-1',
    session_id: SESSION_ID,
    kind: 'subagent',
    description: 'Explore the repo layout',
    status: 'completed',
    subagent_phase: 'completed',
    subagent_type: 'Explore',
    created_at: now,
    started_at: now,
    completed_at: now,
    run_in_background: true,
  };

  // Foreground subagent: upstream's dock lists foreground and background
  // subagents alike, while the fork's filter keeps only `runInBackground === true`
  // (src/lib/subagentFilter.ts), so this is the row that tells the two apart.
  const subagentForeground = {
    id: 'agent-3',
    session_id: SESSION_ID,
    kind: 'subagent',
    description: 'Refit the hadronic interaction model',
    status: 'running',
    subagent_phase: 'working',
    subagent_type: 'coder',
    created_at: now,
    started_at: now,
    run_in_background: false,
  };

  const snapshot = {
    as_of_seq: 3,
    epoch: 'mock-epoch',
    session,
    messages: {
      items: env.MOCK_EMPTY === '1' ? [] : [
        { id: 'm1', session_id: SESSION_ID, role: 'user', content: [
          { type: 'text', text: 'Show me a config example.' },
          { type: 'image', source: { kind: 'session_media', file_id: 'mock_media_1' } },
        ], created_at: now },
        // `prompt_id` is what the fork groups a reply by: without it, every
        // assistant message belongs to one open group, and the live exchange
        // below (MOCK_LIVE_EXCHANGE=1, its own prompt id) would be folded into
        // this reply instead of standing as the exchange it is.
        { id: 'm2', session_id: SESSION_ID, role: 'assistant', prompt_id: 'pr_mock_t2', content: [
          // A reasoning block: upstream renders it as its collapsible thinking
          // block (head + inline body) and so does the fork, so the two can be
          // paired. The transcript route below carries the matching frame.
          { type: 'thinking', thinking: MOCK_THINKING },
          // Default on: a run of consecutive tool calls is what the fork's
          // tool-call summary (and the settings switch that gates it) acts on,
          // and without it no capture ever contains a tool card. Set
          // MOCK_FOLD_TOOLS=0 to get the bare transcript back.
          ...(env.MOCK_FOLD_TOOLS !== '0' ? [
            { type: 'tool_use', tool_call_id: 'tc_read_1', tool_name: 'Read', input: { path: '/tmp/mock-workspace/a.py' } },
            { type: 'tool_result', tool_call_id: 'tc_read_1', output: 'a', is_error: false },
            { type: 'tool_use', tool_call_id: 'tc_bash_1', tool_name: 'Bash', input: { command: 'ls' } },
            { type: 'tool_result', tool_call_id: 'tc_bash_1', output: 'a.py', is_error: false },
            { type: 'tool_use', tool_call_id: 'tc_grep_1', tool_name: 'Grep', input: { pattern: 'x' } },
            { type: 'tool_result', tool_call_id: 'tc_grep_1', output: 'x', is_error: false },
          ] : []),
          ...(env.MOCK_RICH === '0' ? [] : [
            {
              type: 'tool_use',
              tool_call_id: 'tc_todo_1',
              tool_name: 'TodoWrite',
              input: {
                todos: [
                  { title: 'Read the config', status: 'done' },
                  { title: 'Change the timeout', status: 'in_progress' },
                  { title: 'Re-run the check', status: 'pending' },
                ],
              },
            },
            { type: 'tool_result', tool_call_id: 'tc_todo_1', output: 'Todos updated', is_error: false },
          ]),
          { type: 'tool_use', tool_call_id: 'tc_edit_1', tool_name: 'Edit', input: { path: '/tmp/mock-workspace/config.py', old_string: 'a', new_string: 'b' } },
          { type: 'tool_result', tool_call_id: 'tc_edit_1', output: 'The file has been updated.', is_error: false },
          // A subagent call (the `Agent` tool): both apps fold `agent` onto their
          // `task` kind and render a card for it, so a manual pass can see the
          // card in the transcript — the running one is also the dock's
          // "Background Agent" pill.
          { type: 'tool_use', tool_call_id: 'tc_agent_1', tool_name: 'Agent', input: {
            description: 'Refit the hadronic interaction model',
            subagent_type: 'coder',
            prompt: 'Refit the hadronic interaction model against the thin-target data and report the chi2/ndf of the converged fit.',
          } },
          { type: 'tool_result', tool_call_id: 'tc_agent_1', output: 'Fit converged: chi2/ndf = 1.24 over 38 bins; the propagated uncertainty band on the yield dropped from 4.1% to 2.7%.', is_error: false },
          // A goal read (the `GetGoal` tool): upstream renders its goal panel
          // from the returned goal, the fork from the same fields.
          { type: 'tool_use', tool_call_id: 'tc_getgoal_1', tool_name: 'GetGoal', input: { goalId: 'goal_mock_1' } },
          { type: 'tool_result', tool_call_id: 'tc_getgoal_1', output: JSON.stringify(goal), is_error: false },
          // A budget set: both apps summarise it from `{value, unit}` — this is
          // where upstream shows the goal's token budget and wall-clock budget.
          { type: 'tool_use', tool_call_id: 'tc_goalbudget_1', tool_name: 'SetGoalBudget', input: { value: 500000, unit: 'tokens' } },
          { type: 'tool_result', tool_call_id: 'tc_goalbudget_1', output: 'Budget set: 500000 tokens.', is_error: false },
          { type: 'tool_use', tool_call_id: 'tc_goalbudget_2', tool_name: 'SetGoalBudget', input: { value: 30, unit: 'minutes' } },
          { type: 'tool_result', tool_call_id: 'tc_goalbudget_2', output: 'Wall-clock budget set: 30 minutes.', is_error: false },
          { type: 'text', text: CODE_MD },
        ], created_at: now },
        ...(env.MOCK_MANY_TURNS === '1'
          ? Array.from({ length: 11 }, (_, i) => i + 2).flatMap((n) => [
              { id: `mu${n}`, session_id: SESSION_ID, role: 'user', content: [{ type: 'text', text: `Exchange ${n}: how do I configure stage ${n} of the data pipeline and then verify that the output of reduction step ${n} matches the reference distribution?` }], created_at: now },
              { id: `ma${n}`, session_id: SESSION_ID, role: 'assistant', content: [{ type: 'text', text: `Answer ${n}: adjust the stage-${n} config block and compare against the reference.` }], created_at: now },
            ])
          : []),
      ],
      has_more: false,
    },
    // A turn that is live when the page loads (MOCK_LIVE_EXCHANGE=1), carrying
    // only its thinking: the thinking card is then the transcript's last block,
    // which is what makes it the block the fork times. It is ended a few seconds
    // later over the socket with the duration the daemon would have reported.
    in_flight_turn: liveExchange
      ? {
          turn_id: LIVE_TURN_ID,
          assistant_text: '',
          thinking_text: LIVE_THINKING,
          running_tools: [],
          current_prompt_id: 'pr_mock_live_1',
        }
      : null,
    // Pending cards are opt-in (MOCK_PENDING=1): the fork renders `<Composer
    // v-else>` after them, so with either card present the composer is absent
    // from the DOM. On by default they would hide the composer — the element a
    // manual pass is usually looking at. The two extra sessions below show one
    // card each without the switch.
    pending_approvals: env.MOCK_RICH === '0' || env.MOCK_PENDING !== '1' ? [] : [approvalMock(SESSION_ID, now)],
    pending_questions: env.MOCK_RICH === '0' || env.MOCK_PENDING !== '1' ? [] : [questionMock(SESSION_ID, now)],
    subagents: env.MOCK_NO_TASKS === '1'
      ? []
      : env.MOCK_RICH === '0' ? [subagentTask] : [subagentRunning, subagentTask],
  };

  // The two pending-card rows: the same session body, each with its own id and
  // title and the one card it is named after, so that card is on without
  // MOCK_PENDING. `messages` and `subagents` are re-stamped with the row's own id,
  // because a session's body should not name another session. The transcript page
  // carries the matching upstream interaction (`interactions`, state `pending`),
  // which is where upstream reads its pending cards from.
  const variant = (id, title, approvals, questions, interactions) => ({
    session: {
      ...session,
      id,
      title,
      meta: { ...session.meta, title },
    },
    snapshot: {
      ...snapshot,
      messages: { ...snapshot.messages, items: snapshot.messages.items.map((m) => ({ ...m, session_id: id })) },
      subagents: snapshot.subagents.map((s) => ({ ...s, session_id: id })),
      pending_approvals: approvals,
      pending_questions: questions,
    },
    transcriptInteractions: interactions,
    transcriptPendingIds: interactions.map((entry) => entry.interactionId),
  });

  const questionCard = questionMock(QUESTION_SESSION_ID, now);
  const approvalCard = approvalMock(APPROVAL_SESSION_ID, now);
  const questionVariant = variant(QUESTION_SESSION_ID, QUESTION_SESSION_TITLE, [], [questionCard], [questionInteraction(questionCard)]);
  const approvalVariant = variant(APPROVAL_SESSION_ID, APPROVAL_SESSION_TITLE, [approvalCard], [], [approvalInteraction(approvalCard)]);

  const config = {
    providers: { example: { type: '', base_url: 'https://example.com/v1', has_api_key: true } },
    models: { 'example/test-model': { protocol: 'openai', name: 'Test Model', provider: 'example', model: 'test-model', maxContextSize: 128000, has_api_key: false } },
    extra_skill_dirs: [],
    merge_all_available_skills: true,
    builtin_product_skills: true,
    extra_agent_dirs: [],
    default_plan_mode: false,
    subagent: { timeoutMs: 7200000 },
    identity: {},
    swarm: { timeoutMs: 7200000 },
    cron: { debug: false, noJitter: false, noStale: false, disabled: false, manualTick: false },
    defaultModel: 'example/test-model',
    subagentModels: {},
    default_thinking: 'off',
    default_permission: 'manual',
    auto_session_title: false,
    loopControl: { compactionTriggerRatio: 0.92 },
    secondaryModel: {},
  };

  // Rich fixtures (default on; MOCK_RICH=0 gives the bare fixture back). One of
  // every shape the web apps render, so a manual inspection — or a walk surface
  // — shows the real component instead of an empty state. Shapes follow the
  // fork's own wire types (src/api/daemon/wire.ts) and, where upstream consumes
  // the same route, upstream's schema.
  const rich = {
    status: {
      model: 'example/test-model',
      thinking_level: 'off',
      permission: 'manual',
      plan_mode: false,
      swarm_mode: false,
      context_tokens: 30000,
      max_context_tokens: 125000,
      context_usage: 0.24,
    },
    // Opt-in (MOCK_NOTICES=1): the toasts anchor above the composer, so on by
    // default they overlap the goal strip and the composer's top row.
    warnings: env.MOCK_NOTICES === '1'
      ? [
          { code: 'mock_info', message: 'Mock notice: the fixture is serving generated content.', severity: 'info' },
          { code: 'mock_warning', message: 'Mock warning: this row exists to show the warning card.', severity: 'warning' },
        ]
      : [],
    skills: [
      { name: 'mock-skill', description: 'A project skill the mock advertises.', path: '/tmp/mock-workspace/.kimi/skills/mock-skill/SKILL.md', source: 'project', type: 'skill' },
      { name: 'mock-plugin-skill', description: 'A skill contributed by an installed plugin.', path: '/tmp/mock-workspace/.kimi/skills/mock-plugin-skill/SKILL.md', source: 'plugin', type: 'skill' },
    ],
    terminals: [
      {
        id: 'term_mock_1',
        session_id: SESSION_ID,
        cwd: '/tmp/mock-workspace',
        shell: '/bin/bash',
        cols: 100,
        rows: 30,
        status: 'running',
        created_at: now,
      },
    ],
    children: [
      { ...session, id: 'session_mock_child1', title: 'Child session (mock)', parent_id: SESSION_ID },
    ],
    agentProfiles: [
      { name: 'mock-profile', description: 'A subagent profile the mock advertises.', whenToUse: 'When the fixture needs a second agent profile.' },
    ],
    providers: [
      { id: 'example', type: 'openai', base_url: 'https://example.com/v1', default_model: 'example/test-model', has_api_key: true, status: 'connected', models: ['example/test-model'] },
    ],
    gitStatus: {
      branch: 'mock-branch',
      ahead: 1,
      behind: 0,
      entries: { 'config.py': 'modified', 'a.py': 'added' },
      additions: 12,
      deletions: 3,
      pullRequest: { number: 42, state: 'open', url: 'https://example.test/pr/42' },
    },
    fileChanges: {
      changed_files: [
        { path: '/tmp/mock-workspace/config.py', status: 'modified', additions: 8, deletions: 3 },
        { path: '/tmp/mock-workspace/a.py', status: 'added', additions: 4, deletions: 0 },
      ],
    },
    plans: [
      {
        tool_call_id: 'tc_plan_1',
        turn_id: 't2',
        source: 'interaction',
        plan: '## Mock plan\n\n1. Read the config.\n2. Change the timeout.\n3. Re-run the check.',
        path: '/tmp/mock-workspace/.kimi/plans/mock-plan.md',
        options: [
          { label: 'Approve', description: 'Carry the plan out as written.' },
          { label: 'Revise', description: 'Send it back with feedback.' },
        ],
        review: { state: 'pending' },
      },
    ],
    fsHome: {
      path: '/tmp/mock-workspace',
      items: [
        { name: 'config.py', path: '/tmp/mock-workspace/config.py', kind: 'file', is_dir: false },
        { name: 'a.py', path: '/tmp/mock-workspace/a.py', kind: 'file', is_dir: false },
        { name: 'data', path: '/tmp/mock-workspace/data', kind: 'directory', is_dir: true },
      ],
      truncated: false,
    },
  };
  rich.fsBrowse = rich.fsHome;

  // A prompt parked behind the running turn, and one steered into it
  // (MOCK_QUEUED=1). Neither opened a turn of its own, so the transcript page is
  // the only record of them: a `prompts` entry each, plus the queued `turn` item
  // (how agent-core records a prompt that is waiting). `steeredAt === finishedAt`
  // on the steered entry is the daemon's mark for "folded into another turn's
  // request", which is what both apps rebuild its user bubble from.
  const queuedPromptText = 'Queued behind the running turn.';
  const steeredPromptText = 'Steered into the running turn.';
  const queuedPrompt = { promptId: 'pr_mock_queued_1', status: 'queued', content: [{ type: 'text', text: queuedPromptText }], createdAt: now };
  const steeredPrompt = { promptId: 'pr_mock_steered_1', status: 'completed', content: [{ type: 'text', text: steeredPromptText }], createdAt: now, finishedAt: now, steeredAt: now };

  const liveTurn = liveExchange
    ? { turnId: LIVE_TURN_ID, durationMs: LIVE_TURN_MS, endAfterMs: 3_600, seq: 4 }
    : null;

  return { now, session, goal, bashTask, bashTaskExited, subagentTask, subagentRunning, subagentForeground, snapshot, questionVariant, approvalVariant, config, rich, busyOn, queuedOn, queuedPromptText, queuedPrompt, steeredPrompt, liveTurn };
}

function createHandler({ root, token, env, fixtures }) {
  const { now, session, goal, bashTask, bashTaskExited, subagentTask, subagentRunning, subagentForeground, snapshot, questionVariant, approvalVariant, config, rich, busyOn, queuedOn, queuedPromptText, queuedPrompt, steeredPrompt } = fixtures;
  // MOCK_RICH=0 turns the extra fixtures off, leaving the fixture body the walk
  // was originally built against; the three session rows are always listed.
  const richOn = env.MOCK_RICH !== '0';

  // `buildFixtures` stamps created_at/updated_at once, when the mock server
  // starts. The two apps are served by two servers started minutes apart and
  // the walk reads them at different offsets from their own start, so the
  // session row's relative time ("just now" vs "6m") differed between them and
  // every timestamp string landed in the report as a blocker. Re-stamping the
  // session's times per response makes both apps render the same string no
  // matter when the capture happens; the response and the render are
  // milliseconds apart, so both resolve to the same bucket.
  // Session metadata the app can change at runtime (POST /sessions/{id}/profile
  // — pin, emoji, title). Kept per mock process so a walk surface that pins a
  // session, renames it or sets an emoji sees the change on the next GET; the
  // pinned section, the emoji on the row and the session title are all
  // state-dependent, and without this the two apps were compared in different
  // states.
  const sessionState = { pinned: false, emoji: null, title: null };
  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  // Boot seed injected into index.html (MOCK_SEED=0 turns it off). The two apps
  // read these client-side preferences from localStorage, and some of them —
  // goal mode, plan arm, the onboarding flag, the server credential — decide
  // whether a surface is reachable at all. A key is only written when it is
  // ABSENT, so anything the inspector changes in the UI sticks across reloads;
  // set MOCK_SEED=force to overwrite on every load.
  const bootSeed = () => ({
    'kimi-web.onboarded': '1',
    'kimi-web.server-credential': JSON.stringify({ version: 1, credential: token, expiresAt: Date.now() + 864e5 }),
    // Goal mode armed for the mock session: the goal pill and the goal strip
    // both key off this, and nothing else can set it from the server side.
    'kimi-web.goal-mode': JSON.stringify({ [SESSION_ID]: true }),
  });

  const freshSession = (iso) => ({
    ...session,
    ...(sessionState.title === null ? undefined : { title: sessionState.title }),
    pinned: sessionState.pinned,
    meta: {
      ...session.meta,
      ...(sessionState.emoji === null ? undefined : { emoji: sessionState.emoji }),
      created_at: iso,
      updated_at: iso,
    },
    created_at: iso,
    updated_at: iso,
    meta: { ...session.meta, created_at: iso, updated_at: iso },
  });
  const nowIso = () => new Date().toISOString();
  // The same per-response re-stamp for the two extra rows, which carry no
  // runtime-mutable state of their own.
  const freshRow = (row, iso) => ({
    ...row,
    created_at: iso,
    updated_at: iso,
    meta: { ...row.meta, created_at: iso, updated_at: iso },
  });

  // One entry per session row. The two extra entries carry the pending card they
  // are named after, in both the snapshot shape (the fork) and the transcript
  // interaction shape (upstream); the original keeps the snapshot built above,
  // whose cards stay behind MOCK_PENDING. The original row also carries the
  // state the profile route writes, the two extra rows do not.
  // Both rows are listed by default, for a manual pass and for the comparison
  // walk: the pending-card behaviour scenes (surfaces.mjs) open them by title,
  // and the walk's discovery ignores everything inside a session row, so the
  // walk cannot enter one by accident. `MOCK_EXTRA_SESSIONS=0` lists the
  // original row alone.
  const sessions = [
    { id: SESSION_ID, session, snapshot, transcriptInteractions: [], transcriptPendingIds: [] },
    ...(env.MOCK_EXTRA_SESSIONS === '0'
      ? []
      : [
          { id: QUESTION_SESSION_ID, ...questionVariant },
          { id: APPROVAL_SESSION_ID, ...approvalVariant },
        ]),
  ];
  const sessionById = new Map(sessions.map((entry) => [entry.id, entry]));
  const rowOf = (entry, iso) => (entry.id === SESSION_ID ? freshSession(iso) : freshRow(entry.session, iso));
  // Every row of one response carries the SAME stamp. Both apps sort the list by
  // updated_at descending and pick the session to open from that order, so
  // per-row stamps that differ by a millisecond (the calls cross a millisecond
  // boundary at random) would make one app open the original session and the
  // other a pending-card session, and every surface captured after boot would
  // compare two different sessions.
  const sessionRows = () => {
    const iso = nowIso();
    return sessions.map((entry) => rowOf(entry, iso));
  };

  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p.startsWith('/api/')) {
      console.log('API', req.method, p + url.search);
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${token}` && p !== '/api/v1/auth') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 40101, msg: 'unauthorized', data: null }));
        return;
      }
      if (p === '/api/v1/auth') return json(res, { models_ready: true, providers_count: 1, managed_provider: null });
      if (p === '/api/v1/meta') return json(res, { web_title: 'Mock', version: '0.39.1' });
      if (p === '/api/v1/models') {
        // toAppModel maps wire.model → AppModel.id, so the model field must carry
        // the full provider/model id for the menu to match the session's modelId.
        const items = [{ id: 'example/test-model', provider: 'example', model: 'example/test-model', name: 'Test Model', thinking: true }];
        if (env.MOCK_MANY_MODELS === '1') {
          for (let i = 1; i <= 30; i++) items.push({ id: `example/model-${i}`, provider: 'example', model: `example/model-${i}`, name: `Example Model ${i}`, thinking: true });
        }
        return json(res, { items });
      }
      if (p === '/api/v1/config') return json(res, config);
      // Everything below only exists with the rich fixtures on.
      if (richOn) {
        if (p === '/api/v1/providers') return json(res, { items: rich.providers });
        if (p === '/api/v1/agent_profiles') return json(res, { profiles: rich.agentProfiles });
        if (p === '/api/v1/fs:home' || p === '/api/v1/fs:browse') return json(res, rich.fsHome);
        if (p === `/api/v1/workspaces/${WORKSPACE_ID}/skills`) return json(res, { skills: rich.skills });
      }
      // Plugin routes, shaped after kap-server's protocol schemas
      // (packages/kap-server/src/protocol/rest-plugin.ts): GET /plugins →
      // {plugins: PluginSummaryWire[]}, GET /plugins/marketplace →
      // {entries: PluginMarketplaceEntryWire[]}. Without them upstream's
      // Plugins tab renders its load-error state and there is nothing to
      // compare the fork's panel against.
      if (p === '/api/v1/plugins') {
        const summary = (id, displayName, enabled, source) => ({
          id,
          displayName,
          version: '1.0.0',
          enabled,
          state: 'ok',
          skillCount: 1,
          mcpServerCount: 1,
          enabledMcpServerCount: enabled ? 1 : 0,
          hookCount: 1,
          commandCount: 1,
          hasErrors: false,
          source,
        });
        return json(res, {
          plugins: [
            summary('example-official', 'Example Official', true, 'github'),
            summary('example-local', 'Example Local', false, 'local-path'),
          ],
        });
      }
      if (p === '/api/v1/plugins/marketplace') {
        return json(res, {
          entries: [
            { id: 'example-official', tier: 'official', displayName: 'Example Official', description: 'An official example plugin.', version: '2.1.0', source: 'github:example/official', installed: { enabled: true, version: '1.0.0' }, updateAvailable: true },
            { id: 'example-curated', tier: 'curated', displayName: 'Example Curated', description: 'A curated example plugin.', version: '1.2.0', source: 'github:example/curated' },
            { id: 'example-third-party', tier: 'third-party', displayName: 'Example Third-party', description: 'A third-party example plugin.', version: '0.3.0', source: 'github:example/plugin' },
          ],
        });
      }
      if (p === '/api/v1/workspaces') {
        return json(res, { items: [{ id: WORKSPACE_ID, root: '/tmp/mock-workspace', name: 'mock', created_at: now, last_opened_at: now, session_count: sessions.length }], has_more: false });
      }
      // The sidebar list. The fork reads /api/v1/sessions and upstream the newer
      // v2 surface, so both shapes carry every row — the two pending-card
      // sessions appear on either app.
      if (p === '/api/v1/sessions') {
        return json(res, { items: sessionRows(), has_more: false });
      }
      if (p === '/api/v2/sessions') {
        if (url.searchParams.get('view') === 'by_workspace') {
          return json(res, { groups: [{ workspace: { id: WORKSPACE_ID, cwd: '/tmp/mock-workspace', name: 'mock' }, sessions: sessionRows() }], has_more: false, next_page_token: null, total: sessions.length });
        }
        return json(res, { items: sessionRows(), has_more: false, next_page_token: null, total: sessions.length });
      }
      // Every per-session route, `/api/v{1,2}/sessions/<id>[/<sub>]`: the id picks
      // the variant, so all three sessions answer the same set of surfaces.
      const sessionMatch = /^\/api\/(?:v1|v2)\/sessions\/([^/]+)(?:\/(.*))?$/.exec(p);
      if (sessionMatch) {
        const entry = sessionById.get(decodeURIComponent(sessionMatch[1]));
        if (entry === undefined) return json(res, null);
        const sub = sessionMatch[2] ?? '';
        const row = () => rowOf(entry, nowIso());
        // The v2 bare route answers with the snapshot body, the v1 bare route with
        // the session row itself. Upstream fetches the row as the watermark before
        // subscribing to session events; a null body throws there and upstream
        // then skips the whole WebSocket subscription, which leaves its dock
        // without any bash / subagent / todo pills. The fork's deep-link load
        // reads the same route.
        if (sub === '') {
          if (p.startsWith('/api/v2/')) return json(res, { ...entry.snapshot, session: row() });
          return json(res, {
            ...row(),
            last_seq: entry.snapshot.as_of_seq,
            lastSeq: entry.snapshot.as_of_seq,
          });
        }
        if (sub === 'snapshot') return json(res, { ...entry.snapshot, session: row() });
        if (sub === 'tasks')
          return json(res, {
            items: env.MOCK_NO_TASKS === '1'
              ? []
              : richOn
                ? [bashTask, bashTaskExited, subagentRunning, subagentTask, subagentForeground]
                : [bashTask, subagentTask],
          });
        if (sub === 'media/mock_media_1') {
          const mode = env.MOCK_MEDIA ?? 'ok';
          console.log('MEDIA request, mode =', mode);
          if (mode === 'hang') return; // never respond — simulates a wedged server stream
          if (mode === '404') {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ code: 40404, msg: 'file not found', data: null, request_id: 'mock' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'image/png', 'content-length': PIXEL_PNG.length });
          res.end(PIXEL_PNG);
          return;
        }
        // Session metadata write (the fork posts the pin / emoji / title here;
        // upstream posts the same shape). Recorded so the next GET reflects it.
        if (sub === 'profile' && req.method === 'POST') {
          readBody(req).then((body) => {
            if (typeof body?.title === 'string') sessionState.title = body.title;
            const pinned = body?.metadata?.pinned;
            if (typeof pinned === 'boolean') sessionState.pinned = pinned;
            const emoji = body?.metadata?.emoji;
            if (typeof emoji === 'string') sessionState.emoji = emoji;
            json(res, row());
          });
          return;
        }
        // Feature fetches (goal/todos/plans/transcript): graceful empty shapes.
        if (sub === 'goal' && (env.MOCK_GOAL === '1' || (richOn && env.MOCK_GOAL !== '0'))) {
          return json(res, goalMock(env.MOCK_GOAL_STATUS));
        }
        if (richOn) {
          // Live status: the source of truth for the status line, and the driver
          // for the context ring and the mode pills.
          if (sub === 'status') return json(res, rich.status);
          if (sub === 'warnings') return json(res, { warnings: rich.warnings });
          if (sub === 'skills') return json(res, { skills: rich.skills });
          if (sub === 'terminals') return json(res, { items: rich.terminals });
          if (sub === 'children') return json(res, { items: rich.children });
          // Right panel: the change list, the per-turn file history and the diff
          // card all read one of these. Upstream asks for
          // `file-history/changes` and `file-history/content`.
          if (sub === 'fs:git_status') return json(res, rich.gitStatus);
          if (sub.startsWith('file-history')) return json(res, rich.fileChanges);
        }
        if (sub === 'fs:diff') {
          // The diff pane's per-file route (POST .../fs:diff), so the drill into
          // one file shows lines instead of its "no line changes" state.
          readBody(req).then((body) => {
            const wanted = typeof body?.path === 'string' ? body.path : 'file';
            return json(res, {
              path: wanted,
              diff: [
                `diff --git a/${wanted} b/${wanted}`,
                `--- a/${wanted}`,
                `+++ b/${wanted}`,
                '@@ -1,4 +1,5 @@',
                ` """${wanted} — mock content."""`,
                ' import os',
                '-TIMEOUT = 10',
                '+TIMEOUT = 30',
                '+# the mock server serves this diff',
                ' def load_config(path):',
              ].join('\n'),
            });
          });
          return;
        }
        if (sub === 'fs:read') {
          // The file preview's route (POST .../fs:read). Serving it is what makes
          // the panel's file tab and the transcript's file links show content
          // instead of their load-error state.
          readBody(req).then((body) => {
            const wanted = typeof body?.path === 'string' ? body.path : '';
            const text = mockFileText(wanted);
            json(res, {
              path: wanted,
              content: text,
              encoding: 'utf-8',
              size: Buffer.byteLength(text, 'utf8'),
              truncated: false,
              etag: 'mock-etag',
              mime: 'text/x-python',
              language_id: 'python',
              line_count: text.split('\n').length,
              is_binary: false,
            });
          });
          return;
        }
        if (sub === 'transcript/plan') return json(res, { agent_id: 'main', plans: richOn ? rich.plans : [] });
        if (sub === 'transcript') {
          // Transcript contract page (zod-validated by upstream's bundle):
          // user turn with the prompt, assistant turn whose single step carries
          // the markdown as a text frame. Neither the turn nor the step carries
          // a timing here on purpose: upstream renders one from what they hold
          // (a `· 1m20s` on its thinking head, a turn time on its rows) while
          // the fork's main transcript is built from the snapshot's messages,
          // which have no timing at all — a fixture timing would land as a
          // surface the two apps disagree on for a reason not under test. The
          // thinking frame is the same story from the other side:
          // `thinkingFrameSchema` has no timing field either, only
          // `{kind, frameId, text}` — which is why the fork's thinking card
          // times the span it watched rather than reading one from here.
          return json(res, {
            agent_id: 'main',
            items: [
              { kind: 'turn', turnId: 't1', ordinal: 0, state: 'completed', origin: { kind: 'user' }, prompt: 'Show me a config example.', steps: [], startedAt: now, endedAt: now },
              { kind: 'turn', turnId: 't2', ordinal: 1, state: 'completed', origin: { kind: 'user' }, steps: [
                { kind: 'step', stepId: 's1', turnId: 't2', ordinal: 0, state: 'completed', frames: [
                  { kind: 'thinking', frameId: 's1.th_1', text: MOCK_THINKING },
                  // A run of tool calls, matching the snapshot's tool_use parts,
                  // shaped after transcriptFrameSchema in
                  // packages/transcript/src/contract/schema.ts: frameId,
                  // toolCallId and name are required and `state` is one of
                  // running | done | error (a guessed "completed" plus a missing
                  // frameId made upstream fall back to its error surface).
                  ...(env.MOCK_FOLD_TOOLS !== '0'
                    ? [
                        { kind: 'tool', frameId: 's1.tc_read_1', toolCallId: 'tc_read_1', name: 'Read', state: 'done', input: { path: '/tmp/mock-workspace/a.py' }, output: 'a' },
                        { kind: 'tool', frameId: 's1.tc_bash_1', toolCallId: 'tc_bash_1', name: 'Bash', state: 'done', input: { command: 'ls' }, output: 'a.py' },
                        { kind: 'tool', frameId: 's1.tc_grep_1', toolCallId: 'tc_grep_1', name: 'Grep', state: 'done', input: { pattern: 'x' }, output: 'x' },
                      ]
                    : []),
                  // Upstream normalises TodoWrite to the `todo` tool kind and
                  // reads the frame's input.items for the dock's todos pill.
                  { kind: 'tool', frameId: 's1.tc_todo_1', toolCallId: 'tc_todo_1', name: 'TodoWrite', state: 'done', input: { items: [
                    { title: 'Read the config', status: 'completed' },
                    { title: 'Change the timeout', status: 'in_progress' },
                    { title: 'Re-run the check', status: 'pending' },
                  ], todos: [
                    { title: 'Read the config', status: 'completed' },
                    { title: 'Change the timeout', status: 'in_progress' },
                    { title: 'Re-run the check', status: 'pending' },
                  ] }, output: 'Todos updated' },
                  { kind: 'tool', frameId: 's1.tc_edit_1', toolCallId: 'tc_edit_1', name: 'Edit', state: 'done', input: { path: '/tmp/mock-workspace/config.py', old_string: 'a', new_string: 'b' }, output: 'The file has been updated.' },
                  // The subagent card and the goal card, matching the snapshot's
                  // tool_use parts above so both transcript routes carry them.
                  { kind: 'tool', frameId: 's1.tc_agent_1', toolCallId: 'tc_agent_1', name: 'Agent', state: 'done', taskId: subagentForeground.id, agentRefs: [{ agentId: subagentForeground.id, role: 'child' }], input: {
                    description: 'Refit the hadronic interaction model',
                    subagent_type: 'coder',
                    prompt: 'Refit the hadronic interaction model against the thin-target data and report the chi2/ndf of the converged fit.',
                  }, output: 'Fit converged: chi2/ndf = 1.24 over 38 bins; the propagated uncertainty band on the yield dropped from 4.1% to 2.7%.' },
                  { kind: 'tool', frameId: 's1.tc_getgoal_1', toolCallId: 'tc_getgoal_1', name: 'GetGoal', state: 'done', input: { goalId: 'goal_mock_1' }, output: JSON.stringify(goal) },
                  { kind: 'tool', frameId: 's1.tc_goalbudget_1', toolCallId: 'tc_goalbudget_1', name: 'SetGoalBudget', state: 'done', input: { value: 500000, unit: 'tokens' }, output: 'Budget set: 500000 tokens.' },
                  { kind: 'tool', frameId: 's1.tc_goalbudget_2', toolCallId: 'tc_goalbudget_2', name: 'SetGoalBudget', state: 'done', input: { value: 30, unit: 'minutes' }, output: 'Wall-clock budget set: 30 minutes.' },
                  { kind: 'text', frameId: 'f1', role: 'assistant', text: CODE_MD },
                ], startedAt: now, endedAt: now },
              ], startedAt: now, endedAt: now },
              // The parked prompt's turn (MOCK_QUEUED=1): state `queued`, no
              // steps, nothing started. A prompt waiting for the running turn is
              // a turn item like any other, it just has not run yet.
              ...(queuedOn
                ? [{ kind: 'turn', turnId: 't3', ordinal: 2, state: 'queued', origin: { kind: 'user' }, triggerPromptId: queuedPrompt.promptId, prompt: queuedPromptText, steps: [] }]
                : []),
              // A non-turn marker. The daemon records one for every such event
              // (`hook`, `skill`, `cron.fired`, `compaction`, `undo`,
              // `interruption`, `notice`, `goal`, `plan.revision`) and upstream
              // draws a row for a compaction and nothing for the rest. The
              // fixture carried none at all, so a renderer that drew a row for
              // every marker — which the subagent pane did, printing "Context
              // compacted" for skills and hooks — compared clean.
              { kind: 'marker', markerId: 'm_skill_1', marker: 'skill', payload: { origin: { kind: 'skill_activation', skillName: 'mock-skill', skillArgs: '' } }, at: now },
            ],
            has_more: false,
            // Upstream's dock reads its task pills from the transcript page's
            // `tasks` array (kind shell maps to the dock's bash pill), not from
            // the REST task list or from taskCreated events.
            tasks: richOn && env.MOCK_NO_TASKS !== '1'
              ? [
                  { taskId: bashTask.id, kind: 'shell', state: 'running', detached: true, description: bashTask.description, agentId: 'main', outputTail: bashTask.output_preview, startedAt: now },
                  { taskId: bashTaskExited.id, kind: 'shell', state: 'completed', detached: false, description: bashTaskExited.description, agentId: 'main', outputTail: bashTaskExited.output_preview, startedAt: now, endedAt: now },
                  { taskId: subagentRunning.id, kind: 'subagent', state: 'running', detached: true, description: subagentRunning.description, agentId: subagentRunning.id, outputTail: '', startedAt: now },
                  { taskId: subagentTask.id, kind: 'subagent', state: 'completed', detached: true, description: subagentTask.description, agentId: subagentTask.id, outputTail: '', startedAt: now, endedAt: now },
                  { taskId: subagentForeground.id, kind: 'subagent', state: 'running', detached: false, description: subagentForeground.description, agentId: subagentForeground.id, outputTail: '', startedAt: now },
                ]
              : [],
            // Upstream builds its pending cards from this array (state
            // `pending`), not from the snapshot, so the two pending sessions
            // carry their card here as well.
            interactions: entry.transcriptInteractions,
            // The dock's todos pill counts items with status "done"; the
            // transcript todo item status enum is pending | in_progress | done.
            todos: richOn
              ? [
                  { todoId: 'todo_mock_1', updatedAt: now, items: [
                    { title: 'Read the config', status: 'done' },
                    { title: 'Change the timeout', status: 'in_progress' },
                    { title: 'Re-run the check', status: 'pending' },
                  ] },
                ]
              : [],
            // The prompts behind the active turn (MOCK_QUEUED=1): both apps
            // rebuild a steered prompt's user bubble from this array
            // (`finishedAt === steeredAt` marks one folded into another turn's
            // request), and the queued `turn` item above is what gives the
            // waiting prompt a bubble of its own.
            prompts: queuedOn
              ? [
                  steeredPrompt,
                  queuedPrompt,
                ]
              : [],
            meta: { activity: busyOn ? 'turn' : 'idle', goal: {
              objective: goal.objective,
              status: goal.status,
              completionCriterion: goal.completionCriterion,
              budgetUsed: goal.budgetUsed,
              budgetLimit: goal.budgetLimit,
            } },
            agents: [{ agentId: 'main', type: 'main' }],
            pending_interactions: entry.transcriptPendingIds,
          });
        }
        return json(res, null);
      }
      return json(res, null);
    }

    let file = path.join(root, decodeURIComponent(p));
    if (p === '/' || !fs.existsSync(file)) file = path.join(root, 'index.html');
    const ext = path.extname(file).toLowerCase();
    try {
      const body = fs.readFileSync(file);
      if (ext === '.html' && env.MOCK_SEED !== '0') {
        const force = env.MOCK_SEED === 'force';
        const script = Object.entries(bootSeed())
          .map(([k, v]) => force
            ? `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`
            : `if(localStorage.getItem(${JSON.stringify(k)})===null)localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
          .join(';');
        const html = body
          .toString('utf8')
          .replace('<head>', `<head><script>try{${script}}catch(e){}</script>`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('nf');
    }
  };
}

export function startMock({ root, port, token, env } = {}) {
  const switches = env ?? process.env;
  const appRoot = root ?? switches.MOCK_ROOT;
  if (!appRoot) throw new Error('startMock: root is required (pass { root } or set MOCK_ROOT)');
  const authToken = token ?? (switches.MOCK_TOKEN || 'mock-token');
  const listenPort = Number(port ?? switches.MOCK_PORT) || 0;
  const fixtures = buildFixtures(switches);
  const handler = createHandler({ root: appRoot, token: authToken, env: switches, fixtures });

  const server = http.createServer(handler);

  const wss = new WebSocketServer({ noServer: true });
  const pingTimers = new Set();
  // The live exchange's end timer (MOCK_LIVE_EXCHANGE=1). Per connection — see
  // maybeScheduleLiveTurnEnd — and cleared with the server.
  const liveTurnTimers = new Set();

  // MOCK_LIVE_EXCHANGE=1: the running turn the snapshot posed ends a few seconds
  // into the subscription, exactly as the daemon would end it — a raw agent-core
  // `turn.ended` carrying the turn's own duration. The client's turn-end path
  // sets the moon down, stamps the exchange's duration on the reply and lets the
  // thinking card fold up, so one frame closes all three timing displays at
  // once. Sequenced past the snapshot's `as_of_seq` of 3, because the
  // cursor-advancing half of that path refuses an event it has already seen.
  //
  // Once per subscription, not once per process: a page that reloads poses the
  // same running turn again and must see it end again. A repeat of the frame
  // (a socket that reconnects inside the window) carries the seq the client has
  // already advanced past, so the turn-end path ignores it.
  function maybeScheduleLiveTurnEnd(socket, sessionIds, state) {
    if (fixtures.liveTurn === null || state.ended) return;
    if (!Array.isArray(sessionIds) || !sessionIds.includes(SESSION_ID)) return;
    const live = fixtures.liveTurn;
    state.ended = true;
    const endTimer = setTimeout(() => {
      liveTurnTimers.delete(endTimer);
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify({
        type: 'turn.ended',
        seq: live.seq,
        session_id: SESSION_ID,
        timestamp: new Date().toISOString(),
        payload: { turnId: live.turnId, reason: 'completed', durationMs: live.durationMs },
      }));
      console.log(`WS live exchange ended after ${live.endAfterMs}ms, durationMs=${live.durationMs}`);
    }, live.endAfterMs);
    liveTurnTimers.add(endTimer);
  }

  wss.on('connection', (socket, req) => {
    // The browser client cannot set request headers, so the bearer credential
    // rides in the Sec-WebSocket-Protocol subprotocol; ws echoes the first
    // offered protocol back, which is what makes the browser accept the socket.
    console.log('WS open', req.url);
    // Per-connection state for the live exchange (see maybeScheduleLiveTurnEnd).
    const liveState = { ended: false };

    // server_hello must arrive first: the client only marks itself connected
    // and sends its own client_hello after it sees this frame.
    socket.send(JSON.stringify({ type: 'server_hello', payload: { heartbeat_ms: HEARTBEAT_MS } }));

    const pingTimer = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', payload: { nonce: `s_${Date.now()}` } }));
      }
    }, PING_INTERVAL_MS);
    pingTimers.add(pingTimer);

    socket.on('message', (raw) => {
      let frame;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!frame || typeof frame.type !== 'string') return;
      switch (frame.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong', payload: { nonce: frame.payload?.nonce } }));
          break;
        case 'subscribe':
          socket.send(JSON.stringify({ type: 'ack', id: frame.id, payload: {} }));
          maybeScheduleLiveTurnEnd(socket, frame.payload?.session_ids, liveState);
          break;
        case 'unsubscribe':
          socket.send(JSON.stringify({ type: 'ack', id: frame.id, payload: {} }));
          break;
        case 'client_hello':
          // The fork's client carries its whole subscription set in the
          // handshake rather than sending separate `subscribe` frames.
          maybeScheduleLiveTurnEnd(socket, frame.payload?.subscriptions, liveState);
          break;
        default:
          // pong (answer to our heartbeat), client_hello, terminal_* and
          // anything unknown are ignored — never close the socket over them.
          break;
      }
    });

    socket.on('close', () => {
      clearInterval(pingTimer);
      pingTimers.delete(pingTimer);
    });
    socket.on('error', () => {});
  });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/api/v1/ws') {
      socket.destroy();
      return;
    }
    // ws's default protocol handler echoes the client's first offered
    // subprotocol (kimi-code.bearer.<token>), which the browser requires.
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const stop = () => {
    for (const timer of pingTimers) clearInterval(timer);
    pingTimers.clear();
    for (const timer of liveTurnTimers) clearTimeout(timer);
    liveTurnTimers.clear();
    for (const client of wss.clients) client.terminate();
    return Promise.all([
      new Promise((resolve) => wss.close(resolve)),
      new Promise((resolve) => {
        server.close(resolve);
        // idle keep-alive connections from the browser would otherwise hold
        // the process open after the listening socket is gone.
        server.closeAllConnections();
      }),
    ]);
  };

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const boundPort = server.address().port;
      console.log(`mock on ${boundPort} root=${appRoot}`);
      resolve({ url: `http://127.0.0.1:${boundPort}`, port: boundPort, stop });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { url } = await startMock({ env: process.env });
    console.log(`mock url ${url}`);
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 1;
  }
}
