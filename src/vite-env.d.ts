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
  kind: "integration" | "package" | "lookup" | "xml" | "sql" | "other";
};

export type ActionSourceDocument = {
  path: string;
  name: string;
  kind: "docx" | "pdf" | "sql";
  text: string;
  warning?: string;
  ignoredDocuments?: Array<{
    path: string;
    name: string;
    kind: "docx" | "pdf" | "sql";
    textLength: number;
    warning?: string;
    reason: string;
  }>;
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
  kind: "iar" | "par" | "jar" | "unsupported" | "error";
  projects: Array<{
    code?: string;
    name?: string;
    version?: string;
    type?: string;
    state?: string;
  }>;
  components: Array<{
    kind: "connection" | "schedule" | "dvm" | "pipeline" | "proxyService" | "businessService" | "serviceAccount";
    name: string;
    path: string;
  }>;
  entries: string[];
  internalArtifacts?: Array<{
    path: string;
    name: string;
    kind: "iar" | "par" | "jar" | "unsupported" | "error";
    projects: Array<{
      code?: string;
      name?: string;
      version?: string;
      type?: string;
      state?: string;
    }>;
    components: Array<{
      kind: "connection" | "schedule" | "dvm" | "pipeline" | "proxyService" | "businessService" | "serviceAccount";
      name: string;
      path: string;
    }>;
    entries: string[];
    error?: string;
  }>;
  error?: string;
};

export type EvidenceImage = {
  name: string;
  path?: string;
  dataUrl: string;
};

export type RuntimeKnowledgeCatalog = {
  schemaVersion: number;
  knowledgeVersion: string;
  source: "local" | "remote";
  products: Array<{
    id: string;
    name: string;
    version: string;
    previous: string;
    modules: string[];
  }>;
  templates: Array<{
    id: string;
    product?: string;
    label: string;
    hint: string;
  }>;
  basePath: string;
  previousVersion?: string | null;
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
      saveEvidenceImage: (payload: {
        rfc?: string;
        phase?: string;
        outputDirectory?: string;
        name: string;
        dataUrl: string;
      }) => Promise<string | null>;
      saveEvidenceImages: (payload: {
        rfc?: string;
        phase?: string;
        outputDirectory?: string;
        images: Array<{ name: string; dataUrl: string }>;
      }) => Promise<{ directory: string; count: number; paths: string[] } | null>;
      loadKnowledge: () => Promise<RuntimeKnowledgeCatalog | null>;
      installKnowledgePackage: (filePath: string) => Promise<RuntimeKnowledgeCatalog>;
      rollbackKnowledgePackage: () => Promise<RuntimeKnowledgeCatalog | null>;
      saveActionPlanText: (payload: {
        rfc?: string;
        outputDirectory?: string;
        content: string;
      }) => Promise<{ path: string; baseDirectory: string; outputDirectory: string } | string | null>;
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
      showItemInFolder: (path: string) => Promise<boolean>;
    };
  }
}
