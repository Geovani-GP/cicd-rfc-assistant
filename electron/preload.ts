import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("cicd", {
  checkPrerequisites: () => ipcRenderer.invoke("check-prerequisites"),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  selectFiles: (extensions: string[]) => ipcRenderer.invoke("select-files", extensions),
  selectActionDocument: () => ipcRenderer.invoke("select-action-document"),
  selectEvidenceImages: () => ipcRenderer.invoke("select-evidence-images"),
  captureAppWindow: () => ipcRenderer.invoke("capture-app-window"),
  captureScreenRegion: () => ipcRenderer.invoke("capture-screen-region"),
  getPathForFile: (file: File) => webUtils?.getPathForFile(file) ?? (file as File & { path?: string })?.path ?? "",
  scanRepositories: (basePath: string) => ipcRenderer.invoke("scan-repositories", basePath),
  cloneRepository: (payload: unknown) => ipcRenderer.invoke("clone-repository", payload),
  prepareRfcDraft: (payload: unknown) => ipcRenderer.invoke("prepare-rfc-draft", payload),
  getDraftSummary: (payload: unknown) => ipcRenderer.invoke("get-draft-summary", payload),
  commitRfcLocal: (payload: unknown) => ipcRenderer.invoke("commit-rfc-local", payload),
  pushRfcBranch: (payload: unknown) => ipcRenderer.invoke("push-rfc-branch", payload),
  undoRfcLocalCommit: (payload: unknown) => ipcRenderer.invoke("undo-rfc-local-commit", payload),
  finalizeRfc: (payload: unknown) => ipcRenderer.invoke("finalize-rfc", payload),
  inspectArtifacts: (filePaths: string[]) => ipcRenderer.invoke("inspect-artifacts", filePaths),
  exportEvidenceDocx: (payload: unknown) => ipcRenderer.invoke("export-evidence-docx", payload),
  exportEvidencePdf: (payload: unknown) => ipcRenderer.invoke("export-evidence-pdf", payload),
  backupUserData: (payload: unknown) => ipcRenderer.invoke("backup-user-data", payload),
  clearUserFiles: () => ipcRenderer.invoke("clear-user-files"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url)
});
