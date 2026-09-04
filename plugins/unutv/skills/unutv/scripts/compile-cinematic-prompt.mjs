#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { compileCinematicPrompt } from "../../../packages/contracts/src/index.mjs";

async function input() {
  if (process.argv[2]) return JSON.parse(await readFile(process.argv[2], "utf8"));
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

try {
  const envelope = compileCinematicPrompt(await input());
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  if (!envelope.lint.ok || !envelope.preflight.ok) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: { code: error.code ?? "compile_failed", message: error.message, details: error.details } })}\n`);
  process.exitCode = 1;
}
