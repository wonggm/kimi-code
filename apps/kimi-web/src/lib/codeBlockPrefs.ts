// apps/kimi-web/src/lib/codeBlockPrefs.ts
// Shared reactive state for the chat code-block header toggles (word wrap /
// line numbers). One module-scoped ref pair: every code block reacts to the
// same value, and each toggle persists through the storage helpers so the
// choice survives reloads.
import { ref } from 'vue';
import { loadCodeLineNumbers, loadCodeWrap, saveCodeLineNumbers, saveCodeWrap } from './storage';

const codeWrap = ref(loadCodeWrap());
const codeLineNumbers = ref(loadCodeLineNumbers());

export function useCodeBlockPrefs() {
  function toggleWrap(): void {
    codeWrap.value = !codeWrap.value;
    saveCodeWrap(codeWrap.value);
  }
  function toggleLineNumbers(): void {
    codeLineNumbers.value = !codeLineNumbers.value;
    saveCodeLineNumbers(codeLineNumbers.value);
  }
  return { codeWrap, codeLineNumbers, toggleWrap, toggleLineNumbers };
}
