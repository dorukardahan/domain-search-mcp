/**
 * Domain Name Validators.
 *
 * Validates domain names, TLDs, and other inputs.
 * Provides user-friendly error messages.
 */

import { config } from '../config.js';
import { InvalidDomainError, UnsupportedTldError } from './errors.js';

/**
 * Valid domain name pattern (without TLD).
 * - 1-63 characters per label
 * - Alphanumeric and hyphens
 * - Cannot start or end with hyphen
 * - Cannot have consecutive hyphens (except for IDN: xn--)
 */
const DOMAIN_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Valid TLD pattern.
 * - 2-63 characters
 * - Alphanumeric only (no hyphens in TLD)
 */
const TLD_PATTERN = /^[a-z]{2,63}$/i;

/**
 * Characters that are definitely not allowed in domains.
 */
const INVALID_CHARS = /[^a-z0-9.-]/i;

/**
 * Validate and normalize a domain name (without TLD).
 *
 * @param name - The domain name to validate
 * @returns Normalized domain name (lowercase)
 * @throws InvalidDomainError if invalid
 */
export function validateDomainName(name: string): string {
  // Trim and lowercase
  const normalized = name.trim().toLowerCase();

  // Check for empty
  if (!normalized) {
    throw new InvalidDomainError(name, 'Domain name cannot be empty');
  }

  // Check length
  if (normalized.length > 63) {
    throw new InvalidDomainError(
      name,
      `Domain name too long (${normalized.length} chars, max 63)`,
    );
  }

  // Check for invalid characters
  if (INVALID_CHARS.test(normalized)) {
    const invalidChar = normalized.match(INVALID_CHARS)?.[0];
    throw new InvalidDomainError(
      name,
      `Contains invalid character: "${invalidChar}"`,
    );
  }

  // Check pattern
  if (!DOMAIN_LABEL_PATTERN.test(normalized)) {
    if (normalized.startsWith('-')) {
      throw new InvalidDomainError(name, 'Cannot start with a hyphen');
    }
    if (normalized.endsWith('-')) {
      throw new InvalidDomainError(name, 'Cannot end with a hyphen');
    }
    throw new InvalidDomainError(
      name,
      'Invalid format. Use only letters, numbers, and hyphens.',
    );
  }

  return normalized;
}

/**
 * Validate a TLD.
 *
 * @param tld - The TLD to validate (with or without leading dot)
 * @returns Normalized TLD (lowercase, no dot)
 * @throws UnsupportedTldError if invalid or not allowed
 */
export function validateTld(tld: string): string {
  // Remove leading dot if present
  const normalized = tld.replace(/^\./, '').trim().toLowerCase();

  // Check for empty
  if (!normalized) {
    throw new UnsupportedTldError(tld, config.allowedTlds);
  }

  // Check pattern
  if (!TLD_PATTERN.test(normalized)) {
    throw new UnsupportedTldError(normalized, config.allowedTlds);
  }

  // Check against deny list
  if (config.denyTlds.includes(normalized)) {
    throw new UnsupportedTldError(normalized, config.allowedTlds);
  }

  // Check against allow list (if not empty)
  if (
    config.allowedTlds.length > 0 &&
    !config.allowedTlds.includes(normalized)
  ) {
    throw new UnsupportedTldError(normalized, config.allowedTlds);
  }

  return normalized;
}

/**
 * Parse a full domain name into name and TLD.
 *
 * @param fullDomain - Full domain like "example.com" or "sub.example.co.uk"
 * @returns Object with name and tld
 * @throws InvalidDomainError if parsing fails
 */
export function parseDomain(fullDomain: string): { name: string; tld: string } {
  const normalized = fullDomain.trim().toLowerCase();

  // Find the last dot
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot === -1) {
    throw new InvalidDomainError(
      fullDomain,
      'No TLD found. Include the extension (e.g., "example.com")',
    );
  }

  const name = normalized.slice(0, lastDot);
  const tld = normalized.slice(lastDot + 1);

  // Handle multi-part TLDs (e.g., co.uk) - for simplicity, we don't support these yet
  // In a full implementation, you'd use the Public Suffix List

  return {
    name: validateDomainName(name),
    tld: validateTld(tld),
  };
}

/**
 * Validate an array of TLDs.
 *
 * @param tlds - Array of TLDs to validate
 * @returns Array of normalized TLDs
 */
export function validateTlds(tlds: string[]): string[] {
  if (!tlds || tlds.length === 0) {
    // Return default TLDs
    return ['com', 'io', 'dev'];
  }

  return tlds.map(validateTld);
}

/**
 * Check if a string looks like a full domain (has a dot).
 */
export function isFullDomain(input: string): boolean {
  return input.includes('.');
}

/**
 * Build a full domain from name and TLD.
 */
export function buildDomain(name: string, tld: string): string {
  return `${validateDomainName(name)}.${validateTld(tld)}`;
}

/**
 * Validate registrar name.
 */
export function validateRegistrar(registrar: string): string {
  const normalized = registrar.trim().toLowerCase();
  const validRegistrars = ['porkbun', 'dynadot', 'namecheap', 'godaddy'];

  if (!validRegistrars.includes(normalized)) {
    throw new Error(
      `Invalid registrar: "${registrar}". Valid options: ${validRegistrars.join(', ')}`,
    );
  }

  return normalized;
}
