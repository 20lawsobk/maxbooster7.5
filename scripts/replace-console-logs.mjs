#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_DIR = path.join(__dirname, '../server');

// Mapping of console methods to logger methods
const CONSOLE_TO_LOGGER = {
  'console.log': 'logger.info',
  'console.error': 'logger.error',
  'console.warn': 'logger.warn',
  'console.debug': 'logger.debug',
  'console.info': 'logger.info'
};

// Files to skip (already have logger or are test files)
const SKIP_FILES = [
  'logger.ts',
  'logger.js',
  '.test.ts',
  '.test.js',
  '.spec.ts',
  '.spec.js'
];

async function getAllTsFiles(dir) {
  const files = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        // Skip files in skip list
        if (!SKIP_FILES.some(skip => entry.name.includes(skip))) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await walk(dir);
  return files;
}

async function processFile(filePath) {
  let content = await fs.readFile(filePath, 'utf-8');
  let modified = false;
  let hasLogger = false;
  
  // Check if file already imports logger
  hasLogger = content.includes('import') && content.includes('logger');
  
  // Replace console statements
  for (const [consoleMethod, loggerMethod] of Object.entries(CONSOLE_TO_LOGGER)) {
    if (content.includes(consoleMethod)) {
      // Simple replacement - this handles most cases
      const regex = new RegExp(consoleMethod.replace('.', '\\.'), 'g');
      content = content.replace(regex, loggerMethod);
      modified = true;
    }
  }
  
  // If we made changes and logger isn't imported, add import at top
  if (modified && !hasLogger) {
    // Find the last import statement
    const lines = content.split('\n');
    let lastImportIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    
    // Add logger import after last import
    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, "import { logger } from './services/logger.js';");
      content = lines.join('\n');
    }
  }
  
  if (modified) {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  }
  
  return false;
}

async function main() {
  console.log('🔍 Finding TypeScript files in server directory...');
  const files = await getAllTsFiles(SERVER_DIR);
  console.log(`📁 Found ${files.length} files to process`);
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const wasModified = await processFile(file);
    
    processedCount++;
    if (wasModified) {
      modifiedCount++;
      console.log(`✅ Modified: ${relativePath}`);
    }
    
    if (processedCount % 10 === 0) {
      console.log(`📊 Progress: ${processedCount}/${files.length} files processed, ${modifiedCount} modified`);
    }
  }
  
  console.log(`\n✨ Complete! Processed ${processedCount} files, modified ${modifiedCount} files`);
  console.log('\n⚠️  Note: Please manually review changes and fix any import paths as needed.');
}

main().catch(console.error);
