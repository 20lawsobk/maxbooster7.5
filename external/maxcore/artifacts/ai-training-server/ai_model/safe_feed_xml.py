"""Bounded XML feed parsing; DTDs/entities are not part of the feed contract."""
from xml.parsers import expat
from xml.etree import ElementTree


def parse_feed_xml(data):
    raw = data.encode("utf-8") if isinstance(data, str) else data
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("Feed exceeds the XML size limit")
    parser = expat.ParserCreate()
    depth = 0
    nodes = 0

    def reject(*_args):
        raise ValueError("Feed DTDs and entities are forbidden")

    def start(_name, _attributes):
        nonlocal depth, nodes
        depth += 1
        nodes += 1
        if depth > 128 or nodes > 10000:
            raise ValueError("Feed exceeds the XML structural limit")

    def end(_name):
        nonlocal depth
        depth -= 1

    parser.StartDoctypeDeclHandler = reject
    parser.EntityDeclHandler = reject
    parser.ExternalEntityRefHandler = reject
    parser.StartElementHandler = start
    parser.EndElementHandler = end
    # Expat checks declarations before any expansion, including encoded XML.
    # Only the exact validated bytes are then turned into an element tree.
    parser.Parse(raw, True)
    return ElementTree.fromstring(raw)