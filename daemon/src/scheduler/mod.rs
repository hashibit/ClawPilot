//! Multi-agent scheduler module
//!
//! This module implements the DAG-based task scheduling system for coordinating
//! multiple OpenClaw agents.

pub mod models;
pub mod db;
pub mod dag;
pub mod worker;
pub mod recovery;
pub mod artifacts;
pub mod context;
pub mod routes;
pub mod event_stream;

pub use db::Db;
pub use dag::DagScheduler;
pub use worker::Worker;
pub use recovery::Recovery;
pub use event_stream::{EventStream, ActivityEvent, RunRoute};