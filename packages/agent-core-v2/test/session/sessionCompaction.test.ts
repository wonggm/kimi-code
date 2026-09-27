import { afterEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { TestInstantiationService } from '#/_base/di/test';
import { JsonAtomicDocumentStore } from '#/persistence/backends/node-fs/atomicDocumentStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { IAtomicDocumentStore } from '#/persistence/interface/atomicDocumentStore';
import { ISessionContext, makeSessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionStateService } from '#/session/state/sessionState';
import { SessionStateService } from '#/session/state/sessionStateService';

import { SessionCompactionService } from '#/session/sessionCompaction/sessionCompactionService';

describe('SessionCompactionService', () => {
  const instances: TestInstantiationService[] = [];

  afterEach(() => {
    for (const instance of instances) instance.dispose();
    instances.length = 0;
  });

  it('persists and clears the session compaction threshold', async () => {
    const storage = new InMemoryStorageService();
    const store = new JsonAtomicDocumentStore(storage);
    const first = createFixture(store);
    await first.service.ready;
    await first.service.setTriggerRatio(0.7);

    expect(first.service.triggerRatio()).toBe(0.7);
    expect(await store.get(first.scope, 'state.json')).toEqual({ triggerRatio: 0.7 });

    const second = createFixture(store);
    await second.service.ready;
    expect(second.service.triggerRatio()).toBe(0.7);

    await second.service.setTriggerRatio(undefined);
    expect(second.service.triggerRatio()).toBeUndefined();
    expect(await store.get(second.scope, 'state.json')).toEqual({});
  });

  function createFixture(store: IAtomicDocumentStore) {
    const instance = new TestInstantiationService();
    instances.push(instance);
    const context = makeSessionContext({
      sessionId: 's1',
      workspaceId: 'wd_test',
      sessionDir: '/tmp/sessions/wd_test/s1',
      sessionScope: 'sessions/wd_test/s1',
      metaScope: 'sessions/wd_test/s1/session-meta',
      cwd: '/tmp/sessions/wd_test/s1',
    });
    instance.stub(ISessionContext, context);
    instance.stub(IAtomicDocumentStore, store);
    instance.set(ISessionStateService, new SyncDescriptor(SessionStateService));
    return {
      service: instance.createInstance(SessionCompactionService),
      store,
      scope: context.scope('compaction'),
    };
  }
});
