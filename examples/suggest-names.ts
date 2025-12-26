/**
 * Example: Domain Name Suggestions
 *
 * This example demonstrates getting available domain variations
 * when your preferred domain name is taken.
 */

import { suggestDomains } from '../src/services/domain-search.js';

async function main() {
  console.log('Domain Search MCP - Domain Suggestions Example\n');
  console.log('===============================================\n');

  const baseNames = ['vibecoding', 'coolapp', 'techstart'];

  for (const baseName of baseNames) {
    console.log(`\nSuggestions for "${baseName}":`);
    console.log('-'.repeat(40));

    try {
      // Get suggestions for .com
      const result = await suggestDomains(baseName, 'com', 10);

      console.log(`Original: ${baseName}.com`);
      console.log(`Strategy: ${result.strategy}\n`);

      // Display suggestions grouped by type
      const prefixed = result.suggestions.filter((s) =>
        s.domain.startsWith('get') ||
        s.domain.startsWith('try') ||
        s.domain.startsWith('use') ||
        s.domain.startsWith('my')
      );

      const suffixed = result.suggestions.filter((s) =>
        s.domain.includes('app') ||
        s.domain.includes('hq') ||
        s.domain.includes('io') ||
        s.domain.includes('now')
      );

      const others = result.suggestions.filter(
        (s) => !prefixed.includes(s) && !suffixed.includes(s),
      );

      if (prefixed.length > 0) {
        console.log('With Prefix:');
        for (const s of prefixed.slice(0, 3)) {
          const price = s.price_first_year
            ? `$${s.price_first_year}/year`
            : 'Price unknown';
          const status = s.available ? 'Available' : 'Taken';
          console.log(`  ${s.domain} - ${status} - ${price}`);
        }
      }

      if (suffixed.length > 0) {
        console.log('\nWith Suffix:');
        for (const s of suffixed.slice(0, 3)) {
          const price = s.price_first_year
            ? `$${s.price_first_year}/year`
            : 'Price unknown';
          const status = s.available ? 'Available' : 'Taken';
          console.log(`  ${s.domain} - ${status} - ${price}`);
        }
      }

      if (others.length > 0) {
        console.log('\nOther Variations:');
        for (const s of others.slice(0, 3)) {
          const price = s.price_first_year
            ? `$${s.price_first_year}/year`
            : 'Price unknown';
          const status = s.available ? 'Available' : 'Taken';
          console.log(`  ${s.domain} - ${status} - ${price}`);
        }
      }

      // Summary
      const availableCount = result.suggestions.filter((s) => s.available).length;
      console.log(`\nFound ${availableCount} available out of ${result.suggestions.length} checked`);

      // Insights
      if (result.insights.length > 0) {
        console.log('\nInsights:');
        for (const insight of result.insights) {
          console.log(`  ${insight}`);
        }
      }

      // Next steps
      if (result.next_steps.length > 0) {
        console.log('\nNext Steps:');
        for (const step of result.next_steps) {
          console.log(`  - ${step}`);
        }
      }
    } catch (error) {
      console.error(
        `Error getting suggestions for ${baseName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log('Suggestions complete!');
}

main();
