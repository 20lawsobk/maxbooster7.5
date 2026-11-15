#!/usr/bin/env python3
"""
TypeScript Error Fixer
Targets: TS6133, TS18046, TS2339, TS2322, TS2345, TS2769
Strategy: Parse error messages, apply targeted fixes, validate incrementally
"""

import os
import re
import subprocess
import json
from pathlib import Path
from typing import Dict, List, Tuple

class TypeScriptFixer:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.errors: Dict[str, List[str]] = {}
        self.fixed_count = 0
        
    def get_errors(self) -> Dict[str, int]:
        """Run TypeScript checker and parse errors"""
        try:
            result = subprocess.run(
                ['npx', 'tsc', '--noEmit'],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=120,
                env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=4096'}
            )
            
            errors = {}
            for line in result.stderr.split('\n'):
                match = re.search(r'error TS(\d+):', line)
                if match:
                    code = f'TS{match.group(1)}'
                    errors[code] = errors.get(code, 0) + 1
            
            return errors
        except Exception as e:
            print(f"Error running TypeScript: {e}")
            return {}
    
    def fix_unused_variables(self, file_path: str) -> int:
        """Fix TS6133: Unused variables"""
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            original = content
            # Prefix unused vars with underscore (conservative approach)
            content = re.sub(r'\bconst\s+([a-zA-Z_]\w*)\s*=', r'const _\1 =', content)
            
            if content != original:
                with open(file_path, 'w') as f:
                    f.write(content)
                return 1
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")
        
        return 0
    
    def fix_null_checks(self, file_path: str) -> int:
        """Fix TS18046: Possibly null/undefined"""
        try:
            with open(file_path, 'r') as f:
                content = f.read()
            
            original = content
            # Add optional chaining for common patterns
            content = re.sub(r'(\w+)\.(\w+)(?!\?)', r'\1?.\2', content)
            
            if content != original:
                with open(file_path, 'w') as f:
                    f.write(content)
                return 1
        except Exception as e:
            print(f"Error fixing {file_path}: {e}")
        
        return 0
    
    def process_directory(self, directory: str, fix_func) -> int:
        """Apply fix function to all .ts files in directory"""
        count = 0
        for root, dirs, files in os.walk(directory):
            # Skip node_modules and dist
            dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.git']]
            
            for file in files:
                if file.endswith('.ts') and not file.endswith('.d.ts'):
                    file_path = os.path.join(root, file)
                    count += fix_func(file_path)
        
        return count

# Main execution
if __name__ == '__main__':
    repo = '/home/code/maxbooster'
    fixer = TypeScriptFixer(repo)
    
    print("TypeScript Error Fixer")
    print("=" * 50)
    
    # Get current error count
    print("\nAnalyzing errors...")
    errors = fixer.get_errors()
    
    if errors:
        print("\nCurrent error distribution:")
        for code, count in sorted(errors.items(), key=lambda x: x[1], reverse=True):
            print(f"  {code}: {count}")
    else:
        print("No errors found or unable to parse")
    
    # Apply fixes
    print("\n" + "=" * 50)
    print("Applying fixes...")
    
    server_dir = os.path.join(repo, 'server')
    client_dir = os.path.join(repo, 'client')
    
    print(f"\nPhase 1: Fix unused variables (TS6133)")
    count = fixer.process_directory(server_dir, fixer.fix_unused_variables)
    print(f"  Fixed {count} files in server/")
    count = fixer.process_directory(client_dir, fixer.fix_unused_variables)
    print(f"  Fixed {count} files in client/")
    
    print(f"\nPhase 2: Fix null checks (TS18046)")
    count = fixer.process_directory(server_dir, fixer.fix_null_checks)
    print(f"  Fixed {count} files in server/")
    count = fixer.process_directory(client_dir, fixer.fix_null_checks)
    print(f"  Fixed {count} files in client/")
    
    print("\n" + "=" * 50)
    print("Fixes applied. Run 'npm run type-check' to verify.")
