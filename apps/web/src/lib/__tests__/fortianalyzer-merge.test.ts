import { describe, it, expect } from 'vitest';
import { mergeFortiAnalyzerHits } from '../fortianalyzer-merge';
import type { NormalizedPolicyRule } from '@cisco2cp/core';

describe('mergeFortiAnalyzerHits', () => {
  it('merges JSON hits by policy name and id', () => {
    const rules: NormalizedPolicyRule[] = [
      {
        id: 'r1',
        name: 'allow-web',
        enabled: true,
        sourceRefs: [],
        destinationRefs: [],
        serviceRefs: [],
        action: 'allow',
        log: 'none',
        ruleId: '7',
      },
    ];
    const json = JSON.stringify({
      hits: [
        { policyName: 'allow-web', hits: 100 },
        { policyId: '7', hits: 200 },
      ],
    });
    const { rules: out, warnings } = mergeFortiAnalyzerHits(rules, json);
    expect(out[0]?.hitCount).toBe(100);
    expect(warnings.some((w) => w.includes('merged'))).toBe(true);
  });
});
