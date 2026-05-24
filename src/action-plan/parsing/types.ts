export type ManualActionPhase = {
  id: "prerequisites" | "scope" | "backup" | "preAnalysis" | "installation" | "schedule" | "validation" | "returnPoint" | "evidence";
  title: string;
  content: string;
  defaultIncluded?: boolean;
};
