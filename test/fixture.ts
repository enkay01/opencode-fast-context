import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface Fixture {
  root: string;
  cleanup(): Promise<void>;
}

export async function makeFixture(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "fast-context-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content);
  }
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function addSymlink(root: string, path: string, target: string): Promise<void> {
  await symlink(target, join(root, path));
}
