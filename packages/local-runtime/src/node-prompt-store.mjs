function parse(value, fallback) {
  return value ? JSON.parse(value) : fallback;
}

export function writeNodePrompt(database, input) {
  const current = database.prepare("SELECT current_version FROM node_prompts WHERE node_id=?").get(input.nodeId);
  const version = (current?.current_version ?? 0) + 1;
  database.prepare(`
    INSERT INTO node_prompts (node_id, current_version, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(node_id) DO UPDATE SET current_version=excluded.current_version, updated_at=excluded.updated_at
  `).run(input.nodeId, version, input.updatedAt);
  database.prepare(`
    INSERT INTO node_prompt_versions (
      node_id, version, text, provider, model_id, mode, parameters_json,
      reference_node_ids_json, reference_media_ids_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.nodeId,
    version,
    input.text,
    input.provider,
    input.modelId,
    input.mode,
    JSON.stringify(input.parameters),
    JSON.stringify(input.referenceNodeIds),
    JSON.stringify(input.referenceMediaIds),
    input.updatedAt
  );
  database.prepare(`
    INSERT INTO node_prompt_documents (node_id, prompt_version, schema_version, document_json, created_at)
    VALUES (?, ?, 1, ?, ?)
  `).run(input.nodeId, version, JSON.stringify(input.document || { type: "doc", version: 1, content: [{ type: "text", text: input.text || "" }] }), input.updatedAt);
  return { ...input, version };
}

export function readNodePrompt(database, nodeId) {
  const current = database.prepare(`
    SELECT node_id AS nodeId, current_version AS version, updated_at AS updatedAt
    FROM node_prompts WHERE node_id=?
  `).get(nodeId);
  if (!current) return undefined;
  const row = database.prepare(`
    SELECT text, provider, model_id AS modelId, mode, parameters_json,
      reference_node_ids_json, reference_media_ids_json, created_at AS createdAt
    FROM node_prompt_versions WHERE node_id=? AND version=?
  `).get(nodeId, current.version);
  if (!row) return undefined;
  const document = database.prepare(`
    SELECT document_json AS documentJson FROM node_prompt_documents WHERE node_id=? AND prompt_version=?
  `).get(nodeId, current.version);
  return {
    ...current,
    text: row.text,
    provider: row.provider,
    modelId: row.modelId,
    mode: row.mode,
    parameters: parse(row.parameters_json, {}),
    referenceNodeIds: parse(row.reference_node_ids_json, []),
    referenceMediaIds: parse(row.reference_media_ids_json, []),
    document: parse(document?.documentJson, null),
    createdAt: row.createdAt
  };
}
