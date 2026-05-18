import { describe, it, expect } from 'vitest';
import { createIngest, type IngestDeps } from './index.js';
import { NotImplementedError } from '../errors.js';

const fakeDeps = {} as unknown as IngestDeps;

describe('createIngest', () => {
  it('returns an object with the documented API surface', () => {
    const api = createIngest(fakeDeps);
    expect(typeof api.storeMemory).toBe('function');
    expect(typeof api.ingestDocument).toBe('function');
  });

  it('storeMemory throws NotImplementedError at v0.1', async () => {
    const api = createIngest(fakeDeps);
    await expect(
      api.storeMemory({ content: 'hello', source: 'cli' }),
    ).rejects.toThrow(NotImplementedError);
  });

  it('ingestDocument throws NotImplementedError at v0.1', async () => {
    const api = createIngest(fakeDeps);
    await expect(
      api.ingestDocument({ format: 'markdown', content: '# hi' }),
    ).rejects.toThrow(NotImplementedError);
  });
});
