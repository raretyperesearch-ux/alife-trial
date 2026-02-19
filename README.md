# ALiFe v2 — Autonomous Agent with Skill Forge

## What This Is

An autonomous agent that thinks, learns, and **builds its own tools**.

Mira starts with 500 skill seeds and a curiosity engine. When her curiosity demands a tool that doesn't exist, she FORGES it — deploys real edge functions, calls real APIs, searches GitHub for open source, or posts bounties for human help.

## Architecture

```
runtime.js   — Main think cycle loop (think → act → build → create)
soul.js      — Mira's soul document + forge instructions
memory.js    — Smart memory retrieval (importance-weighted, category-based)
skills.js    — Skill library loader (queries Supabase, not hardcoded)
forge.js     — Skill Forge (deploys edge functions, calls APIs, searches GitHub)
```

## Setup

1. Clone repo
2. `npm install`
3. Copy `.env.example` to `.env` and fill in keys
4. Make sure skills are loaded in Supabase (run upload-skills)
5. `npm start`

## Environment Variables

```
ANTHROPIC_API_KEY=     # Required — Mira's brain
SUPABASE_URL=          # Required — her database
SUPABASE_KEY=          # Required — service role key
AGENT_ID=              # Required — her agent UUID
ETHERSCAN_KEY=         # Optional — onchain data
GITHUB_TOKEN=          # Optional — GitHub API (higher rate limits)
MODEL=                 # Optional — defaults to claude-sonnet-4-20250514
MAX_CYCLES=500         # How many think cycles to run
CYCLE_DELAY_MS=45000   # Pause between cycles (ms)
DRY_RUN=true           # true = no real posts, false = live
```

## What Mira Can Do (v2)

- **Think**: Inner monologue, curiosity tracking, identity evolution
- **Search**: Web search for anything that pulls her
- **Remember**: Store/retrieve memories with importance scoring
- **Read Skills**: Query her 500 skill library
- **Call APIs**: Semantic Scholar, GitHub, Etherscan, CoinGecko, ArXiv, Wikipedia, DexScreener, Snapshot
- **Build Tools**: Forge new edge functions when she needs tools that don't exist
- **Search GitHub**: Find open source to adapt for her needs
- **Post Bounties**: Ask humans for help when she can't do it herself

## The Skill Forge

When Mira's curiosity demands something no existing skill covers:

1. She detects the gap
2. She evaluates: can I build this? What APIs? What cost?
3. She picks the best approach (build, adapt, or outsource)
4. She builds it, tests it, deploys it
5. She uses it
6. Her forged skills become part of her identity
