"""Real filesystem/template consumers, without network or app database access."""
import fsspec
from jinja2.exceptions import SecurityError

assert tuple(map(int, fsspec.__version__.split("."))) >= (2026, 6, 0)
payload = "{{ joiner.__init__.__globals__.os.getcwd() }}"

# Verify valid references in all three formerly unsafe rendering paths first.
def reference(document):
    return fsspec.filesystem("reference", fo=document, simple_templates=False,
                             remote_protocol="memory", skip_instance_cache=True)

def direct(value):
    return {"version": 1, "templates": {"root": "memory://"},
            "refs": {"a": ["{{ root }}/" + value, 0, 1]}}

def template(value):
    return {"version": 1, "templates": {"root": value},
            "refs": {"a": ["{{ root() }}/file", 0, 1]}}

def generator(value):
    return {"version": 1, "refs": {"seed": "seed"}, "gen": [{
        "key": "chunk/{{i}}", "url": value,
        "dimensions": {"i": {"start": 0, "stop": 2}}, "offset": "0", "length": "1",
    }]}

assert reference(direct("file")).references["a"] == ["memory:///file", 0, 1]
assert reference(template("{{ value }}")).references["a"][0] == "/file"
assert len(reference(generator("memory:///{{i}}")).references) == 3
for document in (direct(payload), template(payload), generator(payload)):
    try:
        reference(document)
    except SecurityError:
        pass
    else:
        raise AssertionError("unsafe template was not rejected")

# fsspec is pulled into the AI runtime through torch. Exercise that integration.
import torch
tensor = torch.tensor([1.0, 2.0, 3.0])
with fsspec.open("memory://advisory-test/tensor.pt", "wb") as destination:
    torch.save(tensor, destination)
with fsspec.open("memory://advisory-test/tensor.pt", "rb") as source:
    assert torch.equal(torch.load(source, weights_only=True), tensor)
print(f"fsspec {fsspec.__version__}: all three template attacks rejected; torch round-trip passed")
