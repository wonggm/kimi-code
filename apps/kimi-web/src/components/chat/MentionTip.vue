<!-- apps/kimi-web/src/components/chat/MentionTip.vue -->
<!-- Hover detail bubble for a chat mention pill: the full path for files and
     folders (middle ellipsized, last segment kept whole), or the skill name +
     description with an "Open skill file" button. Deleted files get a
     "deleted" label. Positioned fixed from the pill's bounding rect (same
     pattern as MenuSelect), so a backdrop-filtered ancestor can't displace it. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { copyTextToClipboard } from '../../lib/clipboard';
import { formatCapturedAt, browserCaptureTargetLine, type BrowserCapture, type BrowserReference } from '../../lib/browserReference';
import Icon from '../ui/Icon.vue';
import type { MentionKind } from '../../lib/mentionTokens';

const props = withDefaults(
  defineProps<{
    kind: MentionKind;
    name: string;
    /** File/folder full path; empty for skills. */
    path: string;
    /** Pill bounding rect — the tip anchors to it. */
    anchor: DOMRect;
    /** True when the probed file/folder no longer exists. */
    missing?: boolean;
    /** Skill description, when a resolver supplied one. */
    description?: string;
    /** Resolved skill file path — enables the "open skill file" button. */
    skillPath?: string;
    /** A browser reference's capture, when the pill resolved one. */
    browser?: BrowserTipData | null;
    /** Open a file/skill path through the app's file-preview flow. */
    openFile: (target: { path: string }) => void;
    /** Hide the tip (the mouse left the pill/tip). */
    onHide: () => void;
    /** Cancel a pending hide (the mouse entered the tip). */
    onStay: () => void;
  }>(),
  {
    missing: false,
    description: '',
    skillPath: '',
    browser: null,
  },
);

/** What the browser-reference tip shows: the page the capture came from, when
 *  it was taken, the element it points at and the user's comment. */
export interface BrowserTipData {
  reference?: BrowserReference;
  capture?: BrowserCapture;
  thumbnail?: string;
}

const { t } = useI18n();

const SIDE_GAP = 8;

/** Split a path into the ellipsizable head and the whole last segment. */
const pathParts = computed(() => {
  const trimmed = props.path.replace(/[/\\]+$/, '');
  const sepIdx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (sepIdx === -1) return { head: '', sep: '', base: trimmed };
  return {
    head: trimmed.slice(0, sepIdx),
    sep: trimmed[sepIdx]!,
    base: trimmed.slice(sepIdx + 1),
  };
});

const rootRef = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0 });
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function position(): void {
  const el = rootRef.value;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let top = props.anchor.bottom + SIDE_GAP;
  if (top + h > window.innerHeight - SIDE_GAP) {
    top = Math.max(SIDE_GAP, props.anchor.top - h - SIDE_GAP);
  }
  const left = Math.min(
    Math.max(props.anchor.left, SIDE_GAP),
    Math.max(SIDE_GAP, window.innerWidth - SIDE_GAP - w),
  );
  pos.value = { top: Math.round(top), left: Math.round(left) };
}

onMounted(() => {
  void nextTick(position);
});
watch(() => [props.anchor, props.kind, props.path, props.missing, props.description], () => {
  copied.value = false;
  if (copyTimer !== null) {
    clearTimeout(copyTimer);
    copyTimer = null;
  }
  void nextTick(position);
});

onUnmounted(() => {
  if (copyTimer !== null) clearTimeout(copyTimer);
});

function onCopy(): void {
  const text = props.path !== '' ? props.path : props.name;
  void copyTextToClipboard(text).then((ok) => {
    if (!ok) return;
    copied.value = true;
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyTimer = null;
      copied.value = false;
    }, 1000);
  }).catch(() => {/* ignore */});
}

function onOpen(): void {
  const target = props.kind === 'skill' ? props.skillPath : props.path;
  if (!target) return;
  props.onHide();
  props.openFile({ path: target });
}

const tipStyle = computed(() => ({ top: `${pos.value.top}px`, left: `${pos.value.left}px` }));

/** The page a browser reference was captured from, when the lookup resolved
 *  one — the tip's source lines. */
const browserSource = computed(() => {
  const capture = props.browser?.capture;
  if (!capture) return null;
  return {
    title: capture.page.title,
    url: capture.page.url,
    capturedAt: formatCapturedAt(capture.capturedAt),
    target: browserCaptureTargetLine(capture),
  };
});
</script>

