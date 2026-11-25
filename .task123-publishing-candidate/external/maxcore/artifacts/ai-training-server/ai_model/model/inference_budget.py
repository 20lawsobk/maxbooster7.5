"""Cooperative request-local inference deadlines; never return partial output."""
from contextvars import ContextVar
import time

inference_deadline = ContextVar('inference_deadline', default=None)


def check_inference_budget():
    deadline = inference_deadline.get()
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError('Inference exceeded its operational capability time budget')
