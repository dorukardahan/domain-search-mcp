import axios from 'axios';
import { checkRdap } from '../../src/fallbacks/rdap';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RDAP bootstrap caching', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('fetches bootstrap once and reuses cache', async () => {
    mockedAxios.get.mockImplementation((url) => {
      if (url === 'https://data.iana.org/rdap/dns.json') {
        return Promise.resolve({
          data: {
            services: [[['tst'], ['https://rdap.example.com']]],
          },
        } as any);
      }
      if (url === 'https://rdap.example.com/domain/example.tst') {
        return Promise.resolve({ status: 404, data: {} } as any);
      }
      if (url === 'https://rdap.example.com/domain/second.tst') {
        return Promise.resolve({ status: 404, data: {} } as any);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    await checkRdap('example', 'tst');
    await checkRdap('second', 'tst');

    const bootstrapCalls = mockedAxios.get.mock.calls.filter(
      (call) => call[0] === 'https://data.iana.org/rdap/dns.json',
    );
    expect(bootstrapCalls).toHaveLength(1);
  });
});
