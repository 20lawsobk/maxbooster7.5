"""Token-unit boundary tests; no generated prose fixtures or fallback output."""
import unittest
from unittest.mock import patch
from ai_model.agents.script_agent import ScriptAgent, ScriptRequest, _script_prompt
from ai_model.model.candidate_model import CandidateTransformer, PublicContentTransformer
from ai_model.model.candidate_serving import CandidateServingAdapter
from ai_model.generation.plan import GenerationPlan, active_plan


class ScriptByteBudgetTests(unittest.TestCase):
    def setUp(self):
        self.plan_token = active_plan.set(GenerationPlan.from_request({'idea':'Music release','seed':17}, 'text'))

    def tearDown(self):
        active_plan.reset(self.plan_token)

    def test_full_utf8_prompt_and_caption_budget(self):
        model = PublicContentTransformer(context=1024,width=128,layers=1)
        self.assertEqual(model.script_generation_budget('a','short'),384)
        self.assertEqual(model.script_generation_budget('a','optimal'),768)
        self.assertEqual(model.script_generation_budget('a','long'),1023)
        self.assertEqual(model.script_generation_budget('é'*300,'optimal'),424)
        with self.assertRaisesRegex(ValueError,'no prompt truncation'):
            model.script_generation_budget('é'*400,'optimal')
        with self.assertRaisesRegex(ValueError,'caption length'):
            model.script_generation_budget('a','unknown')

    def test_script_boundary_passes_declared_budget_unchanged(self):
        req = ScriptRequest(idea='A new music single',platform='instagram',goal='engagement',tone='energetic',caption_length='short')
        model = PublicContentTransformer(context=1024,width=128,layers=1)
        adapter = CandidateServingAdapter(model,True,True)
        expected = model.script_generation_budget(_script_prompt(req),'short')
        with patch('ai_model.generation.awareness.ensure_context_once',return_value=''), patch.object(adapter,'generate',side_effect=RuntimeError('routing verified')) as generate:
            with self.assertRaisesRegex(RuntimeError,'routing verified'):
                ScriptAgent(adapter).run(req)
        self.assertEqual(generate.call_args.kwargs['max_new_tokens'],expected)
        self.assertEqual(generate.call_args.args[0],_script_prompt(req))

    def test_legacy_boundary_keeps_eighty_word_budget(self):
        class Legacy:
            def generate(self,*args,**kwargs):
                raise RuntimeError('routing verified')
        legacy = Legacy()
        req = ScriptRequest(idea='A new music single',platform='instagram',goal='engagement',tone='energetic')
        with patch('ai_model.generation.awareness.ensure_context_once',return_value=''), patch.object(legacy,'generate',side_effect=RuntimeError('routing verified')) as generate:
            with self.assertRaisesRegex(RuntimeError,'routing verified'):
                ScriptAgent(legacy).run(req)
        self.assertEqual(generate.call_args.kwargs['max_new_tokens'],80)

    def test_actual_v2_kernels_generate_beyond_smoke_limit(self):
        model = PublicContentTransformer(context=512,width=128,layers=1)
        output = model.generate('A',max_new_tokens=257,min_length=257,temperature=.8,top_k=32,seed=5)
        self.assertEqual(len(output['token_ids']),257)
        self.assertEqual(model.backend.dispatch_counts['transformer_prefill'],1)
        self.assertEqual(model.backend.dispatch_counts['transformer_decode'],256)
        self.assertEqual(model.backend.dispatch_counts['transformer_forward'],0)
        count = model.backend.dispatch_counts['transformer_forward']
        with self.assertRaisesRegex(ValueError,'no prompt truncation'):
            model.generate('a'*500,max_new_tokens=257)
        with self.assertRaisesRegex(ValueError,'1..1024'):
            model.generate('A',max_new_tokens=1025)
        self.assertEqual(model.backend.dispatch_counts['transformer_forward'],count)
        with self.assertRaisesRegex(ValueError,'1..256'):
            CandidateTransformer().generate('A',max_new_tokens=257)
