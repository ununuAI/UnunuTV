import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_ROOT = "/Users/zhangxiaohao/Ununu/ununuAI/统一知识库";

function loadJsonDir(dir, idField) {
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
      const id = raw?.[idField] || name.replace(/\.json$/u, "");
      if (id) map.set(id, { ...raw, status: raw.status || raw.lifecycle || "ACTIVE" });
    } catch {
      // skip corrupt files
    }
  }
  return map;
}

/**
 * File-backed Knowledge Port over the unified knowledge library.
 */
export function createKnowledgeFileAdapter(options = {}) {
  const root = options.root || process.env.UNUTV_KNOWLEDGE_ROOT || DEFAULT_ROOT;
  let cache = null;

  function ensureCache() {
    if (cache && !options.noCache) return cache;
    cache = {
      capabilities: loadJsonDir(join(root, "专家/能力模块"), "capabilityId"),
      atoms: loadJsonDir(join(root, "正式知识/知识原子"), "knowledgeId"),
      root,
      loadedAt: new Date().toISOString()
    };
    return cache;
  }

  function scoreCapability(cap, query) {
    let score = 0;
    const text = JSON.stringify(cap).toLowerCase();
    for (const risk of query.risks || []) {
      if (text.includes(String(risk).toLowerCase())) score += 3;
    }
    for (const role of query.roles || []) {
      if (text.includes(String(role).toLowerCase())) score += 2;
    }
    for (const dept of query.departments || []) {
      if ((cap.departments || []).includes(dept) || text.includes(String(dept).toLowerCase())) score += 2;
    }
    if (query.statuses?.length) {
      const st = String(cap.status || "ACTIVE").toUpperCase();
      if (!query.statuses.map((s) => String(s).toUpperCase()).includes(st)) return -1;
    }
    return score;
  }

  return {
    root: () => ensureCache().root,
    stats() {
      const c = ensureCache();
      return { root: c.root, capabilityCount: c.capabilities.size, atomCount: c.atoms.size, loadedAt: c.loadedAt };
    },
    getKnowledgeByIds(ids = []) {
      const c = ensureCache();
      const capabilities = new Map();
      const atoms = new Map();
      for (const id of ids) {
        if (c.capabilities.has(id)) capabilities.set(id, c.capabilities.get(id));
        if (c.atoms.has(id)) atoms.set(id, c.atoms.get(id));
      }
      return { capabilities, atoms };
    },
    retrieveKnowledge(query = {}) {
      const c = ensureCache();
      const limit = Math.max(1, Math.min(Number(query.limit) || 8, 32));
      const statuses = (query.statuses || ["ACTIVE", "LIMITED"]).map((s) => String(s).toUpperCase());
      const scored = [];
      for (const [id, cap] of c.capabilities) {
        const st = String(cap.status || "ACTIVE").toUpperCase();
        if (!statuses.includes(st)) continue;
        const score = scoreCapability(cap, { ...query, statuses });
        if (score >= 0) scored.push({ id, cap, score: score || 1 });
      }
      scored.sort((a, b) => b.score - a.score);
      const topCaps = scored.slice(0, limit);
      const capabilities = topCaps.map((entry) => entry.cap);
      const atomIds = new Set();
      for (const entry of topCaps) {
        for (const [knId, kn] of c.atoms) {
          const caps = Array.isArray(kn.capabilities) ? kn.capabilities : [];
          if (caps.includes(entry.id) || JSON.stringify(kn).toLowerCase().includes(entry.id.toLowerCase())) {
            atomIds.add(knId);
          }
          if (atomIds.size >= limit * 2) break;
        }
      }
      // fallback: take first atoms if none linked
      if (!atomIds.size) {
        let n = 0;
        for (const id of c.atoms.keys()) {
          atomIds.add(id);
          if (++n >= limit) break;
        }
      }
      const atoms = [...atomIds].slice(0, limit).map((id) => c.atoms.get(id)).filter(Boolean);
      return {
        query,
        capabilities,
        atoms,
        capabilityIds: capabilities.map((entry) => entry.capabilityId).filter(Boolean),
        knowledgeIds: atoms.map((entry) => entry.knowledgeId).filter(Boolean)
      };
    }
  };
}
