<!-- apps/kimi-web/src/components/chat/MarkdownCodeBlock.vue -->
<!-- Custom `code_block` renderer registered through markstream-vue's
     setCustomComponents. Keeps markstream's CodeBlock for the actual
     rendering (showHeader/showCopyButton off) and adds the 0.39-style header
     row re-expressed in our design system: language label left; line-number
     and word-wrap toggles + copy right. Both toggles drive the shared
     persisted prefs (lib/codeBlockPrefs), so every block on the page flips
     together. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CodeBlockNode } from 'markstream-vue';
import { copyTextToClipboard } from '../../lib/clipboard';
import { useCodeBlockPrefs } from '../../lib/codeBlockPrefs';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  node: {
    type: 'code_block';
    raw: string;
    language: string;
    code: string;
    content?: string;
  } & Record<string, unknown>;
}>();

const { t } = useI18n();
const { codeWrap, codeLineNumbers, toggleWrap, toggleLineNumbers } = useCodeBlockPrefs();

const language = computed(() => props.node.language ?? '');
const rawCode = computed(() => props.node.code ?? props.node.content ?? '');

// Everything except the node goes through to markstream's CodeBlock; the
// header/copy are ours, so the built-ins stay off even if codeBlockProps
// asked for them.
const innerProps = computed<Record<string, unknown>>(() => {
  const { node: _node, showHeader: _h, showCopyButton: _c, ...rest } = props as Record<string, unknown>;
  return {
    ...rest,
    showHeader: false,
    showCopyButton: false,
    showLineNumbers: codeLineNumbers.value,
  };
});

// ---------------------------------------------------------------------------
// Shadow-root overrides. The settled code renderer draws inside a shadow root
// (markstream's @pierre/diffs grid), which light-DOM CSS cannot reach, and our
// markstream build has no prop to gate the number column (upstream's newer
// custom CodeBlockNode does). So the wrapper toggles classes on the shadow
// host and injects a small stylesheet into that root once: hide the number
// column / flip the grid to a single track when line numbers are off, and
// switch the grid onto wrapped geometry when word wrap is on.
// ---------------------------------------------------------------------------
const rootRef = ref<HTMLElement | null>(null);
const STYLE_ID = 'mdcb-shadow-overrides';
const SHADOW_CSS = `
  :host(.mdcb-lines-off) [data-gutter] { display: none !important; }
  :host(.mdcb-lines-off) [data-code] { grid-template-columns: 1fr !important; --markstream-code-padding-left: 14px; }
  :host(.mdcb-wrap) [data-code] { --diffs-overflow-override: visible; }
  :host(.mdcb-wrap) [data-code], :host(.mdcb-wrap) [data-content], :host(.mdcb-wrap) [data-content] span { white-space: pre-wrap !important; overflow-wrap: anywhere; }
  :host(.mdcb-nowrap) [data-code], :host(.mdcb-nowrap) [data-content] { white-space: pre !important; }
  :host(.mdcb-nowrap) [data-content] span, :host(.mdcb-nowrap) [data-content] div { white-space: pre !important; }
`;

function applyShadowOverrides(): void {
  const root = rootRef.value;
  if (!root) return;
  const hosts: Element[] = [];
  if ((root as HTMLElement).shadowRoot) hosts.push(root);
  root.querySelectorAll('*').forEach((el) => {
    if ((el as HTMLElement).shadowRoot) hosts.push(el);
  });
  for (const host of hosts) {
    const sr = (host as HTMLElement).shadowRoot;
    if (!sr) continue;
    if (!sr.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = SHADOW_CSS;
      sr.appendChild(st);
    }
    host.classList.toggle('mdcb-lines-off', !codeLineNumbers.value);
    host.classList.toggle('mdcb-wrap', codeWrap.value);
    host.classList.toggle('mdcb-nowrap', !codeWrap.value);
  }
}

let shadowObserver: MutationObserver | null = null;
onMounted(() => {
  // The shadowed renderer mounts lazily (after shiki highlights), so re-apply
  // whenever the subtree changes; classes land on the stable host element.
  watch([codeLineNumbers, codeWrap], applyShadowOverrides);
  shadowObserver = new MutationObserver(() => applyShadowOverrides());
  if (rootRef.value) {
    shadowObserver.observe(rootRef.value, { childList: true, subtree: true });
  }
  applyShadowOverrides();
});
onUnmounted(() => {
  shadowObserver?.disconnect();
  shadowObserver = null;
});

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
async function onCopy(): Promise<void> {
  const ok = await copyTextToClipboard(rawCode.value).catch(() => false);
  if (!ok) return;
  copied.value = true;
  if (copyTimer !== null) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyTimer = null;
    copied.value = false;
  }, 1000);
}
</script>

<template>
  <div ref="rootRef" class="mdcb" :class="codeWrap ? 'mdcb--wrap' : 'mdcb--nowrap'">
    <div class="mdcb-head">
      <span class="mdcb-lang">{{ language }}</span>
      <span class="mdcb-actions">
        <button
          type="button"
          class="mdcb-btn"
          :class="{ active: codeLineNumbers }"
          :aria-pressed="codeLineNumbers"
          :aria-label="t('markdown.toggleLineNumbers')"
          :title="t('markdown.toggleLineNumbers')"
          @click="toggleLineNumbers"
        >
          <Icon name="list" size="sm" />
        </button>
        <button
          type="button"
          class="mdcb-btn"
          :class="{ active: codeWrap }"
          :aria-pressed="codeWrap"
          :aria-label="t('markdown.toggleWordWrap')"
          :title="t('markdown.toggleWordWrap')"
          @click="toggleWrap"
        >
          <Icon name="text-wrap" size="sm" />
        </button>
        <button
          type="button"
          class="mdcb-btn"
          :aria-label="t('common.copy')"
          :title="t('common.copy')"
          @click="onCopy"
        >
          <Icon :name="copied ? 'check' : 'copy'" size="sm" />
        </button>
      </span>
    </div>
    <CodeBlockNode ref="codeRef" v-bind="innerProps" :node="node" />
  </div>
</template>

<style scoped>
.mdcb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 5px 8px 5px 14px;
  border-bottom: 1px solid var(--color-line);
  font: var(--text-xs) var(--font-ui);
  color: var(--color-text-muted);
}
.mdcb-lang {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  text-transform: lowercase;
}
.mdcb-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.mdcb-btn {
  width: 24px;
  height: 24px;
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
.mdcb-btn:hover {
  color: var(--color-text);
  background: var(--color-hover);
}
.mdcb-btn.active {
  color: var(--color-accent);
}
.mdcb-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
