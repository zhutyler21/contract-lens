import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEV_BASE_URL = "https://localhost:3000";
const rawBaseUrl = process.env.ADDIN_BASE_URL || DEV_BASE_URL;
const baseUrl = rawBaseUrl.replace(/\/+$/, "");

if (!/^https?:\/\/[^/\s]+/i.test(baseUrl)) {
  throw new Error(`ADDIN_BASE_URL 无效：${rawBaseUrl}`);
}

const staticEntries = [
  ["src/assets", "dist/src/assets"]
];

await Promise.all(
  staticEntries.map(async ([sourceRelativePath, targetRelativePath]) => {
    const sourcePath = resolve(process.cwd(), sourceRelativePath);
    const targetPath = resolve(process.cwd(), targetRelativePath);

    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true, force: true });
  })
);

await buildManifest(baseUrl);

async function buildManifest(targetBaseUrl) {
  const sourcePath = resolve(process.cwd(), "manifest.xml");
  const targetPath = resolve(process.cwd(), "dist/manifest.xml");
  const sourceContent = await readFile(sourcePath, "utf8");
  const outputContent = sourceContent.replaceAll(DEV_BASE_URL, targetBaseUrl);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, outputContent, "utf8");
}
