import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from verify import REQUIRED, observe, read, run, validate, write

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        self.state = self.base / 'state'
        self.state.mkdir()
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        subprocess.run(['git','-C',str(self.root),'-c','user.name=Test','-c','user.email=test@example.test','commit','--allow-empty','-qm','initial'],check=True)
        self.policy = self.base / 'policy.json'
        self.config = {'target':98,'gates':{k:{'argv':[sys.executable,'-c','pass']} for k in REQUIRED}}
        write(self.policy,self.config)
    def test_missing_gates_rejected(self):
        del self.config['gates']['security']
        with self.assertRaises(ValueError): validate(self.config)
    def test_threshold_cannot_drop(self):
        self.config['target']=50
        with self.assertRaises(ValueError): validate(self.config)
    def test_all_pass(self):
        self.assertTrue(observe(self.root,self.policy,self.state,{})['ready'])
    def test_missing_evidence_blocks(self):
        self.config['gates']['performance']={'argv':None}
        write(self.policy,self.config)
        report=observe(self.root,self.policy,self.state,{})
        self.assertFalse(report['ready'])
        self.assertEqual(report['gates']['performance']['status'],'UNVERIFIED')
    def test_failed_command_blocks(self):
        self.config['gates']['security']={'argv':[sys.executable,'-c','raise SystemExit(1)']}
        write(self.policy,self.config)
        self.assertFalse(observe(self.root,self.policy,self.state,{})['ready'])
    def test_mutation_invalidates_evidence(self):
        self.config['gates']['build']={'argv':[sys.executable,'-c',"open('source.txt','w').write('mutation')"]}
        write(self.policy,self.config)
        self.assertFalse(observe(self.root,self.policy,self.state,{})['unchanged'])
    def test_numeric_threshold(self):
        self.config['gates']['performance']={'argv':None,'limits':{'p95':{'max':250}},
            'evidence_argv':[sys.executable,'-c',"import pathlib; pathlib.Path(__import__('sys').argv[1]).write_text('{\"p95\": 251}')",'{evidence}']}
        write(self.policy,self.config)
        self.assertEqual(observe(self.root,self.policy,self.state,{})['gates']['performance']['status'],'FAIL')
    def test_timeout(self):
        result=run([sys.executable,'-c','import time; time.sleep(30)'],self.root,self.state/'timeout.log',0.05)
        self.assertEqual(result['exit'],124)
    def test_missing_executable(self):
        self.assertEqual(run(['/no/such/executable'],self.root,self.state/'missing.log',1)['exit'],127)
    def test_repair_candidate_is_verified_and_source_untouched(self):
        self.config['gates']['build']={'argv':[sys.executable,'-c',"from pathlib import Path; assert Path('fixed.txt').exists()"]}
        self.config['repair_argv']=[sys.executable,'-c',"from pathlib import Path; Path('fixed.txt').write_text('fixed')"]
        write(self.policy,self.config)
        observe(self.root,self.policy,self.state,{})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,0)
        self.assertFalse((self.root/'fixed.txt').exists())
        outcomes=list(self.state.glob('*-evidence/outcome.json'))
        self.assertEqual(len(outcomes),1)
        self.assertTrue(read(outcomes[0])['ready'])
    def test_protected_change_is_rejected(self):
        self.config['repair_argv']=[sys.executable,'-c',"from pathlib import Path; Path('tests').mkdir(); Path('tests/fake.py').write_text('pass')"]
        write(self.policy,self.config)
        observe(self.root,self.policy,self.state,{})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,4)
    def test_repair_unconfigured(self):
        write(self.state/'latest.json',{'gates':{'build':{'status':'FAIL'}}})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,3)

if __name__=='__main__': unittest.main()
