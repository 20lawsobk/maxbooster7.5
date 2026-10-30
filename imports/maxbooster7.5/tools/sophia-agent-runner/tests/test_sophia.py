import importlib.util
import io
import json
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1] / 'scripts' / 'sophia.py'
spec=importlib.util.spec_from_file_location('sophia',SCRIPT)
sophia=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sophia)

class TestSophia(unittest.TestCase):
    def test_payload_uses_saved_agent_and_selected_overrides(self):
        p=sophia.payload('hello')
        self.assertEqual(p['agent_id'],'agent_762a628c80f34c498937fde62f6b0a7e3c747065dea5426691')
        self.assertEqual(p['agent']['model'],'gpt-6-astra')
        self.assertEqual(p['agent']['reasoning'],{'effort':'max','summary':'auto'})
        self.assertEqual(set(p['agent']),{'model','instructions','reasoning','text'})
        self.assertNotIn('tools',p['agent'])
        self.assertNotIn('multi_agent',p['agent'])
        self.assertEqual(p['input'][0]['content'][0]['text'],'hello')
        self.assertEqual(p['environment']['type'],'openai_hosted')
        self.assertEqual(p['environment']['network']['access'], 'enabled')
        self.assertIn('20lawsobk/maxbooster7.5.git', p['environment']['setup_commands'][0]['command'])
        self.assertIn('/workspace/maxbooster7.5', p['environment']['setup_commands'][0]['command'])
        self.assertNotIn('Replit tools provided',p['agent']['instructions'])
        self.assertIn('Never use or delegate any work to the Replit Agent',p['agent']['instructions'])

    def test_text_response_schema_complete_and_strict_objects(self):
        schema=sophia.config()['agent']['text']['format']['schema']
        def walk(n):
            if n['type']=='object':
                self.assertFalse(n['additionalProperties'])
                self.assertEqual(set(n['required']),set(n['properties']))
                for child in n['properties'].values():walk(child)
            elif n['type']=='array':
                self.assertEqual(n['items']['type'],'string')
        walk(schema)

    def test_sse_multiline_and_final_frame(self):
        lines=io.BytesIO(b'event: evt\ndata: {"type":"agent.session.created",\ndata: "session":{"id":"sess_hello"}}\n\ndata: {"type":"agent.session.turn.completed","turn":{"subagent_id":null}}\n\n')
        events=list(sophia.chunks(lines))
        self.assertEqual(sophia.event_sid(events[0]),'sess_hello')
        self.assertEqual(events[1]['type'],'agent.session.turn.completed')

    def test_unknown_tool_returns_error_not_fake_success(self):
        for name in ('begin_prod_hardening_for_max_booster','unknown'):
            result=sophia.tool_result({'name':name})
            self.assertIs(result['success'],False)
            self.assertIn('error',result)

    def test_url_is_quoted(self):
        import unittest.mock as mock
        with mock.patch.object(sophia,'request',return_value={'status':'idle'}) as r:
            sophia.retrieve('sess_abc!')
            self.assertIn('sess_abc%21',r.call_args.args[1])

if __name__=='__main__': unittest.main()
