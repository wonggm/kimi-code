import { describe, expect, it } from 'vitest';
import { toAppTask } from '../src/api/daemon/mappers';
import type { WireTask } from '../src/api/daemon/wire';

function baseWire(overrides: Partial<WireTask> = {}): WireTask {
  return {
    id: 'agent-1',
    session_id: 'session-1',
    kind: 'subagent',
    description: 'desc',
    status: 'running',
    created_at: '2026-01-01T00:00:00.000Z',
    subagent_type: 'explore',
    ...overrides,
  };
}

describe('toAppTask model threading', () => {
  it('copies wire.model onto AppTask', () => {
    const app = toAppTask(baseWire({ model: 'opencode-go/deepseek-v4-flash' }));
    expect(app.model).toBe('opencode-go/deepseek-v4-flash');
  });

  it('leaves AppTask.model undefined when the wire omits it', () => {
    const app = toAppTask(baseWire());
    expect(app.model).toBeUndefined();
  });
});