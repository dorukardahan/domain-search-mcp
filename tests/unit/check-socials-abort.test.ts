import axios from 'axios';
import { executeCheckSocials } from '../../src/tools/check_socials';

jest.mock('axios');

const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('check_socials cancellation', () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it('forwards the caller signal to every platform request and settles after abort', async () => {
    let requestSignal: AbortSignal | undefined;
    mockedAxios.mockImplementation((config) => {
      requestSignal = config.signal;
      return new Promise((_resolve, reject) => {
        if (config.signal?.aborted) {
          reject(config.signal.reason);
          return;
        }
        config.signal?.addEventListener(
          'abort',
          () => reject(config.signal?.reason),
          { once: true },
        );
      });
    });
    const controller = new AbortController();

    const operation = executeCheckSocials(
      { name: 'syntheticcancel', platforms: ['github'] },
      { signal: controller.signal },
    );
    await Promise.resolve();

    expect(requestSignal).toBe(controller.signal);
    const reason = new Error('synthetic caller abort');
    controller.abort(reason);

    await expect(operation).rejects.toBe(reason);
  });

  it('preserves the reason from a signal aborted before execution', async () => {
    const controller = new AbortController();
    const reason = new Error('synthetic pre-abort');
    controller.abort(reason);

    await expect(
      executeCheckSocials(
        { name: 'syntheticpreabort', platforms: ['github'] },
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason);
    expect(mockedAxios).not.toHaveBeenCalled();
  });
});
