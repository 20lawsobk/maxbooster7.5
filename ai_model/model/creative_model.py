from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F
from .tokenizer import SimpleTokenizer


class CreativeModel:
    def __init__(self, model: nn.Module, tokenizer: SimpleTokenizer, device="cpu"):
        self.model = model.to(device)
        self.tokenizer = tokenizer
        self.device = device
        self.tokenizer.freeze()

    def resize_embeddings(self):
        new_vocab = self.tokenizer.vocab_size
        old_emb = self.model.token_emb
        old_head = self.model.head
        if new_vocab > old_emb.num_embeddings:
            dim = old_emb.embedding_dim
            new_emb = nn.Embedding(new_vocab, dim).to(self.device)
            new_emb.weight.data[:old_emb.num_embeddings] = old_emb.weight.data
            self.model.token_emb = new_emb
            new_head = nn.Linear(dim, new_vocab).to(self.device)
            new_head.weight.data[:old_head.out_features] = old_head.weight.data
            new_head.bias.data[:old_head.out_features] = old_head.bias.data
            self.model.head = new_head

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 80,
        temperature: float = 0.8,
        top_p: float = 0.92,
        top_k: int = 50,
        repetition_penalty: float = 1.2,
        min_length: int = 10,
    ) -> str:
        self.model.eval()
        ids = self.tokenizer.encode(prompt).ids
        if not ids:
            ids = [self.tokenizer.token_to_id("<BOS>")]
        x = torch.tensor([ids], device=self.device)

        eos_id = self.tokenizer.token_to_id("<EOS>")
        pad_id = self.tokenizer.token_to_id("<PAD>")
        unk_id = self.tokenizer.token_to_id("<UNK>")
        max_ctx = self.model.pos_emb.num_embeddings

        generated_ids: list[int] = []

        with torch.no_grad():
            for step in range(max_new_tokens):
                logits = self.model(x[:, -max_ctx:])
                next_logits = logits[:, -1, :].clone()

                next_logits[:, pad_id] = -float("inf")
                next_logits[:, unk_id] = -float("inf")

                if step < min_length:
                    next_logits[:, eos_id] = -float("inf")

                if len(generated_ids) > 0:
                    seen = set(generated_ids)
                    for token_id in seen:
                        if token_id not in (pad_id, unk_id, eos_id):
                            next_logits[:, token_id] /= repetition_penalty

                next_logits = next_logits / max(temperature, 1e-8)

                if top_k > 0:
                    top_k_vals, _ = torch.topk(next_logits, min(top_k, next_logits.size(-1)))
                    threshold = top_k_vals[:, -1].unsqueeze(-1)
                    next_logits[next_logits < threshold] = -float("inf")

                if 0.0 < top_p < 1.0:
                    sorted_logits, sorted_indices = torch.sort(next_logits, descending=True)
                    probs = F.softmax(sorted_logits, dim=-1)
                    cumulative_probs = torch.cumsum(probs, dim=-1)
                    mask = cumulative_probs - probs > top_p
                    sorted_logits[mask] = -float("inf")
                    next_logits = sorted_logits.scatter(1, sorted_indices, sorted_logits)

                probs = F.softmax(next_logits, dim=-1)
                next_id = torch.multinomial(probs, num_samples=1)

                token_id = next_id.item()
                generated_ids.append(token_id)

                x = torch.cat([x, next_id], dim=1)
                if token_id == eos_id:
                    break

        return self.tokenizer.decode(x[0].tolist())
