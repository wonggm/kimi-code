<!-- apps/kimi-web/src/components/chat/MarkdownCodeBlock.vue -->
<!-- Custom `code_block` renderer registered through markstream-vue's
     setCustomComponents. Keeps markstream's CodeBlock for the actual
     rendering and fills its built-in header slots, so the 0.39-style header
     row sits INSIDE `.code-block-container` (one panel with the code body):
     language mark + display-name label left; line-number and word-wrap
     toggles + copy right. Both toggles drive the shared persisted prefs
     (lib/codeBlockPrefs), so every block on the page flips together. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CodeBlockNode } from 'markstream-vue';
import { copyTextToClipboard } from '../../lib/clipboard';
import { useCodeBlockPrefs } from '../../lib/codeBlockPrefs';
import { useGlassRefraction } from '../../composables/useGlassRefraction';
import { useIsDark } from '../../composables/useIsDark';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  // Everything markstream forwards from `codeBlockProps` arrives as a prop and
  // is re-forwarded to CodeBlockNode by `innerProps`. Only the keys a caller
  // actually sets need declaring; an undeclared key becomes a DOM attribute on
  // the wrapper instead of reaching the renderer.
  monacoOptions?: Record<string, unknown>;
  /** `loading` and `stream` gate CodeBlockNode's skeleton: it marks the
   *  container `is-rendering` (and arms its shimmer placeholder) while
   *  `loading` is true, and `loading` defaults to TRUE. Undeclared, the
   *  `loading: false` the caller passes never reached the renderer — it landed
   *  on this wrapper as a DOM attribute — so every settled block stayed
   *  `is-rendering`, which upstream's blocks are not. */
  loading?: boolean;
  stream?: boolean;
  // The shiki theme reaches the settled renderer through these; undeclared,
  // they stop at the wrapper and the renderer silently falls back to its own
  // default (github-dark), whatever theme the app asked for.
  theme?: string;
  darkTheme?: string;
  lightTheme?: string;
  themes?: unknown;
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
const isDark = useIsDark();

const language = computed(() => props.node.language ?? '');
const rawCode = computed(() => props.node.code ?? props.node.content ?? '');

// Language badge + label shown before the header controls. The marks, the
// alias table, and the display-name table below are lifted from the upstream
// web bundle: the same colour SVGs upstream renders in markstream's
// `.code-header-main .icon-slot`, and the same fence-language normalisation
// (alias table first, then the display-name table, then the capitalised
// token). Languages with no icon fall back to the generic shell mark, as
// upstream does.
const LANGUAGE_ICON_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  golang: 'go',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shellscript: 'shell',
  bat: 'shell',
  batch: 'shell',
  ps1: 'powershell',
  plaintext: 'plain',
  text: 'plain',
  txt: 'plain',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  'objective-c': 'objectivec',
  'objective-c++': 'objectivecpp',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  kt: 'kotlin',
};

// Display names for the header label (upstream's table), keyed by the
// alias-resolved token. `bash`/`sh` resolve to `shell` first, so they miss
// this table and read "Shell" through the capitalised fallback; unmapped
// tokens are capitalised the same way, and an empty fence reads "Plain Text".
const LANGUAGE_NAMES: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  php: 'PHP',
  sh: 'Shell',
  bash: 'Bash',
  sql: 'SQL',
  yaml: 'YAML',
  md: 'Markdown',
  d2: 'D2',
  d2lang: 'D2',
  '': 'Plain Text',
  plain: 'Plain Text',
};

