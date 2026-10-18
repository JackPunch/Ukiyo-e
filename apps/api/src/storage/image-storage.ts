import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export interface StoredImage {
  filePath: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
}

export function storageRoot(): string {
  return resolve(process.env.STORAGE_ROOT ?? "./data");
}

function safeStoragePath(filePath: string): string {
  const root = storageRoot();
  const absolute = resolve(root, filePath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error("图片路径超出存储目录");
  }
  return absolute;
}

function imageType(bytes: Uint8Array, contentType: string | null): string {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  const extension = ALLOWED_TYPES.get(normalized ?? "");
  if (!extension) throw new Error("供应商返回了不支持的图片类型");

  const valid =
    (extension === "png" &&
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47) ||
    (extension === "jpg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (extension === "webp" &&
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!valid) throw new Error("供应商返回的内容不是有效图片");
  return extension;
}

async function readResponse(response: Response): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error("图片文件超过大小限制");
  }
  if (!response.body) throw new Error("供应商返回了空图片");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) throw new Error("图片文件超过大小限制");
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function storeProviderImage(
  taskId: number,
  position: number,
  sourceUrl: string,
): Promise<StoredImage> {
  const url = new URL(sourceUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("图片地址协议不受支持");
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`);

  const bytes = await readResponse(response);
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = imageType(bytes, mimeType);
  const relativePath = join("images", String(taskId), `${position}-${randomUUID()}.${extension}`);
  const absolutePath = safeStoragePath(relativePath);
  const directory = resolve(absolutePath, "..");
  const temporaryPath = join(directory, `.tmp-${randomUUID()}`);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return {
    filePath: relativePath,
    mimeType,
    fileSize: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function imageFilePath(filePath: string): string {
  return safeStoragePath(filePath);
}

export async function removeStoredImage(filePath: string): Promise<void> {
  await rm(safeStoragePath(filePath), { force: true });
}

export { createReadStream, stat };
