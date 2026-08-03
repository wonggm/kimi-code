// apps/kimi-web/src/bench/fixtures.ts
// Synthetic conversation data for the bench harness. Everything here feeds the
// REAL pipeline: AppMessage[] → messagesToTurns() → ChatTurn[] → ChatPane. No
// server, no WebSocket — the messages are fabricated locally.

import type { AppMessage, AppMessageContent } from '../api/types';

const SESSION_ID = 'bench-session';

/**
 * Fixed creation epoch for every synthetic message. The user-bubble timestamp
 * (MessageTime → formatMessageTime) renders a wall-clock string whose *branch*
 * depends on the current date (today "HH:MM", this-year "MM-DD HH:MM", older
 * "YYYY-MM-DD HH:MM"); using Date.now() would therefore make the pixel poses
 * change every minute and the pixel gate could never pass a same-build
 * re-capture. A fixed epoch in a past year pins the "older" branch, so each
 * message's timestamp is a deterministic function of its index only.
 */
export const BENCH_EPOCH_ISO = '2024-03-12T09:00:00.000Z';
const BENCH_EPOCH_MS = Date.parse(BENCH_EPOCH_ISO);

function iso(offsetMs = 0): string {
  return new Date(BENCH_EPOCH_MS + offsetMs).toISOString();
}

function userMessage(id: string, text: string, offsetMs = 0): AppMessage {
  return {
    id,
    sessionId: SESSION_ID,
    role: 'user',
    content: [{ type: 'text', text }],
    createdAt: iso(offsetMs),
  };
}

function assistantMessage(
  id: string,
  promptId: string,
  content: AppMessageContent[],
  offsetMs = 0,
): AppMessage {
  return {
    id,
    sessionId: SESSION_ID,
    role: 'assistant',
    content,
    createdAt: iso(offsetMs),
    promptId,
  };
}

// ---------------------------------------------------------------------------
// streaming-replay fixture
// ---------------------------------------------------------------------------

/**
 * One rich markdown section (~1.6 KB) exercising the expensive render paths:
 * inline KaTeX `$…$`, display KaTeX `$$…$$`, a TypeScript code fence, a table
 * and prose. Repeated with variation by `streamingMarkdown()` to reach ~2000
 * tokens.
 */
function richSection(i: number): string {
  return [
    `## Section ${i + 1}: the anomalous magnetic moment`,
    '',
    `The muon spin precession frequency in a uniform field is governed by the`,
    `anomaly $a_\\mu = (g_\\mu - 2)/2$. For part ${i + 1}, the difference between`,
    `the measured and predicted values is $\\Delta a_\\mu = 2.49 \\times 10^{-9}$,`,
    `which persists at the $5\\sigma$ level.`,
    '',
    'The leading-order hadronic vacuum polarization enters as',
    '',
    '$$ a_\\mu^{\\mathrm{HVP,LO}} = \\left(\\frac{\\alpha m_\\mu}{2\\pi}\\right)^2 \\int_0^1 \\mathrm{d}x \\, \\frac{x^2(1-x)}{x^2 + (1-x)\\,m_\\mu^2/m_\\pi^2} \\, R(s) $$',
    '',
    'where the kernel is sharply peaked near threshold. A minimal sketch of the',
    'dispersion integral in code:',
    '',
    '```ts',
    `function hvpKernel(x: number, ratio: number): number {`,
    `  const num = x * x * (1 - x);`,
    `  const den = x * x + (1 - x) * ratio;`,
    `  return num / den;`,
    `}`,
    '',
    `export function integrate(rs: number[], dx: number, ratio: number): number {`,
    `  let acc = 0;`,
    `  for (let i = 0; i < rs.length; i++) acc += rs[i]! * hvpKernel(i * dx, ratio);`,
    `  return acc * dx;`,
    `}`,
    '```',
    '',
    '| source | contribution ($10^{-10}$) |',
    '| --- | --- |',
    `| QED | ${116584718 + i} |`,
    `| HVP | ${6840 + i} |`,
    `| HLbL | ${92 + (i % 5)} |`,
    '',
    `The uncertainty budget for iteration ${i + 1} is dominated by the spacelike`,
    'data combination, and the window observable $W(s)$ suppresses the tail.',
    '',
  ].join('\n');
}

