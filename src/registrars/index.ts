/**
 * Registrar Exports.
 *
 * Porkbun is the primary registrar for availability and pricing checks.
 * Namecheap is supported as an alternative.
 */

export { RegistrarAdapter } from './base.js';
export { PorkbunAdapter, porkbunAdapter } from './porkbun.js';
export { NamecheapAdapter, namecheapAdapter } from './namecheap.js';