<template>
  <div
    ref="rootRef"
    class="mention-tip"
    role="tooltip"
    :style="tipStyle"
    @mouseenter="onStay"
    @mouseleave="onHide"
  >
    <!-- File / folder: ellipsized path + copy-path + deleted label -->
    <template v-if="kind !== 'skill' && kind !== 'browser'">
      <div class="mention-tip-path">
        <div class="mention-tip-path-text">
          <span v-if="pathParts.head" class="mention-tip-path-head">{{ pathParts.head }}</span>
          <span v-if="pathParts.sep" class="mention-tip-sep">{{ pathParts.sep }}</span>
          <span class="mention-tip-base">{{ pathParts.base || name }}</span>
        </div>
        <button
          type="button"
          class="mention-tip-copy"
          :aria-label="t('mention.copyPath')"
          @click="onCopy"
        >
          <Icon :name="copied ? 'check' : 'copy'" size="sm" />
        </button>
      </div>
      <div v-if="missing" class="mention-tip-missing">{{ t('mention.deleted') }}</div>
    </template>

    <!-- Browser reference: the page, when it was captured, the element -->
    <div v-else-if="kind === 'browser'" class="mention-tip-browser">
      <div class="mention-tip-name">{{ name }}</div>
      <template v-if="browserSource">
        <div class="mention-tip-browser-source">{{ browserSource.title }}</div>
        <div class="mention-tip-browser-source">{{ browserSource.url }}</div>
        <div class="mention-tip-browser-source">{{ browserSource.capturedAt }}</div>
        <div v-if="browserSource.target" class="mention-tip-browser-target">{{ browserSource.target }}</div>
      </template>
      <img v-if="browser?.thumbnail" class="mention-tip-browser-preview" :src="browser.thumbnail" :alt="name" />
      <div v-if="browser?.reference?.comment" class="mention-tip-browser-comment">{{ browser.reference.comment }}</div>
    </div>

    <!-- Skill: name + description + open-skill-file -->
    <div v-else class="mention-tip-skill">
      <div class="mention-tip-head">
        <span class="mention-tip-name">{{ name }}</span>
        <button
          v-if="skillPath"
          type="button"
          class="mention-tip-open"
          :aria-label="t('mention.openSkill')"
          @click="onOpen"
        >
          <Icon name="external-link" size="sm" />
        </button>
      </div>
      <div v-if="description" class="mention-tip-desc">{{ description }}</div>
    </div>
  </div>
</template>

<style scoped>
.mention-tip {
  position: fixed;
  z-index: var(--z-tooltip);
  max-width: min(420px, calc(100vw - 16px));
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-ui);
  pointer-events: auto;
}

/* Path line: the head ellipsizes, the last segment stays whole. */
.mention-tip-path {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
}
.mention-tip-path-text {
  display: flex;
  align-items: baseline;
  min-width: 0;
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
}
.mention-tip-path-head {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.mention-tip-sep {
  flex: none;
  opacity: 0.7;
}
.mention-tip-base {
  flex: none;
  color: var(--color-text);
  font-weight: var(--weight-medium);
}

.mention-tip-copy,
.mention-tip-open {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
}
.mention-tip-copy:hover,
.mention-tip-open:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.mention-tip-copy:focus-visible,
.mention-tip-open:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.mention-tip-missing {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-danger);
  line-height: var(--leading-normal);
}

/* Browser reference: the page, when it was captured, and the thumbnail. */
.mention-tip-browser {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: min(320px, calc(100vw - var(--space-8)));
}
.mention-tip-browser .mention-tip-name {
  font-size: var(--ui-font-size);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mention-tip-browser-source,
.mention-tip-browser-target {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}
.mention-tip-browser-target {
  font-family: var(--font-mono);
}
.mention-tip-browser-preview {
  width: 100%;
  max-height: 160px;
  object-fit: contain;
  border-radius: var(--radius-xs);
}
.mention-tip-browser-comment {
  color: var(--color-text);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Skill card */
.mention-tip-skill {
  min-width: 180px;
  max-width: 380px;
}
.mention-tip-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.mention-tip-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  line-height: var(--leading-normal);
}
.mention-tip-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}
</style>