from pathlib import Path
import importlib.util,sys
R=Path('/workspace/maxbooster7.5');B=Path(__file__).resolve().parent
sys.path[:0]=[str(B),str(R/'scripts/testing')]
spec=importlib.util.spec_from_file_location('outside_factory_register',B/'platform-register.next.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.ROOT=R
sys.argv=[str(B/'platform-register.next.py'),'--input',str(R/'reports/test-verification'),'--output',str(B/'registry')]
raise SystemExit(m.main())
