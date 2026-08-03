// apps/kimi-web/src/bench/types.ts
// Shared types for the bench scenarios. A scenario drives the harness through
// the `BenchContext` — the reactive state + DOM handles BenchView exposes.

import type { ComputedRef, Ref } from 'vue';
import type { AppApprovalRequest, AppMessage, AppWarning } from '../api/types';
import type { ChatTurn } from '../types';
import type { Sampler } from './sampler';

export type Theme = 'dark' | 'light';

export type DockPanel = 'bash' | 'subagent' | 'todos' | null;

export interface BenchContext {
  sampler: Sampler;

  /** Reactive conversation state, fed through messagesToTurns in BenchView. */
  messages: Ref<AppMessage[]>;
  approvals: Ref<AppApprovalRequest[]>;
  turns: ComputedRef<ChatTurn[]>;
  /** Streaming flag → the last assistant turn renders with `streaming=true`. */
  turnActive: Ref<boolean>;

  /** The scroll container that owns the conversation (ChatPane has none). */
  scroller: () => HTMLElement | null;
  /** Pin the scroller to the bottom (auto-follow during streaming). */
  followScroll: () => void;

  setTheme: (theme: Theme) => void;
  setGlass: (on: boolean) => void;

  /** Overlay mount flags (v-if / :open / v-model in the BenchView template). */
  dialogOpen: Ref<boolean>;
  sheetOpen: Ref<boolean>;
  bottomSheetOpen: Ref<boolean>;
  settingsOpen: Ref<boolean>;
  serverAuthOpen: Ref<boolean>;

  /** ChatDock work-panel state. */
  dockPanel: Ref<DockPanel>;

  /** Toast stack for WarningToasts. */
  warnings: Ref<AppWarning[]>;

  nextFrame: () => Promise<void>;
  settle: (ms: number) => Promise<void>;
}

export type ScenarioName = 'streaming-replay' | 'scroll-long' | 'dialog-storm' | 'dock-toc';

export type ScenarioRunner = (ctx: BenchContext) => Promise<void>;
