import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { InvestigationResponse } from '../api/contracts';
import { flag, initialState, makeInvestigation } from '../mocks/fixtures';

afterEach(() => vi.restoreAllMocks());

describe('Frozen detection response', () => {
  const current = { ...initialState, state_revision: 11, demo_date: '2026-09-30' };
  const detection = makeInvestigation(initialState, 'original-detection');
  const response: InvestigationResponse = {
    serving_context: {
      run_id: current.run_id,
      state_revision: current.state_revision,
      method_version: current.method_version,
      demo_date: current.demo_date,
    },
    analysis: detection,
  };

  it('accepts original detection context while validating the current serving state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(response));
    const actual = await api.investigation(flag.id, current);
    expect(actual).toEqual(detection);
    expect(actual.context.state_revision).toBe(initialState.state_revision);
    expect(actual.analysis_id).toBe('original-detection');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('expected_revision=11'),
      expect.any(Object),
    );
  });

  it('rejects a stale serving envelope even when its frozen detection is valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        ...response,
        serving_context: { ...response.serving_context, state_revision: 10 },
      }),
    );
    await expect(api.investigation(flag.id, current)).rejects.toMatchObject({
      code: 'state_changed',
    });
  });

  it('rejects old-run evidence inside a current serving envelope after reset', async () => {
    const reset = { ...current, run_id: 'reset-run' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        ...response,
        serving_context: { ...response.serving_context, run_id: reset.run_id },
      }),
    );
    await expect(api.investigation(flag.id, reset)).rejects.toMatchObject({
      code: 'invalid_context',
    });
  });
});
