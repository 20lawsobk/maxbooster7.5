"""Kernel-layer reference implementations for the digital GPU.

See ``reference.py`` for the discipline this package enforces: every kernel
this project claims to accelerate should have a naive, obviously-correct
reference implementation living in one place, imported by both the
correctness test suite and the benchmark harness -- never duplicated ad hoc.
"""
