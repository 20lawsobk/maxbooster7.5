use crate::model::{KvEntry, QueueItem, WorkspaceKey};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WalRecord {
    KvSet { key: WorkspaceKey, entry: KvEntry },
    QueuePush { ns: String, ws: String, queue: String, item: QueueItem },
}

/// On-disk format for a single WAL entry: the record JSON plus a CRC32
/// of that JSON to detect partial writes and corruption.
#[derive(Serialize, Deserialize)]
struct WalLine {
    crc: u32,
    data: String,
}

pub trait Wal: Send + Sync + 'static {
    fn append(&self, record: &WalRecord) -> anyhow::Result<()>;
}

pub struct FileWal {
    path: PathBuf,
    inner: Mutex<BufWriter<File>>,
}

impl FileWal {
    /// Open the WAL at `path` for appending and replay all existing valid
    /// records from disk.  Corrupted or partially-written lines (bad CRC,
    /// truncated JSON) are silently skipped rather than aborting startup —
    /// this is the expected behaviour after an unclean shutdown.
    pub fn open(path: PathBuf) -> anyhow::Result<(Self, Vec<WalRecord>)> {
        let records = Self::replay_records(&path)?;

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        let wal = Self {
            path,
            inner: Mutex::new(BufWriter::new(file)),
        };

        Ok((wal, records))
    }

    /// Read, verify, and deserialise every record in an existing WAL file.
    fn replay_records(path: &PathBuf) -> anyhow::Result<Vec<WalRecord>> {
        if !path.exists() {
            return Ok(vec![]);
        }

        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut records: Vec<WalRecord> = Vec::new();
        let mut skipped = 0usize;

        for line_result in reader.lines() {
            let line = match line_result {
                Ok(l) if l.trim().is_empty() => continue,
                Ok(l) => l,
                Err(_) => { skipped += 1; continue; }
            };

            let wal_line: WalLine = match serde_json::from_str(&line) {
                Ok(wl) => wl,
                Err(_) => { skipped += 1; continue; }
            };

            // Verify integrity before trusting the record.
            let computed = crc32fast::hash(wal_line.data.as_bytes());
            if computed != wal_line.crc {
                eprintln!(
                    "[WAL] CRC mismatch (stored={}, computed={}) — skipping corrupt record",
                    wal_line.crc, computed
                );
                skipped += 1;
                continue;
            }

            match serde_json::from_str::<WalRecord>(&wal_line.data) {
                Ok(record) => records.push(record),
                Err(_) => { skipped += 1; }
            }
        }

        if !records.is_empty() || skipped > 0 {
            eprintln!(
                "[WAL] Replayed {} record(s) from {:?} ({} corrupted line(s) skipped)",
                records.len(),
                path,
                skipped
            );
        }

        Ok(records)
    }
}

impl Wal for FileWal {
    fn append(&self, record: &WalRecord) -> anyhow::Result<()> {
        // Serialise the record to JSON, compute its CRC32, then write the
        // envelope.  After flushing the BufWriter we call sync_all() so the
        // kernel flushes its page-cache to stable storage — this is the real
        // fsync that guarantees durability even after a power failure.
        let data = serde_json::to_string(record)?;
        let crc = crc32fast::hash(data.as_bytes());

        let line = serde_json::to_vec(&WalLine { crc, data })?;

        let mut guard = self.inner.lock().unwrap();
        guard.write_all(&line)?;
        guard.write_all(b"\n")?;
        guard.flush()?;
        // fsync — guarantee persistence to physical media before returning.
        guard.get_ref().sync_all()?;

        Ok(())
    }
}
