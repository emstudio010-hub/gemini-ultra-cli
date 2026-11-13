/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CodeAssistServer } from '../server.js';
import { getClientMetadata } from './client_metadata.js';
import type { ListExperimentsResponse, Flag } from './types.js';

// Mock dependencies before importing the module under test
vi.mock('../server.js');
vi.mock('./client_metadata.js');

describe('experiments', () => {
  let mockServer: CodeAssistServer;

  beforeEach(() => {
    // Reset modules to clear the cached `experimentsPromise`
    vi.resetModules();
    delete process.env['GEMINI_EXP'];

    // Mock the dependencies that `getExperiments` relies on
    vi.mocked(getClientMetadata).mockResolvedValue({
      ideName: 'GEMINI_CLI',
      ideVersion: '1.0.0',
      platform: 'LINUX_AMD64',
      updateChannel: 'stable',
    });

    // Create a mock instance of the server for each test
    mockServer = {
      listExperiments: vi.fn(),
    } as unknown as CodeAssistServer;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not cache a missing backend as the experiments for a later native login', async () => {
    const { getExperiments } = await import('./experiments.js');
    expect(await getExperiments()).toEqual({ flags: {}, experimentIds: [] });
    vi.mocked(mockServer.listExperiments).mockResolvedValue({
      experimentIds: [42],
    });
    expect((await getExperiments(mockServer)).experimentIds).toEqual([42]);
    expect(mockServer.listExperiments).toHaveBeenCalledOnce();
  });

  it('keeps different native backends separate while sharing each backend cache', async () => {
    const { getExperiments } = await import('./experiments.js');
    const other = {
      listExperiments: vi.fn().mockResolvedValue({ experimentIds: [84] }),
    } as unknown as CodeAssistServer;
    vi.mocked(mockServer.listExperiments).mockResolvedValue({
      experimentIds: [42],
    });
    const first = await getExperiments(mockServer);
    expect((await getExperiments(other)).experimentIds).toEqual([84]);
    expect(await getExperiments(mockServer)).toBe(first);
    expect(mockServer.listExperiments).toHaveBeenCalledOnce();
    expect(other.listExperiments).toHaveBeenCalledOnce();
  });

  it('permits an explicit fetch after failure without automatically retrying', async () => {
    const { getExperiments } = await import('./experiments.js');
    const failure = new Error('Fixture unavailable');
    vi.mocked(mockServer.listExperiments)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ experimentIds: [42] });
    await expect(getExperiments(mockServer)).rejects.toBe(failure);
    expect(mockServer.listExperiments).toHaveBeenCalledOnce();
    expect((await getExperiments(mockServer)).experimentIds).toEqual([42]);
    expect(mockServer.listExperiments).toHaveBeenCalledTimes(2);
  });

  it('bounds a hanging experiments request and excludes its late result from the next explicit fetch', async () => {
    vi.useFakeTimers();
    const { getExperiments } = await import('./experiments.js');
    let release!: (value: ListExperimentsResponse) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(mockServer.listExperiments).mockImplementationOnce(
      (_metadata, value) => {
        signal = value;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    );
    let outcome = 'pending';
    const pending = getExperiments(mockServer).then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(outcome).toBe('rejected');
      expect(signal?.aborted).toBe(true);
      expect(mockServer.listExperiments).toHaveBeenCalledOnce();
      vi.mocked(mockServer.listExperiments).mockResolvedValueOnce({
        experimentIds: [42],
      });
      const fresh = await getExperiments(mockServer);
      release({ experimentIds: [99] });
      await pending;
      expect(await getExperiments(mockServer)).toBe(fresh);
      expect(fresh.experimentIds).toEqual([42]);
      expect(mockServer.listExperiments).toHaveBeenCalledTimes(2);
    } finally {
      release?.({});
    }
  });

  it('does not dispatch after client metadata arrives beyond the loading deadline', async () => {
    vi.useFakeTimers();
    const { getExperiments } = await import('./experiments.js');
    let release!: (
      value: Awaited<ReturnType<typeof getClientMetadata>>,
    ) => void;
    vi.mocked(getClientMetadata).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    let outcome = 'pending';
    const pending = getExperiments(mockServer).then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(outcome).toBe('rejected');
      release({});
      await pending;
      await vi.advanceTimersByTimeAsync(1);
      expect(mockServer.listExperiments).not.toHaveBeenCalled();
    } finally {
      release?.({});
    }
  });

  it('should fetch and parse experiments from the server', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      flags: [
        { flagId: 234, boolValue: true },
        { flagId: 345, stringValue: 'value' },
      ],
      experimentIds: [123, 456],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    // Verify that the dependencies were called
    expect(getClientMetadata).toHaveBeenCalled();
    expect(mockServer.listExperiments).toHaveBeenCalledWith(
      await getClientMetadata(),
      expect.any(AbortSignal),
    );

    // Verify that the response was parsed correctly
    expect(experiments.flags[234]).toEqual({
      flagId: 234,
      boolValue: true,
    });
    expect(experiments.flags[345]).toEqual({
      flagId: 345,
      stringValue: 'value',
    });
    expect(experiments.experimentIds).toEqual([123, 456]);
  });

  it('should handle an empty or partial response from the server', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {}; // No flags or experimentIds
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    expect(experiments.flags).toEqual({});
    expect(experiments.experimentIds).toEqual([]);
  });

  it('should ignore flags that are missing a name', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      flags: [
        { boolValue: true } as Flag, // No name
        { flagId: 256, stringValue: 'value' },
      ],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const experiments = await getExperiments(mockServer);

    expect(Object.keys(experiments.flags)).toHaveLength(1);
    expect(experiments.flags[256]).toBeDefined();
    expect(experiments.flags['undefined']).toBeUndefined();
  });

  it('should cache the experiments promise to avoid multiple fetches', async () => {
    const { getExperiments } = await import('./experiments.js');
    const mockApiResponse: ListExperimentsResponse = {
      experimentIds: [1, 2, 3],
    };
    vi.mocked(mockServer.listExperiments).mockResolvedValue(mockApiResponse);

    const firstCall = await getExperiments(mockServer);
    const secondCall = await getExperiments(mockServer);

    expect(firstCall).toBe(secondCall); // Should be the exact same promise object
    // Verify the underlying functions were only called once
    expect(getClientMetadata).toHaveBeenCalledTimes(1);
    expect(mockServer.listExperiments).toHaveBeenCalledTimes(1);
  });
});
