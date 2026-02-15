use crate::model::*;
use crate::wal::{Wal, WalRecord};
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, SystemTime};

pub trait BoosterStore {
    fn kv_get(&mut self, now: SystemTime, key: &WorkspaceKey) -> Option<KvEntry>;
    fn kv_set(&mut self, key: WorkspaceKey, entry: KvEntry);

    fn queue_push(&mut self, ns: String, ws: String, queue: String, item: QueueItem);
    fn queue_pop(&mut self, ns: &str, ws: &str, queue: &str, now: SystemTime) -> Option<QueueItem>;

    fn rate_take(&mut self, ns: &str, ws: &str, limiter_id: &str, tokens: u64, now: SystemTime) -> (bool, RateLimiterState);

    fn flat_get(&mut self, now: SystemTime, key: &str) -> Option<String>;
    fn flat_set(&mut self, key: &str, value: &str, ttl_secs: Option<u64>, now: SystemTime);
    fn flat_del(&mut self, keys: &[String]) -> u64;
    fn flat_exists(&mut self, now: SystemTime, key: &str) -> bool;
    fn flat_incr(&mut self, key: &str, now: SystemTime) -> i64;
    fn flat_expire(&mut self, key: &str, seconds: u64, now: SystemTime) -> bool;
    fn flat_keys(&self, pattern: &str) -> Vec<String>;

    fn zadd(&mut self, key: &str, score: f64, value: String);
    fn zcard(&self, key: &str) -> u64;
    fn zrange(&self, key: &str, start: i64, end: i64, rev: bool) -> Vec<String>;
    fn zrem_range_by_score(&mut self, key: &str, min: f64, max: f64) -> u64;
}

pub struct InMemoryStore {
    kv: HashMap<WorkspaceKey, KvEntry>,
    queues: HashMap<(String, String, String), VecDeque<QueueItem>>,
    rate_limiters: HashMap<(String, String, String), RateLimiterState>,
    flat_kv: HashMap<String, (String, Option<SystemTime>)>,
    sorted_sets: HashMap<String, Vec<SortedSetEntry>>,
}

impl InMemoryStore {
    pub fn new() -> Self {
        Self {
            kv: HashMap::new(),
            queues: HashMap::new(),
            rate_limiters: HashMap::new(),
            flat_kv: HashMap::new(),
            sorted_sets: HashMap::new(),
        }
    }

    fn glob_match(pattern: &str, text: &str) -> bool {
        let pattern_chars: Vec<char> = pattern.chars().collect();
        let text_chars: Vec<char> = text.chars().collect();
        let mut dp = vec![vec![false; text_chars.len() + 1]; pattern_chars.len() + 1];
        dp[0][0] = true;
        for i in 1..=pattern_chars.len() {
            if pattern_chars[i - 1] == '*' {
                dp[i][0] = dp[i - 1][0];
            }
        }
        for i in 1..=pattern_chars.len() {
            for j in 1..=text_chars.len() {
                if pattern_chars[i - 1] == '*' {
                    dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
                } else if pattern_chars[i - 1] == '?' || pattern_chars[i - 1] == text_chars[j - 1] {
                    dp[i][j] = dp[i - 1][j - 1];
                }
            }
        }
        dp[pattern_chars.len()][text_chars.len()]
    }
}

impl BoosterStore for InMemoryStore {
    fn kv_get(&mut self, now: SystemTime, key: &WorkspaceKey) -> Option<KvEntry> {
        let entry = self.kv.get(key).cloned()?;
        if let Some(exp) = entry.expires_at {
            if exp <= now {
                self.kv.remove(key);
                None
            } else {
                Some(entry)
            }
        } else {
            Some(entry)
        }
    }

    fn kv_set(&mut self, key: WorkspaceKey, entry: KvEntry) {
        self.kv.insert(key, entry);
    }

    fn queue_push(&mut self, ns: String, ws: String, queue: String, item: QueueItem) {
        let key = (ns, ws, queue);
        let q = self.queues.entry(key).or_default();
        q.push_back(item);
    }

