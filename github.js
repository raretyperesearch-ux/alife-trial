// github.js — Mira's GitHub hands
// Creates repos, pushes code, builds in public under mira-tools org

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'aliveagentsmira';
const GITHUB_API = 'https://api.github.com';

function headers() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'mira-alife-agent',
  };
}

/**
 * Create a new repository under the org
 */
export async function createRepo(name, description, isPrivate = false) {
  const resp = await fetch(`${GITHUB_API}/orgs/${GITHUB_ORG}/repos`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true, // creates with README
      has_issues: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    // If repo already exists, that's fine
    if (resp.status === 422 && JSON.stringify(err).includes('already exists')) {
      return { success: true, existed: true, url: `https://github.com/${GITHUB_ORG}/${name}` };
    }
    return { success: false, error: err.message || `HTTP ${resp.status}`, details: err };
  }

  const data = await resp.json();
  return { success: true, url: data.html_url, clone_url: data.clone_url };
}

/**
 * Push a file to a repo (creates or updates)
 * Each push is an atomic commit
 */
export async function pushFile(repo, path, content, commitMessage) {
  // Check if file exists first (need SHA for updates)
  const existingResp = await fetch(
    `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/contents/${path}`,
    { headers: headers() }
  );

  const body = {
    message: commitMessage || `mira: update ${path}`,
    content: Buffer.from(content).toString('base64'),
  };

  if (existingResp.ok) {
    const existing = await existingResp.json();
    body.sha = existing.sha; // required for updates
  }

  const resp = await fetch(
    `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/contents/${path}`,
    { method: 'PUT', headers: headers(), body: JSON.stringify(body) }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return { success: false, error: err.message || `HTTP ${resp.status}` };
  }

  const data = await resp.json();
  return { success: true, sha: data.content?.sha, url: data.content?.html_url };
}

/**
 * Push multiple files in one commit using Git trees API
 * This is the proper way to push a whole project at once
 */
export async function pushMultipleFiles(repo, files, commitMessage) {
  try {
    // 1. Get the latest commit SHA on main
    const refResp = await fetch(
      `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/ref/heads/main`,
      { headers: headers() }
    );
    if (!refResp.ok) {
      // Try 'master' branch
      const masterResp = await fetch(
        `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/ref/heads/master`,
        { headers: headers() }
      );
      if (!masterResp.ok) return { success: false, error: 'Cannot find main/master branch' };
      var refData = await masterResp.json();
      var branch = 'master';
    } else {
      var refData = await refResp.json();
      var branch = 'main';
    }
    const latestCommitSha = refData.object.sha;

    // 2. Get the tree SHA of that commit
    const commitResp = await fetch(
      `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/commits/${latestCommitSha}`,
      { headers: headers() }
    );
    const commitData = await commitResp.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const tree = [];
    for (const file of files) {
      const blobResp = await fetch(
        `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/blobs`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64',
          }),
        }
      );
      const blobData = await blobResp.json();
      tree.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create new tree
    const treeResp = await fetch(
      `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/trees`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ base_tree: baseTreeSha, tree }),
      }
    );
    const treeData = await treeResp.json();

    // 5. Create commit
    const newCommitResp = await fetch(
      `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/commits`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [latestCommitSha],
          author: {
            name: 'Mira',
            email: 'mira@alife.agent',
            date: new Date().toISOString(),
          },
        }),
      }
    );
    const newCommitData = await newCommitResp.json();

    // 6. Update ref to point to new commit
    await fetch(
      `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ sha: newCommitData.sha }),
      }
    );

    return {
      success: true,
      commit_sha: newCommitData.sha,
      files_pushed: files.length,
      url: `https://github.com/${GITHUB_ORG}/${repo}`,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Create a release/tag
 */
export async function createRelease(repo, tag, name, body) {
  const resp = await fetch(
    `${GITHUB_API}/repos/${GITHUB_ORG}/${repo}/releases`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        tag_name: tag,
        name: name || tag,
        body: body || `Released by Mira`,
        draft: false,
        prerelease: false,
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return { success: false, error: err.message || `HTTP ${resp.status}` };
  }

  const data = await resp.json();
  return { success: true, url: data.html_url };
}

/**
 * List repos in the org
 */
export async function listRepos() {
  const resp = await fetch(
    `${GITHUB_API}/orgs/${GITHUB_ORG}/repos?sort=updated&per_page=20`,
    { headers: headers() }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.map(r => ({
    name: r.name,
    description: r.description,
    stars: r.stargazers_count,
    url: r.html_url,
    updated: r.updated_at,
  }));
}

/**
 * Handle a GitHub forge action from the agent
 */
export async function handleGitHub(agentId, cycleNum, action) {
  console.log(`  🐙 GitHub: ${action.action} — ${action.repo || action.skill_id}`);

  switch (action.action) {
    case 'create_repo': {
      const result = await createRepo(
        action.repo,
        action.description || `Built by Mira at cycle ${cycleNum}`,
        action.private || false
      );
      if (result.success) {
        console.log(`  ✅ Repo created: ${result.url}`);
      }
      return result;
    }

    case 'push_files': {
      // First ensure repo exists
      await createRepo(action.repo, action.description || '');

      if (action.files && action.files.length > 1) {
        const result = await pushMultipleFiles(
          action.repo,
          action.files,
          action.commit_message || `mira cycle ${cycleNum}: ${action.description || 'update'}`
        );
        if (result.success) {
          console.log(`  ✅ Pushed ${result.files_pushed} files to ${GITHUB_ORG}/${action.repo}`);
        }
        return result;
      } else if (action.files && action.files.length === 1) {
        const f = action.files[0];
        return await pushFile(
          action.repo,
          f.path,
          f.content,
          action.commit_message || `mira cycle ${cycleNum}: ${action.description || 'update'}`
        );
      }
      return { success: false, error: 'no files provided' };
    }

    case 'push_file': {
      await createRepo(action.repo, action.description || '');
      return await pushFile(
        action.repo,
        action.path,
        action.content,
        action.commit_message || `mira cycle ${cycleNum}: ${action.description || 'update'}`
      );
    }

    case 'release': {
      return await createRelease(
        action.repo,
        action.tag || `v0.1.${cycleNum}`,
        action.release_name || `Cycle ${cycleNum} release`,
        action.release_notes || `Built by Mira during think cycle ${cycleNum}.`
      );
    }

    case 'list_repos': {
      return await listRepos();
    }

    default:
      return { success: false, error: `Unknown GitHub action: ${action.action}` };
  }
}

export default { createRepo, pushFile, pushMultipleFiles, createRelease, listRepos, handleGitHub };
