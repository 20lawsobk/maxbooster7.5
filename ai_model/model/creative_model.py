from __future__ import annotations
import torch
import torch.nn as nn
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

    def generate(self, prompt: str, max_new_tokens: int = 64) -> str:
        self.model.eval()
        ids = self.tokenizer.encode(prompt).ids
        if not ids:
            ids = [self.tokenizer.token_to_id("<BOS>")]
        x = torch.tensor([ids], device=self.device)

        with torch.no_grad():
            for _ in range(max_new_tokens):
                logits = self.model(x[:, -512:])
                next_id = torch.argmax(logits[:, -1, :], dim=-1)
                x = torch.cat([x, next_id.unsqueeze(0)], dim=1)
                if next_id.item() == self.tokenizer.token_to_id("<EOS>"):
                    break

        return self.tokenizer.decode(x[0].tolist())
