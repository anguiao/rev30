import { describe, expect, it } from 'vitest'
import { assertLatencyTargets } from '../../../../scripts/icon-search/benchmark/measure'

describe('icon search benchmark latency targets', () => {
  it('accepts P95 exactly at both limits', () => {
    expect(() =>
      assertLatencyTargets([{ kind: 'wide', query: 'outline', p95Ms: 50 }], {
        batchP95Ms: 200,
        requestP95Ms: 180,
      }),
    ).not.toThrow()
  })

  it('fails if a single query in its category exceeds the limit', () => {
    expect(() =>
      assertLatencyTargets(
        [
          { kind: 'wide', query: '箭头', p95Ms: 2 },
          { kind: 'wide', query: 'outline', p95Ms: 51 },
          { kind: 'wide', query: 'icon', p95Ms: 8 },
        ],
        { batchP95Ms: 200, requestP95Ms: 180 },
      ),
    ).toThrow('outline')
  })

  it('fails if the complete burst exceeds the limit with fast individual requests', () => {
    expect(() =>
      assertLatencyTargets([{ kind: 'wide', query: 'outline', p95Ms: 50 }], {
        batchP95Ms: 201,
        requestP95Ms: 180,
      }),
    ).toThrow('10-request burst')
  })
})
