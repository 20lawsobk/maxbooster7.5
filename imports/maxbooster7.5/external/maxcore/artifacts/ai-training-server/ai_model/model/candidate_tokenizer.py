"""Independent, lossless UTF-8 byte vocabulary; never changes the release tokenizer."""


class Utf8GenerationState:
    """RFC 3629 byte grammar, independent of learned scores or source language."""

    def __init__(self):
        self.pending = 0
        self.low, self.high = 0x80, 0xBF

    def allowed_tokens(self, budget, eos=258):
        if type(budget) is not int or budget < 1 or budget < self.pending:
            raise ValueError("Insufficient UTF-8 byte budget")
        if self.pending:
            return tuple(range(self.low, self.high + 1))
        allowed = list(range(0x80)) + [eos]
        if budget >= 2:
            allowed.extend(range(0xC2, 0xE0))
        if budget >= 3:
            allowed.extend(range(0xE0, 0xF0))
        if budget >= 4:
            allowed.extend(range(0xF0, 0xF5))
        return tuple(allowed)

    def advance(self, byte):
        if type(byte) is not int or not 0 <= byte <= 255:
            raise ValueError("Expected a UTF-8 byte")
        if self.pending:
            if not self.low <= byte <= self.high:
                raise ValueError("Invalid UTF-8 continuation")
            self.pending -= 1
            self.low, self.high = 0x80, 0xBF
        elif byte <= 0x7F:
            return
        elif 0xC2 <= byte <= 0xDF:
            self.pending = 1
        elif 0xE0 <= byte <= 0xEF:
            self.pending = 2
            self.low = 0xA0 if byte == 0xE0 else 0x80
            self.high = 0x9F if byte == 0xED else 0xBF
        elif 0xF0 <= byte <= 0xF4:
            self.pending = 3
            self.low = 0x90 if byte == 0xF0 else 0x80
            self.high = 0x8F if byte == 0xF4 else 0xBF
        else:
            raise ValueError("Invalid UTF-8 leading byte")


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