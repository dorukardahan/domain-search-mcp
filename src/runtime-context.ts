/**
 * Runtime Transport Context.
 *
 * Tiny module that records which transport the server booted with (stdio vs
 * http). Tools read it to change behavior when the server is reachable by a
 * remote HTTP caller (e.g. name_project's project_path filesystem scan must
 * not run for HTTP callers - see src/tools/name_project.ts).
 *
 * Defaults to 'stdio' so importing this module from a library consumer or a
 * test file - neither of which boots server.ts - never changes behavior.
 */

import type { TransportType } from './transports/index.js';

let currentTransport: TransportType = 'stdio';

/** Record the active transport. Called once at server boot (both stdio and http paths). */
export function setTransport(transport: TransportType): void {
  currentTransport = transport;
}

/** Read the active transport. Defaults to 'stdio' until setTransport() is called. */
export function getTransport(): TransportType {
  return currentTransport;
}
