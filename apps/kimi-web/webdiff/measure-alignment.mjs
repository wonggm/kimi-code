import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = '/home/m/Applications/kimi-code';
const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
process.env.CHROME_BIN = fs
  .readdirSync(cache)
  .filter((n) => n.startsWith('chromium-'))
  .map((n) => path.join(cache, n, 'chrome-linux64', 'chrome'))
  .filter((p) => fs.existsSync(p))
  .sort()
  .at(-1);

const { launchChrome, connectPage, killChrome } = await import(`${REPO}/apps/kimi-web/bench/cdp.mjs`);

const seed = {
  'kimi-locale': 'en',
  'kimi-web.color-scheme': 'dark',
  'kimi-web.onboarded': '1',
  'kimi-web.ui-font-size': '16',
  'kimi-web.font-scale': '16',
  'kimi-web.liquid-glass': 'false',
  'kimi-web.server-credential': JSON.stringify({ version: 1, credential: 'mock-token', expiresAt: Date.now() + 864e5 }),
};

const EXTRACT = `(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const box = (el) => {
    if (!el) return null;
    const s = cs(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 60),
      bg: s.backgroundColor,
      bgImage: s.backgroundImage === 'none' ? '' : s.backgroundImage.slice(0, 40),
      radius: s.borderRadius,
      border: s.borderWidth + ' ' + s.borderColor,
      shadow: s.boxShadow === 'none' ? '' : s.boxShadow.slice(0, 60),
      padding: s.padding,
      gap: s.gap,
      size: Math.round(r.width) + 'x' + Math.round(r.height),
    };
  };
  const appRoot = document.getElementById('app') || document.body;
  const surfaces = Array.from(appRoot.children).slice(0, 3).map(box);

  const ta = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')
    || Array.from(document.querySelectorAll('[class*="composer"], [class*="input"]')).reverse().find((e) => e.querySelector('[contenteditable], textarea')) || null;
  const chain = [];
  let el = ta;
  for (let i = 0; i < 5 && el; i++) { chain.push(box(el)); el = el.parentElement; }

  const taStyle = ta ? (() => { const s = cs(ta); return { fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, padding: s.padding, bg: s.backgroundColor, radius: s.borderRadius, caret: s.caretColor }; })() : null;
  const pre = document.querySelector('[class*="code-block"], [class*="codeblock"]');
  const head = document.querySelector('.mdcb-head, [class*="code-block-header"], [class*="code-header"]');
  const codeChain = [];
  let ce = pre;
  for (let i = 0; i < 3 && ce; i++) { codeChain.push(box(ce)); ce = ce.parentElement; }
  const codeHeader = head || (pre ? pre.firstElementChild : null);
  const codeHeaderHtml = codeHeader ? codeHeader.outerHTML.slice(0, 1200) : '';
  const codeHeaderStyle = codeHeader ? box(codeHeader) : null;
  const glassAttr = document.documentElement.dataset.liquidGlass || '(unset)';
  const rootStyle = getComputedStyle(document.documentElement);
  const tokens = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!rule.style) continue;
      for (const name of Array.from(rule.style)) {
        if (!name.startsWith('--')) continue;
        if (!/bg|surface|panel|border|fg|text|muted|accent|base|layer|elevat|chrome|sidebar/i.test(name)) continue;
        const value = rootStyle.getPropertyValue(name).trim();
        if (!value || !(value[0] === '#' || value.indexOf('rgb') >= 0 || value.indexOf('oklch') >= 0 || value.indexOf('hsl') >= 0 || value.indexOf('color(') >= 0)) continue;
        tokens.push(name + ' = ' + value);
      }
    }
  }
  const tokenSet = Array.from(new Set(tokens)).sort();

  const composerRoot = (() => {
    let e = ta;
    for (let i = 0; i < 4 && e && e.parentElement; i++) e = e.parentElement;
    return e;
  })();
  const html = composerRoot ? composerRoot.outerHTML : '';
  return { glassAttr, surfaces, chain, taStyle, tokens: tokenSet, codeChain, codeHeaderStyle, codeHeaderHtml, html, url: location.href };
})()`;

const chrome = await launchChrome(9347);
const cdp = await connectPage(9347);
const out = {};
try {
  for (const [name, url] of Object.entries({ upstream: 'http://127.0.0.1:5399/', fork: 'http://127.0.0.1:5400/' })) {
    await cdp.navigate(url);
    await cdp.evaluate(`(() => { localStorage.clear(); for (const [k, v] of ${JSON.stringify(Object.entries(seed))}) localStorage.setItem(k, v); return true; })()`);
    await cdp.navigate(url);
    await new Promise((r) => setTimeout(r, 4000));
    out[name] = await cdp.evaluate(EXTRACT);
    console.log(`\n########## ${name} (${url})`);
    console.log('-- liquid-glass attr:', out[name].glassAttr);
    console.log('-- app-root children (surfaces):');
    for (const s of out[name].surfaces) if (s) console.log('   ', JSON.stringify(s));
    console.log('-- textarea -> up the chain:');
    for (const s of out[name].chain) if (s) console.log('   ', JSON.stringify(s));
    console.log('-- composer input style:', JSON.stringify(out[name].taStyle));
    console.log('-- colour tokens (' + out[name].tokens.length + '):');
    for (const t of out[name].tokens) console.log('    ' + t);
    console.log('-- code block chain:');
    for (const c of out[name].codeChain) if (c) console.log('   ', JSON.stringify(c));
    console.log('-- code header:', JSON.stringify(out[name].codeHeaderStyle));
    console.log('-- composer html bytes:', out[name].html.length);
  }
} finally {
  cdp.close();
  killChrome(chrome);
}

const refDir = `${REPO}/PLANS/web-revamp-refs`;
fs.mkdirSync(refDir, { recursive: true });
fs.writeFileSync(`${refDir}/upstream-composer.html`, out.upstream.html);
fs.writeFileSync(`${refDir}/fork-composer.html`, out.fork.html);
fs.writeFileSync(`${refDir}/upstream-codeblock.html`, out.upstream.codeHeaderHtml);
fs.writeFileSync(`${refDir}/fork-codeblock.html`, out.fork.codeHeaderHtml);
fs.writeFileSync(`${refDir}/surface-and-composer-styles.json`, `${JSON.stringify(out, null, 1)}\n`);
console.log(`\nsaved: ${refDir}/upstream-composer.html, fork-composer.html, surface-and-composer-styles.json`);
