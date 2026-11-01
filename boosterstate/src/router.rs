use crate::model::*;
use crate::shard::{ShardCommand, ShardHandle};
use crate::time::SystemClock;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tokio::sync::oneshot;

pub struct BoosterState {
    shards: Vec<ShardHandle>,
}

impl BoosterState {
    pub fn new_with_wal(data_dir: PathBuf, n_shards: usize) -> anyhow::Result<Self> {
        let mut shards = Vec::with_capacity(n_shards);
        for i in 0..n_shards {
            let clock = SystemClock;
            let handle = ShardHandle::spawn(i, data_dir.clone(), clock)?;
            shards.push(handle);
        }
        Ok(Self { shards })
    }

    fn shard_for_workspace_key(&self, key: &WorkspaceKey) -> &ShardHandle {
        let mut hasher = DefaultHasher::new();
        key.hash(&mut hasher);
        let idx = (hasher.finish() as usize) % self.shards.len();
        &self.shards[idx]
    }

    fn shard_for_flat_key(&self, key: &str) -> &ShardHandle {
        let mut hasher = DefaultHasher::new();
        key.hash(&mut hasher);
        let idx = (hasher.finish() as usize) % self.shards.len();
        &self.shards[idx]
    }

    fn shard_for_queue(&self, ns: &str, ws: &str, queue: &str) -> &ShardHandle {
        let mut hasher = DefaultHasher::new();
        ns.hash(&mut hasher);
        ws.hash(&mut hasher);
        queue.hash(&mut hasher);
        let idx = (hasher.finish() as usize) % self.shards.len();
        &self.shards[idx]
    }

    fn shard_for_rate(&self, ns: &str, ws: &str, limiter_id: &str) -> &ShardHandle {
        let mut hasher = DefaultHasher::new();
        ns.hash(&mut hasher);
        ws.hash(&mut hasher);
        limiter_id.hash(&mut hasher);
        let idx = (hasher.finish() as usize) % self.shards.len();
        &self.shards[idx]
    }

    pub async fn ws_get(&self, key: WorkspaceKey) -> anyhow::Result<Option<KvEntry>> {
        let shard = self.shard_for_workspace_key(&key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::KvGet { key, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn ws_set(&self, key: WorkspaceKey, entry: KvEntry) -> anyhow::Result<()> {
        let shard = self.shard_for_workspace_key(&key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::KvSet { key, entry, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn queue_push(&self, ns: String, ws: String, queue: String, item: QueueItem) -> anyhow::Result<()> {
        let shard = self.shard_for_queue(&ns, &ws, &queue);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::QueuePush { ns, ws, queue, item, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn queue_pop(&self, ns: &str, ws: &str, queue: &str) -> anyhow::Result<Option<QueueItem>> {
        let shard = self.shard_for_queue(ns, ws, queue);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::QueuePop { ns: ns.to_string(), ws: ws.to_string(), queue: queue.to_string(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn rate_take(&self, ns: &str, ws: &str, limiter_id: &str, tokens: u64) -> anyhow::Result<(bool, RateLimiterState)> {
        let shard = self.shard_for_rate(ns, ws, limiter_id);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::RateTake { ns: ns.to_string(), ws: ws.to_string(), limiter_id: limiter_id.to_string(), tokens, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatGet { key: key.to_string(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_set(&self, key: &str, value: &str, ttl_secs: Option<u64>) -> anyhow::Result<()> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatSet { key: key.to_string(), value: value.to_string(), ttl_secs, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_del(&self, keys: &[String]) -> anyhow::Result<u64> {
        let shard = &self.shards[0];
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatDel { keys: keys.to_vec(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_exists(&self, key: &str) -> anyhow::Result<bool> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatExists { key: key.to_string(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_incr(&self, key: &str) -> anyhow::Result<i64> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatIncr { key: key.to_string(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_expire(&self, key: &str, seconds: u64) -> anyhow::Result<bool> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::FlatExpire { key: key.to_string(), seconds, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn flat_keys(&self, pattern: &str) -> anyhow::Result<Vec<String>> {
        let mut all_keys = Vec::new();
        for shard in &self.shards {
            let (tx, rx) = oneshot::channel();
            shard.send(ShardCommand::FlatKeys { pattern: pattern.to_string(), resp: tx }).await?;
            let keys = rx.await?;
            all_keys.extend(keys);
        }
        Ok(all_keys)
    }

    pub async fn zadd(&self, key: &str, score: f64, value: String) -> anyhow::Result<()> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::ZAdd { key: key.to_string(), score, value, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn zcard(&self, key: &str) -> anyhow::Result<u64> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::ZCard { key: key.to_string(), resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn zrange(&self, key: &str, start: i64, end: i64, rev: bool) -> anyhow::Result<Vec<String>> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::ZRange { key: key.to_string(), start, end, rev, resp: tx }).await?;
        Ok(rx.await?)
    }

    pub async fn zrem_range_by_score(&self, key: &str, min: f64, max: f64) -> anyhow::Result<u64> {
        let shard = self.shard_for_flat_key(key);
        let (tx, rx) = oneshot::channel();
        shard.send(ShardCommand::ZRemRangeByScore { key: key.to_string(), min, max, resp: tx }).await?;
        Ok(rx.await?)
    }
}
