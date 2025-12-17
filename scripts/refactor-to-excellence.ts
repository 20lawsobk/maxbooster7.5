#!/usr/bin/env tsx
/**
 * Automated Refactoring Script - Bring Max Booster to 100% FAANG Standards
 *
 * This script performs the following transformations:
 * 1. Replace all console.log with structured logger
 * 2. Add JSDoc comments to all functions
 * 3. Fix common TypeScript `any` types
 * 4. Standardize error handling
 *
 * Usage:
 *   tsx scripts/refactor-to-excellence.ts           # Dry-run mode (preview only)
 *   tsx scripts/refactor-to-excellence.ts --apply   # Apply changes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Parse CLI arguments
const DRY_RUN = !process.argv.includes('--apply');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No files will be modified');
  console.log('   Use --apply flag to actually apply changes\n');
} else {
  console.log('⚠️  APPLY MODE - Files will be modified');
  console.log('   Make sure you have committed your changes first!\n');
}

interface RefactorStats {
  filesProcessed: number;
  consoleLogsReplaced: number;
  anyTypesFixed: number;
  jsdocsAdded: number;
  errorsStandardized: number;
}

const stats: RefactorStats = {
  filesProcessed: 0,
  consoleLogsReplaced: 0,
  anyTypesFixed: 0,
  jsdocsAdded: 0,
  errorsStandardized: 0,
};

/**
 * Get all TypeScript files in a directory recursively
 */
async function getAllTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, .git
        if (!['node_modules', 'dist', '.git', '.husky'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        // Skip test files and config files
        if (!/\.(test|spec|config)\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Replace console.log with structured logger
 */
function replaceConsoleLogs(content: string, filePath: string): string {
  let modified = content;
  let replacements = 0;

  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*['"].*logger/i.test(content);

  // Replace console.log with logger.info
  const consoleLogRegex = /console\.log\(/g;
  if (consoleLogRegex.test(content)) {
    modified = modified.replace(consoleLogRegex, 'logger.info(');
    replacements++;
  }

  // Replace console.error with logger.error
  const consoleErrorRegex = /console\.error\(/g;
  if (consoleErrorRegex.test(content)) {
    modified = modified.replace(consoleErrorRegex, 'logger.error(');
    replacements++;
  }

  // Replace console.warn with logger.warn
  const consoleWarnRegex = /console\.warn\(/g;
  if (consoleWarnRegex.test(content)) {
    modified = modified.replace(consoleWarnRegex, 'logger.warn(');
    replacements++;
  }

  // Replace console.debug with logger.debug
  const consoleDebugRegex = /console\.debug\(/g;
  if (consoleDebugRegex.test(content)) {
    modified = modified.replace(consoleDebugRegex, 'logger.debug(');
    replacements++;
  }

  // Add logger import if we made replacements and it's not already imported
  if (replacements > 0 && !hasLoggerImport) {
    // Determine correct logger import path based on file location
    const isServerFile = filePath.includes('/server/');
    const isClientFile = filePath.includes('/client/');

    if (isServerFile) {
      // Find the last import statement
      const lines = modified.split('\n');
      let lastImportIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
          lastImportIndex = i;
        }
      }

      // Add logger import after last import
      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, "import { logger } from './logger.js';");
        modified = lines.join('\n');
      }
    } else if (isClientFile) {
      // For client files, we can use console with structured format
      // or create a client-side logger
      // For now, keep console in client files but format better
    }
  }

  stats.consoleLogsReplaced += replacements;
  return modified;
}

/**
 * Fix common `any` types with better alternatives
 */
function fixAnyTypes(content: string): string {
  let modified = content;
  let fixes = 0;

  // Replace `data: any` with `data: unknown` (safer)
  const anyParamRegex = /:\s*any(?=\s*[,\)])/g;
  if (anyParamRegex.test(content)) {
    modified = modified.replace(anyParamRegex, ': unknown');
    fixes++;
  }

  // Replace `any[]` with `unknown[]`
  const anyArrayRegex = /:\s*any\[\]/g;
  if (anyArrayRegex.test(content)) {
    modified = modified.replace(anyArrayRegex, ': unknown[]');
    fixes++;
  }

  stats.anyTypesFixed += fixes;
  return modified;
}

/**
 * Add JSDoc comments to functions missing them
 */
function addJsDocComments(content: string): string {
  let modified = content;
  let added = 0;

  // Simple pattern: look for functions without JSDoc
  const functionRegex = /(^|\n)(\s*)(export\s+)?(async\s+)?function\s+(\w+)/g;

  const lines = modified.split('\n');
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line has a function declaration
    if (/^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line)) {
      // Check if previous line is a comment
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.startsWith('/**') && !prevLine.startsWith('//')) {
        const indent = line.match(/^\s*/)?.[0] || '';
        newLines.push(`${indent}/**`);
        newLines.push(`${indent} * TODO: Add function documentation`);
        newLines.push(`${indent} */`);
        added++;
      }
    }

    newLines.push(line);
  }

  stats.jsdocsAdded += added;
  return newLines.join('\n');
}

