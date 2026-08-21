#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { assertCinematicContract } from "../../../packages/contracts/src/index.mjs";

async function input() {
  const chunks = [];
  if (process.argv[3]) return JSON.parse(await readFile(process.argv[3], "utf8"));
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

try {
  const kind = process.argv[2];
  if (!kind) throw new Error("Usage: validate-cinematic-spec.mjs CONTRACT_KIND [FILE]");
  const value = await input();
  assertCinematicContract(kind, value.value ?? value, value.context);
  process.stdout.write(`${JSON.stringify({ kind, ok: true })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: { code: error.code ?? "validation_failed", message: error.message, details: error.details } })}\n`);
  process.exitCode = 1;
}
