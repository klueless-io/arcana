import { describe, it, expect } from 'vitest';
import { createRetrieve, type RetrieveDeps } from './index.js';
import { NotImplementedError } from '../errors.js';

const fakeDeps = {} as unknown as RetrieveDeps;

describe('createRetrieve', () => {
  it('returns an object with the documented API surface', () => {
    const api = createRetrieve(fakeDeps);
    expect(typeof api.hybridSearch).toBe('function');
    expect(typeof api.factRetrieval).toBe('function');
    expect(typeof api.getEntityProfile).toBe('function');
  });

  it('every method throws NotImplementedError at v0.1', async () => {
    const api = createRetrieve(fakeDeps);
    await expect(api.hybridSearch({ query: 'x' })).rejects.toThrow(
      NotImplementedError,
    );
    await expect(api.factRetrieval({ query: 'x' })).rejects.toThrow(
      NotImplementedError,
    );
    await expect(api.getEntityProfile('ent_1')).rejects.toThrow(
      NotImplementedError,
    );
  });
});
