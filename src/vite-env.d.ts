/// <reference types="vite/client" />

export type Prerequisite = {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  helpUrl: string;
  fix: string;
};

export type RepositoryInfo = {
  name: string;
  path: string;
  branch: string | null;
  dirty: boolean;
  remote: string | null;
};

export type SelectedFile = {
  path: string;
  name: string;
  kind: "integration" | "package" | "lookup" | "xml" | "other";
};

export type ActionSourceDocument = {
  path: string;
  name: string;
  kind: "docx" | "pdf";
  text: string;
  warning?: string;
};

export type DraftSummary = {
  targetPath: string;
  filesToCopy: Array<{ source: string; destination: string; kind: string }>;
  manifestPath: string;
  manifestEntries: string[];
  inputUpdates: Record<string, string>;
  warnings: string[];
};

export type FinalizeResult = {
  ok: boolean;
  commit?: string;
  branch?: string;
  logPath: string;
  output: string;
};

export type ArtifactInspection = {
  filePath: string;
  fileName: string;
  kind: "iar" | "par" | "unsupported" | "error";
  projects: Array<{
    code?: string;
    name?: string;
    version?: string;
    type?: string;
    state?: string;
  }>;
  components: Array<{
    kind: "connection" | "schedule" | "dvm";
    name: string;
    path: string;
  }>;
  entries: string[];
  error?: string;
};

export type EvidenceImage = {
  name: string;
  path?: string;
  dataUrl: string;
};

declare global {
  interface Window {
    cicd: {
      checkPrerequisites: () => Promise<Prerequisite[]>;
      selectDirectory: () => Promise<string | null>;
      selectFiles: (extensions: string[]) => Promise<SelectedFile[]>;
      selectActionDocument: () => Promise<ActionSourceDocument | null>;
      selectEvidenceImages: () => Promise<EvidenceImage[]>;
      captureAppWindow: () => Promise<EvidenceImage>;
      captureScreenRegion: () => Promise<EvidenceImage>;
      getPathForFile: (file: File) => string;
      scanRepositories: (basePath: string) => Promise<RepositoryInfo[]>;
      cloneRepository: (payload: { url: string; destination: string }) => Promise<RepositoryInfo>;
      prepareRfcDraft: (payload: unknown) => Promise<DraftSummary>;
      getDraftSummary: (payload: unknown) => Promise<DraftSummary>;
      commitRfcLocal: (payload: unknown) => Promise<FinalizeResult>;
      pushRfcBranch: (payload: unknown) => Promise<FinalizeResult>;
      undoRfcLocalCommit: (payload: unknown) => Promise<FinalizeResult>;
      finalizeRfc: (payload: unknown) => Promise<FinalizeResult>;
      inspectArtifacts: (filePaths: string[]) => Promise<ArtifactInspection[]>;
      exportEvidenceDocx: (payload: unknown) => Promise<string | null>;
      exportEvidencePdf: (payload: unknown) => Promise<string | null>;
      backupUserData: (payload: unknown) => Promise<string>;
      clearUserFiles: () => Promise<boolean>;
      deleteLocalFile: (path: string) => Promise<boolean>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
