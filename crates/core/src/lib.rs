//! Core of the SpinTracker backend: business logic with no dependency on Tauri.

pub mod api;
pub mod db;
pub mod engines;
pub mod error;
pub mod models;
pub mod parsers;
pub mod repos;
pub mod services;
pub mod stats;
pub(crate) mod util;

pub use error::{Error, Result};
