<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cost limits (owner's rule, Nov 2026)
- Every platform that can bill must have a **hard stop**, not only an alert (a stranger once ran 56M requests at someone's Vercel site: $1K bill). Before adding a paid service, an API key, a plan upgrade or a public endpoint, check that a hard cap exists and record it below; if the platform has none, cap it in code.
- Code: every route that spends money (AI calls, paid APIs, heavy DB writes) needs sign-in plus per-user and total daily caps, enforced on the server and failing closed (no quota answer = refuse). Public endpoints get a per-IP rate limit. Fixed max_tokens / page sizes on every paid call.
- Platform caps the owner sets himself in each dashboard (never type keys or billing data):
  - Vercel Pro: Settings → Billing → Spend Management, amount + "Pause production deployment". Hobby has hard limits.
  - Netlify / Supabase / Cloudflare on Free: hard limits already. Supabase Pro: keep "Spend Cap" on. Cloudflare Workers Paid has no spend cap: keep the code rate limits.
  - Anthropic / OpenAI console: monthly spend limit per workspace. Google Cloud: budgets only alert, so set per-API quotas (e.g. Text-to-Speech characters/day) and restrict API keys.
  - ElevenLabs, RapidAPI, Firecrawl, Exa: prepaid credits, usage-based overage off. GitHub Actions: spending limit $0.