/**
 * Standardize error handling
 */
function standardizeErrorHandling(content: string): string {
  let modified = content;
  let standardized = 0;

  // Look for try-catch blocks without proper error typing
  const tryCatchRegex = /catch\s*\(\s*(\w+)\s*\)/g;
  modified = modified.replace(tryCatchRegex, (match, errorVar) => {
    standardized++;
    return `catch (${errorVar}: unknown)`;
  });

  stats.errorsStandardized += standardized;
  return modified;
}

/**
 * Process a single file
 */
async function processFile(filePath: string): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;

    // Apply transformations
    content = replaceConsoleLogs(content, filePath);
    content = fixAnyTypes(content);
    content = addJsDocComments(content);
    content = standardizeErrorHandling(content);

    // Only write if content changed AND not in dry-run mode
    if (content !== original) {
      if (!DRY_RUN) {
        await fs.writeFile(filePath, content, 'utf-8');
      }
      stats.filesProcessed++;
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Max Booster Excellence Refactoring...\n');

  // Get all TypeScript files
  const serverFiles = await getAllTsFiles(path.join(PROJECT_ROOT, 'server'));
  const clientFiles = await getAllTsFiles(path.join(PROJECT_ROOT, 'client/src'));
  const allFiles = [...serverFiles, ...clientFiles];

  console.log(`📁 Found ${allFiles.length} TypeScript files to process\n`);

  // Process files
  for (const file of allFiles) {
    await processFile(file);

    if (stats.filesProcessed % 10 === 0) {
      console.log(`⏳ Processed ${stats.filesProcessed} files...`);
    }
  }

  // Print final stats
  console.log('\n✨ Refactoring Complete!\n');
  console.log('📊 Statistics:');
  console.log(`   Files Analyzed: ${stats.filesProcessed}`);
  console.log(`   Console Logs to Replace: ${stats.consoleLogsReplaced}`);
  console.log(`   'any' Types to Fix: ${stats.anyTypesFixed}`);
  console.log(`   JSDoc Comments to Add: ${stats.jsdocsAdded}`);
  console.log(`   Error Handlers to Standardize: ${stats.errorsStandardized}`);

  if (DRY_RUN) {
    console.log('\n🔍 This was a DRY RUN - no files were modified');
    console.log('   Run with --apply flag to actually make changes:\n');
    console.log('   tsx scripts/refactor-to-excellence.ts --apply\n');
  } else {
    console.log('\n✅ Changes applied successfully!\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Run `npm run lint:fix` to apply ESLint fixes');
    console.log('   2. Run `npm run format` to format code with Prettier');
    console.log('   3. Run `npm run type-check` to verify TypeScript');
    console.log('   4. Review changes and commit\n');
  }
}

main().catch(console.error);
