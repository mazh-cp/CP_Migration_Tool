import { createHash } from 'crypto';
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || '25', 10);

export async function ensureUploadDir(projectId: string): Promise<string> {
  const dir = path.join(UPLOAD_DIR, projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveArtifact(
  projectId: string,
  filename: string,
  content: Buffer | string
): Promise<{ path: string; size: number; sha256: string }> {
  const dir = await ensureUploadDir(projectId);
  const size = Buffer.byteLength(content);
  if (size > MAX_MB * 1024 * 1024) {
    throw new Error(`File too large. Max ${MAX_MB}MB allowed.`);
  }
  const sha256 = createHash('sha256').update(content).digest('hex');
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await writeFile(filePath, content);
  return { path: filePath, size, sha256 };
}

export async function loadArtifact(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return buf.toString('utf-8');
}
