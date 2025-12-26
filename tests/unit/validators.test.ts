/**
 * Unit Tests for Domain Validators.
 */

import {
  validateDomainName,
  validateTld,
  validateTlds,
  parseDomain,
  isFullDomain,
  buildDomain,
} from '../../src/utils/validators';
import { InvalidDomainError, UnsupportedTldError } from '../../src/utils/errors';

describe('validateDomainName', () => {
  it('should accept valid domain names', () => {
    expect(validateDomainName('vibecoding')).toBe('vibecoding');
    expect(validateDomainName('my-app')).toBe('my-app');
    expect(validateDomainName('test123')).toBe('test123');
    expect(validateDomainName('a')).toBe('a');
  });

  it('should normalize to lowercase', () => {
    expect(validateDomainName('VibeCoding')).toBe('vibecoding');
    expect(validateDomainName('MyApp')).toBe('myapp');
  });

  it('should trim whitespace', () => {
    expect(validateDomainName('  vibecoding  ')).toBe('vibecoding');
  });

  it('should reject empty names', () => {
    expect(() => validateDomainName('')).toThrow(InvalidDomainError);
    expect(() => validateDomainName('   ')).toThrow(InvalidDomainError);
  });

  it('should reject names starting with hyphen', () => {
    expect(() => validateDomainName('-invalid')).toThrow(InvalidDomainError);
  });

  it('should reject names ending with hyphen', () => {
    expect(() => validateDomainName('invalid-')).toThrow(InvalidDomainError);
  });

  it('should reject names with invalid characters', () => {
    expect(() => validateDomainName('my_app')).toThrow(InvalidDomainError);
    expect(() => validateDomainName('my.app')).toThrow(InvalidDomainError);
    expect(() => validateDomainName('my app')).toThrow(InvalidDomainError);
    expect(() => validateDomainName('my@app')).toThrow(InvalidDomainError);
  });

  it('should reject names that are too long', () => {
    const longName = 'a'.repeat(64);
    expect(() => validateDomainName(longName)).toThrow(InvalidDomainError);
  });

  it('should accept maximum length names', () => {
    const maxName = 'a'.repeat(63);
    expect(validateDomainName(maxName)).toBe(maxName);
  });
});

describe('validateTld', () => {
  it('should accept valid TLDs', () => {
    expect(validateTld('com')).toBe('com');
    expect(validateTld('io')).toBe('io');
    expect(validateTld('dev')).toBe('dev');
  });

  it('should normalize to lowercase', () => {
    expect(validateTld('COM')).toBe('com');
    expect(validateTld('IO')).toBe('io');
  });

  it('should remove leading dot', () => {
    expect(validateTld('.com')).toBe('com');
    expect(validateTld('.io')).toBe('io');
  });

  it('should reject empty TLDs', () => {
    expect(() => validateTld('')).toThrow(UnsupportedTldError);
  });

  it('should reject denied TLDs', () => {
    expect(() => validateTld('localhost')).toThrow(UnsupportedTldError);
    expect(() => validateTld('internal')).toThrow(UnsupportedTldError);
  });
});

describe('validateTlds', () => {
  it('should return defaults for empty array', () => {
    expect(validateTlds([])).toEqual(['com', 'io', 'dev']);
  });

  it('should validate and normalize array of TLDs', () => {
    expect(validateTlds(['com', 'IO', '.dev'])).toEqual(['com', 'io', 'dev']);
  });
});

describe('parseDomain', () => {
  it('should parse full domain names', () => {
    expect(parseDomain('vibecoding.com')).toEqual({
      name: 'vibecoding',
      tld: 'com',
    });
    expect(parseDomain('my-app.io')).toEqual({
      name: 'my-app',
      tld: 'io',
    });
  });

  it('should normalize the parsed result', () => {
    expect(parseDomain('VibeCoding.COM')).toEqual({
      name: 'vibecoding',
      tld: 'com',
    });
  });

  it('should reject domains without TLD', () => {
    expect(() => parseDomain('vibecoding')).toThrow(InvalidDomainError);
  });
});

describe('isFullDomain', () => {
  it('should detect full domains', () => {
    expect(isFullDomain('vibecoding.com')).toBe(true);
    expect(isFullDomain('my-app.io')).toBe(true);
  });

  it('should detect partial domains', () => {
    expect(isFullDomain('vibecoding')).toBe(false);
    expect(isFullDomain('myapp')).toBe(false);
  });
});

describe('buildDomain', () => {
  it('should build full domain from parts', () => {
    expect(buildDomain('vibecoding', 'com')).toBe('vibecoding.com');
    expect(buildDomain('my-app', 'io')).toBe('my-app.io');
  });

  it('should validate parts during build', () => {
    expect(() => buildDomain('-invalid', 'com')).toThrow(InvalidDomainError);
    expect(() => buildDomain('valid', 'localhost')).toThrow(UnsupportedTldError);
  });
});
