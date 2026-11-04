-- Progress of the automatic import per hand-history file, used to resume after a restart.
CREATE TABLE import_files (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    hands_done INTEGER NOT NULL DEFAULT 0
);
