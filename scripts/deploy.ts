import { execSync } from 'child_process';

const GITHUB_REPO = process.env.GITHUB_REPO || '20lawsobk/maxbooster7.5';
const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_API = 'https://api.github.com';

const WORKFLOWS = [
  { file: 'build-desktop.yml', name: 'Desktop (Windows / macOS / Linux)' },
  { file: 'build-mobile.yml',  name: 'Mobile (Android / iOS)' },
];

async function triggerWorkflow(workflowFile: string, label: string): Promise<boolean> {
  if (!GITHUB_PAT) return false;

  const url = `${GITHUB_API}/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });

  if (res.ok || res.status === 204) {
    console.log(`  ✅ ${label}`);
    return true;
  }

  const body = await res.text().catch(() => '');
  console.error(`  ❌ ${label} — HTTP ${res.status}: ${body}`);
  return false;
}

async function main() {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  MAX BOOSTER — DEPLOY');
  console.log('════════════════════════════════════════');

  console.log('\n[1/2] Building web app...\n');
  execSync('npx tsx script/build.ts', { stdio: 'inherit' });
  console.log('\n✅ Build complete.\n');

  console.log('[2/2] Triggering desktop & mobile builds on GitHub Actions...');

  if (!GITHUB_PAT) {
    console.warn('  ⚠️  GITHUB_PAT secret not set — skipping build triggers.');
    console.warn('      Add it in Replit Secrets to enable automatic desktop/mobile builds.');
  } else {
    await Promise.all(
      WORKFLOWS.map(({ file, name }) => triggerWorkflow(file, name))
    );
  }

  console.log('\n════════════════════════════════════════');
  console.log('  Deploy complete.');
  console.log('════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Deploy failed:', err);
  process.exit(1);
});
