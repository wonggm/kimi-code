// apps/kimi-web/src/lib/modelDisplay.ts
// The bound model alias as the UI shows it. A subagent's alias is the
// `provider/alias` pair the engine resolved at spawn, so the provider prefix is
// dropped. Upstream resolves a catalog display name first and falls back to this
// same bare alias, which is the only form these rows ever see.

export function modelDisplay(alias: string | undefined): string | undefined {
  if (typeof alias !== 'string' || alias.length === 0) return undefined;
  const lastSlash = alias.lastIndexOf('/');
  return lastSlash >= 0 && lastSlash < alias.length - 1 ? alias.slice(lastSlash + 1) : alias;
}
