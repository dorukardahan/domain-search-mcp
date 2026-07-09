/**
 * Unit tests for CLI flag parsing.
 *
 * --help/-h and --version/-v are handled before the server boots or reads
 * stdin; transport flags resolve to 'run'.
 */

import { parseCliAction } from '../../src/transports/index';

describe('parseCliAction', () => {
  it('returns "help" for --help and -h', () => {
    expect(parseCliAction(['--help'])).toBe('help');
    expect(parseCliAction(['-h'])).toBe('help');
  });

  it('returns "version" for --version and -v', () => {
    expect(parseCliAction(['--version'])).toBe('version');
    expect(parseCliAction(['-v'])).toBe('version');
  });

  it('returns "run" for no flags or transport flags', () => {
    expect(parseCliAction([])).toBe('run');
    expect(parseCliAction(['--http'])).toBe('run');
    expect(parseCliAction(['--stdio'])).toBe('run');
    expect(parseCliAction(['--port', '3001'])).toBe('run');
  });

  it('prioritizes help over version when both are present', () => {
    expect(parseCliAction(['--version', '--help'])).toBe('help');
  });
});
