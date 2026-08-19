<!-- apps/kimi-web/src/components/chat/MentionText.vue -->
<!-- Renders raw chat text with @-mentioned files / folders / skills as icon
     pills (class `mention-pill`, data-mention-* attributes). File and skill
     pills are clickable (open through the app's file flow); hovering a pill
     shows MentionTip. Missing files (probed on hover, result cached) render
     struck-through with class `mention-missing`. -->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { iconSvg } from '../../lib/icons';
import { tokenizeMentions, type MentionKind, type MentionSegment } from '../../lib/mentionTokens';
import MentionTip from './MentionTip.vue';

const props = withDefaults(
  defineProps<{
    text: string;
    /** File pills open via this callback (chat "open file" flow). */
    openFile?: (target: { path: string }) => void;
    /** Cheap existence probe — hover-only, results cached by the component. */
    probePath?: (kind: 'file' | 'folder', path: string) => Promise<boolean> | boolean;
    /** Skill details resolver — enables the description and open button. */
    resolveSkill?: (name: string) => { description?: string; path?: string } | null | undefined;
  }>(),
  {
    openFile: undefined,
    probePath: undefined,
    resolveSkill: undefined,
  },
);

const segments = computed<MentionSegment[]>(() => tokenizeMentions(props.text));

const ICON_FILE = iconSvg('file', 'sm');
const ICON_FOLDER = iconSvg('folder', 'sm');
const ICON_SKILL = iconSvg('sparkles', 'sm');

function iconFor(kind: MentionKind): string {
  return kind === 'folder' ? ICON_FOLDER : kind === 'skill' ? ICON_SKILL : ICON_FILE;
}

/** Stable no-op fallback so MentionTip never receives a fresh closure. */
function noopOpen(_target: { path: string }): void {}

// ---------------------------------------------------------------------------
// Missing-file detection — hover-only probe with a cached result, so a big
// transcript never triggers a burst of stat requests.
// ---------------------------------------------------------------------------
const PROBE_TTL_MS = 30_000;
const probeCache = new Map<string, { found: boolean; at: number }>();
const inFlight = new Map<string, Promise<boolean>>();
const missing = ref(new Set<string>());

function probeKey(kind: MentionKind, path: string): string {
  return `${kind}|${path}`;
}

function applyProbe(kind: MentionKind, path: string, found: boolean): void {
  const key = probeKey(kind, path);
  const next = new Set(missing.value);
  if (found) next.delete(key);
  else next.add(key);
  missing.value = next;
  const pills = Array.from(document.querySelectorAll<HTMLElement>('.mention-pill'));
  for (const pill of pills) {
    if (pill.dataset.mentionKind === kind && pill.dataset.mentionPath === path) {
      pill.classList.toggle('mention-missing', !found);
    }
  }
}

function probe(kind: MentionKind, path: string): void {
  if (kind === 'skill' || path === '' || !props.probePath) return;
  const key = probeKey(kind, path);
  const cached = probeCache.get(key);
  if (cached !== undefined && Date.now() - cached.at < PROBE_TTL_MS) return;
  let promise = inFlight.get(key);
  if (promise === undefined) {
    promise = Promise.resolve(props.probePath(kind === 'folder' ? 'folder' : 'file', path))
      .catch(() => true);
    inFlight.set(key, promise);
    void promise.then((found) => {
      inFlight.delete(key);
      probeCache.set(key, { found, at: Date.now() });
      applyProbe(kind, path, found);
    });
  }
}

// ---------------------------------------------------------------------------
// Hover tip state (anchored to the pill rect; teleported so no transformed
// ancestor can displace the fixed position).
// ---------------------------------------------------------------------------
interface TipState {
  kind: MentionKind;
  name: string;
  path: string;
  anchor: DOMRect;
}

const tip = ref<TipState | null>(null);
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const SHOW_DELAY_MS = 120;
const HIDE_DELAY_MS = 140;

function clearTimers(): void {
  if (showTimer !== null) clearTimeout(showTimer);
  if (hideTimer !== null) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function onPillEnter(pill: HTMLElement, seg: MentionSegment): void {
  clearTimers();
  if (seg.kind === 'text') return;
  showTimer = setTimeout(() => {
    showTimer = null;
    tip.value = { kind: seg.kind, name: seg.name, path: seg.path, anchor: pill.getBoundingClientRect() };
    probe(seg.kind, seg.path);
  }, SHOW_DELAY_MS);
}

function onPillLeave(): void {
  clearTimers();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    tip.value = null;
  }, HIDE_DELAY_MS);
}

