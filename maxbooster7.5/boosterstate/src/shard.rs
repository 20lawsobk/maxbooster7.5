use crate::model::*;
use crate::store::{BoosterStore, WalStore};
use crate::time::Clock;
use crate::wal::FileWal;
use std::path::PathBuf;
use tokio::sync::{mpsc, oneshot};

pub enum ShardCommand {
    KvGet {
        key: WorkspaceKey,
        resp: oneshot::Sender<Option<KvEntry>>,
    },
    KvSet {
        key: WorkspaceKey,
        entry: KvEntry,
        resp: oneshot::Sender<()>,
    },
    QueuePush {
        ns: String,
        ws: String,
        queue: String,
        item: QueueItem,
        resp: oneshot::Sender<()>,
    },
    QueuePop {
        ns: String,
        ws: String,
        queue: String,
        resp: oneshot::Sender<Option<QueueItem>>,
    },
    RateTake {
        ns: String,
        ws: String,
        limiter_id: String,
        tokens: u64,
        resp: oneshot::Sender<(bool, RateLimiterState)>,
    },
    FlatGet {
        key: String,
        resp: oneshot::Sender<Option<String>>,
    },
    FlatSet {
        key: String,
        value: String,
        ttl_secs: Option<u64>,
        resp: oneshot::Sender<()>,
    },
    FlatDel {
        keys: Vec<String>,
        resp: oneshot::Sender<u64>,
    },
    FlatExists {
        key: String,
        resp: oneshot::Sender<bool>,
    },
    FlatIncr {
        key: String,
        resp: oneshot::Sender<i64>,
    },
    FlatExpire {
        key: String,
        seconds: u64,
        resp: oneshot::Sender<bool>,
    },
    FlatKeys {
        pattern: String,
        resp: oneshot::Sender<Vec<String>>,
    },
    ZAdd {
        key: String,
        score: f64,
        value: String,
        resp: oneshot::Sender<()>,
    },
    ZCard {
        key: String,
        resp: oneshot::Sender<u64>,
    },
    ZRange {
        key: String,
        start: i64,
        end: i64,
        rev: bool,
        resp: oneshot::Sender<Vec<String>>,
    },
    ZRemRangeByScore {
        key: String,
        min: f64,
        max: f64,
        resp: oneshot::Sender<u64>,
    },
}

#[derive(Clone)]
pub struct ShardHandle {
    tx: mpsc::Sender<ShardCommand>,
}

impl ShardHandle {
    pub fn spawn<C: Clock>(shard_id: usize, data_dir: PathBuf, clock: C) -> anyhow::Result<Self> {
        std::fs::create_dir_all(&data_dir)?;
        let wal_path = data_dir.join(format!("shard-{}.wal", shard_id));
        let wal = FileWal::open(wal_path)?;
        let mut store = WalStore::new(wal);

        let (tx, mut rx) = mpsc::channel::<ShardCommand>(4096);

        tokio::spawn(async move {
            while let Some(cmd) = rx.recv().await {
                let now = clock.now();
                match cmd {
                    ShardCommand::KvGet { key, resp } => {
                        let _ = resp.send(store.kv_get(now, &key));
                    }
                    ShardCommand::KvSet { key, entry, resp } => {
                        store.kv_set(key, entry);
                        let _ = resp.send(());
                    }
                    ShardCommand::QueuePush { ns, ws, queue, item, resp } => {
                        store.queue_push(ns, ws, queue, item);
                        let _ = resp.send(());
                    }
                    ShardCommand::QueuePop { ns, ws, queue, resp } => {
                        let _ = resp.send(store.queue_pop(&ns, &ws, &queue, now));
                    }
                    ShardCommand::RateTake { ns, ws, limiter_id, tokens, resp } => {
                        let _ = resp.send(store.rate_take(&ns, &ws, &limiter_id, tokens, now));
                    }
                    ShardCommand::FlatGet { key, resp } => {
                        let _ = resp.send(store.flat_get(now, &key));
                    }
                    ShardCommand::FlatSet { key, value, ttl_secs, resp } => {
                        store.flat_set(&key, &value, ttl_secs, now);
                        let _ = resp.send(());
                    }
                    ShardCommand::FlatDel { keys, resp } => {
                        let _ = resp.send(store.flat_del(&keys));
                    }
                    ShardCommand::FlatExists { key, resp } => {
                        let _ = resp.send(store.flat_exists(now, &key));
                    }
                    ShardCommand::FlatIncr { key, resp } => {
                        let _ = resp.send(store.flat_incr(&key, now));
                    }
                    ShardCommand::FlatExpire { key, seconds, resp } => {
                        let _ = resp.send(store.flat_expire(&key, seconds, now));
                    }
                    ShardCommand::FlatKeys { pattern, resp } => {
                        let _ = resp.send(store.flat_keys(&pattern));
                    }
                    ShardCommand::ZAdd { key, score, value, resp } => {
                        store.zadd(&key, score, value);
                        let _ = resp.send(());
                    }
                    ShardCommand::ZCard { key, resp } => {
                        let _ = resp.send(store.zcard(&key));
                    }
                    ShardCommand::ZRange { key, start, end, rev, resp } => {
                        let _ = resp.send(store.zrange(&key, start, end, rev));
                    }
                    ShardCommand::ZRemRangeByScore { key, min, max, resp } => {
                        let _ = resp.send(store.zrem_range_by_score(&key, min, max));
                    }
                }
            }
        });

        Ok(Self { tx })
    }

    pub async fn send(&self, cmd: ShardCommand) -> anyhow::Result<()> {
        self.tx.send(cmd).await.map_err(|_| anyhow::anyhow!("shard channel closed"))?;
        Ok(())
    }
}