    fn queue_pop(&mut self, ns: &str, ws: &str, queue: &str, now: SystemTime) -> Option<QueueItem> {
        let key = (ns.to_string(), ws.to_string(), queue.to_string());
        let q = self.queues.entry(key).or_default();
        let idx = q.iter().enumerate().find(|(_, item)| item.visible_at <= now).map(|(i, _)| i);
        idx.map(|i| q.remove(i).unwrap())
    }

    fn rate_take(&mut self, ns: &str, ws: &str, limiter_id: &str, tokens: u64, now: SystemTime) -> (bool, RateLimiterState) {
        let key = (ns.to_string(), ws.to_string(), limiter_id.to_string());
        let state = self.rate_limiters.entry(key).or_insert(RateLimiterState {
            capacity: 60,
            tokens: 60,
            refill_per_sec: 1,
            last_refill: now,
        });

        if let Ok(elapsed) = now.duration_since(state.last_refill) {
            let add = elapsed.as_secs() * state.refill_per_sec;
            if add > 0 {
                state.tokens = (state.tokens + add).min(state.capacity);
                state.last_refill = now;
            }
        }

        let allowed = if state.tokens >= tokens {
            state.tokens -= tokens;
            true
        } else {
            false
        };

        (allowed, state.clone())
    }

    fn flat_get(&mut self, now: SystemTime, key: &str) -> Option<String> {
        if let Some((val, exp)) = self.flat_kv.get(key) {
            if let Some(exp_time) = exp {
                if *exp_time <= now {
                    self.flat_kv.remove(key);
                    return None;
                }
            }
            Some(val.clone())
        } else {
            None
        }
    }

    fn flat_set(&mut self, key: &str, value: &str, ttl_secs: Option<u64>, now: SystemTime) {
        let expires_at = ttl_secs.map(|ttl| now + Duration::from_secs(ttl));
        self.flat_kv.insert(key.to_string(), (value.to_string(), expires_at));
    }

    fn flat_del(&mut self, keys: &[String]) -> u64 {
        let mut count = 0u64;
        for key in keys {
            if self.flat_kv.remove(key).is_some() {
                count += 1;
            }
            if self.sorted_sets.remove(key).is_some() {
                count += 1;
            }
        }
        count
    }

    fn flat_exists(&mut self, now: SystemTime, key: &str) -> bool {
        if let Some((_, exp)) = self.flat_kv.get(key) {
            if let Some(exp_time) = exp {
                if *exp_time <= now {
                    self.flat_kv.remove(key);
                    return false;
                }
            }
            true
        } else {
            false
        }
    }

    fn flat_incr(&mut self, key: &str, now: SystemTime) -> i64 {
        let current = self.flat_get(now, key).unwrap_or_else(|| "0".to_string());
        let val: i64 = current.parse().unwrap_or(0) + 1;
        self.flat_set(key, &val.to_string(), None, now);
        val
    }

    fn flat_expire(&mut self, key: &str, seconds: u64, now: SystemTime) -> bool {
        if let Some(entry) = self.flat_kv.get_mut(key) {
            entry.1 = Some(now + Duration::from_secs(seconds));
            true
        } else {
            false
        }
    }

    fn flat_keys(&self, pattern: &str) -> Vec<String> {
        self.flat_kv.keys()
            .filter(|k| Self::glob_match(pattern, k))
            .cloned()
            .collect()
    }

    fn zadd(&mut self, key: &str, score: f64, value: String) {
        let set = self.sorted_sets.entry(key.to_string()).or_default();
        set.retain(|e| e.value != value);
        let pos = set.partition_point(|e| e.score < score);
        set.insert(pos, SortedSetEntry { score, value });
    }

    fn zcard(&self, key: &str) -> u64 {
        self.sorted_sets.get(key).map(|s| s.len() as u64).unwrap_or(0)
    }

