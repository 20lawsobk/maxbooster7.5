"""Archive integrity must stay distinct from missing current inference evidence."""
import importlib.util
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('archived_type_verifier', ROOT / 'evaluations/maxcore-quality/verify_types.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_completed_archives_validate_without_requiring_obsolete_serving_weights():
    result = MODULE.verify_archives()
    assert [run['records'] for run in result['runs']] == [21, 8]
    assert result['archivedCheckpoint']['ai_model/weights/model.pt']
    assert 'not output quality' in result['scope']


def test_current_identity_check_fails_when_model_bytes_are_missing():
    with tempfile.TemporaryDirectory() as temporary:
        try:
            MODULE.verify_current_checkpoint({'ai_model/weights/model.pt': '0' * 64}, Path(temporary))
        except FileNotFoundError as error:
            assert 'UNVERIFIED' in str(error)
        else:
            raise AssertionError('Missing current model must never validate')


def test_incomplete_later_archive_cannot_be_promoted_to_verified_evidence():
    try:
        MODULE.verify_archives(include_later=True)
    except AssertionError as error:
        assert '2026-09-24-post-fix/campaign/result.json' in str(error)
        assert 'incomplete' in str(error)
    else:
        raise AssertionError('Interrupted historical campaign must remain incomplete')
