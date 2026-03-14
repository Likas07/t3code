import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_delegation_batches (
      batch_id TEXT PRIMARY KEY,
      parent_thread_id TEXT NOT NULL,
      parent_turn_id TEXT,
      workspace_mode TEXT NOT NULL,
      concurrency_limit INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_delegation_children (
      child_thread_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      parent_thread_id TEXT NOT NULL,
      task_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      branch TEXT,
      worktree_path TEXT,
      started_at TEXT,
      completed_at TEXT,
      summary TEXT,
      error TEXT,
      blocking_request_id TEXT,
      blocking_kind TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_delegation_batches_parent_thread
    ON projection_thread_delegation_batches(parent_thread_id, created_at)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_delegation_children_parent_thread
    ON projection_thread_delegation_children(parent_thread_id, batch_id, task_index)
  `;
});