    fn zrange(&self, key: &str, start: i64, end: i64, rev: bool) -> Vec<String> {
        let set = match self.sorted_sets.get(key) {
            Some(s) => s,
            None => return vec![],
        };
        let len = set.len() as i64;
        if len == 0 { return vec![]; }

        let normalize = |idx: i64| -> usize {
            if idx < 0 {
                (len + idx).max(0) as usize
            } else {
                idx.min(len - 1) as usize
            }
        };

        let s = normalize(start);
        let e = normalize(end);
        if s > e { return vec![]; }

        if rev {
            set.iter().rev().skip(s).take(e - s + 1).map(|e| e.value.clone()).collect()
        } else {
            set.iter().skip(s).take(e - s + 1).map(|e| e.value.clone()).collect()
        }
    }

    fn zrem_range_by_score(&mut self, key: &str, min: f64, max: f64) -> u64 {
        if let Some(set) = self.sorted_sets.get_mut(key) {
            let before = set.len();
            set.retain(|e| e.score < min || e.score > max);
            (before - set.len()) as u64
        } else {
            0
        }
    }
}

pub struct WalStore<W: Wal> {
    inner: InMemoryStore,
    #[allow(dead_code)]
    wal: W,
}

impl<W: Wal> WalStore<W> {
    pub fn new(wal: W) -> Self {
        Self {
            inner: InMemoryStore::new(),
            wal,
        }
    }
}

impl<W: Wal> BoosterStore for WalStore<W> {
    fn kv_get(&mut self, now: SystemTime, key: &WorkspaceKey) -> Option<KvEntry> {
        self.inner.kv_get(now, key)
    }
    fn kv_set(&mut self, key: WorkspaceKey, entry: KvEntry) {
        let _ = self.wal.append(&WalRecord::KvSet { key: key.clone(), entry: entry.clone() });
        self.inner.kv_set(key, entry);
    }
    fn queue_push(&mut self, ns: String, ws: String, queue: String, item: QueueItem) {
        let _ = self.wal.append(&WalRecord::QueuePush { ns: ns.clone(), ws: ws.clone(), queue: queue.clone(), item: item.clone() });
        self.inner.queue_push(ns, ws, queue, item);
    }
    fn queue_pop(&mut self, ns: &str, ws: &str, queue: &str, now: SystemTime) -> Option<QueueItem> {
        self.inner.queue_pop(ns, ws, queue, now)
    }
    fn rate_take(&mut self, ns: &str, ws: &str, limiter_id: &str, tokens: u64, now: SystemTime) -> (bool, RateLimiterState) {
        self.inner.rate_take(ns, ws, limiter_id, tokens, now)
    }
    fn flat_get(&mut self, now: SystemTime, key: &str) -> Option<String> { self.inner.flat_get(now, key) }
    fn flat_set(&mut self, key: &str, value: &str, ttl_secs: Option<u64>, now: SystemTime) { self.inner.flat_set(key, value, ttl_secs, now) }
    fn flat_del(&mut self, keys: &[String]) -> u64 { self.inner.flat_del(keys) }
    fn flat_exists(&mut self, now: SystemTime, key: &str) -> bool { self.inner.flat_exists(now, key) }
    fn flat_incr(&mut self, key: &str, now: SystemTime) -> i64 { self.inner.flat_incr(key, now) }
    fn flat_expire(&mut self, key: &str, seconds: u64, now: SystemTime) -> bool { self.inner.flat_expire(key, seconds, now) }
    fn flat_keys(&self, pattern: &str) -> Vec<String> { self.inner.flat_keys(pattern) }
    fn zadd(&mut self, key: &str, score: f64, value: String) { self.inner.zadd(key, score, value) }
    fn zcard(&self, key: &str) -> u64 { self.inner.zcard(key) }
    fn zrange(&self, key: &str, start: i64, end: i64, rev: bool) -> Vec<String> { self.inner.zrange(key, start, end, rev) }
    fn zrem_range_by_score(&mut self, key: &str, min: f64, max: f64) -> u64 { self.inner.zrem_range_by_score(key, min, max) }
}
