/**
 * Example: Compare Registrar Pricing
 *
 * This example demonstrates comparing prices across different
 * registrars to find the best deal for a domain.
 */

import { compareRegistrars } from '../src/services/domain-search.js';

async function main() {
  console.log('Domain Search MCP - Compare Registrars Example\n');
  console.log('===============================================\n');

  const domains = [
    { name: 'vibecoding', tld: 'com' },
    { name: 'myawesomeapp', tld: 'io' },
    { name: 'coolstartup', tld: 'dev' },
  ];

  for (const { name, tld } of domains) {
    console.log(`\nComparing prices for ${name}.${tld}:`);
    console.log('-'.repeat(40));

    try {
      const result = await compareRegistrars(name, tld);

      // Show what happened
      console.log(`Status: ${result.what_happened}`);

      // Display prices from each registrar
      console.log('\nPrices by Registrar:');
      for (const price of result.prices) {
        const firstYear = price.price_first_year
          ? `$${price.price_first_year}`
          : 'N/A';
        const renewal = price.price_renewal ? `$${price.price_renewal}` : 'N/A';
        const privacy = price.privacy_included ? '(privacy included)' : '';

        console.log(`  ${price.registrar}:`);
        console.log(`    First year: ${firstYear} ${privacy}`);
        console.log(`    Renewal: ${renewal}`);
      }

      // Show best options
      if (result.best_first_year) {
        console.log(
          `\n Best first year: ${result.best_first_year.registrar} at $${result.best_first_year.price}`,
        );
      }
      if (result.best_renewal) {
        console.log(
          ` Best renewal: ${result.best_renewal.registrar} at $${result.best_renewal.price}`,
        );
      }

      // Show recommendation
      console.log(`\nRecommendation: ${result.recommendation}`);

      // Show insights
      if (result.insights.length > 0) {
        console.log('\nInsights:');
        for (const insight of result.insights) {
          console.log(`  ${insight}`);
        }
      }
    } catch (error) {
      console.error(
        `Error checking ${name}.${tld}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log('Comparison complete!');
}

main();
