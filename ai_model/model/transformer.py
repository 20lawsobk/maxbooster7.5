import math
import torch
import torch.nn as nn


class TransformerLM(nn.Module):
    def __init__(self, vocab_size, dim=256, n_layers=4, n_heads=4, max_len=512, dropout=0.1):
        super().__init__()
        self.token_emb = nn.Embedding(vocab_size, dim)
        self.pos_emb = nn.Embedding(max_len, dim)
        self.emb_dropout = nn.Dropout(dropout)

        self.layers = nn.ModuleList([
            nn.TransformerDecoderLayer(
                d_model=dim,
                nhead=n_heads,
                dim_feedforward=4 * dim,
                dropout=dropout,
                batch_first=True,
                norm_first=True,
            )
            for _ in range(n_layers)
        ])

        self.ln = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, vocab_size)

        self._init_weights()

    def _init_weights(self):
        nn.init.normal_(self.token_emb.weight, mean=0.0, std=0.02)
        nn.init.normal_(self.pos_emb.weight, mean=0.0, std=0.02)
        nn.init.normal_(self.head.weight, mean=0.0, std=0.02)
        nn.init.zeros_(self.head.bias)

        for layer in self.layers:
            for name, param in layer.named_parameters():
                if 'weight' in name and param.dim() >= 2:
                    nn.init.xavier_uniform_(param)
                elif 'bias' in name:
                    nn.init.zeros_(param)

    def forward(self, x):
        B, T = x.shape
        pos = torch.arange(0, T, device=x.device).unsqueeze(0)
        h = self.token_emb(x) + self.pos_emb(pos)
        h = self.emb_dropout(h)

        causal_mask = nn.Transformer.generate_square_subsequent_mask(T, device=x.device)

        for layer in self.layers:
            h = layer(h, h, tgt_mask=causal_mask, memory_mask=causal_mask)
        h = self.ln(h)
        logits = self.head(h)
        return logits
