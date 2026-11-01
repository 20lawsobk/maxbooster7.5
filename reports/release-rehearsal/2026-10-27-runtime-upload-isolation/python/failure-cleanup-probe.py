import importlib,sys,json
from ai_model.image import image_engine
from ai_model.retrieval import asset_pipeline,test_pipeline,test_phase4
original=test_pipeline._UPLOADS_DIR
assert 'ai_model.retrieval.rcgs' not in sys.modules
try:
 with test_pipeline._isolated_uploads(test_pipeline.__dict__) as owned:
  result=image_engine.ImageEngine().render(image_engine.ImageRequest(prompt='Owned temporary failure-cleanup probe',seed=91823))
  assert result.success and (owned/result.filename).is_file()
  rcgs=importlib.import_module('ai_model.retrieval.rcgs')
  assert image_engine._UPLOADS_DIR==owned
  assert asset_pipeline._UPLOADS_DIR==owned
  assert test_phase4._UPLOADS_DIR==owned
  assert rcgs._uploads_base()==owned.resolve()
  raise RuntimeError('Deliberate assertion-path cleanup probe')
except RuntimeError as error:
 assert str(error)=='Deliberate assertion-path cleanup probe'
assert not owned.exists()
for module in [image_engine,asset_pipeline,test_pipeline,test_phase4,rcgs]:
 assert module._UPLOADS_DIR==original
print(json.dumps({'actualRender':True,'existingAndLateImportAliasesRestored':True,'exceptionCleanup':True,'temporaryRootRemoved':True}))
