export type SourceType = 'asa' | 'ftd' | 'both';

export interface Project {
  id: string;
  name: string;
  sourceType: SourceType;
  status: ProjectStatus;
  currentStep: ProjectStep;
  completedSteps: ProjectStep[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectStatus =
  | 'draft'
  | 'imported'
  | 'parsed'
  | 'mapped'
  | 'validated'
  | 'exported';

export type ProjectStep =
  | 'import'
  | 'parse'
  | 'map-objects'
  | 'map-policy'
  | 'validate'
  | 'export';

export interface ImportSource {
  id: string;
  projectId: string;
  sourceType: SourceType;
  filename?: string;
  uploadedAt: Date;
}

export interface RawConfigArtifact {
  id: string;
  projectId: string;
  filename: string;
  size: number;
  sha256: string;
  uploadedAt: Date;
  sourceType: 'asa' | 'ftd';
  content?: string; // Only loaded when needed; never logged
}
