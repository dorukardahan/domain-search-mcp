/**
 * Example: Search for a Single Domain
 *
 * This example demonstrates the basic usage of the search_domain tool.
 * It checks availability across multiple TLDs and shows pricing.
 */

import { searchDomain } from '../src/services/domain-search.js';

async function main() {
  console.log('Domain Search MCP - Single Domain Example\n');
  console.log('==========================================\n');

  // Search for a domain across default TLDs (com, io, dev)
  console.log('Searching for "vibecoding" across .com, .io, .dev...\n');

  try {
    const result = await searchDomain('vibecoding');

    // Display results
    console.log('Results:');
    console.log('--------');

    for (const domain of result.results) {
      const status = domain.available ? '✅ Available' : '❌ Taken';
      const price = domain.price_first_year
        ? `$${domain.price_first_year}/year`
        : 'Price unknown';
      const privacy = domain.privacy_included ? '(privacy included)' : '';

      console.log(`${domain.domain}: ${status} - ${price} ${privacy}`);
    }

    // Display insights
    console.log('\nInsights:');
    console.log('---------');
    for (const insight of result.insights) {
      console.log(insight);
    }

    // Display next steps
    console.log('\nNext Steps:');
    console.log('-----------');
    for (const step of result.next_steps) {
      console.log(`• ${step}`);
    }

    console.log(`\n(Completed in ${result.duration_ms}ms)`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main();
