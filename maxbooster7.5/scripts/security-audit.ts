#!/usr/bin/env npx tsx
/**
 * SECURITY AUDIT SCRIPT
 * 
 * Performs vulnerability scanning on npm dependencies and generates security reports.
 * Integrates with the build process to fail on critical vulnerabilities.
 * 
 * Usage: npm run security:audit
 * 
 * Options:
 *   --fail-on-high     Fail build on high severity vulnerabilities (default: critical only)
 *   --report-only      Generate report without failing build
 *   --json             Output JSON report to stdout
 *   --output <file>    Write report to specified file
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

interface AllowedVulnerability {
  id: string;
  reason: string;
  expires: string;
  reviewer: string;
}

interface AllowlistConfig {
  allowedVulnerabilities: AllowedVulnerability[];
  lastUpdated?: string;
  version?: string;
}

interface VulnerabilityInfo {
  name: string;
  severity: string;
  title: string;
  path: string;
  id?: string;
  url?: string;
  range?: string;
  fixAvailable?: boolean | { name: string; version: string };
}

interface AuditResult {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
    total: number;
  };
  packages: VulnerabilityInfo[];
  metadata: {
    totalDependencies: number;
    devDependencies: number;
    prodDependencies: number;
  };
}

interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  dependent: string;
  location: string;
  type: 'dependencies' | 'devDependencies';
  deprecated?: boolean;
}

interface SecurityReport {
  timestamp: string;
  projectName: string;
  projectVersion: string;
  auditResult: AuditResult;
  outdatedPackages: OutdatedPackage[];
  allowedVulnerabilities: string[];
  effectiveVulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  buildStatus: 'pass' | 'fail' | 'warn';
  recommendations: string[];
  summary: string;
}

class SecurityAuditor {
  private projectRoot: string;
  private allowlist: AllowlistConfig;
  private options: {
    failOnHigh: boolean;
    reportOnly: boolean;
    jsonOutput: boolean;
    outputFile?: string;
  };

  constructor(projectRoot: string, options: Partial<typeof SecurityAuditor.prototype.options> = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      failOnHigh: options.failOnHigh ?? false,
      reportOnly: options.reportOnly ?? false,
      jsonOutput: options.jsonOutput ?? false,
      outputFile: options.outputFile,
    };
    this.allowlist = this.loadAllowlist();
  }

  private loadAllowlist(): AllowlistConfig {
    const allowlistPath = join(this.projectRoot, 'security-allowlist.json');
    if (existsSync(allowlistPath)) {
      try {
        const content = readFileSync(allowlistPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.warn('⚠️  Warning: Could not parse security-allowlist.json');
        return { allowedVulnerabilities: [] };
      }
    }
    return { allowedVulnerabilities: [] };
  }

  private getPackageInfo(): { name: string; version: string } {
    const packageJsonPath = join(this.projectRoot, 'package.json');
    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return { name: pkg.name || 'unknown', version: pkg.version || '0.0.0' };
    } catch {
      return { name: 'unknown', version: '0.0.0' };
    }
  }

  private runNpmAudit(): AuditResult {
    console.log('🔍 Running npm audit...');
    
    const result: AuditResult = {
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
      packages: [],
      metadata: {
        totalDependencies: 0,
        devDependencies: 0,
        prodDependencies: 0,
      },
    };

    try {
      const auditProcess = spawnSync('npm', ['audit', '--json'], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });

      const output = auditProcess.stdout || '{}';
      const auditData = JSON.parse(output);

      if (auditData.metadata) {
        result.metadata.totalDependencies = auditData.metadata.dependencies?.total || 0;
        result.metadata.devDependencies = auditData.metadata.devDependencies?.total || 0;
        result.metadata.prodDependencies = auditData.metadata.dependencies?.prod || 0;
      }

      if (auditData.vulnerabilities) {
        for (const [pkgName, vuln] of Object.entries(auditData.vulnerabilities)) {
          const v = vuln as any;
          const severity = v.severity?.toLowerCase() || 'unknown';
          
          if (severity in result.vulnerabilities) {
            result.vulnerabilities[severity as keyof typeof result.vulnerabilities]++;
          }
          result.vulnerabilities.total++;

          if (v.via && Array.isArray(v.via)) {
            for (const via of v.via) {
              if (typeof via === 'object') {
                const ghsaId = via.url?.includes('/advisories/') 
                  ? via.url.split('/advisories/').pop()?.split('/')[0]
                  : via.url?.split('/').pop();
                result.packages.push({
                  name: pkgName,
                  severity: severity,
                  title: via.title || 'Unknown vulnerability',
                  path: v.nodes?.[0] || pkgName,
                  id: ghsaId || String(via.source),
                  url: via.url,
                  range: via.range,
                  fixAvailable: v.fixAvailable,
                });
              }
            }
          } else {
            result.packages.push({
              name: pkgName,
              severity: severity,
              title: 'Vulnerability detected',
              path: v.nodes?.[0] || pkgName,
              fixAvailable: v.fixAvailable,
            });
          }
        }
      }

      if (auditData.metadata?.vulnerabilities) {
        result.vulnerabilities.critical = auditData.metadata.vulnerabilities.critical || 0;
        result.vulnerabilities.high = auditData.metadata.vulnerabilities.high || 0;
        result.vulnerabilities.moderate = auditData.metadata.vulnerabilities.moderate || 0;
        result.vulnerabilities.low = auditData.metadata.vulnerabilities.low || 0;
        result.vulnerabilities.info = auditData.metadata.vulnerabilities.info || 0;
        result.vulnerabilities.total = auditData.metadata.vulnerabilities.total || 0;
      }
    } catch (error) {
      console.warn('⚠️  Warning: npm audit encountered an issue:', error);
    }

    return result;
  }

  private checkOutdatedPackages(): OutdatedPackage[] {
    console.log('📦 Checking for outdated packages...');
    
    const outdated: OutdatedPackage[] = [];

    try {
      const result = spawnSync('npm', ['outdated', '--json'], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = result.stdout || '{}';
      const outdatedData = JSON.parse(output);

      for (const [name, info] of Object.entries(outdatedData)) {
        const pkg = info as any;
        outdated.push({
          name,
          current: pkg.current || 'N/A',
          wanted: pkg.wanted || 'N/A',
          latest: pkg.latest || 'N/A',
          dependent: pkg.dependent || '',
          location: pkg.location || '',
          type: pkg.type === 'devDependencies' ? 'devDependencies' : 'dependencies',
          deprecated: pkg.deprecated,
        });
      }
    } catch {
    }

    return outdated;
  }

  private checkDeprecatedPackages(): string[] {
    console.log('⚠️  Checking for deprecated packages...');
    
    const deprecated: string[] = [];

    try {
      const result = spawnSync('npm', ['ls', '--json', '--depth=0'], {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = result.stdout || '{}';
      const lsData = JSON.parse(output);

      if (lsData.problems) {
        for (const problem of lsData.problems) {
          if (problem.includes('deprecated')) {
            deprecated.push(problem);
          }
        }
      }
    } catch {
    }

    return deprecated;
  }

  private isVulnerabilityAllowed(vulnId?: string): boolean {
    if (!vulnId) return false;
    
    const now = new Date();
    
    for (const allowed of this.allowlist.allowedVulnerabilities) {
      if (allowed.id === vulnId) {
        const expiryDate = new Date(allowed.expires);
        if (expiryDate > now) {
          return true;
        }
      }
    }
    
    return false;
  }

  private calculateEffectiveVulnerabilities(auditResult: AuditResult): {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    allowedIds: string[];
  } {
    const effective = { critical: 0, high: 0, moderate: 0, low: 0 };
    const allowedIds: string[] = [];

    for (const pkg of auditResult.packages) {
      if (pkg.id && this.isVulnerabilityAllowed(pkg.id)) {
        allowedIds.push(pkg.id);
        continue;
      }

      const severity = pkg.severity.toLowerCase();
      if (severity in effective) {
        effective[severity as keyof typeof effective]++;
      }
    }

    return { ...effective, allowedIds };
  }

  private generateRecommendations(report: Partial<SecurityReport>): string[] {
    const recommendations: string[] = [];

    if (report.effectiveVulnerabilities?.critical && report.effectiveVulnerabilities.critical > 0) {
      recommendations.push('🚨 CRITICAL: Run `npm audit fix --force` to attempt automatic fixes for critical vulnerabilities');
      recommendations.push('🚨 CRITICAL: Review each critical vulnerability and update affected packages immediately');
    }

    if (report.effectiveVulnerabilities?.high && report.effectiveVulnerabilities.high > 0) {
      recommendations.push('⚠️  HIGH: Schedule updates for packages with high severity vulnerabilities within 7 days');
    }

    if (report.effectiveVulnerabilities?.moderate && report.effectiveVulnerabilities.moderate > 0) {
      recommendations.push('📋 MODERATE: Plan to address moderate vulnerabilities in the next sprint');
    }

    if (report.outdatedPackages && report.outdatedPackages.length > 10) {
      recommendations.push('📦 Many outdated packages detected. Consider running `npm update` to update to wanted versions');
    }

    const deprecatedCount = report.outdatedPackages?.filter(p => p.deprecated).length || 0;
    if (deprecatedCount > 0) {
      recommendations.push(`⚠️  ${deprecatedCount} deprecated package(s) found. Find alternatives for these packages`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ No immediate security actions required');
    }

    return recommendations;
  }

  private determineBuildStatus(effectiveVulns: { critical: number; high: number }): 'pass' | 'fail' | 'warn' {
    if (this.options.reportOnly) {
      return effectiveVulns.critical > 0 || effectiveVulns.high > 0 ? 'warn' : 'pass';
    }

    if (effectiveVulns.critical > 0) {
      return 'fail';
    }

    if (this.options.failOnHigh && effectiveVulns.high > 0) {
      return 'fail';
    }

    if (effectiveVulns.high > 0) {
      return 'warn';
    }

    return 'pass';
  }

  private generateSummary(report: SecurityReport): string {
    const { effectiveVulnerabilities: ev, auditResult, outdatedPackages, buildStatus } = report;
    
    const lines = [
      '════════════════════════════════════════════════════════════',
      '                    SECURITY AUDIT SUMMARY                  ',
      '════════════════════════════════════════════════════════════',
      '',
      `📅 Timestamp: ${report.timestamp}`,
      `📦 Project: ${report.projectName} v${report.projectVersion}`,
      '',
      '┌─────────────────────────────────────────────────────────┐',
      '│                   VULNERABILITY COUNTS                   │',
      '├─────────────────────────────────────────────────────────┤',
      `│  🔴 Critical:  ${String(ev.critical).padStart(4)}  │  Total Scanned:  ${String(auditResult.metadata.totalDependencies).padStart(5)}  │`,
      `│  🟠 High:      ${String(ev.high).padStart(4)}  │  Outdated:       ${String(outdatedPackages.length).padStart(5)}  │`,
      `│  🟡 Moderate:  ${String(ev.moderate).padStart(4)}  │  Allowed:        ${String(report.allowedVulnerabilities.length).padStart(5)}  │`,
      `│  🟢 Low:       ${String(ev.low).padStart(4)}  │                          │`,
      '└─────────────────────────────────────────────────────────┘',
      '',
    ];

    if (report.allowedVulnerabilities.length > 0) {
      lines.push('📋 Allowed Vulnerabilities (excluded from count):');
      for (const id of report.allowedVulnerabilities) {
        const allowed = this.allowlist.allowedVulnerabilities.find(a => a.id === id);
        if (allowed) {
          lines.push(`   - ${id}: ${allowed.reason} (expires: ${allowed.expires})`);
        }
      }
      lines.push('');
    }

    if (auditResult.packages.length > 0) {
      lines.push('🔍 Vulnerability Details:');
      const grouped = new Map<string, VulnerabilityInfo[]>();
      for (const pkg of auditResult.packages) {
        const key = pkg.severity.toUpperCase();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(pkg);
      }

      for (const severity of ['CRITICAL', 'HIGH', 'MODERATE', 'LOW']) {
        const pkgs = grouped.get(severity);
        if (pkgs && pkgs.length > 0) {
          lines.push(`\n   ${severity}:`);
          for (const pkg of pkgs.slice(0, 5)) {
            const allowed = pkg.id && this.isVulnerabilityAllowed(pkg.id) ? ' [ALLOWED]' : '';
            const fix = pkg.fixAvailable ? ' [FIX AVAILABLE]' : '';
            lines.push(`   - ${pkg.name}: ${pkg.title}${allowed}${fix}`);
            if (pkg.url) {
              lines.push(`     URL: ${pkg.url}`);
            }
          }
          if (pkgs.length > 5) {
            lines.push(`   ... and ${pkgs.length - 5} more`);
          }
        }
      }
      lines.push('');
    }

    lines.push('📝 Recommendations:');
    for (const rec of report.recommendations) {
      lines.push(`   ${rec}`);
    }
    lines.push('');

    const statusEmoji = buildStatus === 'pass' ? '✅' : buildStatus === 'warn' ? '⚠️' : '❌';
    const statusText = buildStatus === 'pass' ? 'PASSED' : buildStatus === 'warn' ? 'WARNING' : 'FAILED';
    lines.push('════════════════════════════════════════════════════════════');
    lines.push(`                 BUILD STATUS: ${statusEmoji} ${statusText}                    `);
    lines.push('════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  public async run(): Promise<SecurityReport> {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           MAX BOOSTER - SECURITY AUDIT                     ║');
    console.log('║           Vulnerability Scanning System                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    const packageInfo = this.getPackageInfo();
    const auditResult = this.runNpmAudit();
    const outdatedPackages = this.checkOutdatedPackages();
    this.checkDeprecatedPackages();

    const effectiveCalc = this.calculateEffectiveVulnerabilities(auditResult);
    const effectiveVulnerabilities = {
      critical: effectiveCalc.critical,
      high: effectiveCalc.high,
      moderate: effectiveCalc.moderate,
      low: effectiveCalc.low,
    };

    const partialReport: Partial<SecurityReport> = {
      effectiveVulnerabilities,
      outdatedPackages,
    };

    const recommendations = this.generateRecommendations(partialReport);
    const buildStatus = this.determineBuildStatus(effectiveVulnerabilities);

    const report: SecurityReport = {
      timestamp: new Date().toISOString(),
      projectName: packageInfo.name,
      projectVersion: packageInfo.version,
      auditResult,
      outdatedPackages,
      allowedVulnerabilities: effectiveCalc.allowedIds,
      effectiveVulnerabilities,
      buildStatus,
      recommendations,
      summary: '',
    };

    report.summary = this.generateSummary(report);

    if (this.options.jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(report.summary);
    }

    if (this.options.outputFile) {
      const outputDir = dirname(this.options.outputFile);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(this.options.outputFile, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved to: ${this.options.outputFile}`);
    }

    const reportsDir = join(this.projectRoot, 'logs', 'security-reports');
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    const reportFileName = `security-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(join(reportsDir, reportFileName), JSON.stringify(report, null, 2));

    return report;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: {
    failOnHigh: boolean;
    reportOnly: boolean;
    jsonOutput: boolean;
    outputFile?: string;
  } = {
    failOnHigh: false,
    reportOnly: false,
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--fail-on-high':
        options.failOnHigh = true;
        break;
      case '--report-only':
        options.reportOnly = true;
        break;
      case '--json':
        options.jsonOutput = true;
        break;
      case '--output':
        options.outputFile = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Max Booster Security Audit Script

Usage: npm run security:audit [options]

Options:
  --fail-on-high     Fail build on high severity vulnerabilities (default: critical only)
  --report-only      Generate report without failing build
  --json             Output JSON report to stdout
  --output <file>    Write report to specified file
  --help, -h         Show this help message

Examples:
  npm run security:audit                    # Run audit, fail on critical
  npm run security:audit --fail-on-high     # Fail on critical or high
  npm run security:audit --report-only      # Generate report without failing
  npm run security:audit --json             # Output JSON for CI integration
        `);
        process.exit(0);
    }
  }

  const auditor = new SecurityAuditor(projectRoot, options);
  const report = await auditor.run();

  if (report.buildStatus === 'fail') {
    console.error('\n❌ Security audit failed! Build blocked due to security vulnerabilities.');
    console.error('   Fix the vulnerabilities or add them to security-allowlist.json with justification.');
    process.exit(1);
  } else if (report.buildStatus === 'warn') {
    console.warn('\n⚠️  Security audit passed with warnings. Review and address vulnerabilities soon.');
    process.exit(0);
  } else {
    console.log('\n✅ Security audit passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Security audit failed with error:', error);
  process.exit(1);
});

export { SecurityAuditor, AuditResult, SecurityReport, VulnerabilityInfo };
