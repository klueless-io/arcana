import { describe, it, expect } from 'vitest';
import { createCommand, type CommandDeps } from './index.js';
import { NotImplementedError } from '../../errors.js';

const fakeDeps = {} as unknown as CommandDeps;

describe('createCommand', () => {
  it('returns an object with the documented API surface', () => {
    const api = createCommand(fakeDeps);
    expect(typeof api.recordFact).toBe('function');
    expect(typeof api.correctFact).toBe('function');
    expect(typeof api.linkMemories).toBe('function');
    expect(typeof api.pin).toBe('function');
    expect(typeof api.moveToTier).toBe('function');
    expect(typeof api.deleteMemory).toBe('function');
    expect(typeof api.updateBlock).toBe('function');
  });

  it('every method throws NotImplementedError at v0.1', async () => {
    const api = createCommand(fakeDeps);
    await expect(
      api.recordFact({
        entity: 'David',
        attribute: 'role',
        value: 'engineer',
        confidence: 0.9,
        sourceType: 'chat',
      }),
    ).rejects.toThrow(NotImplementedError);
    await expect(api.correctFact('fact_1', 'new')).rejects.toThrow(
      NotImplementedError,
    );
    await expect(
      api.linkMemories(
        { type: 'memory', id: 'mem_1' },
        { type: 'entity', id: 'ent_1' },
        'mentions',
      ),
    ).rejects.toThrow(NotImplementedError);
    await expect(api.pin('mem_1')).rejects.toThrow(NotImplementedError);
    await expect(api.moveToTier('mem_1', 'hot')).rejects.toThrow(
      NotImplementedError,
    );
    await expect(api.deleteMemory('mem_1')).rejects.toThrow(
      NotImplementedError,
    );
    await expect(api.updateBlock('persona', 'new content')).rejects.toThrow(
      NotImplementedError,
    );
  });
});