function hideTip(): void {
  clearTimers();
  tip.value = null;
}

function onTipEnter(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

// Hide on scroll/resize — the anchor moves out from under the fixed tip.
function onViewportChange(): void {
  hideTip();
}

// ---------------------------------------------------------------------------
// Pill interaction
// ---------------------------------------------------------------------------
function skillInfo(name: string): { description?: string; path?: string } | null {
  return props.resolveSkill ? props.resolveSkill(name) ?? null : null;
}

function pillIsButton(seg: MentionSegment): boolean {
  if (seg.kind === 'text' || seg.kind === 'folder') return false;
  if (seg.kind === 'file') return props.openFile !== undefined && seg.path !== '';
  return (skillInfo(seg.name)?.path ?? '') !== '';
}

function onPillActivate(seg: MentionSegment): void {
  if (seg.kind !== 'file' && seg.kind !== 'skill') return;
  if (seg.kind === 'file') {
    if (props.openFile && seg.path !== '') {
      hideTip();
      props.openFile({ path: seg.path });
    }
    return;
  }
  const path = skillInfo(seg.name)?.path;
  if (props.openFile && path) {
    hideTip();
    props.openFile({ path });
  }
}

function onPillKeydown(e: KeyboardEvent, seg: MentionSegment): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!pillIsButton(seg)) return;
  e.preventDefault();
  e.stopPropagation();
  onPillActivate(seg);
}

function isMissing(seg: MentionSegment): boolean {
  return seg.kind !== 'text' && seg.path !== '' && missing.value.has(probeKey(seg.kind, seg.path));
}

function tipMissing(): boolean {
  const t = tip.value;
  return t !== null && t.path !== '' && missing.value.has(probeKey(t.kind, t.path));
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);
}
onUnmounted(() => {
  clearTimers();
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
  }
});
</script>

<template>
  <template v-for="(seg, i) in segments" :key="i">
    <template v-if="seg.kind === 'text'">{{ seg.value }}</template>
    <span
      v-else
      class="mention-pill"
      :class="[`mention-${seg.kind}`, { 'mention-missing': isMissing(seg) }]"
      :data-mention-kind="seg.kind"
      :data-mention-name="seg.name"
      :data-mention-path="seg.path || undefined"
      :role="pillIsButton(seg) ? 'button' : undefined"
      :tabindex="pillIsButton(seg) ? 0 : undefined"
      @mouseenter="onPillEnter($event.currentTarget as HTMLElement, seg)"
      @mouseleave="onPillLeave"
      @focus="onPillEnter($event.currentTarget as HTMLElement, seg)"
      @blur="onPillLeave"
      @click="onPillActivate(seg)"
      @keydown="onPillKeydown($event, seg)"
    >
      <!-- eslint-disable-next-line vue/no-v-html -->
      <span class="mention-pill-icon" v-html="iconFor(seg.kind)" aria-hidden="true" />
      <span class="mention-pill-name">{{ seg.name }}</span>
    </span>
  </template>

  <Teleport to="body">
    <MentionTip
      v-if="tip"
      :kind="tip.kind"
      :name="tip.name"
      :path="tip.path"
      :anchor="tip.anchor"
      :missing="tipMissing()"
      :description="tip.kind === 'skill' ? skillInfo(tip.name)?.description ?? '' : ''"
      :skill-path="tip.kind === 'skill' ? skillInfo(tip.name)?.path ?? '' : ''"
      :open-file="props.openFile ?? noopOpen"
      :on-hide="hideTip"
      :on-stay="onTipEnter"
    />
  </Teleport>
</template>

<style scoped>
.mention-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  padding: var(--space-1);
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--ui-font-size);
  line-height: 1.4;
  vertical-align: baseline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* No glassmorphism, no gradients — flat sunken pill per the design system. */

.mention-pill[role='button'] {
  cursor: pointer;
}
.mention-pill[role='button']:hover,
.mention-pill[role='button']:focus-visible {
  background: var(--color-surface-raised);
  border-color: var(--color-accent);
}
.mention-pill[role='button']:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

/* Deleted files render struck through. */
.mention-pill.mention-missing {
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
  opacity: 0.78;
}

.mention-pill-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--color-text-muted);
}
.mention-pill-icon :deep(svg) {
  width: 13px;
  height: 13px;
  display: block;
}

.mention-pill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>