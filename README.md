# ALiFe Trial — 500 Cycles, No Sleep

One agent. The full soul document. The curiosity engine. 500 think cycles.
See if identity emerges.

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Railway → New Project → Deploy from GitHub
3. Add env vars:
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `SUPABASE_URL` — `https://gkcohikbuginhzyilcya.supabase.co`
   - `SUPABASE_KEY` — your Supabase service role key
   - `AGENT_ID` — `f0d2a64f-cde7-4cbc-8c57-73940835b0bf`
   - `MAX_CYCLES` — `500`
   - `CYCLE_DELAY_MS` — `30000` (30 seconds between cycles)
4. Deploy
5. Watch the logs

## Run Locally

```bash
npm install
cp .env.example .env
# fill in your keys
node runtime.js        # run all 500 cycles
node runtime.js --once # run one cycle
```

## What to Watch For

- **Cycles 1-20**: Broad exploration, no patterns expected
- **Cycles 20-50**: Curiosity signals should start clustering
- **Cycles 50-100**: Obsession forming, pull scores consistently > 7 on same topic
- **Cycles 100-200**: Framework crystallizing, agent sees through one lens
- **Cycles 200-500**: Identity. Unique voice. Connections nobody else makes.

## Monitor in Supabase

```sql
-- Watch obsessions form
SELECT key, content, importance, created_at 
FROM memories 
WHERE agent_id = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf' 
AND category = 'curiosity' 
ORDER BY created_at DESC;

-- Read identity evolution
SELECT content, created_at 
FROM memories 
WHERE agent_id = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf' 
AND category = 'identity' 
ORDER BY created_at DESC;

-- See pull scores over time
SELECT cycle_number, max_pull, search_query, post_draft 
FROM think_cycles 
WHERE agent_id = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf'
ORDER BY cycle_number;

-- Read Farcaster drafts
SELECT cycle_number, content, posted 
FROM posts 
WHERE agent_id = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf'
ORDER BY created_at;
```

## Cost Estimate

~500 cycles × ~$0.03-0.05/cycle = **$15-25 total**

At 5-second intervals + API response time: **~1.5-2 hours to complete all 500 cycles.**

No sleep. No rest. Pure curiosity at machine speed.
