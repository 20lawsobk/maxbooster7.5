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
