#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const MAX_TS_LINES = 500;
const repoRoot = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.local',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

function collectTypeScriptFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

const oversizedFiles = collectTypeScriptFiles(repoRoot)
  .map((filePath) => {
    const lineCount = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
    return {
      filePath: path.relative(repoRoot, filePath),
      lineCount,
    };
  })
  .filter((file) => file.lineCount > MAX_TS_LINES)
  .sort((a, b) => b.lineCount - a.lineCount);

if (oversizedFiles.length > 0) {
  console.error(`TypeScript files must stay at ${MAX_TS_LINES} lines or fewer:`);
  for (const file of oversizedFiles) {
    console.error(`- ${file.filePath}: ${file.lineCount} lines`);
  }
  process.exit(1);
}

console.log(`All TypeScript files are within the ${MAX_TS_LINES}-line limit.`);
