"""Keep inline source-media bytes out of durable database journals/receipts."""
from hashlib import sha256


def without_inline_media(value):
    if isinstance(value, dict):
        return {
            key: ({"encoding": "base64", "encoded_length": len(item),
                   "encoded_sha256": sha256(item.encode("utf-8")).hexdigest()}
                  if key.endswith("_b64") and isinstance(item, str)
                  else without_inline_media(item))
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [without_inline_media(item) for item in value]
    return value
