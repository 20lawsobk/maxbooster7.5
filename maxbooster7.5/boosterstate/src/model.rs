use serde::{Deserialize, Serialize};
use std::time::SystemTime;

#[derive(Clone, Hash, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub struct WorkspaceKey {
    pub namespace: String,
    pub workspace: String,
    pub scope: String,
    pub key: String,
}

impl WorkspaceKey {
    pub fn new(ns: &str, ws: &str, scope: &str, key: &str) -> Self {
        Self {
            namespace: ns.to_string(),
            workspace: ws.to_string(),
            scope: scope.to_string(),
            key: key.to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Value {
    String(String),
    Json(serde_json::Value),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KvEntry {
    pub value: Value,
    pub expires_at: Option<SystemTime>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub payload: Value,
    pub priority: i32,
    pub visible_at: SystemTime,
    pub dedupe_key: Option<String>,
    pub attempts: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RateLimiterState {
    pub capacity: u64,
    pub tokens: u64,
    pub refill_per_sec: u64,
    pub last_refill: SystemTime,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SortedSetEntry {
    pub score: f64,
    pub value: String,
}
