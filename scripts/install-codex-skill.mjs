import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const fatalHandler = Symbol.for('investment-assistant.skill-installer-error-handler');
if (!globalThis[fatalHandler]) {
  globalThis[fatalHandler] = true;
  const reportFatal = (error) => {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  };
  process.on('uncaughtException', reportFatal);
  process.on('unhandledRejection', reportFatal);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skill', 'investment-assistant');
const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const skillsRoot = path.join(codexHome, 'skills');
const target = path.join(skillsRoot, 'investment-assistant');
const force = process.argv.includes('--force');

if (!fs.existsSync(path.join(source, 'SKILL.md'))) throw new Error(`Skill 源目录无效：${source}`);
if (fs.existsSync(target) && !force) {
  throw new Error(`Skill 已存在：${target}。如需更新，请追加 --force。`);
}

fs.mkdirSync(skillsRoot, { recursive: true, mode: 0o700 });
const staging = path.join(skillsRoot, `.investment-assistant-${randomUUID()}.install`);
const backup = path.join(skillsRoot, '.investment-assistant.previous');

try {
  fs.cpSync(source, staging, {
    recursive: true,
    force: true,
    filter: (entry) => {
      const relative = path.relative(source, entry);
      const segments = relative.split(path.sep);
      return !segments.includes('node_modules') && !segments.includes('dist') && !segments.includes('.git');
    },
  });
  fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(target)) fs.renameSync(target, backup);
  fs.renameSync(staging, target);
  fs.rmSync(backup, { recursive: true, force: true });
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true });
  if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
  throw error;
}

process.stdout.write(`Codex Skill 已安装：${target}\n`);
process.stdout.write('重新启动 Codex 后即可识别该 Skill。\n');
