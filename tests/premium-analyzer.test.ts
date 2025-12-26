/**
 * Tests for Premium Domain Analyzer.
 */

import { describe, expect, it } from '@jest/globals';
import {
  analyzePremiumReason,
  generatePremiumInsight,
  suggestPremiumAlternatives,
  calculateDomainScore,
  generatePremiumSummary,
} from '../src/utils/premium-analyzer.js';
import type { DomainResult } from '../src/types.js';

describe('Premium Analyzer', () => {
  describe('analyzePremiumReason', () => {
    it('should detect single character domains', () => {
      const reasons = analyzePremiumReason('x.com');
      expect(reasons).toContain('Single character domain (extremely rare)');
    });

    it('should detect two-character domains', () => {
      const reasons = analyzePremiumReason('ai.io');
      expect(reasons.some(r => r.includes('Two-character'))).toBe(true);
    });

    it('should detect three-character domains', () => {
      const reasons = analyzePremiumReason('app.dev');
      expect(reasons.some(r => r.includes('Three-character'))).toBe(true);
    });

    it('should detect premium keywords', () => {
      const reasons = analyzePremiumReason('cloud.io');
      expect(reasons.some(r => r.includes('Popular keyword'))).toBe(true);
    });

    it('should detect numeric patterns', () => {
      const reasons = analyzePremiumReason('123.com');
      expect(reasons.some(r => r.includes('numeric pattern'))).toBe(true);
    });

    it('should detect repeating characters', () => {
      const reasons = analyzePremiumReason('aaa.io');
      expect(reasons.some(r => r.includes('Repeating character'))).toBe(true);
    });

    it('should detect high-demand TLDs', () => {
      const reasons = analyzePremiumReason('mysite.io');
      expect(reasons.some(r => r.includes('High-demand .io'))).toBe(true);
    });

    it('should return empty for non-premium domains', () => {
      const reasons = analyzePremiumReason('myawesomewebsite.net');
      // Long, non-keyword domain on .net should have no premium reasons
      expect(reasons.length).toBe(0);
    });
  });

  describe('generatePremiumInsight', () => {
    it('should generate insight for premium domain with price', () => {
      const result: DomainResult = {
        domain: 'ai.io',
        available: true,
        premium: true,
        price_first_year: 5000,
        price_renewal: 500,
        currency: 'USD',
        privacy_included: false,
        transfer_price: null,
        registrar: 'porkbun',
        source: 'porkbun_api',
        checked_at: new Date().toISOString(),
      };

      const insight = generatePremiumInsight(result);
      expect(insight).not.toBeNull();
      expect(insight).toContain('ai.io');
      expect(insight).toContain('$5000');
    });

    it('should return null for non-premium domains', () => {
      const result: DomainResult = {
        domain: 'mywebsite.com',
        available: true,
        premium: false,
        price_first_year: 10,
        price_renewal: 12,
        currency: 'USD',
        privacy_included: true,
        transfer_price: null,
        registrar: 'porkbun',
        source: 'porkbun_api',
        checked_at: new Date().toISOString(),
      };

      const insight = generatePremiumInsight(result);
      expect(insight).toBeNull();
    });

    it('should return null for unavailable domains', () => {
      const result: DomainResult = {
        domain: 'google.com',
        available: false,
        premium: true,
        price_first_year: null,
        price_renewal: null,
        currency: 'USD',
        privacy_included: false,
        transfer_price: null,
        registrar: 'rdap',
        source: 'rdap',
        checked_at: new Date().toISOString(),
      };

      const insight = generatePremiumInsight(result);
      expect(insight).toBeNull();
    });
  });

  describe('suggestPremiumAlternatives', () => {
    it('should suggest alternatives for premium domain', () => {
      const alternatives = suggestPremiumAlternatives('app.io');
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives.length).toBeLessThanOrEqual(3);
    });

    it('should include prefix variations', () => {
      const alternatives = suggestPremiumAlternatives('cloud.com');
      const hasPrefix = alternatives.some(a =>
        a.startsWith('get') || a.startsWith('try') || a.startsWith('use') ||
        a.startsWith('my') || a.startsWith('the') || a.startsWith('go')
      );
      expect(hasPrefix).toBe(true);
    });

    it('should include suffix variations', () => {
      const alternatives = suggestPremiumAlternatives('tech.io');
      const hasSuffix = alternatives.some(a =>
        a.includes('app') || a.includes('hq') || a.includes('io') ||
        a.includes('now') || a.includes('hub') || a.includes('labs')
      );
      expect(hasSuffix).toBe(true);
    });
  });

  describe('calculateDomainScore', () => {
    it('should return 0 for unavailable domains', () => {
      const result: DomainResult = {
        domain: 'taken.com',
        available: false,
        premium: false,
        price_first_year: null,
        price_renewal: null,
        currency: 'USD',
        privacy_included: false,
        transfer_price: null,
        registrar: 'rdap',
        source: 'rdap',
        checked_at: new Date().toISOString(),
      };

      expect(calculateDomainScore(result)).toBe(0);
    });

    it('should give higher score for domains with privacy', () => {
      const withPrivacy: DomainResult = {
        domain: 'test.com',
        available: true,
        premium: false,
        price_first_year: 10,
        price_renewal: 12,
        currency: 'USD',
        privacy_included: true,
        transfer_price: null,
        registrar: 'porkbun',
        source: 'porkbun_api',
        checked_at: new Date().toISOString(),
      };

      const withoutPrivacy: DomainResult = {
        ...withPrivacy,
        privacy_included: false,
      };

      expect(calculateDomainScore(withPrivacy)).toBeGreaterThan(calculateDomainScore(withoutPrivacy));
    });

    it('should penalize premium domains', () => {
      const nonPremium: DomainResult = {
        domain: 'test.com',
        available: true,
        premium: false,
        price_first_year: 10,
        price_renewal: 12,
        currency: 'USD',
        privacy_included: false,
        transfer_price: null,
        registrar: 'porkbun',
        source: 'porkbun_api',
        checked_at: new Date().toISOString(),
      };

      const premium: DomainResult = {
        ...nonPremium,
        premium: true,
      };

      expect(calculateDomainScore(nonPremium)).toBeGreaterThan(calculateDomainScore(premium));
    });

    it('should return score between 0 and 10', () => {
      const result: DomainResult = {
        domain: 'mybrand.io',
        available: true,
        premium: false,
        price_first_year: 40,
        price_renewal: 50,
        currency: 'USD',
        privacy_included: true,
        transfer_price: null,
        registrar: 'porkbun',
        source: 'porkbun_api',
        checked_at: new Date().toISOString(),
      };

      const score = calculateDomainScore(result);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });
  });

  describe('generatePremiumSummary', () => {
    it('should return empty array when no premium domains', () => {
      const results: DomainResult[] = [
        {
          domain: 'mybrand.com',
          available: true,
          premium: false,
          price_first_year: 10,
          price_renewal: 12,
          currency: 'USD',
          privacy_included: true,
          transfer_price: null,
          registrar: 'porkbun',
          source: 'porkbun_api',
          checked_at: new Date().toISOString(),
        },
      ];

      const summary = generatePremiumSummary(results);
      expect(summary).toEqual([]);
    });

    it('should generate summary for premium domains', () => {
      const results: DomainResult[] = [
        {
          domain: 'ai.io',
          available: true,
          premium: true,
          price_first_year: 5000,
          price_renewal: 500,
          currency: 'USD',
          privacy_included: false,
          transfer_price: null,
          registrar: 'porkbun',
          source: 'porkbun_api',
          checked_at: new Date().toISOString(),
        },
      ];

      const summary = generatePremiumSummary(results);
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should suggest alternatives when all available domains are premium', () => {
      const results: DomainResult[] = [
        {
          domain: 'cloud.io',
          available: true,
          premium: true,
          price_first_year: 2000,
          price_renewal: 200,
          currency: 'USD',
          privacy_included: false,
          transfer_price: null,
          registrar: 'porkbun',
          source: 'porkbun_api',
          checked_at: new Date().toISOString(),
        },
        {
          domain: 'cloud.com',
          available: false,
          premium: false,
          price_first_year: null,
          price_renewal: null,
          currency: 'USD',
          privacy_included: false,
          transfer_price: null,
          registrar: 'rdap',
          source: 'rdap',
          checked_at: new Date().toISOString(),
        },
      ];

      const summary = generatePremiumSummary(results);
      const hasSuggestion = summary.some(s => s.includes('Try:'));
      expect(hasSuggestion).toBe(true);
    });
  });
});
