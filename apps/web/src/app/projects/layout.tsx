import { AppShell } from '@/components/app-shell';

/** Separate from (app) group so dev chunks use paths without parentheses (avoids ChunkLoadError on some setups). */
export default function ProjectsBranchLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
