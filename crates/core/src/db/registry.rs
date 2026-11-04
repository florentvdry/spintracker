//! Database registry (`database_registry.json`).
//!
//! The file format is the one written by the C# backend (PascalCase properties) so existing
//! installations are read back unchanged.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

use crate::Result;

const REGISTRY_FILE: &str = "database_registry.json";
// Legacy value written by the former backend; kept so existing registries stay consistent.
const DEFAULT_DB_NAME: &str = "Base de données principale";

mod lenient_datetime {
    use super::*;

    pub fn serialize<S: Serializer>(dt: &DateTime<Utc>, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&dt.to_rfc3339_opts(SecondsFormat::Micros, true))
    }

    /// Accepts RFC 3339 (with `Z` or an offset) and the zone-less dates .NET writes for a
    /// `DateTime` of kind Unspecified (read as UTC).
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<DateTime<Utc>, D::Error> {
        let raw = String::deserialize(d)?;
        if let Ok(dt) = DateTime::parse_from_rfc3339(&raw) {
            return Ok(dt.with_timezone(&Utc));
        }
        NaiveDateTime::parse_from_str(&raw, "%Y-%m-%dT%H:%M:%S%.f")
            .map(|n| n.and_utc())
            .map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DatabaseInfo {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub file_path: String,
    #[serde(with = "lenient_datetime")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "lenient_datetime")]
    pub last_used_at: DateTime<Utc>,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub hands_count: i64,
}

pub struct DatabaseRegistry {
    app_dir: PathBuf,
    registry_path: PathBuf,
    databases: Mutex<Vec<DatabaseInfo>>,
}

impl DatabaseRegistry {
    /// Loads the registry stored in `app_dir`, or creates it with a default database.
    ///
    /// `provided_db_path`: existing database adopted as the default one when the registry is
    /// first created (the former backend's `--db-path` argument).
    pub fn load(app_dir: impl Into<PathBuf>, provided_db_path: Option<&Path>) -> Result<Self> {
        let app_dir = app_dir.into();
        std::fs::create_dir_all(&app_dir)?;
        let registry_path = app_dir.join(REGISTRY_FILE);

        let loaded = match std::fs::read_to_string(&registry_path) {
            Ok(json) => match serde_json::from_str::<Vec<DatabaseInfo>>(&json) {
                Ok(list) => Some(list),
                Err(e) => {
                    log::error!("unreadable registry ({e}), recreating it with the default database");
                    None
                }
            },
            Err(_) => None,
        };

        let registry = Self {
            app_dir,
            registry_path,
            databases: Mutex::new(loaded.clone().unwrap_or_default()),
        };
        if loaded.is_none() {
            registry.create_default(provided_db_path)?;
        }
        Ok(registry)
    }

    pub fn databases_folder(&self) -> Result<PathBuf> {
        let dir = self.app_dir.join("databases");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    fn create_default(&self, provided_db_path: Option<&Path>) -> Result<()> {
        let (path, file_name) = match provided_db_path {
            Some(p) if p.exists() => (
                p.to_path_buf(),
                p.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default(),
            ),
            _ => (self.databases_folder()?.join("poker_tracker.db"), "poker_tracker.db".to_string()),
        };
        let now = Utc::now();
        let mut dbs = self.databases.lock().unwrap();
        dbs.push(DatabaseInfo {
            id: Uuid::new_v4().to_string(),
            name: DEFAULT_DB_NAME.into(),
            file_name,
            file_path: path.to_string_lossy().into_owned(),
            created_at: now,
            last_used_at: now,
            is_active: true,
            hands_count: 0,
        });
        self.save(&dbs);
        Ok(())
    }

    /// A write failure is logged without interrupting the caller (like the former backend).
    fn save(&self, dbs: &[DatabaseInfo]) {
        let result = serde_json::to_string_pretty(dbs)
            .map_err(crate::Error::from)
            .and_then(|json| std::fs::write(&self.registry_path, json).map_err(Into::into));
        if let Err(e) = result {
            log::error!("cannot write the registry: {e}");
        }
    }

    pub fn get_all(&self) -> Vec<DatabaseInfo> {
        self.databases.lock().unwrap().clone()
    }

    pub fn get_by_id(&self, id: &str) -> Option<DatabaseInfo> {
        self.databases.lock().unwrap().iter().find(|d| d.id == id).cloned()
    }

    pub fn get_active(&self) -> Option<DatabaseInfo> {
        self.databases.lock().unwrap().iter().find(|d| d.is_active).cloned()
    }

    /// Registers a new database. The file is created the first time it is opened.
    pub fn create(&self, name: &str) -> Result<DatabaseInfo> {
        let folder = self.databases_folder()?;
        let id = Uuid::new_v4().to_string();
        let file_name = format!("spintracker_{}.db", &id[..8]);
        let now = Utc::now();
        let info = DatabaseInfo {
            id,
            name: name.to_string(),
            file_path: folder.join(&file_name).to_string_lossy().into_owned(),
            file_name,
            created_at: now,
            last_used_at: now,
            is_active: false,
            hands_count: 0,
        };
        let mut dbs = self.databases.lock().unwrap();
        dbs.push(info.clone());
        self.save(&dbs);
        Ok(info)
    }

    pub fn set_active(&self, id: &str) -> bool {
        let mut dbs = self.databases.lock().unwrap();
        if !dbs.iter().any(|d| d.id == id) {
            return false;
        }
        let now = Utc::now();
        for d in dbs.iter_mut() {
            d.is_active = d.id == id;
            if d.is_active {
                d.last_used_at = now;
            }
        }
        self.save(&dbs);
        true
    }

    /// Refuses to delete the last or the active database. Also removes `-wal` and `-shm`.
    pub fn delete(&self, id: &str) -> bool {
        let mut dbs = self.databases.lock().unwrap();
        if dbs.len() <= 1 {
            return false;
        }
        let Some(pos) = dbs.iter().position(|d| d.id == id) else {
            return false;
        };
        if dbs[pos].is_active {
            return false;
        }
        let removed = dbs.remove(pos);
        for suffix in ["", "-wal", "-shm"] {
            let file = format!("{}{}", removed.file_path, suffix);
            if let Err(e) = std::fs::remove_file(&file) {
                if e.kind() != std::io::ErrorKind::NotFound {
                    log::error!("suppression de {file} impossible: {e}");
                }
            }
        }
        self.save(&dbs);
        true
    }

    pub fn rename(&self, id: &str, new_name: &str) -> bool {
        let mut dbs = self.databases.lock().unwrap();
        let Some(db) = dbs.iter_mut().find(|d| d.id == id) else {
            return false;
        };
        db.name = new_name.to_string();
        self.save(&dbs);
        true
    }

    pub fn update_hands_count(&self, id: &str, count: i64) {
        let mut dbs = self.databases.lock().unwrap();
        if let Some(db) = dbs.iter_mut().find(|d| d.id == id) {
            db.hands_count = count;
            self.save(&dbs);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry(dir: &Path) -> DatabaseRegistry {
        DatabaseRegistry::load(dir, None).unwrap()
    }

    #[test]
    fn first_load_creates_active_default_database() {
        let dir = tempfile::tempdir().unwrap();
        let reg = registry(dir.path());
        let all = reg.get_all();
        assert_eq!(all.len(), 1);
        assert!(all[0].is_active);
        assert_eq!(all[0].name, "Base de données principale");
        assert!(all[0].file_path.ends_with("poker_tracker.db"));
        assert!(dir.path().join("database_registry.json").exists());
    }

    #[test]
    fn provided_existing_db_is_adopted() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("poker_tracker.db");
        std::fs::write(&db, b"").unwrap();
        let reg = DatabaseRegistry::load(dir.path(), Some(&db)).unwrap();
        let active = reg.get_active().unwrap();
        assert_eq!(Path::new(&active.file_path), db);
        assert_eq!(active.file_name, "poker_tracker.db");
    }

    #[test]
    fn registry_is_persisted_and_reloaded() {
        let dir = tempfile::tempdir().unwrap();
        let reg = registry(dir.path());
        let created = reg.create("Other").unwrap();
        let reloaded = registry(dir.path());
        assert_eq!(reloaded.get_all().len(), 2);
        assert_eq!(reloaded.get_by_id(&created.id).unwrap().name, "Other");
    }

    #[test]
    fn reads_json_written_by_the_csharp_backend() {
        let dir = tempfile::tempdir().unwrap();
        let json = r#"[
          {
            "Id": "11111111-2222-3333-4444-555555555555",
            "Name": "Base de données principale",
            "FileName": "poker_tracker.db",
            "FilePath": "C:\\Users\\x\\AppData\\Roaming\\SpinTracker\\poker_tracker.db",
            "CreatedAt": "2026-05-20T10:15:30.1234567Z",
            "LastUsedAt": "2026-06-01T08:00:00",
            "IsActive": true,
            "HandsCount": 1234
          }
        ]"#;
        std::fs::write(dir.path().join("database_registry.json"), json).unwrap();
        let reg = registry(dir.path());
        let db = reg.get_active().unwrap();
        assert_eq!(db.hands_count, 1234);
        assert_eq!(db.file_path, "C:\\Users\\x\\AppData\\Roaming\\SpinTracker\\poker_tracker.db");
        assert_eq!(db.created_at.to_rfc3339_opts(SecondsFormat::Secs, true), "2026-05-20T10:15:30Z");
        assert_eq!(db.last_used_at.to_rfc3339_opts(SecondsFormat::Secs, true), "2026-06-01T08:00:00Z");

        // Rewritten with the same property names.
        reg.rename(&db.id, "Renamed");
        let written = std::fs::read_to_string(dir.path().join("database_registry.json")).unwrap();
        assert!(written.contains("\"FilePath\"") && written.contains("\"IsActive\""));
    }

    #[test]
    fn corrupt_registry_falls_back_to_default() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("database_registry.json"), "{ pas du json").unwrap();
        let reg = registry(dir.path());
        assert_eq!(reg.get_all().len(), 1);
    }

    #[test]
    fn set_active_switches_flag_and_unknown_id_fails() {
        let dir = tempfile::tempdir().unwrap();
        let reg = registry(dir.path());
        let other = reg.create("B").unwrap();
        assert!(reg.set_active(&other.id));
        assert_eq!(reg.get_active().unwrap().id, other.id);
        assert_eq!(reg.get_all().iter().filter(|d| d.is_active).count(), 1);
        assert!(!reg.set_active("unknown"));
    }

    #[test]
    fn delete_rules_and_file_cleanup() {
        let dir = tempfile::tempdir().unwrap();
        let reg = registry(dir.path());
        let first = reg.get_active().unwrap();
        assert!(!reg.delete(&first.id), "the last database cannot be deleted");

        let other = reg.create("B").unwrap();
        assert!(!reg.delete(&first.id), "the active database cannot be deleted");
        assert!(!reg.delete("unknown"));

        for suffix in ["", "-wal", "-shm"] {
            std::fs::write(format!("{}{}", other.file_path, suffix), b"x").unwrap();
        }
        assert!(reg.delete(&other.id));
        assert!(reg.get_by_id(&other.id).is_none());
        for suffix in ["", "-wal", "-shm"] {
            assert!(!Path::new(&format!("{}{}", other.file_path, suffix)).exists());
        }
    }

    #[test]
    fn rename_and_hands_count() {
        let dir = tempfile::tempdir().unwrap();
        let reg = registry(dir.path());
        let id = reg.get_active().unwrap().id;
        assert!(reg.rename(&id, "New"));
        assert!(!reg.rename("unknown", "x"));
        reg.update_hands_count(&id, 42);
        let db = reg.get_by_id(&id).unwrap();
        assert_eq!((db.name.as_str(), db.hands_count), ("New", 42));
    }
}
