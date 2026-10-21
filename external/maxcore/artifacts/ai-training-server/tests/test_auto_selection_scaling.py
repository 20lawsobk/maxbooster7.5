"""Selector scheduling/cache checks; capability itself keeps real-agent guards."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from ai_model.training import auto_selection as selection
from ai_model.training import candidate_registry as registry
from ai_model.model.inference_budget import inference_deadline
from ai_model.model.candidate_model import PublicContentTransformer

PEAK = 'public-peak-shortform-v1'

class SelectionScalingTests(unittest.TestCase):
    def setUp(self):
        selection._OPERATIONAL_CACHE.clear()

    def candidate(self, root, name, observed, peak=True):
        run = root/'candidate_runs'/name
        run.mkdir(parents=True)
        report = {'architecture':'public-content-transformer-v2','model_config':{'width':128,'layers':1,'heads':8,'expansion':4},'learning_generation':observed}
        if peak:
            report['learning_stream'] = {'policy':PEAK,'architecture':'public-content-transformer-v2'}
        (run/'report.json').write_text(json.dumps(report))
        (run/'corpus.manifest.json').write_text(json.dumps({'records':[{'live_provenance':{'observed_at':observed}}]}))
        (run/'candidate.pt').write_bytes(name.encode())
        marker = root/'live_candidate_admissions'/name
        marker.mkdir(parents=True)
        (marker/'certified.json').write_text('{}')
        return run

    def decision(self, run):
        run = Path(run)
        report = json.loads((run/'report.json').read_text())
        return {'eligible':True,'fingerprints':{'run':str(run),'observed_at':report['learning_generation'],
            'checkpoint_sha256':registry.sha256(run/'candidate.pt'),'report_sha256':registry.sha256(run/'report.json')}}

    def test_newest_beyond_first_hundred_and_peak_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for i in range(105): self.candidate(root,f'live-{i:04}',i)
            wrong = self.candidate(root,'live-zz-chart',1000,peak=False)
            with patch.object(registry,'REGISTRY',root/'registry'), patch.object(registry,'public_live_eligibility',side_effect=self.decision), patch.object(registry,'select_candidate') as selected, patch.object(selection,'_operational_candidate',return_value=True):
                result = selection.auto_select(learning_policy=PEAK)
                self.assertEqual(Path(selected.call_args.kwargs['run']).name,'live-0104')
                self.assertEqual(result['state'],'selected')

    def test_two_new_probes_per_tick_and_cached_failures_progress(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for i in range(5): self.candidate(root,f'live-{i}',i)
            with patch.object(registry,'REGISTRY',root/'registry'), patch.object(registry,'public_live_eligibility',side_effect=self.decision), patch('ai_model.model.candidate_serving.create_candidate_adapter',return_value=object()), patch('ai_model.generation.capability.verify_text_capability',side_effect=ValueError('not capable')) as probe:
                result = selection.auto_select(learning_policy=PEAK)
                self.assertTrue(result['probe_limited'])
                self.assertEqual(probe.call_count,2)
                selection.auto_select(learning_policy=PEAK)
                self.assertEqual(probe.call_count,4)
                selection.auto_select(learning_policy=PEAK)
                self.assertEqual(probe.call_count,5)

    def test_cache_binds_checkpoint_report_certificate_configuration_budget(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            run = self.candidate(root,'live-test',1)
            checkpoint = registry.sha256(run/'candidate.pt')
            with patch('ai_model.model.candidate_serving.create_candidate_adapter',return_value=object()), patch('ai_model.generation.capability.verify_text_capability',return_value={}) as probe:
                self.assertTrue(selection._operational_candidate(str(run),checkpoint))
                self.assertTrue(selection._operational_candidate(str(run),checkpoint))
                self.assertEqual(probe.call_count,1)
                (root/'live_candidate_admissions'/run.name/'certified.json').write_text('{"changed":true}')
                self.assertTrue(selection._operational_candidate(str(run),checkpoint))
                self.assertEqual(probe.call_count,2)
                report = json.loads((run/'report.json').read_text())
                report['model_config']['heads'] = 4
                (run/'report.json').write_text(json.dumps(report))
                self.assertTrue(selection._operational_candidate(str(run),checkpoint))
                self.assertEqual(probe.call_count,3)
                with patch.dict(os.environ,{'MAXCORE_CAPABILITY_PROBE_SECONDS':'60'}):
                    self.assertTrue(selection._operational_candidate(str(run),checkpoint))
                self.assertEqual(probe.call_count,4)
                (run/'candidate.pt').write_bytes(b'tamper')
                self.assertFalse(selection._operational_candidate(str(run),checkpoint))
                self.assertEqual(probe.call_count,4)

    def test_requested_peak_never_falls_back_to_reviewed_selection(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(registry,'REGISTRY',Path(folder)/'registry'), patch.object(selection,'_reviewed_selection') as legacy:
            self.assertEqual(selection.auto_select(learning_policy=PEAK)['state'],'waiting_for_candidate')
            legacy.assert_not_called()

    def test_deadline_interrupts_actual_kernel_generation(self):
        model = PublicContentTransformer(context=128,width=128,layers=1)
        original = model.backend.dispatch
        deadline_token = inference_deadline.set(time.monotonic()+10)
        def dispatch(operation,*args):
            result = original(operation,*args)
            if operation == 'transformer_prefill':
                inference_deadline.set(time.monotonic()-1)
            return result
        try:
            with patch.object(model.backend,'dispatch',side_effect=dispatch):
                with self.assertRaises(TimeoutError):
                    model.generate('A',max_new_tokens=8,min_length=8)
            self.assertGreater(model.backend.dispatch_counts['transformer_prefill'],0)
        finally:
            inference_deadline.reset(deadline_token)

    def test_retained_returns_only_validated_matching_policy_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            run = self.candidate(root,'live-incumbent',1)
            decision = self.decision(run)
            registry_path = root/'registry'
            registry_path.mkdir()
            (registry_path/'selected.json').write_text(json.dumps({'eligibility_policy':registry.PUBLIC_LIVE_POLICY,'fingerprints':decision['fingerprints']}))
            with patch.object(registry,'REGISTRY',registry_path), patch.object(registry,'selected_eligibility',return_value=decision), patch.object(registry,'public_live_eligibility',side_effect=self.decision), patch.object(selection,'_operational_candidate',return_value=True):
                result = selection.auto_select(learning_policy=PEAK)
                self.assertEqual(result['state'],'retained')
                self.assertTrue(result['validated_selected'])
                self.assertEqual(result['learning_policy'],PEAK)
                self.assertEqual(result['checkpoint_sha256'],decision['fingerprints']['checkpoint_sha256'])
                wrong = selection.auto_select(learning_policy='different-policy')
                self.assertEqual(wrong['state'],'waiting_for_candidate')
                self.assertNotIn('validated_selected',wrong)
                self.assertNotIn('checkpoint_sha256',wrong)
