use crate::model::{KvEntry, QueueItem, WorkspaceKey};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WalRecord {
    KvSet { key: WorkspaceKey, entry: KvEntry },
    QueuePush { ns: String, ws: String, queue: String, item: QueueItem },
}

pub trait Wal: Send + Sync + 'static {
    fn append(&self, record: &WalRecord) -> anyhow::Result<()>;
}

pub struct FileWal {
    #[allow(dead_code)]
    path: PathBuf,
    inner: Mutex<BufWriter<File>>,
}

impl FileWal {
    pub fn open(path: PathBuf) -> anyhow::Result<Self> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        Ok(Self {
            path,
            inner: Mutex::new(BufWriter::new(file)),
        })
    }
}

impl Wal for FileWal {
    fn append(&self, record: &WalRecord) -> anyhow::Result<()> {
        let mut guard = self.inner.lock().unwrap();
        let bytes = serde_json::to_vec(record)?;
        guard.write_all(&bytes)?;
        guard.write_all(b"\n")?;
        guard.flush()?;
        Ok(())
    }
}