/**
 * A ~2000-token markdown document (≈ 8–9 KB) of varied math + code, built by
 * repeating `richSection`. Deterministic. Fed token-by-token by the
 * `streaming-replay` scenario.
 */
export function streamingMarkdown(sections = 6): string {
  const parts: string[] = [
    '# Muon $g-2$ — a streaming walkthrough',
    '',
    'Below is a self-contained derivation rendered live through the real',
    'markdown + KaTeX pipeline, including `inline code` and fenced blocks.',
    '',
  ];
  for (let i = 0; i < sections; i++) parts.push(richSection(i));
  return parts.join('\n');
}

/**
 * Split text into whitespace-delimited "tokens", each carrying its trailing
 * whitespace so `chunks.join('')` reproduces the input exactly. Feeding one
 * chunk per tick approximates token-granular streaming deltas.
 */
export function chunkTokens(text: string): string[] {
  const chunks = text.match(/\S+\s*/g);
  return chunks ?? [];
}

// ---------------------------------------------------------------------------
// scroll-long / backdrop fixture
// ---------------------------------------------------------------------------

const QUESTION_POOL = [
  'Derive the Thomas-BMT equation for the frozen-spin condition.',
  'How does the magic momentum $p = 3.094\\,\\mathrm{GeV}/c$ cancel the EDM term?',
  'Summarize the Bethe-Bloch stopping power in a few lines.',
  'What is the SiPM photon detection efficiency model?',
  'Explain Birks quenching for a plastic scintillator.',
  'Write a small ROOT macro that fits a Gaussian to a histogram.',
];

function assistantBody(i: number): string {
  const lead = `Turn ${i + 1}: here is a concise answer with a formula $\\omega_a = \\frac{e}{m}\\left[a_\\mu B - \\left(a_\\mu - \\frac{1}{\\gamma^2 - 1}\\right)\\frac{\\beta \\times E}{c}\\right]$ and a short snippet.`;
  if (i % 4 === 0) {
    return [
      lead,
      '',
      '```cpp',
      `void fitPeak() {`,
      `  auto *h = (TH1D*)gDirectory->Get("h${i}");`,
      `  h->Fit("gaus", "Q");`,
      `  std::cout << "sigma = " << h->GetFunction("gaus")->GetParameter(2) << "\\n";`,
      `}`,
      '```',
    ].join('\n');
  }
  if (i % 4 === 2) {
    return `${lead}\n\nThe key relation is $$\\tau_\\mu = \\frac{1}{\\Gamma_0}\\left(1 + \\frac{3}{5}x\\right), \\qquad x = \\frac{m_e^2}{m_\\mu^2}.$$`;
  }
  return `${lead} The dominant systematic scales as $1/\\sqrt{N}$ with the stored-muon count $N$.`;
}

/**
 * Build a synthetic conversation of approximately `totalTurns` chat turns
 * (alternating user/assistant messages). Each assistant reply carries formulas
 * and, every few turns, a code fence — enough to make scrolling repaint the
 * blur band over real rendered content.
 */
export function buildLongConversation(totalTurns: number): AppMessage[] {
  const pairs = Math.max(1, Math.ceil(totalTurns / 2));
  const messages: AppMessage[] = [];
  for (let i = 0; i < pairs; i++) {
    const question = QUESTION_POOL[i % QUESTION_POOL.length]!;
    messages.push(userMessage(`bench-u-${i}`, question, -i * 60_000));
    messages.push(
      assistantMessage(`bench-a-${i}`, `bench-p-${i}`, [{ type: 'text', text: assistantBody(i) }], -i * 60_000 + 1000),
    );
  }
  return messages;
}

/** The opening user + empty assistant message pair the streaming scenario grows. */
export function streamingSeed(): AppMessage[] {
  return [
    userMessage('bench-stream-user', 'Walk me through the muon $g-2$ anomaly with the key formula and a code sketch.'),
    assistantMessage('bench-stream-assistant', 'bench-stream-prompt', [{ type: 'text', text: '' }]),
  ];
}

/** Id of the assistant message the streaming scenario appends deltas to. */
export const STREAMING_ASSISTANT_ID = 'bench-stream-assistant';
