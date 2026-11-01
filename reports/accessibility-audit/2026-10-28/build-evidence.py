#!/usr/bin/env python3
"""Reproduce the owned, credential-free focused check and all-80 audit matrix.

Run at the repository root after npm run build. Historical before receipts are
retained, not regenerated. No application/provider/database runtime is started.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path.cwd()
OUT = ROOT / 'reports/accessibility-audit/2026-10-28'
SOURCES = [
    'client/src/components/layout/AppLayout.tsx',
    'client/src/components/layout/TopBar.tsx',
    'client/src/components/layout/Sidebar.tsx',
    'client/src/components/ui/button.tsx',
    'tests/layout-navigation-accessibility-browser.test.mjs',
    'tests/helpers-browser-processes.mjs',
    'script/deployment/owned-processes.mjs',
]


def fingerprint(path):
    data = path.read_bytes()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


before = {name: fingerprint(ROOT / name) for name in SOURCES}
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
selector = {'PATH': '/workspace/.cloud-tools/node_modules/.bin:/usr/bin:/bin',
            'HOME': '/tmp', 'CHROMIUM_PATH': '/usr/bin/chromium',
            'LD_LIBRARY_PATH': '/workspace/.cloud-system/usr/lib/x86_64-linux-gnu'}
command = ['node', '--test', '--test-reporter=tap',
           '--test-reporter-destination=' + str(OUT / 'after-final.txt'),
           '--test-reporter=junit',
           '--test-reporter-destination=' + str(OUT / 'after-final.junit.xml'),
           SOURCES[4]]
with (OUT / 'after-final-driver.txt').open('w') as log:
    result = subprocess.run(command, env=selector, stdout=log,
                            stderr=subprocess.STDOUT, timeout=45)
after = {name: fingerprint(ROOT / name) for name in SOURCES}
write('source-hashes.json', after)
junit = ET.parse(OUT / 'after-final.junit.xml')
cases = junit.findall('.//testcase')
passed = [case.attrib['name'] for case in cases
          if case.find('failure') is None and case.find('error') is None
          and case.find('skipped') is None]
write('focused-receipt.json', {
    'startedAt': started,
    'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'command': command,
    'environmentVariableNames': sorted(selector),
    'configuredApplicationOrProviderCredentialsInherited': False,
    'exitCode': result.returncode,
    'sourceInputsBefore': before,
    'sourceInputsAfter': after,
    'sourceInputsUnchanged': before == after,
    'leafCases': len(cases),
    'passedLeafCases': len(passed),
    'passedCaseNames': passed,
    'scope': 'Actual shared layout/TopBar/Sidebar/Button/icons/production CSS in Chromium; auth, translation and unrelated widgets are owned fixtures. Not full page, real auth or full accessibility compliance.',
})
if result.returncode or before != after or len(cases) != 9 or len(passed) != 9:
    raise SystemExit('Focused check or exact source binding failed; preserve receipts')

register_path = ROOT / 'reports/test-verification/platform-register.json'
plan_path = ROOT / 'reports/test-verification/completion-plan.json'
register = json.loads(register_path.read_text())
plan = json.loads(plan_path.read_text())
criteria = [
    ('A01', 'Non-text alternatives', '1.1.1', 'Every informative image/icon/canvas/audio visualizer has an equivalent meaningful name/description; decorative media is excluded from the accessibility tree. No required information only in a waveform/canvas.'),
    ('A02', 'Media alternatives', '1.2.1–1.2.5', 'Prerecorded required audio/video has equivalent transcript/captions/audio description as applicable; live synchronized audio has captions. Test actual media controls and captions. Mark applicability only with explicit reviewed reason.'),
    ('A03', 'Semantics and relationships', '1.3.1–1.3.3', 'Headings, landmarks, form labels/instructions, table headers and groups expose correct programmatic relationships; no duplicated/nested interactive controls or hidden required information.'),
    ('A04', 'Orientation and input purpose', '1.3.4–1.3.5', 'Supported tasks work in portrait and landscape without a justified essential lock; personal-data inputs expose correct autocomplete purpose.'),
    ('A05', 'Color, contrast, audio and text', '1.4.1–1.4.3,1.4.5,1.4.11', 'Information does not rely on color alone; ordinary text contrast >=4.5:1, large text >=3:1 and essential controls/focus graphics >=3:1 in every enabled theme/state. Autoplay audio longer than3seconds has independent stop/pause/volume control. Use actual text rather than images of text except reviewed customizable/essential exceptions.'),
    ('A06', 'Resize and reflow', '1.4.4,1.4.10,1.4.12', 'Text at200% and layout at320CSSpx/400% zoom retain all information and controls without two-dimensional scrolling except explicitly essential content; WCAG text-spacing overrides cause no clipping/loss.'),
    ('A07', 'Hover/focus additional content', '1.4.13', 'Every tooltip/popover shown by hover or focus is dismissible, hoverable and persistent until dismissed or its trigger is invalidated.'),
    ('A08', 'Keyboard operation', '2.1.1–2.1.2', 'Every action and parameter adjustment completes with keyboard; no trap; drag-only/time-critical gestures have a keyboard path unless the exact criterion exception is documented.'),
    ('A09', 'Shortcuts, timing and animation', '2.1.4,2.2.1–2.2.2,2.3.1', 'Single-character shortcuts can be disabled/remapped/focus-scoped; time limits can be adjusted as required; moving/auto-updating content can pause; no prohibited flashing.'),
    ('A10', 'Bypass and page identity', '2.4.1–2.4.2', 'First-keyboard bypass skips repeated navigation into actual page content; each direct route has an accurate programmatic document title and logical landmark/heading structure.'),
    ('A11', 'Focus order and visibility', '2.4.3,2.4.7,2.4.11', 'Sequential focus follows meaningful task order; closed/hidden panels receive no keyboard focus; focus is visible and not entirely obscured by sticky UI, modal or overlay.'),
    ('A12', 'Link purpose and navigation consistency', '2.4.4–2.4.6,3.2.3–3.2.4', 'Link/control names identify their purpose in context; multiple required ways to locate pages exist; navigation and repeated components remain consistently named/ordered.'),
    ('A13', 'Pointer, drag and target size', '2.5.1–2.5.4,2.5.7–2.5.8', 'Multipoint/path/drag actions have single-pointer alternatives; cancellation works; accessible name contains visible label; no mandatory motion actuation; targets meet24x24CSSpx or explicit spacing/exception rule.'),
    ('A14', 'Language and locale', '3.1.1–3.1.2', 'Actual document language and language changes are programmatic; translated/RTL states keep names, reading/focus order and complete content without clipping.'),
    ('A15', 'Predictability and consistent help', '3.2.1–3.2.2,3.2.6', 'Focus/input changes do not unexpectedly navigate or submit; help mechanisms retain consistent relative order when repeated.'),
    ('A16', 'Form errors, labels and financial safety', '3.3.1–3.3.4', 'Required fields and errors are named, linked and announced; suggestions are available when known; financial/legal/deletion submissions support correction, reversal or reviewed confirmation.'),
    ('A17', 'Redundant entry and accessible authentication', '3.3.7–3.3.8', 'Same-session entry is reused/selectable where required; login/recovery permit password-manager/autofill/paste and avoid unsupported cognitive-function tests without an accessible alternative.'),
    ('A18', 'Name, role, value and status', '4.1.2–4.1.3', 'All components expose meaningful name/role/state/value; expanded/control/selection/error/busy changes match real behavior; results/errors/progress announcements work without unexpected focus loss.'),
]
requirements = [{'id': i, 'category': name, 'wcag22AA': wcag,
                 'passCriteria': acceptance,
                 'failCriteria': 'Any required state or criterion fails the stated acceptance; missing, stale, skipped or inapplicable-without-reviewed-reason evidence remains UNVERIFIED and cannot establish compliance.',
                 'evidenceRequired': ['source-bound automated interaction/DOM/AX results', 'manual keyboard and applicable screen-reader/device review', 'reviewed applicability and retained failures'],
                 'status': 'UNVERIFIED'} for i, name, wcag, acceptance in criteria]
normative = {
    'A01':['1.1.1'], 'A02':['1.2.1','1.2.2','1.2.3','1.2.4','1.2.5'],
    'A03':['1.3.1','1.3.2','1.3.3'], 'A04':['1.3.4','1.3.5'],
    'A05':['1.4.1','1.4.2','1.4.3','1.4.5','1.4.11'],
    'A06':['1.4.4','1.4.10','1.4.12'], 'A07':['1.4.13'],
    'A08':['2.1.1','2.1.2'], 'A09':['2.1.4','2.2.1','2.2.2','2.3.1'],
    'A10':['2.4.1','2.4.2'], 'A11':['2.4.3','2.4.7','2.4.11'],
    'A12':['2.4.4','2.4.5','2.4.6','3.2.3','3.2.4'],
    'A13':['2.5.1','2.5.2','2.5.3','2.5.4','2.5.7','2.5.8'],
    'A14':['3.1.1','3.1.2'], 'A15':['3.2.1','3.2.2','3.2.6'],
    'A16':['3.3.1','3.3.2','3.3.3','3.3.4'], 'A17':['3.3.7','3.3.8'],
    'A18':['4.1.2','4.1.3'],
}
assert len({criterion for ids in normative.values() for criterion in ids}) == 55
for requirement in requirements:
    requirement['normativeCriterionIds'] = normative[requirement['id']]
pages = []
for ordinal, page in enumerate(register['pages'], 1):
    work = plan['businessPageWork'][page['id']]
    shared = 'client/src/components/layout/AppLayout.tsx' in page['reachableSourceFiles']
    pages.append({
        'ordinal': ordinal, 'pageId': page['id'], 'route': page['path'],
        'component': page['component'], 'source': page['source'],
        'sharedLayoutReachable': shared,
        'sharedNavigationFocusedReceipt': 'focused-receipt.json' if shared else None,
        'sharedNavigationReceiptApplicability': 'Shared component only; static reachable import is not proof that this exact route/state rendered it.' if shared else 'No AppLayout reachability established in register.',
        'accessibilityStatus': 'UNVERIFIED', 'productionAccessibilityGreen': False,
        'requiredCriterionIds': [item['id'] for item in requirements],
        'businessSectionIds': [s['id'] for s in work['businessSections']],
        'requiredActions': ['Exercise A01–A18 for every named section and all pending/data/empty/error/permission/success/modal states on this exact route.', 'Retain source-bound automated and manual evidence; review applicability explicitly; repair failures before closing any criterion.'],
        'existingDetailedLedger': f'../../../docs/testing/platform-pages/{ordinal:02}-{page["id"]}.md',
    })
assert len(pages) == 80 and len({p['pageId'] for p in pages}) == 80
write('page-matrix.json', {
    'scope': 'All80 registered route declarations and all their existing business-section IDs; no aliases collapsed.',
    'inputPlatformRegister': {'path': str(register_path.relative_to(ROOT)), **fingerprint(register_path), 'platformSourceDigest': register['platformSourceDigest'], 'freshness': 'Historical register snapshot; shared source changed after that master. Regenerate platform register after the new frozen master.'},
    'inputCompletionPlan': {'path': str(plan_path.relative_to(ROOT)), **fingerprint(plan_path)},
    'requirements': requirements, 'pages': pages,
    'summary': {'pages': len(pages), 'sharedLayoutReachablePages': sum(p['sharedLayoutReachable'] for p in pages), 'pageAccessibilityGreen': 0, 'fullPageAccessibilityUnverified': 80,
                'businessSectionsRetained': sum(len(p['businessSectionIds']) for p in pages)},
})
write('summary.json', {
    'status': 'focused_shared_navigation_passed_full_platform_accessibility_unverified',
    'productionReady': False, 'all80AccessibilityGreen': False,
    'pairedSameFinalTest': {'testSha256': before[SOURCES[4]]['sha256'], 'beforeExitCode': 1, 'beforeLeafCases': 9, 'beforePass': 2, 'beforeFail': 7, 'afterExitCode': result.returncode, 'afterLeafCases': 9, 'afterPass': 9, 'afterFail': 0, 'afterSkip': 0},
    'frameworkCounts': 'TAP10includes the parent; JUnit9counts actualleafcases. Never sum parent and leaf totals.',
    'configuredSecretsUsed': 0,
    'a11yEngine': 'Actual Chromium Accessibility domain and real Input.dispatchKeyEvent; axe-core not installed and not substituted with a heuristic compliance score.',
    'sourceInputsUnchanged': before == after,
    'notes': ['Initial after.txt onefocusfailure was caused by an incomplete synthetic Enter event; after-keyboard.txt corrects nativekeycode/text. Both retained. before-final-test.txt reran originalHEAD sources with the same finaltest and proved7actualdefects.', 'The9focused checks do not establish all80page compliance, full realauthentication, screenreader usability, contrast, reflow, localization, mediaalternatives or providerjourneys.'],
})
artifacts = []
for file in sorted(OUT.rglob('*')):
    if file.is_file() and file.name != 'manifest.json':
        artifacts.append({'path': str(file.relative_to(OUT)), **fingerprint(file)})
write('manifest.json', {'schemaVersion': 1, 'artifacts': artifacts})
print(json.dumps({'leafPass': len(passed), 'pages': len(pages), 'sharedLayoutReachable': sum(p['sharedLayoutReachable'] for p in pages), 'fullPageAccessibilityGreen': 0}))
