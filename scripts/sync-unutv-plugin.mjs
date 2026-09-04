#!/usr/bin/env node
import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "plugins/unutv/skills/unutv");
rmSync(target, { recursive: true, force: true });
cpSync(resolve(root, "skills/unutv"), target, { recursive: true });
console.log(`Synced ${target}`);