const LANGUAGE_ICONS: Record<string, string> = {
  plain: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/><path fill="#42a5f5" d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z"/></svg>',
  javascript: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#ffca28" d="M2 2v12h12V2zm6 6h1v4a1.003 1.003 0 0 1-1 1H7a1.003 1.003 0 0 1-1-1v-1h1v1h1zm3 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"/></svg>',
  typescript: '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 16 16"><path fill="#0288d1" d="M2 2v12h12V2zm4 6h3v1H8v4H7V9H6zm5 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"/></svg>',
  jsx: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#00bcd4" d="M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6"/><path fill="#00bcd4" d="M16 14a2 2 0 1 0 2 2 2 2 0 0 0-2-2"/><path fill="#00bcd4" d="M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z"/><path fill="#00bcd4" d="M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369"/></svg>',
  tsx: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#0288d1" d="M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6"/><path fill="#0288d1" d="M16 14a2 2 0 1 0 2 2 2 2 0 0 0-2-2"/><path fill="#0288d1" d="M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z"/><path fill="#0288d1" d="M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369"/></svg>',
  html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#e65100" d="m4 4 2 22 10 2 10-2 2-22Zm19.72 7H11.28l.29 3h11.86l-.802 9.335L15.99 25l-6.635-1.646L8.93 19h3.02l.19 2 3.86.77 3.84-.77.29-4H8.84L8 8h16Z"/></svg>',
  css: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#7e57c2" d="M20 18h-2v-2h-2v2c0 .193 0 .703 1.254 1.033A3.345 3.345 0 0 1 20 22h2v2h2v-2c0-.388-.562-.851-1.254-1.034C20.356 20.34 20 18.84 20 18m-3.254 2.966C14.356 20.34 14 18.84 14 18h-2v-2h-2v8h2v-2h4v2h2v-2c0-.388-.562-.851-1.254-1.034"/><path fill="#7e57c2" d="M24 4H4v20a4 4 0 0 0 4 4h16.16A3.84 3.84 0 0 0 28 24.16V8a4 4 0 0 0-4-4m2 14h-2v-2h-2v2c0 .193 0 .703 1.254 1.033A3.345 3.345 0 0 1 26 22v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z"/></svg>',
  scss: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#ec407a" d="M27.837 5.673a4.33 4.33 0 0 0-2.293-2.701c-2.362-1.261-6.11-1.298-9.548-.092a26.3 26.3 0 0 0-8.76 4.966c-2.752 2.542-3.438 4.925-3.189 6.194.523 2.668 3.274 4.539 5.485 6.042.418.284.822.559 1.175.816-1.429.76-4.261 2.444-5.088 4.248a3.88 3.88 0 0 0-.118 3.332A2.37 2.37 0 0 0 6.869 29.8a5.6 5.6 0 0 0 1.49.2 6.35 6.35 0 0 0 5.19-2.856 6.74 6.74 0 0 0 .864-5.382 7.3 7.3 0 0 1 2.044-.03 3.92 3.92 0 0 1 2.816 1.311 1.82 1.82 0 0 1 .423 1.262 1.55 1.55 0 0 1-.772 1.05c-.234.14-.586.355-.504.803.036.194.198.633.894.512a2.93 2.93 0 0 0 2.145-2.651 4 4 0 0 0-1.197-2.904 5.94 5.94 0 0 0-4.396-1.626 10.6 10.6 0 0 0-2.672.304 20 20 0 0 0-2.203-1.846c-1.712-1.3-3.33-2.529-3.235-4.26.125-2.263 2.468-4.532 6.964-6.744 4.016-1.976 7.254-2.037 8.944-1.438a2 2 0 0 1 1.204.883 2.77 2.77 0 0 1-.36 2.47 9.71 9.71 0 0 1-7.425 4.304 3.86 3.86 0 0 1-3.238-.757c-.278-.302-.593-.645-1.074-.383q-.565.31-.225 1.189a3.9 3.9 0 0 0 2.407 1.92 11.7 11.7 0 0 0 7.128-.671c3.527-1.35 6.681-5.202 5.756-8.787M11.895 24.475a4 4 0 0 1-.192.468 4.5 4.5 0 0 1-.753 1.081 2.83 2.83 0 0 1-2.533 1.107c-.056-.032-.078-.146-.085-.193a3.28 3.28 0 0 1 1.076-2.284 11.3 11.3 0 0 1 2.644-1.933 3.85 3.85 0 0 1-.157 1.754"/></svg>',
  json: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="#f9a825" d="M560-160v-80h120q17 0 28.5-11.5T720-280v-80q0-38 22-69t58-44v-14q-36-13-58-44t-22-69v-80q0-17-11.5-28.5T680-720H560v-80h120q50 0 85 35t35 85v80q0 17 11.5 28.5T840-560h40v160h-40q-17 0-28.5 11.5T800-360v80q0 50-35 85t-85 35zm-280 0q-50 0-85-35t-35-85v-80q0-17-11.5-28.5T120-400H80v-160h40q17 0 28.5-11.5T160-600v-80q0-50 35-85t85-35h120v80H280q-17 0-28.5 11.5T240-680v80q0 38-22 69t-58 44v14q36 13 58 44t22 69v80q0 17 11.5 28.5T280-240h120v80z"/></svg>',
  python: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0288d1" d="M9.86 2A2.86 2.86 0 0 0 7 4.86v1.68h4.29c.39 0 .71.57.71.96H4.86A2.86 2.86 0 0 0 2 10.36v3.781a2.86 2.86 0 0 0 2.86 2.86h1.18v-2.68a2.85 2.85 0 0 1 2.85-2.86h5.25c1.58 0 2.86-1.271 2.86-2.851V4.86A2.86 2.86 0 0 0 14.14 2zm-.72 1.61c.4 0 .72.12.72.71s-.32.891-.72.891c-.39 0-.71-.3-.71-.89s.32-.711.71-.711"/><path fill="#fdd835" d="M17.959 7v2.68a2.85 2.85 0 0 1-2.85 2.859H9.86A2.85 2.85 0 0 0 7 15.389v3.75a2.86 2.86 0 0 0 2.86 2.86h4.28A2.86 2.86 0 0 0 17 19.14v-1.68h-4.291c-.39 0-.709-.57-.709-.96h7.14A2.86 2.86 0 0 0 22 13.64V9.86A2.86 2.86 0 0 0 19.14 7zM8.32 11.513l-.004.004.038-.004zm6.54 7.276c.39 0 .71.3.71.89a.71.71 0 0 1-.71.71c-.4 0-.72-.12-.72-.71s.32-.89.72-.89"/></svg>',
  ruby: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f44336" d="M18.041 3.177c2.24.382 2.879 1.919 2.843 3.527V6.67l-1.013 13.266-13.132.897h.008c-1.093-.044-3.518-.151-3.634-3.545l1.217-2.222 2.462 5.74 2.097-6.77-.045.009.018-.018 6.85 2.186L13.945 9.3l6.53-.409-5.144-4.212 2.71-1.51v.009M3.113 17.252v.017zM6.916 6.874c2.63-2.622 6.033-4.168 7.34-2.844 1.297 1.306-.072 4.523-2.702 7.135-2.666 2.613-6.015 4.248-7.322 2.933-1.306-1.324.036-4.612 2.675-7.224z"/></svg>',
  go: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#00acc1" d="M2 12h4v2H2zm-2 4h6v2H0zm4 4h2v2H4zm16.954-5H14v3h3.239a4.42 4.42 0 0 1-3.531 2 2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 15.292 13a2.73 2.73 0 0 1 1.749.584l2.962-1.185A5.6 5.6 0 0 0 15.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 6.4 6.4 0 0 0 .003-1.5"/><path fill="#00acc1" d="M26.292 10a7.526 7.526 0 0 0-7.243 6.5 5.614 5.614 0 0 0 5.659 6.5 7.526 7.526 0 0 0 7.243-6.5 5.614 5.614 0 0 0-5.659-6.5m2.681 6.137A4.515 4.515 0 0 1 24.708 20a2.65 2.65 0 0 1-2.053-.858 2.86 2.86 0 0 1-.628-2.28A4.515 4.515 0 0 1 26.292 13a2.65 2.65 0 0 1 2.053.858 2.86 2.86 0 0 1 .628 2.28Z"/></svg>',
  java: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#f44336" d="M4 26h24v2H4zM28 4H7a1 1 0 0 0-1 1v13a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-4h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 8h-4V6h4Z"/></svg>',
  kotlin: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><defs><linearGradient id="a" x1="1.725" x2="22.185" y1="22.67" y2="1.982" gradientTransform="translate(1.306 1.129)scale(.89324)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7c4dff"/><stop offset=".5" stop-color="#d500f9"/><stop offset="1" stop-color="#ef5350"/></linearGradient></defs><path fill="url(#a)" d="M2.975 2.976v18.048h18.05v-.03l-4.478-4.511-4.48-4.515 4.48-4.515 4.443-4.477z"/></svg>',
  c: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#0288d1" d="M19.563 22A5.57 5.57 0 0 1 14 16.437v-2.873A5.57 5.57 0 0 1 19.563 8H24V2h-4.437A11.563 11.563 0 0 0 8 13.563v2.873A11.564 11.564 0 0 0 19.563 28H24v-6Z"/></svg>',
  cpp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#0288d1" d="M28 14v-4h-2v4h-6v-4h-2v4h-4v2h4v4h2v-4h6v4h2v-4h4v-2z"/><path fill="#0288d1" d="M13.563 22A5.57 5.57 0 0 1 8 16.437v-2.873A5.57 5.57 0 0 1 13.563 8H18V2h-4.437A11.563 11.563 0 0 0 2 13.563v2.873A11.564 11.564 0 0 0 13.563 28H18v-6Z"/></svg>',
  php: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1e88e5" d="M12 18.08c-6.63 0-12-2.72-12-6.08s5.37-6.08 12-6.08S24 8.64 24 12s-5.37 6.08-12 6.08m-5.19-7.95c.54 0 .91.1 1.09.31.18.2.22.56.13 1.03-.1.53-.29.87-.58 1.09q-.42.33-1.29.33h-.87l.53-2.76zm-3.5 5.55h1.44l.34-1.75h1.23c.54 0 .98-.06 1.33-.17.35-.12.67-.31.96-.58.24-.22.43-.46.58-.73.15-.26.26-.56.31-.88.16-.78.05-1.39-.33-1.82-.39-.44-.99-.65-1.82-.65H4.59zm7.25-8.33-1.28 6.58h1.42l.74-3.77h1.14c.36 0 .6.06.71.18s.13.34.07.66l-.57 2.93h1.45l.59-3.07c.13-.62.03-1.07-.27-1.36-.3-.27-.85-.4-1.65-.4h-1.27L12 7.35zM18 10.13c.55 0 .91.1 1.09.31.18.2.22.56.13 1.03-.1.53-.29.87-.57 1.09-.29.22-.72.33-1.3.33h-.85l.5-2.76zm-3.5 5.55h1.44l.34-1.75h1.22c.55 0 1-.06 1.35-.17.35-.12.65-.31.95-.58.24-.22.44-.46.58-.73.15-.26.26-.56.32-.88.15-.78.04-1.39-.34-1.82-.36-.44-.99-.65-1.82-.65h-2.75z"/></svg>',
  shell: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#ff7043" d="M2 2a1 1 0 0 0-1 1v10c0 .554.446 1 1 1h12c.554 0 1-.446 1-1V3a1 1 0 0 0-1-1zm0 3h12v8H2zm1 2 2 2-2 2 1 1 3-3-3-3zm5 3.5V12h5v-1.5z"/></svg>',
  powershell: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#03a9f4" d="M29.07 6H7.677A1.535 1.535 0 0 0 6.24 7.113l-4.2 17.774A.852.852 0 0 0 2.93 26h21.393a1.535 1.535 0 0 0 1.436-1.113L29.96 7.112A.852.852 0 0 0 29.07 6M8.626 23.797a1.4 1.4 0 0 1-1.814-.31l-.007-.009a1.075 1.075 0 0 1 .315-1.599l9.6-6.061-6.102-5.852-.01-.01a1.068 1.068 0 0 1 .084-1.625l.037-.03a1.38 1.38 0 0 1 1.8.07l7.233 6.957a1.1 1.1 0 0 1 .236.739 1.08 1.08 0 0 1-.412.79c-.074.04-.146.119-10.951 6.935ZM24 22.94A1.135 1.135 0 0 1 22.803 24h-5.634a1.061 1.061 0 1 1 .001-2.112h5.633A1.134 1.134 0 0 1 24 22.938Z"/></svg>',
  sql: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#ffca28" d="M16 24c-5.525 0-10-.9-10-2v4c0 1.1 4.475 2 10 2s10-.9 10-2v-4c0 1.1-4.475 2-10 2m0-8c-5.525 0-10-.9-10-2v4c0 1.1 4.475 2 10 2s10-.9 10-2v-4c0 1.1-4.475 2-10 2m0-12C10.477 4 6 4.895 6 6v4c0 1.1 4.475 2 10 2s10-.9 10-2V6c0-1.105-4.477-2-10-2"/></svg>',
  yaml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ff5252" d="M13 9h5.5L13 3.5zM6 2h8l6 6v12c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2m12 16v-2H9v2zm-4-4v-2H6v2z"/></svg>',
  markdown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#42a5f5" d="m14 10-4 3.5L6 10H4v12h4v-6l2 2 2-2v6h4V10zm12 6v-6h-4v6h-4l6 8 6-8z"/></svg>',
  xml: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8bc34a" d="M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.11.89-2 2-2m.12 13.5 3.74 3.74 1.42-1.41-2.33-2.33 2.33-2.33-1.42-1.41zm11.16 0-3.74-3.74-1.42 1.41 2.33 2.33-2.33 2.33 1.42 1.41z"/></svg>',
  rust: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#ff7043" d="m30 12-4-2V6h-4l-2-4-4 2-4-2-2 4H6v4l-4 2 2 4-2 4 4 2v4h4l2 4 4-2 4 2 2-4h4v-4l4-2-2-4ZM6 16a9.9 9.9 0 0 1 .842-4H10v8H6.842A9.9 9.9 0 0 1 6 16m10 10a9.98 9.98 0 0 1-7.978-4H16v-2h-2v-2h4c.819.819.297 2.308 1.179 3.37a1.89 1.89 0 0 0 1.46.63h3.34A9.98 9.98 0 0 1 16 26m-2-12v-2h4a1 1 0 0 1 0 2Zm11.158 6H24a2.006 2.006 0 0 1-2-2 2 2 0 0 0-2-2 3 3 0 0 0 3-3q0-.08-.004-.161A3.115 3.115 0 0 0 19.83 10H8.022a9.986 9.986 0 0 1 17.136 10"/></svg>',
  vue: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#41b883" d="M1.791 3.851 12 21.471 22.209 3.936V3.85H18.24l-6.18 10.616L5.906 3.851z"/><path fill="#35495e" d="m5.907 3.851 6.152 10.617L18.24 3.851h-3.723L12.084 8.03 9.66 3.85z"/></svg>',
  mermaid: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#42a5f5" d="m14 10-4 3.5L6 10H4v12h4v-6l2 2 2-2v6h4V10zm12 6v-6h-4v6h-4l6 8 6-8z"/></svg>',
  fallback: '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#ff7043" d="M2 2a1 1 0 0 0-1 1v10c0 .554.446 1 1 1h12c.554 0 1-.446 1-1V3a1 1 0 0 0-1-1zm0 3h12v8H2zm1 2 2 2-2 2 1 1 3-3-3-3zm5 3.5V12h5v-1.5z"/></svg>',
};

