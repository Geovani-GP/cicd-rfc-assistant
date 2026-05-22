import type { ManualActionPhase } from "./types";

function actionPlanSubheadingFromLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const numbered = trimmed.match(/^\d+(?:\.\d+)*\s+(.+)$/);
  const title = numbered?.[1]?.trim() ?? trimmed;
  const technicalHeading = /^[A-Z0-9][A-Z0-9_-]*(?:_[A-Z0-9_-]+){1,}$/i;
  const knownHeading =
    /^(?:Overview Installation|Environment Information|Pre[- ]Installation Steps|Get a backup integration|Get a backup lookups\.?|Installation Steps|Configuration of Connections|Importation of Lookups\.? Only if it is necessary\.?|Activate integration|Configure and start scheduler|Appendix|Appendix Lookups|Pre-configuration and integration dependencies|Steps for setting up connections|Steps for import a library|Steps for setting up Lookups|Integration.?s backup.*|Verification Checklist|Return Point|Open and Closed Issues)$/i;
  if (numbered && (knownHeading.test(title) || technicalHeading.test(title))) return title.replace(/\.$/, "");
  if (!numbered && knownHeading.test(title)) return title.replace(/\.$/, "");
  return "";
}

function formatActionPlanDetailLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const numbered = line.match(/^\d+\s*[.)-]\s+(.+)$/);
      const bullet = line.match(/^[-•]\s+(.+)$/);
      return `   - ${(numbered?.[1] ?? bullet?.[1] ?? line).trim()}`;
    })
    .join("\n");
}

export function formatManualPhaseForActionPlan(phase: ManualActionPhase) {
  const lines = phase.content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const blocks: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } = { title: "", lines: [] };

  for (const line of lines) {
    const heading = actionPlanSubheadingFromLine(line);
    if (heading) {
      if (current.title || current.lines.length) blocks.push(current);
      current = { title: heading, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.title || current.lines.length) blocks.push(current);

  const titledBlocks = blocks.filter((block) => block.title);
  if (!titledBlocks.length) return phase.content.trim();

  let counter = 0;
  return blocks
    .map((block) => {
      if (!block.title) return block.lines.join("\n");
      counter += 1;
      const detail = formatActionPlanDetailLines(block.lines);
      return detail ? `${counter}. ${block.title}\n${detail}` : `${counter}. ${block.title}`;
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
