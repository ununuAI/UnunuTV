import {
  deleteScriptRow,
  insertScriptRow,
  saveScreenplayDocument,
  selectScriptDocument,
  updateScriptRow
} from "./script-store.mjs";
import { invalidateCinematicDerivedState } from "./cinematic-derived-state-invalidation.mjs";

export function attachProjectScriptMethods(prototype, emitEvent) {
  Object.assign(prototype, {
    getScriptDocument(projectId, nodeId) {
      return selectScriptDocument(this.database(projectId), nodeId);
    },
    saveScreenplayDocument(projectId, input) {
      const database = this.database(projectId);
      let invalidations = [];
      const saved = saveScreenplayDocument(database, input, {
        onRevisionChanged: (screenplayDocument) => {
          invalidations = invalidateCinematicDerivedState(database, {
            sourceNodeId: input.nodeId,
            screenplayDocument,
            updatedAt: input.updatedAt
          });
        }
      });
      emitEvent(database, "screenplay.document_saved", saved.documentId, {
        checksum: saved.checksum,
        revision: saved.revision,
        invalidations
      });
      return {
        ...saved,
        cinematicDerivedStateInvalidations: invalidations
      };
    },
    createScriptRow(projectId, row) {
      const database = this.database(projectId);
      const created = insertScriptRow(database, row);
      emitEvent(database, "script.row_created", row.id, { nodeId: row.nodeId, documentRevision: created.documentRevision });
      return created;
    },
    updateScriptRow(projectId, rowId, input) {
      const database = this.database(projectId);
      const updated = updateScriptRow(database, rowId, input);
      if (updated) emitEvent(database, "script.row_updated", rowId, { nodeId: updated.nodeId, version: updated.version, documentRevision: updated.documentRevision });
      return updated;
    },
    deleteScriptRow(projectId, rowId, updatedAt) {
      const database = this.database(projectId);
      const deleted = deleteScriptRow(database, rowId, updatedAt);
      if (deleted) emitEvent(database, "script.row_deleted", rowId);
      return deleted;
    }
  });
}
