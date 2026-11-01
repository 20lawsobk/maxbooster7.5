#!/usr/bin/env python3
"""Turn recorded test failures, exclusions and coverage gaps into repair tasks.

Generating a guide does not repair a feature or make a failed check pass.
Use --strict when unresolved tasks must make a master verification fail.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import datetime
import hashlib
import json
from pathlib import Path
import re
import shlex
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def redact(text: str) -> str:
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", str(text))
    text = re.sub(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+", "[REDACTED_PROVIDER_KEY]", text)
    text = re.sub(r"(?i)(postgres(?:ql)?://)[^@\s]+@", r"\1[REDACTED]@", text)
    return text.replace(str(ROOT), ".")


class Guide:
    def __init__(self, base: Path):
        self.base = base.resolve()
        self.items: list[dict] = []
        self.seen: set[tuple] = set()
        self.sources: dict[str, str] = {}
        self.junit_details: dict[str, dict[str, str]] = {}
        self.platform_templates: dict = {}
        self.entries: dict[str, dict] = {}
        self.inventory = self.load('test-inventory.json', {'entries': []}, required=True)
        self.entries = {row['path']: row for row in self.inventory.get('entries', [])}
        if not self.entries:
            self.add('missing_evidence', 'verification', 'test-inventory.json', 'Empty source inventory',
                     'No test/source entries were inventoried; an empty index cannot establish verification scope.', 'test-inventory.json')

    def load(self, name, default=None, required=False):
        file = self.base / name
        if not file.is_file():
            if required:
                self.add('missing_evidence', 'verification', str(name), 'No evidence file',
                         'The expected final report does not exist.', str(name))
            return default
        try:
            raw = file.read_bytes()
            self.sources[relative(file)] = hashlib.sha256(raw).hexdigest()
            value = json.loads(raw)
            if default is not None and not isinstance(value, type(default)):
                raise ValueError('unexpected report collection type')
            return value
        except (OSError, ValueError) as error:
            self.add('invalid_evidence', 'verification', str(name), 'Unreadable evidence',
                     f'{type(error).__name__}: report could not be parsed as JSON', str(name))
            return default

    def log(self, name: str | None, subdirectory='') -> str:
        if not name:
            return ''
        path = Path(name)
        candidates = [ROOT / path, self.base / path, self.base / subdirectory / path]
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
                if not (resolved.is_relative_to(ROOT) or resolved.is_relative_to(self.base)):
                    continue
                if resolved.is_file():
                    raw = resolved.read_bytes()
                    self.sources[relative(resolved)] = hashlib.sha256(raw).hexdigest()
                    return redact(raw.decode(errors='replace')[-262144:])
            except OSError:
                pass
        return ''

    def case_detail(self, name, case):
        if not name:
            return ''
        if name not in self.junit_details:
            details = {}
            path = Path(name)
            for candidate in (ROOT / path, self.base / path):
                try:
                    resolved = candidate.resolve()
                    if not (resolved.is_relative_to(ROOT) or resolved.is_relative_to(self.base)) or not resolved.is_file():
                        continue
                    raw = resolved.read_bytes()
                    self.sources[relative(resolved)] = hashlib.sha256(raw).hexdigest()
                    root = ET.fromstring(raw)
                    for entry in root.iter('testcase'):
                        failure = entry.find('failure')
                        if failure is None: failure = entry.find('error')
                        if failure is None: failure = entry.find('skipped')
                        if failure is not None:
                            details[entry.get('name', '')] = redact(failure.get('message', '') + '\n' + (failure.text or ''))[:20000]
                    break
                except (OSError, ET.ParseError):
                    continue
            self.junit_details[name] = details
        return self.junit_details[name].get(case, '')

    def command(self, file: str, supplied=None) -> str:
        entry = self.entries.get(file, {})
        if entry.get('command'):
            return entry['command']
        if isinstance(supplied, list):
            return shlex.join(map(str, supplied))
        if isinstance(supplied, str) and supplied:
            return supplied
        return 'npm run test:all -- --plan'

    def add(self, kind, group, file, case, message, evidence, command=None, detail='', prerequisites=None):
        key = (kind, group, file, case)
        if key in self.seen:
            return
        self.seen.add(key)
        observed = redact(message or 'The runner recorded this check as unresolved.')[:1200]
        diagnosis, confidence, actions, acceptance = advice(kind, file, case, observed + '\n' + detail,
                                                          prerequisites or self.entries.get(file, {}).get('prerequisites', []))
        ident = hashlib.sha256('\0'.join(key).encode()).hexdigest()[:16]
        priority = 2 if kind in ('coverage_gap', 'feature_acceptance_gap', 'mapping_gap', 'blocked_check', 'skipped_case', 'missing_execution') else 1
        if kind in ('missing_evidence', 'invalid_evidence') or (kind == 'dependency_vulnerability' and re.search(r'\b(?:critical|high)\b', observed, re.I)):
            priority = 0
        self.items.append({
            'id': 'repair-' + ident, 'kind': kind, 'group': group, 'file': file, 'case': case,
            'status': 'unresolved', 'priority': priority, 'observationConfidence': 'confirmed',
            'observed': observed, 'evidence': evidence,
            'diagnosis': {'confidence': confidence, 'description': diagnosis},
            'reproduce': {'cwd': self.entries.get(file, {}).get('cwd', '.'),
                          'command': self.command(file, command)},
            'actions': actions, 'requiredEvidence': acceptance,
        })

    def collect(self):
        self.load('summary.json', {}, required=True)
        cases = self.load('case-results.json', [], required=True)
        if not cases:
            self.add('missing_evidence', 'verification', 'case-results.json', 'No reconciled assertion cases',
                     'The final case index contains no executed framework assertions.', 'case-results.json')
        for row in cases:
            if row.get('status') not in ('failed', 'skipped', 'blocked'):
                continue
            self.add({'failed': 'assertion_failure', 'skipped': 'skipped_case', 'blocked': 'blocked_check'}[row['status']],
                     row.get('group', 'unknown'), row.get('file', 'unknown'), row.get('name') or 'Unnamed case',
                     row.get('message') or 'JUnit records this case as skipped; inspect its skip condition.',
                     row.get('junit') or row.get('evidence'), detail=self.case_detail(row.get('junit'), row.get('name')))

        node = self.load('node/results.json', {})
        subsystems = self.load('subsystems/results.json', {})
        separately_covered_rust = any(row.get('id') == 'rust-cleanup-concurrency'
            and row.get('exitCode') == 0 and row.get('passedTests', 0) >= 2
            for row in subsystems.get('results', []))
        for row in node.get('runs', []):
            text = self.log(row.get('log'), 'node')
            if row.get('exitCode'):
                names = re.findall(r'^not ok \d+ - (.+)', text, re.M) or ['Assertion script/process exit']
                error = first_error(text)
                for name in names:
                    self.add('assertion_failure', 'node', row['file'], name,
                             error or f"Process exited {row['exitCode']}", row.get('log'), row.get('command'), text)
            if row.get('counts', {}).get('skipped') and not (
                    row['file'] == 'tests/deployment-rust-phase.test.mjs' and separately_covered_rust):
                names = re.findall(r'^ok \d+ - (.+?)\s+# SKIP(.*)$', text, re.M)
                for name, reason in names or [('Conditional Node test cases', 'Inspect the original skip guard.')]:
                    self.add('skipped_case', 'node', row['file'], name, reason.strip(), row.get('log'), detail=text)

        python = self.load('python/results.json', {})
        for row in python.get('suites', []):
            if row.get('status') not in ('blocked', 'empty', 'timeout'):
                continue
            if self.entries.get(row['file'], {}).get('category') == 'support':
                continue
            self.add('blocked_check', 'python', row['file'], 'Unexecuted Python suite',
                     row.get('blockedReason') or row['status'], row.get('log') or 'python/results.json',
                     row.get('command'), prerequisites=self.entries.get(row['file'], {}).get('prerequisites', []))

        commerce = self.load('commerce/results.json', {})
        provider = self.load('providers/stripe-test-api.json', {})
        for row in commerce.get('blocked', []):
            if provider and row['path'] == 'tests/payment-processing/real-stripe-api.mjs':
                continue
            self.add('blocked_check', 'commerce', row['path'], 'Provider execution mode',
                     row.get('reason'), 'commerce/results.json')
        for row in provider.get('cleanup', []):
            if row.get('status') != 'PASS':
                self.add('provider_cleanup', 'stripe-test-api', 'tests/payment-processing/real-stripe-api.mjs',
                         row.get('resource', 'Owned sandbox resource'), row.get('note') or row.get('status'),
                         'providers/stripe-test-api.json',
                         detail='Keep the owned-resource journal. Verify final provider state and settle/revoke only this run\'s resources where supported. Immutable provider audit records require proof that active effects are resolved; do not invent deletion or cleanup success.')
        for name, collection in (('commerce', commerce.get('commands', [])),
                                 ('subsystems', subsystems.get('results', []))):
            for row in collection:
                if row.get('status') not in ('failed', 'blocked', 'timeout'):
                    continue
                file = row.get('path') or (row.get('sourceFiles') or [row.get('id', 'unknown')])[0]
                log = row.get('log') or row.get('stdoutFile')
                text = self.log(log, name)
                self.add('command_failure', name, file, row.get('id', 'Suite process'),
                         first_error(text) or row.get('reason') or f"Exit {row.get('exitCode')}", log,
                         row.get('command'), text)

        master = self.load('orchestration/results.json', {})
        master_ids = {row.get('id') for row in master.get('runs', [])}
        latest_audit = next((row for row in master.get('runs', []) if row.get('id') == 'audit'), None)
        for name in ('operations/results.json', 'final-checks/orchestration/results.json', 'orchestration/results.json'):
            report = master if name == 'orchestration/results.json' else self.load(name, {})
            for row in report.get('runs', []):
                if name == 'final-checks/orchestration/results.json' and row.get('id') in master_ids:
                    continue
                if row.get('exitCode') in (0, None):
                    continue
                file = row.get('file') or 'scripts/testing/run-all.py'
                text = self.log(row.get('log'))
                self.add('command_failure', row.get('group', 'operations'), file, row.get('id') or Path(file).name,
                         first_error(text) or f"Command exited {row['exitCode']}", row.get('log'), row.get('command'), text)

        audit = self.load('root/dependency-audit.json', {})
        older_audit = False
        if latest_audit and latest_audit.get('startedAt'):
            try:
                started = datetime.datetime.fromisoformat(latest_audit['startedAt']).timestamp()
                older_audit = (self.base / 'root/dependency-audit.json').stat().st_mtime < started
            except (ValueError, OSError):
                pass
        if audit.get('exitCode') and not (older_audit and latest_audit and latest_audit.get('exitCode') == 0):
            result = audit.get('result', {})
            vulnerabilities = result.get('vulnerabilities', {})
            if vulnerabilities:
                for name, row in vulnerabilities.items():
                    self.add('dependency_vulnerability', 'dependency-audit', 'package-lock.json', name,
                             f"{row.get('severity', 'unknown')} severity: affected range {row.get('range', 'see audit JSON')}",
                             'root/dependency-audit.json', audit.get('command'), json.dumps(row))
            else:
                self.add('command_failure', 'dependency-audit', 'package-lock.json', 'Advisory service verification',
                         result.get('message') or str(result.get('error', 'Audit did not complete')),
                         'root/dependency-audit.json', audit.get('command'))

        feeds = self.load('root/public-feeds.json', {})
        for row in feeds.get('result', {}).get('sources', []):
            if not row.get('passed'):
                self.add('assertion_failure', 'public-feeds', 'tests/awareness-public-read-smoke.py', row['source'],
                         f"Public adapter returned passed=false; rows={row.get('rows')}; reason={row.get('reason', 'required row contract did not pass')}",
                         'root/public-feeds.json')

        coverage = self.load('file-status.json', [], required=True)
        for row in coverage:
            if row.get('status') == 'not_run':
                self.add('missing_execution', row.get('group', 'unknown'), row['file'], 'No final execution evidence',
                         'The source inventory contains this check, but the reconciled run has no result for it.',
                         'file-status.json', prerequisites=row.get('prerequisites', []))
        self.collect_coverage()
        self.collect_platform()

    def collect_coverage(self):
        candidates = (self.base / 'coverage/coverage-final.json', self.base / 'coverage/coverage-final.platform.json')
        file = next((path for path in candidates if path.is_file()), None)
        if file is None:
            self.add('missing_evidence', 'coverage', 'vitest.platform.config.ts', 'Platform code coverage report',
                     'No final Istanbul function/statement/branch report was found.', 'coverage/coverage-final.json')
            return
        report = self.load(str(file.relative_to(self.base)), {})
        if not report:
            self.add('missing_evidence', 'coverage', 'vitest.platform.config.ts', 'Empty code coverage report',
                     'The coverage file contains no source entries; check the provider, include globs and actual instrumented run.', relative(file))
            return
        for absolute, row in report.items():
            if not isinstance(row, dict): continue
            source = relative(Path(row.get('path', absolute)))
            statements = [row.get('statementMap', {}).get(key, {}).get('start', {}).get('line')
                          for key, count in row.get('s', {}).items() if count == 0]
            functions = [{'name': row.get('fnMap', {}).get(key, {}).get('name', key),
                          'line': row.get('fnMap', {}).get(key, {}).get('loc', {}).get('start', {}).get('line')}
                         for key, count in row.get('f', {}).items() if count == 0]
            branches = [{'id': key, 'uncoveredArms': [i for i, count in enumerate(counts) if count == 0],
                         'line': row.get('branchMap', {}).get(key, {}).get('line')}
                        for key, counts in row.get('b', {}).items() if any(count == 0 for count in counts)]
            if statements or functions or branches:
                self.add('coverage_gap', 'coverage', source, 'Unexecuted source branches/functions',
                         f'{len(statements)} statements, {len(functions)} functions and {sum(len(b["uncoveredArms"]) for b in branches)} branch arms have zero hits.',
                         relative(file))
                self.items[-1]['uncovered'] = {'statementLines': sorted(set(line for line in statements if line)),
                                             'functions': functions, 'branches': branches}

    def collect_platform(self):
        platform = self.load('platform-register.json', {})
        if not platform or not platform.get('pages') or not platform.get('backendRoutes'):
            self.add('missing_evidence', 'platform', 'scripts/testing/platform-register.py', 'Feature acceptance register',
                     'The final page/API acceptance register is missing or contains no page/route inventory.', 'platform-register.json')
            return
        self.platform_templates = platform.get('checkTemplates', {})
        for row in platform.get('pages', []):
            checks = [check for check in row.get('requiredChecks', []) if check.get('status') not in ('PASS', 'PASSED')]
            if not checks: continue
            source = row.get('source', {})
            self.add('feature_acceptance_gap', 'platform', source.get('file', row.get('path', 'unknown')),
                     'Page ' + str(row.get('path')), f'{len(checks)} required feature checks remain unverified.', 'platform-register.json')
            self.items[-1]['platformReferences'] = {'pageId': row.get('id'), 'requiredChecks': checks,
                                                    'source': source, 'addTest': row.get('addTest'),
                                                    'templateDefinitions': 'See platformCheckTemplates in this report',
                                                    'testCandidatesAreProof': False}
        groups = defaultdict(list)
        for name in ('backendRoutes', 'interactions'):
            for row in platform.get(name, []):
                if row.get('status') in ('PASS', 'PASSED'): continue
                groups[row.get('source', {}).get('file', 'unknown')].append({'id': row.get('id'),
                    'kind': name, 'method': row.get('method'), 'path': row.get('path'),
                    'source': row.get('source'), 'checkIds': [check.get('id') for check in row.get('requiredChecks', [])]})
        for source, rows in groups.items():
            self.add('feature_acceptance_gap', 'platform', source, 'Handler/interaction acceptance evidence',
                     f'{len(rows)} source-defined routes or controls lack complete feature evidence.', 'platform-register.json')
            self.items[-1]['platformReferences'] = {'entries': rows, 'details': 'Follow each ID in platform-register.json for exact requirements and suggested test additions.'}
        unknown = defaultdict(list)
        for row in platform.get('unknownMappings', []):
            unknown[row.get('file', 'unknown')].append(row)
        for source, rows in unknown.items():
            self.add('mapping_gap', 'platform', source, 'Unresolved source-to-feature mappings',
                     f'{len(rows)} dynamic paths, imports or controls could not be resolved to a verified target.', 'platform-register.json')
            self.items[-1]['platformReferences'] = {'unknownMappings': rows}
        if platform.get('invalidEvidenceLinks'):
            self.add('missing_evidence', 'platform', 'platform-register.json', 'Invalid feature evidence links',
                     'The platform register rejected one or more proposed proof links.', 'platform-register.json')
            self.items[-1]['platformReferences'] = {'invalidEvidenceLinks': platform['invalidEvidenceLinks']}


def first_error(text):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if re.search(r'(?:Error(?: \[|:)|error:|ERR_|AssertionError|ModuleNotFoundError|FAIL\b|E\s+assert)', line):
            return '\n'.join(lines[max(0, index - 1):index + 9]).strip()[:1200]
    return text.strip()[-1000:]


def advice(kind, file, case, text, prerequisites):
    lower = (file + '\n' + case + '\n' + text).lower()
    rerun = ['Rerun the exact affected case/file and retain its original failure plus successful new evidence.',
             'Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.']
    if kind == 'invalid_evidence':
        return ('The recorded JSON is invalid or unreadable.', 'confirmed', [
            'Inspect the named report for reporter-output collisions or interrupted writes.',
            'Use separate scoped JSON/JUnit destinations, write atomically, and rerun the producing group.'],
            ['The file parses successfully and contains the actual producer exit code and current source identity.'])
    if 'err_blocked_by_administrator' in lower:
        return ('Chromium rejected the local HTML navigation under managed browser policy.', 'confirmed', [
            'Run the PDF test on an approved host/browser profile that permits its local fixture, or request the supported policy configuration for that test.',
            'Keep the real PDF generator and its Letter/PDF byte assertions. Do not disable browser policy, use insecure launch overrides, or mark an unrendered PDF as passed.'], rerun)
    if 'deletionoutbox' in lower:
        return ('The deletion test imports a source module that is absent from this checkout.', 'confirmed', [
            'Trace the current PocketStorageService.deleteNamedObject implementation and the historical DeletionOutbox contract.',
            'Restore the intended durable deletion-outbox implementation if still required, or port this regression to the supported deletion owner while preserving pending-delete, retry/restart and acknowledgement assertions.',
            'Add failure injection proving deleted content cannot reappear after a restart; do not add an empty class merely to satisfy the import.'], rerun)
    if ('python_runtime' in lower and any(word in lower for word in ('enoent', 'not found', 'missing', 'absent'))) or 'portable interpreter' in lower:
        return ('The portable-runtime test needs the actual packaged interpreter.', 'likely', [
            'Prepare python_runtime with script/prepare-runtime.ts or restore the checksum-verified prepared Python capsule using dist/pdim-restore.mjs.',
            'Verify python_runtime/bin/python3, its standard library origin and isolation verifier. A host Python or virtualenv cannot stand in for this package-boundary test.'], rerun)
    if any(word in lower for word in ('self-signed certificate', 'unable_to_verify', 'unable_to_get_issuer_cert', 'certificate verify failed')):
        return ('The failing client did not trust the configured proxy/system certificate chain.', 'likely', [
            'Keep the approved HTTP/HTTPS proxy and CA bindings for this command.',
            'For npm/Node, pass the configured NODE_EXTRA_CA_CERTS or NPM_CONFIG_CAFILE; SSL_CERT_FILE alone may not change Node\'s bundled trust.',
            'Example with the approved CA file: NODE_EXTRA_CA_CERTS=/path/to/approved-ca.pem npm audit --omit=dev --audit-level=high --json.',
            'Repeat the real registry request with certificate verification enabled. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0 or strict-ssl=false.'], rerun)
    if 'espeak' in lower and any(word in lower for word in ('missing', 'not found', 'skipped', 'no such file', 'phontab')):
        return ('The speech runtime or its matching data files are unavailable.', 'likely', [
            'Install espeak-ng and its matching data package; ensure espeak-ng is on PATH.',
            'For Debian/Ubuntu, the package names are espeak-ng and espeak-ng-data; Replit declares pkgs.espeak-ng in replit.nix.',
            'For an extracted package, set ESPEAK_DATA_PATH to its real data directory and retain required library paths.',
            'Run actual narration and decode the WAV output; a stub executable is not speech verification.'], rerun)
    if kind == 'dependency_vulnerability':
        return ('The advisory service reported this installed dependency as affected.', 'confirmed', [
            f'Inspect the advisory entry for {case} and every consumer in the root/imported lockfiles.',
            'Select a fixed compatible version, update only affected dependency declarations/locks, and reinstall from those locks.',
            'Run the real transport/archive/request regression for the affected consumer and repeat npm audit with the same production scope; do not suppress the advisory.'], rerun)
    if 'no module named' in lower or 'cannot find package' in lower:
        return ('A required test or application dependency could not be imported.', 'confirmed', [
            'Read the exact missing module in the captured exception and map it to the owning package/lockfile.',
            'Install Node dependencies from the root and imported workspace locks, or Python dependencies from scripts/testing/requirements.txt using the selected prepared interpreter.',
            'Use npm ci; pnpm --dir external/maxcore install --frozen-lockfile; pnpm --dir external/pdim install --frozen-lockfile; or /path/to/prepared/python -m pip install -r scripts/testing/requirements.txt for the owning language.',
            'If it is a first-party module, restore the source/export or correct the real import path; do not mock away the behavior under test.'], rerun)
    if 'unmocked external boundary' in lower or 'persistence was not supplied by the owner' in lower:
        return ('The isolated fixture does not supply a dependency required by the current subject.', 'likely', [
            'Compare the current subject imports/constructor with the fixture boundary map.',
            'Supply the actual pure validator or an owned disposable persistence adapter, retaining all original business assertions.',
            'Prove the fixture cannot contact shared services and rerun the real handler against its injected boundary.'], rerun)
    if 'enotempty' in lower or ('chromium' in lower and 'cleanup' in lower):
        return ('A browser descendant may still be writing the temporary profile during cleanup.', 'likely', [
            'Use tests/helpers-browser-processes.mjs and the PID-identity owned-process tracker while the browser is running.',
            'Stop only owned descendants before deleting the profile, and fail if any owned processes remain. Keep all UI/audio assertions.'], rerun)
    if any(word in lower for word in ('.jucer', 'juce/c++', 'linux vst3', 'native vst3')):
        return ('Native plugin compilation/processing requires its original source and an execution host.', 'needs_verification', [
            'Restore the original .jucer or CMake project, Source/*.cpp/*.h, resources and compatible JUCE version; Windows DLL/OBJ/LIB outputs are not a Linux source project.',
            'Run scripts/build-linux-vst3.py, validate ELF/GetPluginFactory, then run a real Linux VST3 host with DSP parity and authenticated Studio audio transport.'], rerun)
    if ('model_loaded' in lower or 'no_operationally_capable' in lower or 'certified' in lower
            or ('readiness' in lower and ('503' in lower or 'false' in lower))):
        return ('A required capability/readiness condition was not established.', 'needs_verification', [
            'Capture the disposable service readiness details and identify the exact unavailable component or candidate-quality gate.',
            'Implement or configure the required operational capability and verify actual text/media output, quality and durable delivery with the same public-signal conditioning.',
            'Keep separate unconfigured-state 503 tests and configured-state success tests. Do not forge a certificate, report model_loaded=true without proof, or turn a failing readiness gate into a blanket 200.'], rerun)
    if '/api/billing' in lower and ('404' in lower or 'retired' in lower):
        return ('The legacy assertion may address a retired billing endpoint.', 'needs_verification', [
            'Compare the exact method/path with reports/endpoint-audit.json and the current mounted billing/subscription handler.',
            'If the endpoint moved, port the journey to its supported route while retaining authentication, subscription-state and settlement assertions.',
            'If the contract still requires the route, implement the missing handler; do not accept 404 as successful billing.'], rerun)
    if ('401' in lower or '403' in lower or "reading 'email'" in lower or "reading 'id'" in lower) and any(word in lower for word in ('http', 'auth', 'feature-', 'critical-path', 'paid-user', 'billing')):
        return ('Authorization/session setup and application behavior must be distinguished before changing this expectation.', 'needs_verification', [
            'Inspect the isolated registration/login response, required adult birthdate, CSRF token, cookie jar, host/scheme and session persistence before the first failing protected request.',
            'Compare the successful 80-page authentication fixture with this test\'s request setup. Repair missing valid input or cookie/CSRF propagation in the fixture when proven.',
            'If valid owned credentials still fail, fix the actual session/authorization implementation and add an owner-versus-other-user regression. Do not bypass CSRF, MFA or ownership checks.'], rerun)
    if 'verify_evidence.py' in lower or 'verify_types.py' in lower:
        return ('An immutable historical diagnostic record or its referenced bytes no longer verifies.', 'needs_verification', [
            'Read the first missing file/hash assertion and obtain the matching recorded diagnostic artifact generation.',
            'Verify fixture/checkpoint/media SHA-256 identities without changing the historical expected digest to fit newer bytes.',
            'If this verifier is intentionally historical, retain it with its required archive and label it as such; add a separate current-generation verifier rather than treating old quality evidence as current.'], rerun)
    if 'voiceover' in lower and ('bad_music_path' in lower or 'required audio artifact is missing' in lower):
        return ('The fallback expectation may conflict with the current strict source-artifact requirement.', 'needs_verification', [
            'Trace voiceover_track input validation and the caller\'s promised behavior when the source music file is missing.',
            'Keep missing/corrupt source tests explicit. If narration-only fallback is a supported feature, implement and verify that separate mode without pretending a missing music artifact was mixed.',
            'If strict rejection is the intended contract, document it and add both rejection and valid-input narration/mix cases; preserve successful audio decoding and delivery checks.'], rerun)
    if kind in ('coverage_gap', 'feature_acceptance_gap'):
        return ('Source-defined behavior lacks the required execution/feature evidence.', 'confirmed', [
            f'Add a meaningful isolated regression for the named source: {file}. Follow its actual caller, route/owner and persistence boundary.',
            'Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.',
            'For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.',
            'Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.'], rerun)
    if kind == 'mapping_gap':
        return ('The source inventory cannot resolve the actual target of a dynamic registration or interaction.', 'confirmed', [
            f'Trace each listed line in {file} through its imports, router mounts, finite path builders and event-handler bindings.',
            'Add an explicit source mapping for the actual method/path/component and a regression proving the runtime dispatch reaches that target.',
            'Regenerate the platform register and link only matching test/case/source identities. Do not guess a target or count a filename association as business proof.'], rerun)
    if kind in ('blocked_check', 'skipped_case', 'missing_execution'):
        actions = [f'Provision the exact documented prerequisite: {value}' for value in prerequisites]
        if 'stripe' in lower or 'provider execution' in lower:
            actions += ['Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.',
                        'Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.']
        elif 'bucket' in lower:
            actions += ['Provide a dedicated test bucket or isolated fixture namespace with scoped access and generation preconditions.',
                        'Run the documented opt-in bucket roundtrip and retain checksum/restore/cleanup receipts; do not write to an arbitrary live namespace.']
        elif any(word in lower for word in ('load/', 'chaos', 'burn-in', 'fault', 'gpu', 'hardware', 'unshare')):
            actions += ['Prepare the documented disposable service/network topology or specialized hardware, with bounded concurrency, duration and owned-process cleanup.',
                        'Select an explicit isolated target and run the original assertions. A small mocked benchmark does not verify the requested load/fault/hardware behavior.']
        else:
            actions += ['Inspect the file\'s skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.',
                        'Run the exact source-defined assertions and record a fresh command exit plus artifact identity.']
        return ('This check was not executed under its required conditions.', 'confirmed', actions, rerun)
    if kind == 'missing_evidence':
        return ('The master run cannot establish this verification boundary without its expected artifact.', 'confirmed', [
            'Run the owning catalog/coverage/platform/test producer using the documented isolated master command.',
            'Retain a complete machine report, its current source identity and real process exit. Do not treat an absent report as zero failures.'],
            ['The expected artifact exists, parses and describes an actually executed producer.'])
    return ('The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.', 'needs_verification', [
        f'Reproduce the exact named case in {file} using the command below and inspect its first expected/actual difference.',
        'Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.',
        'Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.',
        'Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.'], rerun)


def write_markdown(path, report, limit=100):
    lines = ['# Actionable test and feature repair guide', '',
             f"Generated: `{report['generatedAt']}`. Status: **{report['status']}**. Unresolved tasks: **{len(report['items'])}**.", '',
             'Observations come from the linked reports. A likely diagnosis is not a confirmed application bug. '
             'Run the reproduction command in the prepared isolated environment, complete the listed actions, and retain fresh proof. '
             'Generating this guide does not change a test result.', '',
             '| Task kind | Unresolved |', '| --- | ---: |']
    lines += [f'| {kind} | {count} |' for kind, count in sorted(report['countsByKind'].items())]
    lines += ['', '## Failure families', '', '| Observed boundary / diagnosis | Tasks |', '| --- | ---: |']
    lines += [f'| {family} | {count} |' for family, count in sorted(report['failureFamilies'].items(), key=lambda row: (-row[1], row[0]))]
    lines += ['', 'Machine details, exact uncovered source locations and platform acceptance IDs are in `remediation.json`. '
              'The platform register provides every page/API/control requirement; these tasks link to it without copying the entire register.', '',
              f'This Markdown shows the first {min(limit, len(report["items"]))} prioritized tasks of {len(report["items"])}. '
              'The JSON retains every task and every uncovered location. Use `--markdown-limit N` to expand this review without changing the machine results.', '']
    for item in report['items'][:limit]:
        lines += [f"## `{item['id']}` — {item['case']}", '',
                  f"Source: `{item['file']}`. Group: `{item['group']}`. Kind: `{item['kind']}`. Priority: **P{item['priority']}**.", '',
                  f"Observed: {item['observed'].replace(chr(10), ' ')}", '',
                  f"Diagnosis (**{item['diagnosis']['confidence']}**): {item['diagnosis']['description']}", '',
                  f"Evidence: `{item['evidence']}`.", '', 'Reproduce from the documented working directory:', '',
                  '```sh', item['reproduce']['command'], '```', '', 'Required changes:', '']
        lines += [f'{index}. {action}' for index, action in enumerate(item['actions'], 1)]
        lines += ['', 'Proof needed:', ''] + [f'- {line}' for line in item['requiredEvidence']] + ['']
    path.write_text('\n'.join(line.rstrip() for line in lines).rstrip() + '\n')


def write_machine(path, report):
    # Keep full locations without millions of indentation bytes. Each task is
    # one JSON record line, while the entire file remains a standard object.
    header = {key: value for key, value in report.items() if key != 'items'}
    with path.open('w') as output:
        output.write(json.dumps(header, indent=2)[:-2] + ',\n  "items": [\n')
        for index, item in enumerate(report['items']):
            if index: output.write(',\n')
            output.write('    ' + json.dumps(item, separators=(',', ':')))
        output.write('\n  ]\n}\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'reports/test-verification')
    parser.add_argument('--output', type=Path, help='Directory for remediation.json/md; defaults to --input')
    parser.add_argument('--strict', action='store_true', help='Exit 1 if any unresolved task remains')
    parser.add_argument('--markdown-limit', type=int, default=100, help='Maximum prioritized tasks expanded in Markdown; JSON always retains all')
    args = parser.parse_args()
    if args.markdown_limit < 0:
        parser.error('--markdown-limit must be nonnegative')
    guide = Guide(args.input)
    guide.collect()
    guide.items.sort(key=lambda row: (row['priority'], row['group'], row['file'], row['case']))
    output = (args.output or args.input).resolve()
    output.mkdir(parents=True, exist_ok=True)
    report = {'schemaVersion': 1, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'status': 'needs_work' if guide.items else 'recorded_boundaries_clear',
              'productionReady': False, 'countsByKind': dict(Counter(row['kind'] for row in guide.items)),
              'failureFamilies': dict(Counter(row['diagnosis']['description'] for row in guide.items)),
              'platformCheckTemplates': guide.platform_templates,
              'inputSha256': guide.sources, 'items': guide.items,
              'limits': ['No current test or application assertion is changed by this script',
                         'Diagnosis confidence is distinct from the observed failure',
                         'Coverage and static associations do not prove complete business behavior',
                         'No provider/private data/hardware behavior is inferred from missing execution']}
    write_machine(output / 'remediation.json', report)
    write_markdown(output / 'remediation.md', report, args.markdown_limit)
    print(json.dumps({'status': report['status'], 'unresolvedTasks': len(guide.items), 'countsByKind': report['countsByKind']}))
    return int(args.strict and bool(guide.items))


if __name__ == '__main__':
    sys.exit(main())
