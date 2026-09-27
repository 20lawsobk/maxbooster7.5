"""Independent, lossless UTF-8 byte vocabulary; never changes the release tokenizer."""


class CandidateByteTokenizer:
    vocab_size = 259
    pad_id, bos_id, eos_id = 256, 257, 258
    version = "utf8-bytes-v1"

    def encode_bytes(self, value: bytes) -> list[int]:
        return list(value)

    def decode_bytes(self, ids) -> bytes:
        values = list(ids)
        if any(type(i) is not int or not 0 <= i < self.vocab_size for i in values):
            raise ValueError("Invalid candidate token ID")
        return bytes(i for i in values if i < 256)

    def encode(self, text: str) -> list[int]:
        return self.encode_bytes(text.encode("utf-8"))

    def decode(self, ids, errors="strict") -> str:
        return self.decode_bytes(ids).decode("utf-8", errors=errors)