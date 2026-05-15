export type ManualActionPhase = {
  id: "prerequisites" | "backup" | "installation" | "schedule" | "validation" | "returnPoint" | "evidence";
  title: string;
  content: string;
};
