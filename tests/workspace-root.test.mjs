import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("workspace keeps SQLite state hidden and project media in the user-selected directory", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "unutv-workspace-root-"));
  const dataRoot = path.join(base, "state");
  const firstRoot = path.join(base, "visible-projects");
  const secondRoot = path.join(base, "next-projects");
  const runtime = createLocalRuntime({
    dataRoot,
    autoInitializeWorkspace: false,
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });

  try {
    assert.deepEqual(await runtime.app.getWorkspace(), {
      initialized: false,
      rootPath: null,
      initializedAt: null,
      updatedAt: null
    });
    await assert.rejects(
      () => runtime.app.createProject({ title: "尚未初始化" }),
      (error) => error.code === "workspace_not_initialized"
    );
    await assert.rejects(
      () => runtime.app.initializeWorkspace({ rootPath: "relative/projects" }),
      (error) => error.code === "workspace_root_must_be_absolute"
    );

    const initialized = await runtime.app.initializeWorkspace({ rootPath: firstRoot });
    assert.equal(initialized.rootPath, firstRoot);

    const { project } = await runtime.app.createProject({ title: "艾泽拉斯网吧" });
    assert.equal(project.mediaRoot, path.join(firstRoot, "艾泽拉斯网吧"));
    assert.ok(existsSync(path.join(dataRoot, "catalog.sqlite")));
    assert.ok(existsSync(path.join(dataRoot, "projects", project.id, "project.sqlite")));
    for (const directory of ["Images", "Videos", "Audio", "Worlds"]) {
      assert.ok(existsSync(path.join(project.mediaRoot, directory)));
    }

    const media = await runtime.app.importDataMedia({
      projectId: project.id,
      kind: "image",
      dataUrl: ONE_PIXEL_PNG,
      title: "主角定妆.png"
    });
    assert.match(media.relativePath, /^Images\//);
    assert.ok(existsSync(path.join(project.mediaRoot, media.relativePath)));
    const visibleTopLevel = await readdir(project.mediaRoot);
    assert.equal(visibleTopLevel.some((name) => /\.(?:json|md|sqlite)$/i.test(name)), false);

    await assert.rejects(
      () => runtime.app.createProject({ title: "艾泽拉斯网吧" }),
      (error) => error.code === "project_directory_exists"
    );

    await runtime.app.setWorkspaceRoot({ rootPath: secondRoot });
    const { project: nextProject } = await runtime.app.createProject({ title: "第二集" });
    assert.equal(nextProject.mediaRoot, path.join(secondRoot, "第二集"));
    assert.equal(runtime.projects.mediaRoot(project.id), path.join(firstRoot, "艾泽拉斯网吧"));
  } finally {
    runtime.close();
    await rm(base, { recursive: true, force: true });
  }
});
