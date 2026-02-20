// forge.js — Skill Forge for ALiFe v2
// Handles: gap detection → planning → building → deploying → testing
// Now with REAL deployment via forge-deployer edge function
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
  await logForgeEvent(agentId, label, cycleNumber, 'attempt', { action, description });

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
          await logForgeEvent(agentId, label, cycleNumber, 'blocked', { reason: safetyCheck.reason });
          return { success: false, reason: safetyCheck.reason };
        }

        // Deploy via forge-deployer edge function (REAL DEPLOYMENT)
        const funcName = `forged-${skill_id}`;
        const deployed = await deployFunction(agentId, skill_id, name, description, code, env_vars_needed);

        if (deployed.success) {
          await logForgeEvent(agentId, label, cycleNumber, 'deployed', {
            function_name: funcName,
            callable_url: deployed.callable_url,
            code_length: code.length,
          });

          console.log(`  ✅ FORGED: ${funcName} deployed`);
          console.log(`  🔗 Callable at: ${deployed.callable_url}`);

          // Update agent forged count
          try {
            await supabase.rpc('increment_forged_count', { aid: agentId });
          } catch {
            const { data: agent } = await supabase.from('agents').select('forged_skill_count').eq('id', agentId).single();
            if (agent) {
              await supabase.from('agents').update({ forged_skill_count: (agent.forged_skill_count || 0) + 1 }).eq('id', agentId);
            }
          }

          // Run test if provided
          if (test) {
            const testResult = await testFunction(skill_id, test);
            await logForgeEvent(agentId, label, cycleNumber,
              testResult.passed ? 'test_passed' : 'test_failed', testResult);
            console.log(`  🧪 Test: ${testResult.passed ? 'PASSED' : 'FAILED'}`);
          }

          return { success: true, function_name: funcName, callable_url: deployed.callable_url };
        } else {
          await logForgeEvent(agentId, label, cycleNumber, 'deploy_failed', deployed);
          console.log(`  ❌ Deploy failed: ${deployed.error}`);
          return { success: false, reason: deployed.error };
        }
      }

      case 'invoke_forged': {
        // Call a previously forged function
        const { target_skill: targetSkill, input } = forgeAction;
        if (!targetSkill) return { success: false, reason: 'no target_skill' };
        
        const result = await invokeForgedFunction(targetSkill, input || {});
        await logForgeEvent(agentId, label, cycleNumber, result.success ? 'invoke_success' : 'invoke_failed', {
          target_skill: targetSkill, result: JSON.stringify(result).slice(0, 500),
        });
        return result;
      }

      case 'list_forged_skills': {
        // List all forged skills for this agent
        try {
          const resp = await fetch(`${SUPA_URL}/functions/v1/forge-deployer`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
            },
            body: JSON.stringify({ action: 'list', agent_id: agentId }),
          });
          const data = await resp.json();
          await logForgeEvent(agentId, label, cycleNumber, 'list_success', {
            count: data.functions?.length || 0,
          });
          return data;
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }

      case 'create_table': {
        const { sql } = forgeAction.implementation || {};
        if (!sql) return { success: false, reason: 'no sql' };

        if (!isSafeDDL(sql)) {
          console.log('  🚫 Unsafe DDL blocked');
          return { success: false, reason: 'unsafe DDL' };
        }

        const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(e => ({ error: e }));
        if (error) {
          console.log(`  ❌ DDL failed: ${error.message || error}`);
          return { success: false, reason: error.message || 'DDL error' };
        }

        await logForgeEvent(agentId, label, cycleNumber, 'table_created', { sql });
        console.log(`  ✅ Table created`);
        return { success: true };
      }

      case 'call_api': {
        const { url, method, headers, body } = forgeAction.api_call || {};
        if (!url) return { success: false, reason: 'no url' };

        if (!isAllowedDomain(url)) {
          console.log(`  🚫 Domain not allowed: ${url}`);
          return { 
            success: false, 
            reason: 'domain not allowed',
            forge_hint: `Domain ${new URL(url).hostname} is not in the allowlist. You can forge an edge function that wraps this API — deploy it via deploy_edge_function and then call it through invoke_forged.`,
          };
        }

        try {
          const resp = await fetch(url, {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await resp.json().catch(() => resp.text());
          await logForgeEvent(agentId, label, cycleNumber, 'api_called', { url, status: resp.status });
          return { success: true, data };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }

      case 'post_bounty': {
        const { task, payment, platform } = forgeAction.bounty || {};
        await logForgeEvent(agentId, label, cycleNumber, 'bounty_posted', { task, payment, platform });
        console.log(`  📋 Bounty logged: "${task}" (${payment})`);
        return { success: true, logged: true, note: 'Bounty logged, Farcaster posting not yet active' };
      }

      case 'search_github': {
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
          await logForgeEvent(agentId, label, cycleNumber, 'github_searched', { query, results: repos.length });
          return { success: true, repos };
        } catch (e) {
          return { success: false, reason: e.message };
        }
      }

      case 'github_push':
      case 'push_files':
      case 'push_file':
      case 'create_repo': {
        const { handleGitHub } = await import('./github.js');
        const result = await handleGitHub(agentId, cycleNumber, forgeAction);
        await logForgeEvent(agentId, label, cycleNumber, 'github_push', result);
        console.log(`  ${result.success ? '✅' : '❌'} GitHub: ${JSON.stringify(result).slice(0, 120)}`);
        return result;
      }

      default:
        console.log(`  ⚠ Unknown forge action: ${action}`);
        return { success: false, reason: `unknown action: ${action}` };
    }
  } catch (err) {
    console.error(`  ❌ Forge error:`, err.message);
    await logForgeEvent(agentId, label, cycleNumber, 'error', { error: err.message });
    return { success: false, reason: err.message };
  }
}

/**
 * Deploy an edge function via the forge-deployer edge function (REAL)
 */
async function deployFunction(agentId, skillId, name, description, code, envVarsNeeded) {
  let finalCode = code;
  if (!code.includes('Deno.serve') && !code.includes('export default')) {
    finalCode = `// Forged by agent: ${agentId}\n// Skill: ${skillId} — ${name || ''}\n// ${description || ''}\n\nexport default async function(input, ctx) {\n${code}\n}`;
  }

  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/forge-deployer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: 'deploy',
        skill_id: skillId,
        name,
        description,
        code: finalCode,
        agent_id: agentId,
        env_vars_needed: envVarsNeeded || [],
      }),
    });

    const data = await resp.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Invoke a forged function
 */
async function invokeForgedFunction(skillId, input) {
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/forge-invoke?skill=${skillId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      },
      body: JSON.stringify(input),
    });

    const data = await resp.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function testFunction(skillId, testInput) {
  try {
    const result = await invokeForgedFunction(skillId, testInput);
    return { passed: result.success, ...result };
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

  if (code.length > 50000) {
    return { safe: false, reason: 'code too large (max 50KB)' };
  }

  return { safe: true };
}

function isSafeDDL(sql) {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith('CREATE TABLE') && !upper.startsWith('CREATE INDEX')) return false;
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
  'api.openai.com',
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
