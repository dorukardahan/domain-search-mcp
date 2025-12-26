/**
 * Example: Interactive CLI
 *
 * This example demonstrates an interactive command-line interface
 * for domain searching using readline.
 */

import * as readline from 'readline';
import {
  searchDomain,
  bulkSearch,
  compareRegistrars,
  suggestDomains,
  getTldInfo,
  checkSocials,
} from '../src/services/domain-search.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function printHelp() {
  console.log(`
Available Commands:
-------------------
  search <name> [tlds]     - Search domain across TLDs (default: com,io,dev)
  bulk <names> [tld]       - Check multiple names (comma-separated)
  compare <name> <tld>     - Compare registrar prices
  suggest <name> [tld]     - Get available variations
  tld <tld>                - Get TLD information
  socials <name>           - Check social media availability
  help                     - Show this help
  quit                     - Exit

Examples:
  search vibecoding
  search vibecoding com,io,dev,app
  bulk vibecoding,coolapp,mysite io
  compare vibecoding com
  suggest vibecoding com
  tld dev
  socials vibecoding
`);
}

async function handleSearch(args: string[]) {
  const name = args[0];
  const tlds = args[1]?.split(',') || ['com', 'io', 'dev'];

  if (!name) {
    console.log('Usage: search <name> [tlds]');
    return;
  }

  console.log(`\nSearching for ${name} across ${tlds.join(', ')}...\n`);

  try {
    const result = await searchDomain(name, tlds);

    for (const domain of result.results) {
      const status = domain.available ? 'Available' : 'Taken';
      const price = domain.price_first_year
        ? `$${domain.price_first_year}/year`
        : '';
      console.log(`  ${domain.domain}: ${status} ${price}`);
    }

    console.log('\nInsights:');
    for (const insight of result.insights) {
      console.log(`  ${insight}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function handleBulk(args: string[]) {
  const names = args[0]?.split(',') || [];
  const tld = args[1] || 'com';

  if (names.length === 0) {
    console.log('Usage: bulk <names> [tld]');
    return;
  }

  console.log(`\nChecking ${names.length} names for .${tld}...\n`);

  try {
    const result = await bulkSearch(names, tld);

    console.log(`Available: ${result.summary.available}/${result.summary.total}`);

    const available = result.results.filter((r) => r.available);
    if (available.length > 0) {
      console.log('\nAvailable:');
      for (const d of available) {
        const price = d.price_first_year ? `$${d.price_first_year}/year` : '';
        console.log(`  ${d.domain} ${price}`);
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function handleCompare(args: string[]) {
  const name = args[0];
  const tld = args[1] || 'com';

  if (!name) {
    console.log('Usage: compare <name> <tld>');
    return;
  }

  console.log(`\nComparing prices for ${name}.${tld}...\n`);

  try {
    const result = await compareRegistrars(name, tld);

    for (const price of result.prices) {
      const first = price.price_first_year ? `$${price.price_first_year}` : 'N/A';
      console.log(`  ${price.registrar}: ${first}/year`);
    }

    if (result.recommendation) {
      console.log(`\nRecommendation: ${result.recommendation}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function handleSuggest(args: string[]) {
  const name = args[0];
  const tld = args[1] || 'com';

  if (!name) {
    console.log('Usage: suggest <name> [tld]');
    return;
  }

  console.log(`\nGetting suggestions for ${name}.${tld}...\n`);

  try {
    const result = await suggestDomains(name, tld, 10);

    const available = result.suggestions.filter((s) => s.available);
    console.log(`Found ${available.length} available variations:\n`);

    for (const s of available.slice(0, 10)) {
      const price = s.price_first_year ? `$${s.price_first_year}/year` : '';
      console.log(`  ${s.domain} ${price}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function handleTld(args: string[]) {
  const tld = args[0];

  if (!tld) {
    console.log('Usage: tld <tld>');
    return;
  }

  console.log(`\nGetting info for .${tld}...\n`);

  try {
    const result = await getTldInfo(tld);

    console.log(`  TLD: .${result.tld}`);
    console.log(`  Category: ${result.category}`);
    console.log(`  Description: ${result.description}`);
    console.log(`  Popularity: ${result.popularity}`);

    if (result.price_range) {
      console.log(
        `  Price Range: $${result.price_range.min} - $${result.price_range.max}/year`,
      );
    }

    if (result.restrictions.length > 0) {
      console.log(`  Restrictions: ${result.restrictions.join(', ')}`);
    }

    if (result.recommendation) {
      console.log(`\n  Recommendation: ${result.recommendation}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function handleSocials(args: string[]) {
  const name = args[0];

  if (!name) {
    console.log('Usage: socials <name>');
    return;
  }

  console.log(`\nChecking social media for "${name}"...\n`);

  try {
    const result = await checkSocials(name);

    for (const platform of result.results) {
      const status = platform.available ? 'Available' : 'Taken';
      const confidence =
        platform.confidence === 'high'
          ? ''
          : ` (${platform.confidence} confidence)`;
      console.log(`  ${platform.platform}: ${status}${confidence}`);
    }

    console.log('\nInsights:');
    for (const insight of result.insights) {
      console.log(`  ${insight}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('Domain Search MCP - Interactive CLI\n');
  console.log('====================================\n');
  console.log('Type "help" for available commands, "quit" to exit.\n');

  while (true) {
    const input = await prompt('\ndomain> ');

    if (!input) continue;

    const [command, ...args] = input.split(' ');

    switch (command.toLowerCase()) {
      case 'search':
        await handleSearch(args);
        break;
      case 'bulk':
        await handleBulk(args);
        break;
      case 'compare':
        await handleCompare(args);
        break;
      case 'suggest':
        await handleSuggest(args);
        break;
      case 'tld':
        await handleTld(args);
        break;
      case 'socials':
        await handleSocials(args);
        break;
      case 'help':
        printHelp();
        break;
      case 'quit':
      case 'exit':
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
      default:
        console.log(`Unknown command: ${command}. Type "help" for available commands.`);
    }
  }
}

main();
