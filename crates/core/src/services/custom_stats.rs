//! User-defined stats: saving them and computing their figures over the history.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};

use crate::db::Database;
use crate::stats::custom::model::parse_definition;
use crate::stats::custom::store::{self, SaveError};
use crate::Result;

pub struct CustomStatsService {
    db: Arc<Database>,
    running: AtomicBool,
    done: AtomicU64,
    total: AtomicU64,
}

/// Resets the running flag even when the computation fails.
struct RunGuard<'a>(&'a AtomicBool);

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl CustomStatsService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, running: AtomicBool::new(false), done: AtomicU64::new(0), total: AtomicU64::new(0) }
    }

    pub fn list(&self) -> Result<Value> {
        Ok(Value::Array(store::list_json(&*self.db.conn()?)?))
    }

    pub fn create(&self, definition: &Value) -> std::result::Result<Value, SaveError> {
        let def = parse_definition(definition).map_err(SaveError::Invalid)?;
        let id = store::create(&*self.db.conn()?, &def)?;
        self.db.bump_data_version();
        Ok(json!({ "id": id, "name": def.name }))
    }

    /// `false` for an unknown id.
    pub fn update(&self, id: i64, definition: &Value) -> std::result::Result<bool, SaveError> {
        let def = parse_definition(definition).map_err(SaveError::Invalid)?;
        let found = store::update(&*self.db.conn()?, id, &def)?;
        self.db.bump_data_version();
        Ok(found)
    }

    pub fn delete(&self, id: i64) -> Result<bool> {
        let found = store::delete(&*self.db.conn()?, id)?;
        self.db.bump_data_version();
        Ok(found)
    }

    pub fn preview(&self, definition: &Value, hero: Option<&str>) -> std::result::Result<Value, SaveError> {
        let def = parse_definition(definition).map_err(SaveError::Invalid)?;
        store::preview(&*self.db.conn()?, &def, hero)
    }

    /// Computes the figures of every pending stat. Returns the hands processed; `0` also when a
    /// computation is already running (the caller polls [`Self::status`]).
    pub fn recompute(&self) -> Result<u64> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Ok(0);
        }
        let _guard = RunGuard(&self.running);
        self.done.store(0, Ordering::SeqCst);
        self.total.store(0, Ordering::SeqCst);
        let done = store::recompute_pending(&mut *self.db.conn()?, |done, total| {
            self.done.store(done, Ordering::SeqCst);
            self.total.store(total, Ordering::SeqCst);
        })?;
        self.db.bump_data_version();
        Ok(done)
    }

    pub fn status(&self) -> Result<Value> {
        let pending = store::pending_count(&*self.db.conn()?)?;
        Ok(json!({
            "pending": pending,
            "running": self.running.load(Ordering::SeqCst),
            "done": self.done.load(Ordering::SeqCst),
            "total": self.total.load(Ordering::SeqCst),
        }))
    }
}
