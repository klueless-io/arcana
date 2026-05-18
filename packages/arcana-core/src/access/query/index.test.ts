import { describe, it, expect } from 'vitest';
import { createQuery, type QueryDeps } from './index.js';
import { NotImplementedError } from '../../errors.js';

const fakeDeps = {} as unknown as QueryDeps;

describe('createQuery', () => {
  it('returns an object with the documented API surface', () => {
    const api = createQuery(fakeDeps);
    expect(typeof api.queryFacts).toBe('function');
    expect(typeof api.getNeighbors).toBe('function');
    expect(typeof api.stats).toBe('function');
    expect(typeof api.listContradictions).toBe('function');
    expect(typeof api.listInsights).toBe('function');
    expect(typeof api.readBlock).toBe('function');
    expect(typeof api.getBlockHistory).toBe('function');
  });

  it('every method throws NotImplementedError at v0.1', async () => {
    const api = createQuery(fakeDeps);
    await expect(api.queryFacts('David')).rejects.toThrow(NotImplementedError);
    await expect(
      api.getNeighbors({ type: 'memory', id: 'mem_1' }),
    ).rejects.toThrow(NotImplementedError);
    await expect(api.stats()).rejects.toThrow(NotImplementedError);
    await expect(api.listContradictions()).rejects.toThrow(NotImplementedError);
    await expect(api.listInsights()).rejects.toThrow(NotImplementedError);
    await expect(api.readBlock('persona')).rejects.toThrow(NotImplementedError);
    await expect(api.getBlockHistory('persona')).rejects.toThrow(
      NotImplementedError,
    );
  });
});
