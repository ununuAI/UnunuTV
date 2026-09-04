import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import test from "node:test";

const exec = promisify(execFile);
const sourceWrapper = path.resolve("skills/unutv/scripts/unutv.mjs");

test("UnunuTV skill wrapper uses the Windows portable directory without UNUTV_ROOT", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-skill-wrapper-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const wrapper = path.join(root, "plugin", "skills", "unutv", "scripts", "unutv.mjs");
  await mkdir(path.dirname(wrapper), { recursive: true });
  await copyFile(sourceWrapper, wrapper);
  const localAppData = path.join(path.parse(process.cwd()).root, "Users", "tester", "AppData", "Local");
  const code = `
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.LOCALAPPDATA = ${JSON.stringify(localAppData)};
    delete process.env.UNUTV_ROOT;
    process.argv = [process.execPath, ${JSON.stringify(wrapper)}, "--help"];
    await import(${JSON.stringify(`${pathToFileURL(wrapper).href}?windows-default`)});
  `;
  const { stdout } = await exec(process.execPath, ["--input-type=module", "-e", code]);
  assert.equal(JSON.parse(stdout).repo, path.join(localAppData, "Ununu", "ununu-unutv"));
});