function normalizeLanguage(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const token = trimmed.split(/\s+/)[0] ?? '';
  const head = token.split(':')[0] ?? '';
  return head.toLowerCase();
}

const languageKey = computed(() => {
  const key = normalizeLanguage(language.value);
  return key ? (LANGUAGE_ICON_ALIASES[key] ?? key) : '';
});

const languageIcon = computed(() => {
  if (!languageKey.value) return '';
  return LANGUAGE_ICONS[languageKey.value] ?? LANGUAGE_ICONS.fallback;
});

const languageLabel = computed(() => {
  const key = languageKey.value;
  const name = LANGUAGE_NAMES[key];
  if (name) return name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
});

// Everything except the node goes through to markstream's CodeBlock. Its shell
// renders the header inside the container; the header-left/header-right slot
// contents are ours, so only the built-in we do not re-render (copy) stays off.
const innerProps = computed<Record<string, unknown>>(() => {
  const { node: _node, showHeader: _h, showCopyButton: _c, ...rest } = props as Record<string, unknown>;
  return {
    ...rest,
    showHeader: true,
    showCopyButton: false,
    showLineNumbers: codeLineNumbers.value,
    isDark: isDark.value,
  };
});

// HTML preview runner (0.39 code-block-interaction): html/html-vue blocks get
// a Preview button in our header. markstream's own overlay is unreachable here
// (its trigger lives in the built-in header controls we replace), so the runner
// is ours: a sandboxed srcdoc iframe that only exists while open (close = stop).
// `allow-scripts` without `allow-same-origin` keeps the document on an opaque
// origin — scripts run, but they cannot reach our origin's storage or DOM.
const isPreviewable = computed(() => language.value === 'html' || language.value === 'html-vue');
const previewOpen = ref(false);
const previewFrameRef = ref<HTMLElement | null>(null);
// WebGL rim-refraction fallback (Firefox/Safari) on the glass frame (the
// backdrop stays a plain translucent layer). Non-transient like ui/Dialog: the
// runner can stay open indefinitely, so its backdrop keeps refreshing instead
// of freezing the snapshot for the whole app.
useGlassRefraction(previewFrameRef, { transient: false });

