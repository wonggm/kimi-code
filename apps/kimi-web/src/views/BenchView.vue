<!--
  apps/kimi-web/src/views/BenchView.vue
  Isolated performance-bench page (dev-only). Mounted by main.ts when
  `?bench=1` is present AND `import.meta.env.DEV` is true — so none of this
  reaches the production bundle.

  It renders the REAL presentational components (ChatPane, Markdown via
  ChatPane, Dialog, Sheet, BottomSheet, SettingsDialog, ServerAuthDialog,
  MenuSelect via SettingsDialog, Tooltip, Toast via WarningToasts,
  ConversationToc, ChatDock→Composer) off synthetic data fed through the real
  `messagesToTurns` reducer. No kap-server, no WebSocket.

  Two modes, selected by query string:
    ?bench=1&scenario=<name>   run a timed scenario; final metrics on window.__bench
    ?bench=1&scene=<name>      static pixel-capture pose (capture.mjs drives input)
  Optional: &theme=dark|light  &glass=on|off
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref } from 'vue';
import type { AppApprovalRequest, AppMessage, AppModel, AppSkill, AppWarning } from '../api/types';
import type { ChatTurn, ConversationStatus, TaskItem, TodoView } from '../types';
import { messagesToTurns } from '../composables/messagesToTurns';
import { useAppearance } from '../composables/client/useAppearance';
import { buildLongConversation, streamingMarkdown, BENCH_EPOCH_ISO } from '../bench/fixtures';
import { Sampler, signalDone, signalReady } from '../bench/sampler';
import { scenarios } from '../bench/scenarios';
import type { BenchContext, DockPanel, ScenarioName, Theme } from '../bench/types';

import ChatPane from '../components/chat/ChatPane.vue';
import ConversationToc, { type ConversationTocItem } from '../components/chat/ConversationToc.vue';
import ChatDock from '../components/chat/ChatDock.vue';
import Dialog from '../components/ui/Dialog.vue';
import Sheet from '../components/ui/Sheet.vue';
import Tooltip from '../components/ui/Tooltip.vue';
import BottomSheet from '../components/dialogs/BottomSheet.vue';
import SettingsDialog from '../components/settings/SettingsDialog.vue';
import ServerAuthDialog from '../components/ServerAuthDialog.vue';
import WarningToasts from '../components/WarningToasts.vue';

const appearance = useAppearance();

// Markdown injects this to rewrite local image URLs; a no-op stub is fine here.
provide('resolveImage', (src: string) => Promise.resolve(src));

// --- reactive conversation state (fed through messagesToTurns) -------------
const messages = ref<AppMessage[]>([]);
const approvals = ref<AppApprovalRequest[]>([]);
const turnActive = ref(false);
const turns = computed<ChatTurn[]>(() => messagesToTurns(messages.value, approvals.value));

// --- overlay / dock / toast state ------------------------------------------
const dialogOpen = ref(false);
const sheetOpen = ref(false);
const bottomSheetOpen = ref(false);
const settingsOpen = ref(false);
const serverAuthOpen = ref(false);
const dockPanel = ref<DockPanel>(null);
const warnings = ref<AppWarning[]>([]);

// --- scroller handle (BenchView owns the scroller ConversationPane would) ---
const scrollerEl = ref<HTMLElement | null>(null);

// --- static props for ChatDock / Composer / SettingsDialog ------------------
const status: ConversationStatus = {
  model: 'Kimi K2',
  modelId: 'kimi-k2',
  ctxUsed: 18_400,
  ctxMax: 131_072,
  cacheHitRate: 0.62,
  permission: 'manual',
  branch: 'main',
  cwd: '~/work/muedm',
  isGitRepo: true,
};
const models: AppModel[] = [
  { id: 'kimi-k2', provider: 'kimi', model: 'kimi-k2', displayName: 'Kimi K2', maxContextSize: 131_072, capabilities: ['thinking'] },
  { id: 'kimi-k2-thinking', provider: 'kimi', model: 'kimi-k2-thinking', displayName: 'Kimi K2 Thinking', maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['low', 'high', 'max'] },
  { id: 'gpt-example', provider: 'openai', model: 'gpt-example', displayName: 'GPT Example', maxContextSize: 128_000 },
];
const skills: AppSkill[] = [
  { name: 'root-analysis', description: 'Run ROOT macros and fit histograms', source: 'user' },
  { name: 'musr-sim', description: 'Build and run musrSim Geant4 simulations', source: 'user' },
  { name: 'mpl-pub', description: 'Publication-quality matplotlib figures', source: 'user' },
  { name: 'pdf', description: 'Read, merge and create PDF files', source: 'user' },
  { name: 'hpc-pipeline', description: 'Sync, submit and monitor HPC jobs', source: 'user' },
  { name: 'llm-wiki', description: 'Build an Obsidian knowledge base', source: 'user' },
];
const bashTasks: TaskItem[] = [
  { id: 'bench-bash-1', name: 'root -b -q fit.C', kind: 'task', state: 'run', timing: '12s' },
  { id: 'bench-bash-2', name: 'make -j8', kind: 'task', state: 'done', timing: '1m04s' },
];
const subagentTasks: TaskItem[] = [
  { id: 'bench-sub-1', name: 'Explore detector geometry', kind: 'subagent', state: 'run', timing: '8s', runInBackground: true },
];
const todos: TodoView[] = [
  { title: 'Capture reference pixels', status: 'done' },
  { title: 'Run baseline metrics', status: 'in_progress' },
  { title: 'Verify isolation', status: 'pending' },
];

