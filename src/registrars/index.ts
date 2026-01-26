/**
 * Registrar Exports.
 *
 * Porkbun is the primary registrar for availability and pricing checks.
 * Namecheap is supported as an alternative.
 * GoDaddy public endpoint provides free availability + premium/auction detection.
 */

export { RegistrarAdapter, RateLimiter } from './base.js';
export { PorkbunAdapter, porkbunAdapter } from './porkbun.js';
export { NamecheapAdapter, namecheapAdapter } from './namecheap.js';
export {
  GodaddyPublicAdapter,
  godaddyPublicAdapter,
  getGodaddyCircuitState,
  resetGodaddyCircuit,
  type GodaddySuggestion,
} from './godaddy-public.js';
