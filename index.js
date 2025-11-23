import { Octokit } from '@octokit/rest';
import sodium from 'libsodium-wrappers';

const LINK = 'https://geographic-provides-collaboration-contrast.trycloudflare.com/vnc.html';
const PASS = 'nature';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { github_token } = req.body || {};
  if (!github_token || (!github_token.startsWith('ghp_') && !github_token.startsWith('github_pat_'))) {
    return res.status(400).json({ error: 'Token GitHub không hợp lệ!' });
  }

  try {
    const octokit = new Octokit({ auth: github_token });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    const repo = `vps-${Date.now()}`;
    await octokit.rest.repos.createForAuthenticatedUser({ name: repo, private: false, auto_init: true });

    await sodium.ready;
    const { data: key } = await octokit.rest.actions.getRepoPublicKey({ owner: user.login, repo });
    const encrypted = sodium.crypto_box_seal(Buffer.from(github_token), Buffer.from(key.key, 'base64'));
    await octokit.rest.actions.createOrUpdateRepoSecret({
      owner: user.login, repo,
      secret_name: 'GH_TOKEN',
      encrypted_value: Buffer.from(encrypted).toString('base64'),
      key_id: key.key_id
    });

    const wf = `name: VPS Ready
on: workflow_dispatch
jobs:
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { token: \${{ secrets.GH_TOKEN }} }
      - run: |
          echo "${LINK}" > remote-link.txt
          git config user.email "bot@vps.com"
          git config user.name "VPS Bot"
          git add remote-link.txt
          git commit -m "ready" --allow-empty
          git push origin main --force`;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: user.login, repo,
      path: '.github/workflows/go.yml',
      message: 'VPS workflow',
      content: Buffer.from(wf).toString('base64')
    });

    await octokit.rest.repos.createDispatchEvent({ owner: user.login, repo, event_type: 'workflow_dispatch' });

    res.json({ success: true, link: LINK, password: PASS, repo: `https://github.com/${user.login}/${repo}` });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
}
