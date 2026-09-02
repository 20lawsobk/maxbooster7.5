# NOTE — GPU subsystem reconciliation (see docs/gpu-architecture.md):
# HyperGPU/HyperGPUBackend (hyper_core.py, hyper_backend.py) is the primary,
# live compute path for model inference/training and is imported directly by
# server.py — it is intentionally NOT re-exported here.
#
# `execution_graph.py`, `digital_library.py`, `multi_backend.py`, and
# `multi_stream.py` were only reachable through a never-started alternate
# FastAPI stack (ai_model/api/app.py -> ai_model/serve.py) and have been
# removed as dead code. `DigitalGPU` below (the standalone ISA/VRAM/SIMDCore
# emulator) is kept for its own tests/tooling but is NOT instantiated by
# server.py for compute.
from ai_model.gpu.digital_gpu import (
    DigitalGPU, VRAM, SIMDCore, Scheduler, Program, Instruction, OpCode,
    GPUError, ShapeError, TypeErrorGPU, ShapeMismatchError, InvalidOpcodeError,
    OOMError,
)
from ai_model.gpu.torch_backend import DigitalGPUBackend
from ai_model.gpu.silicon_model import (
    MaxCoreSilicon, SiliconScheduler, MaxCoreOp, ComputeTile, GemmTile,
    AttentionTile, GlobalMemory, make_default_silicon,
)
from ai_model.gpu.opcode_spec import OpcodeSpec, OPCODES, get_spec, register
from ai_model.gpu.telemetry import Telemetry, OpRecord
from ai_model.gpu import precision

__all__ = [
    "DigitalGPU", "VRAM", "SIMDCore", "Scheduler", "Program", "Instruction", "OpCode",
    "GPUError", "ShapeError", "TypeErrorGPU", "ShapeMismatchError",
    "InvalidOpcodeError", "OOMError",
    "DigitalGPUBackend",
    "MaxCoreSilicon", "SiliconScheduler", "MaxCoreOp", "ComputeTile", "GemmTile",
    "AttentionTile", "GlobalMemory", "make_default_silicon",
    "OpcodeSpec", "OPCODES", "get_spec", "register",
    "Telemetry", "OpRecord", "precision",
]