function openPreview(): void {
  previewOpen.value = true;
}
function closePreview(): void {
  previewOpen.value = false;
}
function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePreview();
}
watch(previewOpen, (open) => {
  if (open) window.addEventListener('keydown', onPreviewKeydown);
  else window.removeEventListener('keydown', onPreviewKeydown);
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
  :host(.mdcb-lines-off) [data-content] { grid-column: 1 / -1 !important; }
  :host(.mdcb-lines-off) [data-code] { grid-template-columns: 1fr !important; --markstream-code-padding-left: 14px; }
  :host(.mdcb-wrap) [data-code] { --diffs-overflow-override: visible; }
  :host(.mdcb-wrap) [data-code], :host(.mdcb-wrap) [data-content], :host(.mdcb-wrap) [data-content] span { white-space: pre-wrap !important; overflow-wrap: anywhere; }
  :host(.mdcb-nowrap) [data-code], :host(.mdcb-nowrap) [data-content] { white-space: pre !important; }
  :host(.mdcb-nowrap) [data-content] span, :host(.mdcb-nowrap) [data-content] div { white-space: pre !important; }
  :where(.md-code-scroll-viewport) { scrollbar-width: none; }
  :where(.md-code-scroll-viewport)::-webkit-scrollbar { display: none; }
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
  window.removeEventListener('keydown', onPreviewKeydown);
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

// The two marks upstream's copy button paints, taken verbatim from its
// CodeBlockNode chunk (14px, 2px round strokes). They are inlined rather than
// registered in lib/icons.ts because the app's shared `copy` / `check` marks
// are different glyphs used in a dozen other places.
const COPY_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const COPIED_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
// The header controls' class string, copied verbatim from the upstream bundle
// so the two header rows compare element for element. markstream ships the
// utilities it names (`p-[…]`, `rounded`, `active:scale-[0.96]`, …); the box
// itself is pinned by the scoped `.code-action-btn` rule below.
const ACTION_BTN_CLASS =
  'code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0 cursor-pointer text-[var(--code-action-fg)] hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
</script>

<template>
  <div ref="rootRef" class="mdcb" :class="codeWrap ? 'mdcb--wrap' : 'mdcb--nowrap'">
    <CodeBlockNode ref="codeRef" v-bind="innerProps" :node="node">
      <template #header-left>
        <div class="code-header-main">
          <!-- eslint-disable-next-line vue/no-v-html -- static mark from the language map below -->
          <span v-if="languageIcon" class="icon-slot h-4 w-4 flex-shrink-0" aria-hidden="true" v-html="languageIcon" />
          <div class="code-header-copy">
            <div class="code-header-title">{{ languageLabel }}</div>
          </div>
        </div>
      </template>
      <template #header-right>
        <div class="flex items-center gap-0.5">
          <button
            v-if="isPreviewable"
            type="button"
            :class="ACTION_BTN_CLASS"
            :aria-label="t('common.preview')"
            :title="t('common.preview')"
            @click="openPreview"
          >
            <Icon name="play" size="sm" />
          </button>
          <button
            type="button"
            :class="[ACTION_BTN_CLASS, 'md-code-nums-toggle', { active: codeLineNumbers }]"
            :aria-pressed="codeLineNumbers"
            :aria-label="t('conversation.codeBlock.showLineNumbers')"
            :title="t('conversation.codeBlock.showLineNumbers')"
            @click="toggleLineNumbers"
          >
            <Icon name="list-numbers" size="sm" />
          </button>
          <button
            type="button"
            :class="[ACTION_BTN_CLASS, 'md-code-wrap-toggle', { active: codeWrap }]"
            :aria-pressed="codeWrap"
            :aria-label="t('conversation.codeBlock.wrapCode')"
            :title="t('conversation.codeBlock.wrapCode')"
            @click="toggleWrap"
          >
            <Icon :name="codeWrap ? 'text-wrap-disabled' : 'text-wrap'" size="sm" />
          </button>
          <button
            type="button"
            :class="ACTION_BTN_CLASS"
            :aria-label="t('common.copy')"
            :title="t('common.copy')"
            @click="onCopy"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- static mark from the upstream bundle -->
            <span class="mdcb-glyph" v-html="copied ? COPIED_GLYPH : COPY_GLYPH" />
          </button>
        </div>
      </template>
    </CodeBlockNode>
    <Teleport to="body">
      <div v-if="previewOpen" class="mdcb-preview-backdrop" @click="closePreview">
        <div ref="previewFrameRef" class="mdcb-preview lg-glass lg-lens" role="dialog" :aria-label="t('common.preview')" @click.stop>
          <div class="mdcb-preview-head">
            <span class="mdcb-preview-dot" aria-hidden="true" />
            <span class="mdcb-preview-title">{{ t('common.preview') }}</span>
            <button
              type="button"
              class="mdcb-btn"
              :aria-label="t('common.cancel')"
              :title="t('common.cancel')"
              @click="closePreview"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
          <iframe
            class="mdcb-preview-frame"
            sandbox="allow-scripts"
            referrerpolicy="no-referrer"
            :srcdoc="rawCode"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Language mark + label, and the header controls, rendered into markstream's
   built-in header slot. The header chrome (surface background, hairline,
   4px/6px/4px/12px padding, font-ui at --text-xs) lives on
   `.code-block-header` in Markdown.vue, inside `.code-block-container`, so the
   header and the code body read as one panel. The 26px controls match the §03
   IconButton sm size; with the 4px vertical padding the bar lands on the
   measured 35px height. */
.code-header-main {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: 6px;
  overflow: hidden;
}
/* Upstream's header vocabulary: `.icon-slot` hosts the language mark,
   `.code-header-copy > .code-header-title` holds the label, and the actions row
   is a plain `flex items-center gap-0.5` div. The names are upstream's so the
   two trees compare element for element; the declarations stay the fork's. */
.icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  height: 16px;
}
.icon-slot :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.code-header-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
/* markstream styles `.code-block-header .code-header-title` itself (12px label
   ink), so the title needs the same ancestor to outrank it — with only the bare
   class the upstream rule wins on source order and the label renders at 12px. */
.code-block-header .code-header-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-ui);
  /* Upstream's title measures 13px — the same size as its code text, one step
     under its 14px body scale. Ours is --text-sm (13px), so the label takes it
     directly rather than the +1px step off the base that predates this
     measurement. */
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.mdcb-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mdcb-glyph :deep(svg) {
  display: block;
}
/* `.mdcb-btn` is the HTML-preview sheet's close button; it shares the header
   controls' box, so both selectors carry the same declarations. */
