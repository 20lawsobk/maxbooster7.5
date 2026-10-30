---
name: SQLite per-op connection churn deadlock
description: Per-operation sqlite3 connect/close across threads can deadlock in SQLite's unix-VFS inode mutex
---

Opening and closing a fresh `sqlite3.connect()` per operation from many threads — even when fully serialized by a Python lock — can permanently deadlock inside libsqlite3's unix-VFS inode mutex (`py-spy dump --native` shows threads parked in `findReusableFd` / `sqlite3WalClose` → `pthread_mutex_lock`). Symptoms: process near-idle, every disk-store call hangs forever, yet the DB opens instantly from another process.

**Why:** this froze all AI content generation behind a disk-cache read until the store was switched to one persistent connection.

**How to apply:** for any threaded SQLite disk store, keep ONE long-lived connection guarded by the existing lock; on `sqlite3.Error`, drop and lazily reopen it. py-spy IS pip-installable in this workspace.
