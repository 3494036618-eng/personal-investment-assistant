import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  assertPreferenceCoverage,
  assertReportSourcePolicy,
  canonicalSecurityCode,
} from '../skill/investment-assistant/scripts/acceptance-validators.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(root, 'skill', 'investment-assistant');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-initializer-'));
const configDir = path.join(sandbox, 'config');
const installRoot = path.join(sandbox, 'runtime');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'credentials.env'), [
  'ARK_API_KEY="single-agent-plan-key"',
  'DATAPRO_API_KEY=""',
  'WEB_SEARCH_API_KEY=""',
  '',
].join('\n'), { mode: 0o600 });

process.env.INVESTMENT_ASSISTANT_CONFIG_HOME = configDir;
process.env.INVESTMENT_ASSISTANT_HOME = installRoot;

try {
  const {
    assertApplicationSource,
    configuredCredentials,
    paths,
    sanitizedNpmEnvironment,
  } = await import('../skill/investment-assistant/scripts/lib.mjs');
  const { loadConfig, publicConfig } = await import(
    '../skill/investment-assistant/assets/app/src/server/config.js'
  );

  const credentials = configuredCredentials();
  assert.deepEqual(credentials, {
    agent_plan_model: true,
    datapro: true,
    web_search: true,
  });

  const config = loadConfig({
    NODE_ENV: 'test',
    INVESTMENT_ASSISTANT_CONFIG_HOME: configDir,
    INVESTMENT_ASSISTANT_HOME: installRoot,
  });
  assert.equal(config.ark.apiKey, 'single-agent-plan-key');
  assert.equal(config.dataPro.apiKey, 'single-agent-plan-key');
  assert.equal(config.webSearch.apiKey, 'single-agent-plan-key');
  assert.deepEqual(publicConfig(config).providers.web_search, { configured: true });
  assertApplicationSource(paths.sourceApp);

  const onboardText = fs.readFileSync(path.join(skillRoot, 'scripts', 'onboard.mjs'), 'utf8');
  assert.doesNotMatch(onboardText, /project\.mjs|--target/u);
  assert.match(onboardText, /--profile/u);
  assert.match(onboardText, /--all/u);
  assert.match(onboardText, /--seed/u);
  assert.match(onboardText, /--skip-initial-reports/u);

  const configureText = fs.readFileSync(path.join(skillRoot, 'scripts', 'configure.mjs'), 'utf8');
  assert.match(configureText, /Agent Plan API Key/u);
  assert.doesNotMatch(configureText, /Harness 联网搜索 API Key|独立 API Key/u);

  const sanitized = sanitizedNpmEnvironment({
    PATH: '/usr/bin',
    ARK_API_KEY: 'secret',
    DATAPRO_API_KEY: 'secret',
    WEB_SEARCH_API_KEY: 'secret',
    INVESTMENT_ASSISTANT_CREDENTIALS_FILE: '/private/credentials.env',
    INVESTMENT_ASSISTANT_HOME: '/private/runtime',
  });
  assert.equal(sanitized.PATH, '/usr/bin');
  for (const key of [
    'ARK_API_KEY',
    'DATAPRO_API_KEY',
    'WEB_SEARCH_API_KEY',
    'INVESTMENT_ASSISTANT_CREDENTIALS_FILE',
    'INVESTMENT_ASSISTANT_HOME',
  ]) {
    assert.equal(sanitized[key], undefined);
  }

  const knownEvidenceIds = new Set(['D1', 'W1']);
  assertPreferenceCoverage({
    preference: '股价走势和行业动态',
    status: 'partial',
    evidence_ids: ['D1'],
    facets: [
      { preference: '股价走势', status: 'covered', evidence_ids: ['D1'] },
      { preference: '行业动态', status: 'watch', evidence_ids: [] },
    ],
  }, '股价走势和行业动态', knownEvidenceIds);
  assert.throws(() => assertPreferenceCoverage({
    preference: '股价走势和行业动态',
    status: 'partial',
    evidence_ids: ['W9'],
    facets: [
      { preference: '股价走势', status: 'covered', evidence_ids: ['W9'] },
      { preference: '行业动态', status: 'watch', evidence_ids: [] },
    ],
  }, '股价走势和行业动态', knownEvidenceIds), /不存在的来源/u);

  assertReportSourcePolicy({
    change_status: 'initial',
    provider_status: {
      web_search: { ok: true, successful_query_count: 2, raw_result_count: 4, result_count: 0 },
    },
    report: {
      analysis: {
        risk_level: 'unknown',
        summary_evidence_ids: ['D1'],
        sections: [{ title: '市场异动', claims: [{ text: '行情事实', evidence_ids: ['D1'] }] }],
        conclusion: { evidence_ids: ['D1'] },
      },
      evidence: [{
        id: 'D1',
        type: 'datapro',
        rows: [{ 最新价: 100, 前收盘价: 99, 涨跌幅: 1.01 }],
      }],
    },
  }, 'monitor');
  assert.throws(() => assertReportSourcePolicy({
    report: {
      analysis: { risk_level: 'unknown' },
      evidence: [{
        id: 'D1',
        type: 'datapro',
        rows: [{ 最新价: 100, 前收盘价: 99, 涨跌幅: 1.01 }],
      }],
    },
  }, 'brief'), /联网搜索证据/u);

  assert.equal(canonicalSecurityCode('AAPL.O'), 'AAPL');
  assert.equal(canonicalSecurityCode('NASDAQ:AAPL'), 'AAPL');

  process.stdout.write(
    'Initializer single-key configuration, packaged app, onboarding flow, credential isolation, and acceptance validators passed.\n',
  );
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
