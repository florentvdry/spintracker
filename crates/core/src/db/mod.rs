//! SQLite access: migrations, connection pool and database registry.

pub mod migrations;
pub mod pool;
pub mod registry;

pub use pool::Database;
pub use registry::{DatabaseInfo, DatabaseRegistry};
