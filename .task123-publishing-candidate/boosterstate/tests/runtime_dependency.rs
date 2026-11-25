use boosterstate::model::{KvEntry, Value, WorkspaceKey};
use boosterstate::wal::{FileWal, Wal, WalRecord};
use std::path::PathBuf;

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("boosterstate-dependency-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn wal_io_error_preserves_anyhow_source_and_context() {
    let fixture = Fixture::new();
    let result = FileWal::open(fixture.0.join("missing-parent/data.wal"));
    let error = match result {
        Err(error) => error.context("opening isolated WAL"),
        Ok(_) => panic!("missing parent must fail"),
    };
    assert_eq!(error.to_string(), "opening isolated WAL");
    assert_eq!(
        error.downcast_ref::<std::io::Error>().unwrap().kind(),
        std::io::ErrorKind::NotFound
    );
    assert_eq!(error.chain().count(), 2);
}

#[test]
fn wal_append_and_reopen_remain_compatible_with_updated_anyhow() {
    let fixture = Fixture::new();
    let path = fixture.0.join("data.wal");
    let key = WorkspaceKey::new("fixture", "owner", "test", "record");
    {
        let (wal, records) = FileWal::open(path.clone()).unwrap();
        assert!(records.is_empty());
        wal.append(&WalRecord::KvSet {
            key: key.clone(),
            entry: KvEntry { value: Value::String("persisted".to_string()), expires_at: None },
        }).unwrap();
    }
    let (_wal, records) = FileWal::open(path).unwrap();
    assert_eq!(records.len(), 1);
    match &records[0] {
        WalRecord::KvSet { key: actual, entry } => {
            assert_eq!(actual, &key);
            assert_eq!(entry.value, Value::String("persisted".to_string()));
        }
        _ => panic!("unexpected WAL record"),
    }
}