import type { DatabaseSync } from "node:sqlite";

/** An `images` row, keyed by the column names SQLite returns. */
export interface ImageRow {
  id: number;
  task_id: number;
  position: number;
  /** Path relative to the storage root, never absolute. */
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  sha256: string | null;
  source_url: string | null;
  created_at: string;
}

/** Input for {@link createImage}. */
export interface NewImage {
  /** Owning task; must exist. Deleting the task cascades to this row. */
  taskId: number;
  filePath: string;
  mimeType: string;
  /** Order within the task. Defaults to `0`. */
  position?: number;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  sha256?: string | null;
  sourceUrl?: string | null;
}

const COLUMNS = `id, task_id, position, file_path, mime_type, width, height,
  file_size, sha256, source_url, created_at`;

/** Inserts an image row and returns it. */
export function createImage(db: DatabaseSync, input: NewImage): ImageRow {
  const row = db
    .prepare(
      `INSERT INTO images
         (task_id, position, file_path, mime_type, width, height, file_size, sha256, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .get(
      input.taskId,
      input.position ?? 0,
      input.filePath,
      input.mimeType,
      input.width ?? null,
      input.height ?? null,
      input.fileSize ?? null,
      input.sha256 ?? null,
      input.sourceUrl ?? null,
    );

  return row as unknown as ImageRow;
}

/** Looks an image up by id. */
export function findImageById(
  db: DatabaseSync,
  id: number,
): ImageRow | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM images WHERE id = ?`).get(id);

  return row as unknown as ImageRow | undefined;
}

/** Lists a task's images in display order (`position`, then `id`). */
export function listImagesByTask(db: DatabaseSync, taskId: number): ImageRow[] {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM images WHERE task_id = ? ORDER BY position, id`,
    )
    .all(taskId) as unknown as ImageRow[];
}

/**
 * Deletes an image row. Returns whether a row was deleted. The file on disk is
 * removed separately by the storage layer (roadmap step 7).
 */
export function deleteImage(db: DatabaseSync, id: number): boolean {
  const { changes } = db.prepare("DELETE FROM images WHERE id = ?").run(id);

  return changes > 0;
}
