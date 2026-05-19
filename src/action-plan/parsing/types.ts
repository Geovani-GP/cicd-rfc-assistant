export type ManualActionPhase = {
  id: "prerequisites" | "backup" | "preAnalysis" | "installation" | "schedule" | "validation" | "returnPoint" | "evidence";
  title: string;
  content: string;
};
