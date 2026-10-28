import importlib,sys
from pathlib import Path
from ai_model.retrieval import test_pipeline as subject
original=subject._UPLOADS_DIR
assert 'ai_model.retrieval.rcgs' not in sys.modules
with subject._isolated_uploads(subject.__dict__) as owned:
 rcgs=importlib.import_module('ai_model.retrieval.rcgs')
 assert rcgs._uploads_base()==owned.resolve()
assert not owned.exists()
assert rcgs._UPLOADS_DIR==original, 'Late-import reader must restore its original source path'