// --- TOC items derived from the rendered turns ------------------------------
function tocTitle(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const clean = line.replace(/^#+\s*/, '').trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || '…';
}
const tocItems = computed<ConversationTocItem[]>(() =>
  turns.value.map((t) => ({ id: t.id, role: t.role, no: t.no, title: tocTitle(t.text) })),
);
const activeTurnId = computed<string | null>(() => turns.value.at(-1)?.id ?? null);

// --- bench context handed to the scenarios ----------------------------------
const sampler = new Sampler();
function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
const ctx: BenchContext = {
  sampler,
  messages,
  approvals,
  turns,
  turnActive,
  scroller: () => scrollerEl.value,
  followScroll: () => {
    const el = scrollerEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  setTheme: (theme: Theme) => appearance.setColorScheme(theme),
  setGlass: (on: boolean) => appearance.setLiquidGlass(on),
  dialogOpen,
  sheetOpen,
  bottomSheetOpen,
  settingsOpen,
  serverAuthOpen,
  dockPanel,
  warnings,
  nextFrame,
  settle,
};

// Expose for the pixel-capture driver: push warnings late so the 6s
// auto-dismiss timer doesn't fire before the screenshot lands.
;(window as unknown as Record<string, unknown>).__benchPushWarnings = (ws: AppWarning[]) => {
  warnings.value = ws;
};

// A math+code conversation used as the backdrop for every pixel scene.
function sceneConversation(): AppMessage[] {
  const base = buildLongConversation(4);
  const rich: AppMessage = {
    id: 'bench-scene-rich',
    sessionId: 'bench-session',
    role: 'assistant',
    content: [{ type: 'text', text: streamingMarkdown(3) }],
    createdAt: BENCH_EPOCH_ISO,
    promptId: 'bench-scene-prompt',
  };
  return [...base, rich];
}

function applyQueryAppearance(params: URLSearchParams): void {
  const theme: Theme = params.get('theme') === 'light' ? 'light' : 'dark';
  const glass = params.get('glass') !== 'off';
  appearance.setColorScheme(theme);
  appearance.setLiquidGlass(glass);
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  applyQueryAppearance(params);

  const scenario = params.get('scenario') as ScenarioName | null;
  const scene = params.get('scene');

  if (scenario && scenarios[scenario]) {
    signalReady();
    try {
      await scenarios[scenario](ctx);
    } catch (err) {
      window.__benchError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      sampler.stop();
    }
    signalDone();
    return;
  }

  if (scene) {
    messages.value = sceneConversation();
    if (scene === 'settings') settingsOpen.value = true;
    if (scene === 'toast-tooltip') {
      // Warnings are pushed late by the capture driver (via __benchPushWarnings)
      // so the 6s auto-dismiss timer doesn't fire during the render-settle wait.
    }
    await nextTick();
    await settle(700); // let KaTeX / shiki finish painting the static pose
    signalReady();
    signalDone();
    return;
  }

  // Idle: a small conversation for manual inspection at ?bench=1.
  messages.value = buildLongConversation(8);
  signalReady();
  signalDone();
});
</script>

<template>
  <div class="bench-root">
    <!-- A thin bench toolbar; also hosts the tooltip trigger for pixel poses. -->
    <div class="bench-bar">
      <span class="bench-bar__title">kimi-web bench</span>
      <Tooltip text="Bench tooltip — hover pose for pixel capture" placement="bottom">
        <button type="button" class="bench-bar__btn" data-bench="tooltip-trigger">tooltip</button>
      </Tooltip>
    </div>

    <!-- Conversation column. Mirrors ConversationPane's structure: .chat-layout
         hosts the top blur band (::before) + vignette; .panes.chat-scroll is the
         scroller; .content-wrap constrains the reading column. -->
    <div class="chat-layout">
      <div ref="scrollerEl" class="panes chat-scroll" data-bench="scroller">
        <div class="content-wrap align-center">
          <ChatPane :turns="turns" :turn-active="turnActive" />
        </div>
      </div>

      <ConversationToc :items="tocItems" :active-turn-id="activeTurnId" />
    </div>

    <!-- Dock (wraps the real Composer: model pill + slash menu live here). -->
    <div class="bench-dock">
      <ChatDock
        :status="status"
        :models="models"
        :skills="skills"
        :todos="todos"
        :bash-tasks="bashTasks"
        :subagent-tasks="subagentTasks"
        :bash-running="1"
        :subagent-running="1"
        :todo-done-count="1"
        :has-dock-work="true"
        :dock-panel="dockPanel"
        :mobile="false"
        session-id="bench-session"
        @toggle-dock-panel="(p) => (dockPanel = dockPanel === p ? null : p)"
        @close-dock-panel="dockPanel = null"
      />
    </div>

    <!-- Overlays exercised by dialog-storm and the settings pixel scene. -->
    <Dialog
      :open="dialogOpen"
      title="Bench dialog"
      description="A real Dialog primitive over the conversation."
      size="md"
      @update:open="dialogOpen = $event"
      @close="dialogOpen = false"
    >
      <p class="bench-dialog-body">
        Dialog content with a backdrop blur scrim. Opening and closing this is
        one dialog-storm cycle.
      </p>
    </Dialog>

    <Sheet :open="sheetOpen" title="Bench sheet" @update:open="sheetOpen = $event" @close="sheetOpen = false">
      <p class="bench-dialog-body">A real Sheet primitive, bottom-anchored.</p>
    </Sheet>

    <BottomSheet v-model="bottomSheetOpen" title="Bench bottom sheet">
      <p class="bench-dialog-body">A real BottomSheet primitive with a slide-up transition.</p>
    </BottomSheet>

    <SettingsDialog
      v-if="settingsOpen"
      :color-scheme="appearance.colorScheme.value"
      :accent="appearance.accent.value"
      :ui-font-size="appearance.uiFontSize.value"
      :auth-ready="true"
      :notify="true"
      :notify-question="true"
      :notify-approval="true"
      :sound="false"
      :liquid-glass="appearance.liquidGlass.value"
      :wide-mode="appearance.wideMode.value"
      :models="models"
      @close="settingsOpen = false"
      @set-color-scheme="appearance.setColorScheme($event)"
      @set-accent="appearance.setAccent($event)"
      @set-ui-font-size="appearance.setUiFontSize($event)"
      @set-liquid-glass="appearance.setLiquidGlass($event)"
      @set-wide-mode="appearance.setWideMode($event)"
    />

    <ServerAuthDialog v-if="serverAuthOpen" />

    <WarningToasts :warnings="warnings" @dismiss="warnings.splice($event, 1)" />
  </div>
</template>

<!-- Non-scoped: replicates ConversationPane's scroller / blur-band / vignette
     exactly (same selectors + values) so scroll-long measures the real
     backdrop-filter-over-scrolling-text cost. ConversationPane is client-coupled
     and out of the required component list, so its structural CSS lives here.
     Only loaded on the dev-only bench page — never in production. -->
<style>
.bench-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-fg);
  z-index: var(--z-max);
  overflow: hidden;
}

