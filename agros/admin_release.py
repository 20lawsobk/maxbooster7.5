"""Private-admin acceptance: separate evidence from later public launch readiness."""
import json
from pathlib import Path
import uuid

from verify import digest, finite_number, read, run, write

MANIFEST = Path(__file__).with_name('admin_release.json')


def collect(root, session, config, head, source_sha256):
    manifest = read(MANIFEST)
    criteria = manifest['required_criteria']
    result = {'id': 'admin-private', 'ready': False, 'status': 'UNVERIFIED',
              'criteria': {key: {'status': 'UNVERIFIED'} for key in criteria},
              'manifest_sha256': digest(MANIFEST), 'source_sha256': source_sha256,
              'reason': 'Configure a trusted admin_release_argv acceptance harness',
              'deferred_public_work': manifest['deferred']}
    command = config.get('admin_release_argv')
    if not command:
        return result
    directory = session / 'admin-release'
    directory.mkdir(mode=0o700)
    artifacts = directory / 'artifacts'
    artifacts.mkdir(mode=0o700)
    request_path, evidence = directory / 'request.json', directory / 'evidence.json'
    request = {'schema': 1, 'id': 'admin-private', 'nonce': uuid.uuid4().hex,
               'head': head, 'source_sha256': source_sha256,
               'manifest_sha256': digest(MANIFEST), 'manifest': manifest,
               'artifacts': str(artifacts), 'evidence': str(evidence)}
    write(request_path, request)
    substitutions = {'{request}': str(request_path), '{evidence}': str(evidence),
                     '{root}': str(root), '{artifacts}': str(artifacts)}
    argv = []
    for item in command:
        for token, value in substitutions.items():
            item = item.replace(token, value)
        argv.append(item)
    detail = run(argv, root, directory / 'acceptance.log', config.get('admin_release_timeout', 1800))
    result.update(status='FAIL', reason='Missing or invalid private-admin evidence', command=detail,
                  log=str(directory / 'acceptance.log'))
    try:
        from team import regular_file, safe_relative
        regular_file(evidence, directory)
        if evidence.stat().st_size > 5 * 1024 * 1024:
            raise ValueError('Acceptance evidence exceeds 5 MiB')
        values = read(evidence)
        if detail['exit'] or values.get('schema') != 1 or any(values.get(key) != request[key]
                for key in ('id', 'nonce', 'head', 'source_sha256', 'manifest_sha256')):
            raise ValueError('Evidence is not bound to the current admin acceptance run')
        if not isinstance(values.get('environment'), str) or not values['environment'].strip():
            raise ValueError('Acceptance must identify the tested environment')
        checks = values.get('criteria')
        if not isinstance(checks, dict) or set(checks) != set(criteria):
            raise ValueError('Every admin criterion must be present, with no unknown criteria')
        hashes = {}
        all_pass = True
        for key, check in checks.items():
            if not isinstance(check, dict) or check.get('status') not in ('PASS', 'FAIL', 'UNVERIFIED'):
                raise ValueError('Invalid criterion status')
            all_pass = all_pass and check['status'] == 'PASS'
            paths = check.get('evidence')
            if not isinstance(paths, list) or not paths:
                raise ValueError('Each criterion must reference actual evidence')
            for name in paths:
                if not safe_relative(name):
                    raise ValueError('Unsafe evidence reference')
                hashes[name] = digest(regular_file(artifacts / name, artifacts))
        metrics = values.get('metrics', {})
        for key, bounds in manifest['numeric_limits'].items():
            value = metrics.get(key)
            if not finite_number(value) or not bounds['min'] <= value <= bounds['max']:
                all_pass = False
        result.update(criteria=checks, metrics=metrics, evidence=str(evidence), artifact_hashes=hashes,
                      environment=values['environment'], status='PASS' if all_pass else 'FAIL',
                      reason='Admin acceptance measured; source gates and final artifact validation still required')
    except (OSError, ValueError, KeyError, TypeError) as error:
        result['reason'] = str(error)
    return result


def finalize(result, report):
    mandatory = read(MANIFEST)['mandatory_source_gates']
    blockers = [key for key in mandatory if report['gates'].get(key, {}).get('status') != 'PASS']
    if report.get('artifact_contract', {}).get('status') != 'PASS':
        blockers.append('artifact_contract')
    if not report.get('unchanged'):
        blockers.append('source_or_controller_changed')
    result['blocking_source_gates'] = blockers
    result['ready'] = result['status'] == 'PASS' and not blockers
    result['decision'] = 'GO_ADMIN_PRIVATE' if result['ready'] else 'NO_GO_ADMIN_PRIVATE'
    result['public_release_ready'] = bool(report.get('ready'))
    return result
