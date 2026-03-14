import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_kind TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_source_thread_id TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_bootstrap_status TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_imported_message_count INTEGER
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_created_at TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN fork_bootstrapped_at TEXT
  `;
});
