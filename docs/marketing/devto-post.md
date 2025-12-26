---
title: I Built an MCP Server to Check Domain Availability from Claude
published: true
description: How I stopped context-switching between AI and domain registrars
tags: ai, typescript, opensource, webdev
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/placeholder.png
---

# I Built an MCP Server to Check Domain Availability from Claude

Last week, I was brainstorming names for a new side project with Claude. Every time I came up with a name, I had to:

1. Leave Claude
2. Open Namecheap/Porkbun
3. Search the domain
4. Go back to Claude
5. Report the result
6. Repeat 50 times

This was frustrating. So I built a solution.

## Introducing Domain Search MCP

[Domain Search MCP](https://github.com/dorukardahan/domain-search-mcp) is an open-source MCP server that gives Claude the ability to check domain availability in real-time.

Now my workflow is:

> **Me:** "Is vibecoding.com available?"
> **Claude:** "✅ vibecoding.com is available at $9.73/year on Porkbun (includes free WHOIS privacy)"

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is Anthropic's open standard for connecting AI assistants to external tools and data sources. Think of it as USB-C for AI – a universal way to plug in capabilities.

## Features

### 1. Multi-Source Search
Checks domain availability across:
- **Porkbun** (with pricing)
- **Namecheap** (with pricing)
- **RDAP** (free, 50+ TLDs)
- **WHOIS** (fallback)

### 2. Sherlock-Style Social Check
```
check_socials("vibecoding")
```
Returns availability across 10 platforms:
- HIGH confidence: GitHub, npm, PyPI, Reddit
- MEDIUM confidence: Twitter, YouTube, ProductHunt
- LOW confidence: Instagram, LinkedIn, TikTok

### 3. Premium Domain Analysis
When a domain is premium, you get insights:
```
💎 ai.io is priced at $5000 (125x standard .io pricing)
Why premium: Two-character domain, Popular keyword "ai", High-demand .io extension
💡 Try: getai.io, aihq.io, ai.dev
```

### 4. Expiration Tracking
For taken domains, see when they expire:
```
🕐 coolstartup.com expires in 23 days — watch for availability
```

## Quick Start

```bash
# Add to Claude Desktop
npx @anthropic/claude-code mcp add domain-search-mcp
```

Or manually add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "domain-search": {
      "command": "npx",
      "args": ["-y", "domain-search-mcp"]
    }
  }
}
```

## Zero Config Mode

Works out of the box using public RDAP/WHOIS. Add registrar API keys for pricing:

```bash
PORKBUN_API_KEY=pk1_xxx
PORKBUN_API_SECRET=sk1_xxx
```

## Technical Highlights

- **TypeScript** with strict types
- **Zod validation** for all API responses
- **98 tests** passing
- **LRU cache** with TTL
- **Rate limiting** per registrar
- **Security audited** (see SECURITY.md)

## Architecture

```
┌─────────────────────────────────────────┐
│           MCP Protocol Layer            │
│        (Zod schema validation)          │
├─────────────────────────────────────────┤
│              6 Tools                    │
│  search_domain, bulk_search, compare,   │
│  suggest, tld_info, check_socials       │
├─────────────────────────────────────────┤
│         Registrar Adapters              │
│   Porkbun │ Namecheap │ RDAP │ WHOIS    │
└─────────────────────────────────────────┘
```

## What's Next?

I'm considering adding:
- DNS record checking
- SSL certificate info
- Trademark search integration

What features would you find useful? Drop a comment!

---

**GitHub:** https://github.com/dorukardahan/domain-search-mcp
**License:** MIT

If this helped you, consider giving it a ⭐ on GitHub!
