/**
 * GoDaddy Optimistic-Availability NS Gate.
 *
 * GoDaddy's public "domains_check_availability" endpoint reports a domain as
 * "available" whenever it is *purchasable* — which includes aftermarket /
 * parked domains being resold via Afternic, Sedo, Dan, etc. That is NOT the
 * same thing as "unregistered", and treating it as such produces confident
 * false positives (e.g. verdict.ai was reported available:true while having
 * been registered since 2017 and parked on Afternic).
 *
 * Ground truth used here: if a domain currently has live DNS NS records, it
 * IS registered — regardless of what GoDaddy's endpoint reports. This module
 * cross-checks any GoDaddy-sourced available:true result against a live NS
 * lookup before it is returned to the caller.
 *
 * This gate intentionally only looks at `result.source === 'godaddy_api'`.
 * It must never run for RDAP/WHOIS/pricing-api/BYOK-registrar results —
 * those sources already carry correct registered/available semantics.
 */

import { resolveNs } from 'node:dns/promises';
import type { DomainResult } from '../types.js';
import { logger } from '../utils/logger.js';

/**
 * Race the NS lookup against this timeout so a slow/hanging resolver never
 * blocks or slows down a search.
 */
const NS_GATE_TIMEOUT_MS = 2500;

/**
 * Node DNS error codes that mean "no NS records exist anywhere for this
 * name" — i.e. the domain really is unregistered. Any other error/timeout
 * is inconclusive and must NOT be treated as "no records".
 */
const NO_RECORDS_CODES = new Set(['ENOTFOUND', 'ENODATA']);

class NsGateTimeoutError extends Error {
  constructor() {
    super('ns_gate_timeout');
    this.name = 'NsGateTimeoutError';
  }
}

/**
 * Resolve NS records for a domain, racing against a hard timeout.
 * Rejects with whatever error resolveNs produced, or NsGateTimeoutError.
 */
function resolveNsWithTimeout(
  domain: string,
  timeoutMs: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NsGateTimeoutError()), timeoutMs);

    resolveNs(domain).then(
      (records) => {
        clearTimeout(timer);
        resolve(records);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Cross-check a GoDaddy "available" result against live DNS NS records.
 *
 * Mutates `result` in place when the gate overrides GoDaddy's verdict.
 * No-ops for any result not sourced from GoDaddy, or already unavailable.
 * Never throws — DNS failures/timeouts fall back to keeping GoDaddy's
 * original answer.
 */
export async function gateGodaddyAvailability(
  result: DomainResult,
): Promise<void> {
  if (result.source !== 'godaddy_api' || result.available !== true) {
    return;
  }

  let nameservers: string[];
  try {
    nameservers = await resolveNsWithTimeout(result.domain, NS_GATE_TIMEOUT_MS);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code && NO_RECORDS_CODES.has(code)) {
      // No NS records anywhere -> domain really is unregistered.
      // Keep GoDaddy's available:true answer as-is.
      return;
    }

    // Any other error (timeout, SERVFAIL, network hiccup, etc.) is
    // inconclusive. Don't second-guess GoDaddy, and never crash the search.
    logger.warn(
      'GoDaddy NS ground-truth check failed; keeping GoDaddy availability answer',
      {
        domain: result.domain,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return;
  }

  if (!nameservers || nameservers.length === 0) {
    // Defensive: treat "resolved but empty" the same as "no records".
    return;
  }

  // Live NS records exist: the domain is registered (most likely
  // parked/aftermarket), regardless of GoDaddy reporting it as purchasable.
  result.available = false;
  result.premium = true;
  if (!result.premium_reason) {
    result.premium_reason =
      'Registered domain detected via live DNS NS records (aftermarket)';
  }
  result.aftermarket = {
    type: result.aftermarket?.type ?? 'aftermarket',
    price: result.aftermarket?.price ?? null,
    currency: result.aftermarket?.currency ?? null,
    source: 'dns_ns_ground_truth',
    url: result.aftermarket?.url,
    note:
      'GoDaddy reported this domain as available, but live DNS NS records ' +
      'prove it is registered (aftermarket/parked). GoDaddy "available" ' +
      'means purchasable via aftermarket, not unregistered.',
  };

  logger.warn(
    'GoDaddy optimistic availability overridden by DNS NS ground truth',
    {
      domain: result.domain,
      nameservers,
    },
  );
}
