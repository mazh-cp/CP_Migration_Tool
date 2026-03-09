import Link from 'next/link';
import { readFile } from 'fs/promises';
import path from 'path';

const repoRoot = path.join(process.cwd(), '..', '..');
const docsDir = path.join(repoRoot, 'docs');

export default async function DocViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const safeSlug = slug.replace(/[^a-zA-Z0-9-]/g, '');
  const filePath =
    slug === 'README'
      ? path.join(repoRoot, 'README.md')
      : path.join(docsDir, `${safeSlug}.md`);
  let content: string;

  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return (
      <div>
        <Link href="/documentation" className="text-cyan-400 hover:underline mb-4 inline-block">
          ← Back to Documentation
        </Link>
        <p className="text-red-400">Document not found.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/documentation" className="text-cyan-400 hover:underline mb-6 inline-block">
        ← Back to Documentation
      </Link>
      <pre className="p-6 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 text-sm whitespace-pre-wrap font-sans overflow-x-auto">
        {content}
      </pre>
    </div>
  );
}
