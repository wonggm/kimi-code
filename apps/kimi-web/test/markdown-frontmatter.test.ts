// apps/kimi-web/test/markdown-frontmatter.test.ts
// Render-level checks for the two upstream markdown fixes:
// 1. verbatim plain text — the registered plugin disables the parser's
//    smart-typography rewrite, so (c)/(tm)/(r)/--/--- survive as written;
// 2. frontmatter meta block — the split-on-body extraction still leaves the
//    REST of the message rendering verbatim.
//
// getMarkdown is the same builder markstream-vue uses for the chat renderer,
// and registerMarkdownPlugin feeds the same module-global registry the
// component registers into at module scope — so these assertions cover the
// actual parse path Markdown.vue exercises.
import { afterEach, describe, expect, it } from 'vitest';
import { clearRegisteredMarkdownPlugins, getMarkdown, registerMarkdownPlugin } from 'markstream-vue';
import { extractFrontmatter } from '../src/lib/frontmatter';

describe('markdown web rendering', () => {
  afterEach(() => {
    clearRegisteredMarkdownPlugins();
  });

  it('renders (c)/(tm)/(r)/--/--- verbatim once typographer is disabled', () => {
    registerMarkdownPlugin((md) => md.set({ typographer: false }));
    const html = getMarkdown().render('(c) (tm) (r) -- ---');
    expect(html).toContain('(c)');
    expect(html).toContain('(tm)');
    expect(html).toContain('(r)');
    expect(html).toContain(' -- ---');
    expect(html).not.toContain('©');
    expect(html).not.toContain('™');
    expect(html).not.toContain('®');
    expect(html).not.toContain('–');
    expect(html).not.toContain('—');
  });

  it('leaves KaTeX math untouched when typographer is off', () => {
    registerMarkdownPlugin((md) => md.set({ typographer: false }));
    const html = getMarkdown().render('formula $x^2 + y^2$ display');
    // Math still fires its own gated rule (the parser emits the <math>
    // placeholder the Vue layer swaps for the KaTeX DOM) — turning
    // typographer off must not suppress it.
    expect(html).toContain('<math');
  });

  it('renders the frontmatter-stripped body verbatim end to end', () => {
    registerMarkdownPlugin((md) => md.set({ typographer: false }));
    const { frontmatter, body } = extractFrontmatter('---\npath: src/a.png\n---\n(c) -- body');
    expect(frontmatter).toBe('path: src/a.png\n');
    expect(getMarkdown().render(body)).toBe('<p>(c) -- body</p>\n');
  });
});