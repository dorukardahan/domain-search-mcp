# Common Workflows

Practical examples for common domain search scenarios.

## Brand Validation Pipeline

Check domain and social media availability together:

```typescript
async function validateBrand(name: string) {
  // Run domain and social checks in parallel
  const [domains, socials] = await Promise.allSettled([
    searchDomain({ domain_name: name, tlds: ["com", "io", "dev"] }),
    checkSocials({ name, platforms: ["github", "twitter"] })
  ]);

  const domainResults = domains.status === "fulfilled" ? domains.value.results : [];
  const socialResults = socials.status === "fulfilled" ? socials.value.results : [];

  const availableDomains = domainResults.filter(d => d.available);
  const availableSocials = socialResults.filter(s => s.available);

  return {
    brandName: name,
    domains: {
      available: availableDomains.length,
      bestOption: availableDomains[0]?.domain
    },
    socials: {
      available: availableSocials.length,
      platforms: availableSocials.map(s => s.platform)
    },
    fullyAvailable: availableDomains.length > 0 && availableSocials.length === socialResults.length
  };
}

const result = await validateBrand("techstartup");
// { brandName: "techstartup", domains: { available: 2 }, socials: { available: 2 }, fullyAvailable: true }
```

## Finding Alternatives

When your preferred domain is taken:

```typescript
async function findAlternatives(name: string) {
  // Check if original is available
  const check = await searchDomain({ domain_name: name, tlds: ["com"] });

  if (check.results[0].available) {
    return { available: true, domain: check.results[0] };
  }

  // Generate alternatives
  const suggestions = await suggestDomains({
    base_name: name,
    tld: "com",
    max_suggestions: 10,
    variants: ["prefixes", "suffixes", "hyphen"]
  });

  return {
    available: false,
    originalDomain: `${name}.com`,
    alternatives: suggestions.suggestions,
    bestPick: suggestions.suggestions[0]
  };
}

const result = await findAlternatives("techapp");
// { available: false, alternatives: [{ domain: "gettechapp.com", price: 8.95 }, ...] }
```

## Bulk Domain Research

Check multiple domains with TLD comparison:

```typescript
async function researchDomains(names: string[]) {
  const results = [];

  for (const name of names) {
    const result = await searchDomain({
      domain_name: name,
      tlds: ["com", "io", "dev"]
    });

    const available = result.results.filter(r => r.available);

    results.push({
      name,
      availableCount: available.length,
      cheapest: available.sort((a, b) =>
        (a.price_first_year || 999) - (b.price_first_year || 999)
      )[0]
    });
  }

  return results.sort((a, b) => b.availableCount - a.availableCount);
}

const result = await researchDomains(["startup1", "startup2", "startup3"]);
// Sorted by most available TLDs
```

## Price Comparison

Find the cheapest registrar:

```typescript
async function findCheapest(name: string, tld: string) {
  const comparison = await compareRegistrars({ domain: name, tld });

  const available = comparison.comparisons
    .filter(c => c.available && c.price_first_year)
    .sort((a, b) => a.price_first_year - b.price_first_year);

  if (available.length === 0) {
    return { available: false };
  }

  return {
    available: true,
    cheapest: available[0],
    savings: available.length > 1
      ? available[available.length - 1].price_first_year - available[0].price_first_year
      : 0
  };
}

const result = await findCheapest("myproject", "com");
// { cheapest: { registrar: "porkbun", price: 8.95 }, savings: 3.04 }
```

## Rate Limit Handling

Handle rate limits gracefully:

```typescript
async function searchWithRetry(name: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await searchDomain({ domain_name: name, tlds: ["com"] });
    } catch (error) {
      if (error.code === "RATE_LIMIT" && error.retryable) {
        const delay = (error.retryAfter || 30) * 1000;
        console.log(`Rate limited. Waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}
```

## AI-Powered Naming

Generate creative names from a description:

```typescript
async function generateBrandNames(description: string) {
  const suggestions = await suggestDomainsSmart({
    query: description,
    tld: "com",
    style: "brandable",
    max_suggestions: 10,
    include_premium: false
  });

  // Also check social availability for top picks
  const topPicks = suggestions.suggestions.slice(0, 3);

  const validated = await Promise.all(
    topPicks.map(async (s) => {
      const name = s.domain.replace(".com", "");
      const socials = await checkSocials({
        name,
        platforms: ["github", "twitter"]
      });
      return {
        domain: s.domain,
        price: s.price_first_year,
        socialsAvailable: socials.results.filter(r => r.available).length
      };
    })
  );

  return validated.sort((a, b) => b.socialsAvailable - a.socialsAvailable);
}

const result = await generateBrandNames("ai customer service chatbot");
// [{ domain: "helpbot.com", price: 8.95, socialsAvailable: 2 }, ...]
```