.bench-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 48px;
  padding: 0 var(--space-4);
  flex-shrink: 0;
}
.bench-bar__title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  opacity: 0.7;
}
.bench-bar__btn {
  font: inherit;
  font-size: var(--text-xs);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: inherit;
  cursor: pointer;
}

.chat-layout {
  --read-max: 760px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  min-height: 0;
  position: relative;
  container-type: inline-size;
}
.panes.chat-scroll {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
}
.content-wrap {
  width: 100%;
  max-width: var(--read-max);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.content-wrap.align-center {
  margin-left: auto;
  margin-right: auto;
}

/* Edge vignette (glass-gated) — fade transcript at top/bottom. */
html[data-liquid-glass='on'] .bench-root .panes {
  --con-pane-vignette: linear-gradient(
    to bottom,
    transparent 0,
    black 28px,
    black calc(100% - 28px),
    transparent 100%
  );
  -webkit-mask-image: var(--con-pane-vignette);
  mask-image: var(--con-pane-vignette);
}

/* Top blur band (glass-gated) — blurs scrolling text under the 96px header zone. */
html[data-liquid-glass='on'] .bench-root .chat-layout::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 96px;
  z-index: 2;
  pointer-events: none;
  -webkit-backdrop-filter: blur(14px) saturate(170%) brightness(1.04);
  backdrop-filter: blur(14px) saturate(170%) brightness(1.04);
  -webkit-mask-image: linear-gradient(to bottom, black 0, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0, transparent 100%);
}

.bench-dock {
  flex-shrink: 0;
  position: relative;
  z-index: 3;
}
.bench-dialog-body {
  margin: 0;
  line-height: var(--leading-normal);
}
</style>
