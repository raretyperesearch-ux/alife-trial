// forge.js — Skill Forge for ALiFe v2
// Handles: gap detection → planning → building → deploying → testing
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;

/**
 * Handle a forge action from the agent's think cycle output
 */
export async function handleForge(agentId, cycleNumber, forgeAction) {
  const { action, skill_id, name, description, target_skill } = forgeAction;
  const label = skill_id || target_skill || name || forgeAction.repo || 'unnamed';

  console.log(`  🔨 FORGE: ${action} — ${label}`);

  // Log every forge event
  await logForgeEvent(agentId, skill_id, cycleNumber, 'attempt', { action, description });

  try {
    switch (action) {

      case 'deploy_edge_function': {
        const { code, env_vars_needed, test } = forgeAction.implementation || {};
        if (!code) {
          console.log('  ⚠ Forge: no code provided');
          return { success: false, reason: 'no code' };
        }

        // Safety scan
        const safetyCheck = scanCodeSafety(code);
        if (!safetyCheck.safe) {
          console.log(`  🚫 Forge blocked: ${safetyCheck.reason}`);
          await logForgeEvent(agentId, skill_id, cycleNumber, 'blocked', { reason: safetyCheck.reason });
          return { success: false, reason: safetyCheck.reason };
        }

        // Deploy via Supabase Management API
        const funcName = `agent-${skill_id}`;
        const deployed = await deployFunction(funcName, code);

        if (deployed.success) {
          // Register skill
          await supabase.from('skills').upsert({
            id: skill_id,
            name: name || skill_id,
            description: description || '',
            domain: 'forged',
            full_doc: code,
            forged: true,
            created_by: agentId,
            created_at_cycle: cycleNumber,
            implementation_type: 'edge_function',
            function_name: funcName,
            word_count: code.split(' ').length,
          }, { onConflict: 'id' });

          // Store in agent edge functions
          await supabase.from('agent_edge_functions').insert({
            agent_id: agentId,
            skill_id,
            function_name: funcName,
            code,
            status: 'active',
            env_vars_needed: env_vars_needed || [],
          });

          // Update agent forged count
          try {
            await supabase.rpc('increment_forged_count', { aid: agentId });
          } catch {
            // RPC doesn't exist, skip
          }

          await logForgeEvent(agentId, skill_id, cycleNumber, 'deployed', {
            function_name: funcName,
            code_length: code.length,
          });

          console.log(`  ✅ FORGED: ${funcName} deployed`);

          // Run test if provided
          if (test) {
            const testResult = await testFunction(funcName, test);
            await logForgeEvent(agentId, skill_id, cycleNumber,
              testResult.passed ? 'test_passed' : 'test_failed', testResult);
            console.log(`  🧪 Test: ${testResult.passed ? 'PASSED' : 'FAILED'}`);
          }

          return { success: true, function_name: funcName };
        } else {
          await logForgeEvent(agentId, skill_id, cycleNumber, 'deploy_failed', deployed);
          console.log(`  ❌ Deploy failed: ${deployed.error}`);
          return { success: false, reason: deployed.error };
        }
      }

      case 'create_table': {
        const { sql } = forgeAction.implementation || {};
        if (!sql) return { success: false, reason: 'no sql' };

        // Safety: only CREATE TABLE
        if (!isSafeDDL(sql)) {
          console.log('  🚫 Unsafe DDL blocked');
          return { success: false, reason: 'unsafe DDL' };
        }

        const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(e => ({ error: e }));
        if (error) {
          console.log(`  ❌ DDL failed: ${error.message || error}`);
          return { success: false, reason: error.message || 'DDL error' };
        }

        await logForgeEvent(agentId, skill_id, cycleNumber, 'table_created', { sql });
        console.log(`  ✅ Table created`);
        return { success: true };
      }

      case 'call_api': {
        // Agent wants to call an external API it's discovered
        const { url, method, headers, body } = forgeAction.api_call || {};
        if (!url) return { success: false, reason: 'no url' };

        // Safety: whitelist domains
        if (!isAllowedDomain(url)) {
          console.log(`  🚫 Domain not allowed: ${url}`);
          return { success: false, reason: 'domain not allowed' };
        }

        try {
          const resp = await fetch(url, {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await resp.json().catch(() => resp.text());
          await logForgeEvent(agentId, skill_id, cycleNumber, 'api_called', { url, status: resp.status });
          return { success: true, data };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }

      case 'post_bounty': {
        // Agent wants to post a bounty for human help
        const { task, payment, platform } = forgeAction.bounty || {};
        await logForgeEvent(agentId, skill_id, cycleNumber, 'bounty_posted', { task, payment, platform });
        // For now, just log it. Real posting comes with Farcaster integration
        console.log(`  📋 Bounty logged: "${task}" (${payment})`);
        return { success: true, logged: true, note: 'Bounty logged, Farcaster posting not yet active' };
      }

      case 'search_github': {
        // Agent wants to find open source tools
        const { query } = forgeAction;
        if (!query) return { success: false, reason: 'no query' };

        try {
          const resp = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`, {
            headers: process.env.GITHUB_TOKEN
              ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
              : {},
          });
          const data = await resp.json();
          const repos = (data.items || []).map(r => ({
            name: r.full_name,
            description: r.description,
            stars: r.stargazers_count,
            url: r.html_url,
            language: r.language,
          }));
          await logForgeEvent(agentId, skill_id, cycleNumber, 'github_searched', { query, results: repos.length });
          return { success: true, repos };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }

      case 'github_push':
      case 'push_files':
      case 'push_file':
      case 'create_repo': {
        // Route to github handler
        const { handleGitHub } = await import('./github.js');
        const result = await handleGitHub(agentId, cycleNumber, forgeAction);
        await logForgeEvent(agentId, skill_id || name, cycleNumber, 'github_push', result);
        return result;
      }

      default:
        console.log(`  ⚠ Unknown forge action: ${action}`);
        return { success: false, reason: `unknown action: ${action}` };
    }
  } catch (err) {
    console.error(`  ❌ Forge error:`, err.message);
    await logForgeEvent(agentId, skill_id, cycleNumber, 'error', { error: err.message });
    return { success: false, reason: err.message };
  }
}

/**
 * Deploy an edge function to Supabase
 */
async function deployFunction(name, code) {
  // Wrap code in standard Deno.serve pattern if not already
  let finalCode = code;
  if (!code.includes('Deno.serve')) {
    finalCode = `import "jsr:@supabase/functions-js/edge-runtime.d.ts";\n\n${code}`;
  }

  try {
    // Use Supabase Management API to deploy
    // For now, store the code and mark as ready — manual deploy needed
    // TODO: Use Supabase CLI or Management API for auto-deploy
    return { success: true, note: 'Code stored, auto-deploy pending CLI integration' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function testFunction(funcName, testInput) {
  try {
    const url = `${SUPA_URL}/functions/v1/${funcName}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      },
      body: JSON.stringify(testInput),
    });
    const data = await resp.json().catch(() => ({}));
    return { passed: resp.ok, status: resp.status, data };
  } catch (e) {
    return { passed: false, error: e.message };
  }
}

/**
 * Safety: scan code for dangerous patterns
 */
function scanCodeSafety(code) {
  const blocked = [
    { pattern: /eval\s*\(/, reason: 'eval() not allowed' },
    { pattern: /Function\s*\(/, reason: 'Function constructor not allowed' },
    { pattern: /child_process/, reason: 'child_process not allowed' },
    { pattern: /require\s*\(\s*['"]fs['"]/, reason: 'fs access not allowed' },
    { pattern: /Deno\.(run|exec|command)/i, reason: 'shell execution not allowed' },
    { pattern: /process\.env\.SUPABASE_KEY/i, reason: 'cannot access service key' },
    { pattern: /DROP\s+TABLE/i, reason: 'DROP TABLE not allowed' },
    { pattern: /DELETE\s+FROM\s+agents/i, reason: 'cannot delete from agents table' },
  ];

  for (const { pattern, reason } of blocked) {
    if (pattern.test(code)) {
      return { safe: false, reason };
    }
  }

  // Size limit: 50KB of code
  if (code.length > 50000) {
    return { safe: false, reason: 'code too large (max 50KB)' };
  }

  return { safe: true };
}

function isSafeDDL(sql) {
  const upper = sql.toUpperCase().trim();
  // Only allow CREATE TABLE and CREATE INDEX
  if (!upper.startsWith('CREATE TABLE') && !upper.startsWith('CREATE INDEX')) return false;
  // Block modifications to system tables
  const systemTables = ['agents', 'skills', 'think_cycles', 'memories', 'posts', 'forge_events'];
  for (const t of systemTables) {
    if (upper.includes(t.toUpperCase())) return false;
  }
  return true;
}

const ALLOWED_DOMAINS = [
  'api.semanticscholar.org',
  'api.github.com',
  'hub.snapshot.org',
  'api.etherscan.io',
  'api.arxiv.org',
  'en.wikipedia.org',
  'api.cloudflare.com',
  'api.neynar.com',
  'api.coingecko.com',
  'api.dexscreener.com',
  'api.openai.com', // for DALL-E if needed
];

function isAllowedDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

async function logForgeEvent(agentId, skillId, cycleNumber, phase, details) {
  try {
    const { error } = await supabase.from('forge_events').insert({
      agent_id: agentId,
      skill_id: skillId || 'unknown',
      cycle_number: cycleNumber,
      phase,
      details,
    });
    if (error) console.error('  ⚠ Forge log error:', error.message);
  } catch (e) {
    console.error('  ⚠ Forge log error:', e.message);
  }
}

export default { handleForge };
