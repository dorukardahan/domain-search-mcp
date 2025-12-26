# Reddit Post - r/ClaudeAI

## Title:
```
I built an MCP server that lets Claude check domain availability in real-time
```

## Body:
```
Hey everyone!

I got frustrated with constantly leaving Claude to check if domains were available while brainstorming project names. So I built an MCP server to solve this.

**What it does:**

- Check domain availability + pricing across Porkbun, Namecheap, RDAP, WHOIS
- Compare prices between registrars
- Check social handle availability (GitHub, Twitter, npm, etc.)
- Tell you WHY premium domains are expensive
- Show when taken domains expire

**Example conversation:**

> Me: "Is vibecoding.com available?"
>
> Claude: "✅ vibecoding.com is available!
> - Porkbun: $9.73/year (includes free WHOIS privacy)
> - .io also available at $39.99/year
> - .dev available at $12.00/year
>
> 💡 .com is the classic, universal choice — trusted worldwide"

**Install:**

```bash
npx @anthropic/claude-code mcp add domain-search-mcp
```

**Links:**
- GitHub: https://github.com/dorukardahan/domain-search-mcp
- MIT License, open source
- 98 tests, TypeScript, security audited

Would love to hear your feedback or feature requests!
```

---

## Subreddit options:
1. r/ClaudeAI (primary)
2. r/LocalLLaMA (if they allow MCP posts)
3. r/MachineLearning (Saturday thread)
4. r/SideProject

## Tips:
- Post during US working hours (9 AM - 5 PM EST)
- Respond to every comment
- Don't be too promotional
- Ask for feedback genuinely