.code-action-btn,
.mdcb-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  /* upstream's .code-action-btn: 26x26 with 6px padding around a 14px glyph */
  padding: 6px;
}
.code-action-btn:hover,
.mdcb-btn:hover {
  color: var(--color-text);
  background: var(--color-hover);
}
.code-action-btn.active,
.mdcb-btn.active {
  /* upstream's pressed toggle: filled with --color-selected, ink at full
     strength, and no accent colour. */
  background: var(--color-selected);
  color: var(--color-text);
}
.code-action-btn.active:hover,
.mdcb-btn.active:hover {
  /* upstream's pressed toggle hover: one step deeper than the pressed fill. */
  background: var(--color-selected-hover);
}
.code-action-btn:focus-visible,
.mdcb-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* HTML preview runner overlay. Teleported to body; the backdrop is a plain
   translucent layer and the frame is a separate .lg-glass element, so Firefox
   never sees a backdrop-filter nested inside another filtered element. */
.mdcb-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(10, 14, 20, 0.45);
}
.mdcb-preview {
  display: flex;
  flex-direction: column;
  width: min(920px, 92vw);
  height: min(680px, 86vh);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.mdcb-preview-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px 6px 14px;
  border-bottom: 1px solid var(--color-line);
  font: var(--text-xs) var(--font-ui);
  color: var(--color-text-muted);
}
.mdcb-preview-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  flex: none;
}
.mdcb-preview-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mdcb-preview-frame {
  flex: 1;
  min-height: 0;
  border: none;
  background: #fff;
}
</style>
