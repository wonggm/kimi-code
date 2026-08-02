import { describe, expect, it } from 'vitest';
import { toAppConfig, toAppTask } from '../src/api/daemon/mappers';
import type { WireConfig, WireTask } from '../src/api/daemon/wire';

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

function baseConfig(overrides: Partial<WireConfig> = {}): WireConfig {
  return { providers: {}, ...overrides };
}

describe('toAppConfig model settings', () => {
  it('maps camelCase secondary model fields and subagent efforts', () => {
    const app = toAppConfig(baseConfig({
      secondary_model: {
        model: 'secondary-alias',
        defaultEffort: 'high',
        supportEfforts: ['low', 'high'],
        capabilities: ['thinking'],
      },
      subagent_efforts: { explore: 'high' },
    }));

    expect(app.secondaryModel).toEqual({
      model: 'secondary-alias',
      defaultEffort: 'high',
      supportEfforts: ['low', 'high'],
      capabilities: ['thinking'],
    });
    expect(app.subagentEfforts).toEqual({ explore: 'high' });
  });

  it('keeps compatibility with snake_case secondary model fields', () => {
    const app = toAppConfig(baseConfig({
      secondary_model: {
        model: 'secondary-alias',
        default_effort: 'medium',
        support_efforts: ['low', 'medium'],
      },
    }));

    expect(app.secondaryModel?.defaultEffort).toBe('medium');
    expect(app.secondaryModel?.supportEfforts).toEqual(['low', 'medium']);
  });
});
