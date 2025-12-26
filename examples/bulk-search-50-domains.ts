/**
 * Example: Bulk Search 50 Domains
 *
 * This example demonstrates the bulk_search tool for checking
 * many domains at once efficiently.
 */

import { bulkSearch } from '../src/services/domain-search.js';

// Sample domain names to check
const DOMAIN_NAMES = [
  'vibecoding',
  'codevibes',
  'devmagic',
  'buildfast',
  'shipit',
  'hackflow',
  'codealchemy',
  'pixelperfect',
  'bytesize',
  'stackflow',
  'gitflow',
  'deployfast',
  'cloudnine',
  'serverless',
  'microstack',
  'apicraft',
  'dataflow',
  'mlops',
  'aicraft',
  'neuralnet',
  'tensorflow',
  'deeplearn',
  'automate',
  'botcraft',
  'chatops',
  'devtools',
  'codebase',
  'repocraft',
  'gitmagic',
  'versionctl',
  'cicdpipe',
  'testcraft',
  'debugflow',
  'logstream',
  'metrics',
  'dashcraft',
  'uimagic',
  'csscraft',
  'reactflow',
  'vuemagic',
  'sveltekit',
  'nextcraft',
  'nuxtmagic',
  'astrosite',
  'remixapp',
  'solidstart',
  'qwiksite',
  'htmxcraft',
  'alpinejs',
  'tailwindui',
];

async function main() {
  console.log('Domain Search MCP - Bulk Search Example\n');
  console.log('=======================================\n');

  console.log(`Checking ${DOMAIN_NAMES.length} domains across .io TLD...\n`);

  try {
    const startTime = Date.now();
    const result = await bulkSearch(DOMAIN_NAMES, 'io');
    const duration = Date.now() - startTime;

    // Display summary
    console.log('Summary:');
    console.log('--------');
    console.log(`Total checked: ${result.summary.total}`);
    console.log(`Available: ${result.summary.available}`);
    console.log(`Taken: ${result.summary.taken}`);
    console.log(`Errors: ${result.summary.errors}`);
    console.log(`Duration: ${duration}ms\n`);

    // Display available domains
    const available = result.results.filter((r) => r.available);
    if (available.length > 0) {
      console.log('Available Domains:');
      console.log('------------------');
      for (const domain of available.slice(0, 10)) {
        const price = domain.price_first_year
          ? `$${domain.price_first_year}/year`
          : 'Price unknown';
        console.log(`  ${domain.domain} - ${price}`);
      }
      if (available.length > 10) {
        console.log(`  ... and ${available.length - 10} more`);
      }
    }

    // Display taken domains
    const taken = result.results.filter((r) => !r.available && !r.error);
    if (taken.length > 0) {
      console.log('\nTaken Domains:');
      console.log('--------------');
      for (const domain of taken.slice(0, 5)) {
        console.log(`  ${domain.domain}`);
      }
      if (taken.length > 5) {
        console.log(`  ... and ${taken.length - 5} more`);
      }
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
      console.log(`- ${step}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main();
