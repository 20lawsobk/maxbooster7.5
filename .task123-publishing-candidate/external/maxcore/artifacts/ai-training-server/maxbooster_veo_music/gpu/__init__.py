from ai_model.gpu.hyper_core import HyperGPU, PrecisionMode
from ai_model.gpu.sizing import hyper_gpu_sizing

_lanes, _tensor_cores = hyper_gpu_sizing()
gpu = HyperGPU(lanes=_lanes, tensor_cores=_tensor_cores, precision=PrecisionMode.MIXED)

__all__ = ["gpu", "HyperGPU", "PrecisionMode"]
