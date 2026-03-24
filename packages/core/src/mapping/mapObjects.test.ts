import { describe, expect, it } from 'vitest';
import { mapObjects } from './mapObjects';
import type { NormalizedObject } from '../models/normalized';

describe('mapObjects', () => {
  it('maps FQDN normalized objects to Check Point fqdn target without host fallback warning', () => {
    const obj: NormalizedObject = {
      id: 'id-1',
      type: 'fqdn',
      name: 'KBNINADC22.emea.demant.com',
      value: 'KBNINADC22.emea.demant.com',
    };
    const [d] = mapObjects([obj]);
    expect(d?.proposedTarget).toMatchObject({
      type: 'fqdn',
      name: 'KBNINADC22.emea.demant.com',
      fqdn: 'KBNINADC22.emea.demant.com',
    });
    expect(d?.confidenceScore).toBe(1);
    expect(d?.warnings).toHaveLength(0);
  });
});
