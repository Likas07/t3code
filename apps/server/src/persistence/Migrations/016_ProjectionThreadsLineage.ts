import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN root_thread_id TEXT
  `;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN parent_thread_id TEXT
  `;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN delegation_depth INTEGER
  `;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN delegation_role TEXT
  `;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN parent_batch_id TEXT
  `;
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN parent_task_index INTEGER
  `;

  yield* sql`
    UPDATE projection_threads
    SET
      root_thread_id = COALESCE(root_thread_id, thread_id),
      parent_thread_id = parent_thread_id,
      delegation_depth = COALESCE(delegation_depth, 0),
      delegation_role = COALESCE(delegation_role, 'primary'),
      parent_batch_id = parent_batch_id,
      parent_task_index = parent_task_index
  `;
});
