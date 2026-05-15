export function cleanIm090Text(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (!line) return false;
      if (/^File Ref:/i.test(line)) return false;
      if (/^Doc Ref:/i.test(line)) return false;
      if (/^IM\.090 Installation Instructions$/i.test(line)) return false;
      if (/^Installation Instructions for Grupo Bimbo \d+ of \d+$/i.test(line)) return false;
      if (/^Document Control\s+/i.test(line)) return false;
      if (/^Confidential - Oracle Restricted/i.test(line)) return false;
      if (/^Confidential\s+[–-]\s+Oracle\s+(?:Internal|Restricted)/i.test(line)) return false;
      if (/^\d+\s+of\s+\d+$/i.test(line)) return false;
      if (/^Open and Closed Issues\. \d+ of \d+$/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d+[\w.-]*\.(?:docx|pdf)$/i.test(line)) return false;
      if (/^\d+(?:\.\d+)*\s+(?:Environment Information|Installation artifacts|Pre installation steps|Installation Steps|Schedule activation|Verification Checklist|Return Point|Open and Closed Issues|Open Issues|Closed Issues)\s+\d+$/i.test(line)) return false;
      if (/^[A-Za-z]+ \d{1,2}, \d{4}$/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function operationalIm090Text(text: string) {
  const cleaned = cleanIm090Text(text);
  const marker = cleaned.match(/2\s+Installation Instructions\b[\s\S]*?\n2\.1\s+Environment Information/i);
  if (marker?.index !== undefined) return cleaned.slice(marker.index).trim();
  const looseMarker =
    looseIndexOf(cleaned, "2 Installation Instructions for Grupo Bimbo 2.1 Environment Information") ??
    looseIndexOf(cleaned, "2 Installation Instructions 2.1 Environment Information") ??
    looseIndexOf(cleaned, "Environment Information Environment Name");
  return looseMarker !== null ? cleaned.slice(looseMarker).trim() : cleaned;
}

export function actionPlanLinesFromIm090(text: string) {
  const cleaned = cleanIm090Text(text);
  const lines = cleaned.split("\n").filter(Boolean);
  const start = lines.findIndex((line) => /^2\s+Installation Instructions\b/i.test(line) && !line.includes("..."));
  return start >= 0 ? lines.slice(start) : lines;
}

function isTableOfContentsLine(line: string) {
  if (!line) return false;
  if (line.includes("...") || line.includes("___")) return true;
  const heading =
    "(?:Overview Installation|Pre-?Installation Steps|OUT_[A-Z0-9_]+|Get a backup integration|Get a backup lookups\\.?|Installation Steps|Configuration of Connections|Importation of Lookups\\.? Only if it is necessary\\.?|Activate integration|Configure and start scheduler|Appendix Lookups|Open and Closed Issues|Open Issues|Closed Issues)";
  return new RegExp(`^\\d+(?:\\.\\d+)*\\s+${heading}\\s+\\d+$`, "i").test(line.trim());
}

function findHeadingLine(lines: string[], pattern: RegExp, from = 0) {
  return lines.findIndex((line, index) => index >= from && pattern.test(line) && !isTableOfContentsLine(line));
}

function findNextMajorHeading(lines: string[], from: number) {
  const index = lines.findIndex((line, lineIndex) => lineIndex > from && isMajorIm090Heading(line));
  return index >= 0 ? index : lines.length;
}

function isMajorIm090Heading(line: string) {
  if (!line || isTableOfContentsLine(line)) return false;
  if (/^\d+(?:\.\d+)*\s+(?:IN|OUT|LAC|LACL|LACLS|ICWC|ICWE|GB)[A-Z0-9_-]*(?:_[A-Z0-9_-]+)+\b/i.test(line)) return true;
  const heading = "(?:Overview Installation|Environment Information|Installation artifacts|Pre installation steps|Pre-Installation Steps|Get a backup integration|Get a backup lookups\\.?|Installation Steps|Configure and start scheduler|Appendix Lookups|Schedule activation|Verification Checklist|Return Point|Open and Closed Issues|Open Issues|Closed Issues)";
  return new RegExp(`^\\d+(?:\\.\\d+)*\\s+${heading}\\.?$`, "i").test(line) ||
    new RegExp(`^${heading}\\.?$`, "i").test(line);
}

export function normalizeManualSection(lines: string[], options: { dedupe?: boolean } = {}) {
  const cleaned = lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !line.includes("................................................................"));
  const normalized = options.dedupe === false
    ? cleaned
    : cleaned.filter((line, index, list) => list.indexOf(line) === index);
  return normalized
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sectionByAnyHeading(lines: string[], patterns: RegExp[], from = 0, options: { dedupe?: boolean } = {}) {
  const starts = patterns
    .map((pattern) => findHeadingLine(lines, pattern, from))
    .filter((index) => index >= 0);
  if (!starts.length) return "";
  const start = Math.min(...starts);
  return normalizeManualSection(lines.slice(start, findNextMajorHeading(lines, start)), options);
}

function looseIndexOf(text: string, phrase: string, from = 0) {
  const normalized: string[] = [];
  const map: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) continue;
    normalized.push(char.toLowerCase());
    map.push(index);
  }
  const normalizedFrom = Math.max(0, map.findIndex((index) => index >= from));
  const needle = phrase.replace(/\s+/g, "").toLowerCase();
  const found = normalized.join("").indexOf(needle, normalizedFrom < 0 ? 0 : normalizedFrom);
  return found >= 0 ? map[found] : null;
}

export function looseSectionByHeadings(text: string, starts: string[], ends: string[], options: { dedupe?: boolean } = {}) {
  const startIndexes = starts
    .map((heading) => looseIndexOf(text, heading))
    .filter((index): index is number => index !== null);
  if (!startIndexes.length) return "";
  const start = Math.min(...startIndexes);
  const endIndexes = ends
    .map((heading) => looseIndexOf(text, heading, start + 1))
    .filter((index): index is number => index !== null && index > start);
  const end = endIndexes.length ? Math.min(...endIndexes) : text.length;
  return normalizeManualSection(text.slice(start, end).split("\n"), options);
}

export function asBullets(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- Confirm artifacts listed in the IM090.";
}

export function environmentAliases(environment: string) {
  const value = normalizeEnvironmentName(environment);
  if (!value) return [];
  if (value === "DEV" || value === "DEVELOPMENT") return ["DEV", "DEVELOPMENT"];
  if (value === "TEST") return ["TEST", "PREPROD", "TE", "REGRESSION"];
  if (value === "REGRESSION") return ["REGRESSION", "TEST", "PREPROD", "TE"];
  if (value === "PREPROD" || value === "TE") return ["PREPROD", "TE"];
  if (value === "PROD" || value === "PRODUCTION" || value === "PR") return ["PROD", "PRODUCTION", "PR"];
  return [value];
}

export function normalizeEnvironmentName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function environmentNameFromLine(line: string) {
  const match = line.match(/^Environment Name:\s*(.+?)(?:\s+IC Service Environment:|\s+OIC Admin Console:|\s+ERP Host:|$)/i);
  return match?.[1]?.trim() ?? "";
}

function environmentBlocks(section: string) {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const heading = lines[0] && /^2\.\d+\s+Environment Information/i.test(lines[0]) ? lines[0] : "2.1 Environment Information";
  const body = lines[0] === heading ? lines.slice(1) : lines;
  const environmentIndexes = body
    .map((line, index) => (/^Environment Name:/i.test(line) ? index : -1))
    .filter((index) => index >= 0);
  const blocks = environmentIndexes.map((start, index) => {
    const end = index + 1 < environmentIndexes.length ? environmentIndexes[index + 1] : body.length;
    return body.slice(start, end);
  });
  return { heading, blocks };
}

export function availableEnvironmentsFromDocument(text: string) {
  const section = environmentSectionFromDocument(text);
  const { blocks } = environmentBlocks(section);
  const names = blocks.length
    ? blocks
      .map((block) => environmentNameFromLine(block[0] ?? ""))
      .map((name) => name.trim())
      .filter(Boolean)
    : overviewEnvironmentNames(section);
  return Array.from(new Map(names.map((name) => [normalizeEnvironmentName(name), name])).values());
}

export function availableEnvironmentMessage(environment: string, available: string[]) {
  const suffix = available.length ? ` Ambientes disponibles: ${available.join(", ")}.` : "";
  return `El ambiente ${environment} no se encontro en el IM090.${suffix}`;
}

function findEnvironmentBlock(section: string, environment: string) {
  const aliases = environmentAliases(environment);
  const { heading, blocks } = environmentBlocks(section);
  if (!section || !aliases.length || !blocks.length) return { heading, block: null, hasBlocks: blocks.length > 0 };
  const ranked = blocks
    .map((block) => ({
      block,
      rank: aliases.indexOf(normalizeEnvironmentName(environmentNameFromLine(block[0] ?? "")))
    }))
    .filter((item) => item.rank >= 0)
    .sort((left, right) => left.rank - right.rank);
  const selected = ranked[0]?.block;
  return { heading, block: selected ?? null, hasBlocks: true };
}

function overviewEnvironmentLabel(line: string) {
  const match = line.match(/^\s*(Dev|Development|Regression|Test|Pre[- ]?Prod|TE|Prod|Production)\s+(?:OIC|WMS|ERP|OTM|OSB|MFT|DB)\b/i);
  if (!match) return "";
  const label = match[1].trim();
  return /^Prod/i.test(label) ? "Production" : label;
}

function overviewEnvironmentNames(section: string) {
  const names = section
    .split("\n")
    .map(overviewEnvironmentLabel)
    .filter(Boolean);
  return Array.from(new Map(names.map((name) => [normalizeEnvironmentName(name), name])).values());
}

function filterOverviewEnvironmentSection(section: string, environment: string) {
  const aliases = environmentAliases(environment);
  if (!section || !aliases.length) return section;
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const selected: string[] = [];
  let includeCurrentEnvironment = false;
  for (const line of lines) {
    const label = overviewEnvironmentLabel(line);
    if (/^(?:\d+(?:\.\d+)*\s+)?Overview Installation\b/i.test(line) || /^Environment\s+Url$/i.test(line)) {
      selected.push(line);
      continue;
    }
    if (/^Note\s*:/i.test(line)) {
      selected.push(line);
      continue;
    }
    if (label) {
      includeCurrentEnvironment = aliases.includes(normalizeEnvironmentName(label));
      if (includeCurrentEnvironment) selected.push(line);
      continue;
    }
    if (includeCurrentEnvironment && /^(?:OIC|WMS|ERP|OTM|OSB|MFT|DB)\s+\S/i.test(line)) {
      selected.push(line);
    }
  }
  return selected.length > 2 ? selected.join("\n") : section;
}

export function filterEnvironmentSection(section: string, environment: string) {
  const result = findEnvironmentBlock(section, environment);
  if (section && !result.hasBlocks && overviewEnvironmentNames(section).length) {
    return filterOverviewEnvironmentSection(section, environment);
  }
  if (!section || !environmentAliases(environment).length || !result.hasBlocks) return section;
  return result.block ? [result.heading, ...result.block].join("\n") : section;
}

function environmentIsMissingInDocument(section: string, environment: string) {
  if (!section || !environmentAliases(environment).length) return false;
  const result = findEnvironmentBlock(section, environment);
  if (!result.hasBlocks) {
    const overviewNames = overviewEnvironmentNames(section).map(normalizeEnvironmentName);
    return overviewNames.length > 0 && !environmentAliases(environment).some((alias) => overviewNames.includes(alias));
  }
  return result.hasBlocks && !result.block;
}

export function environmentSectionFromDocument(text: string) {
  const operational = operationalIm090Text(text);
  const lines = actionPlanLinesFromIm090(text);
  return sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Environment Information\b/i, /^Environment Information\b/i], 0) ||
    sectionByAnyHeading(lines, [/^\d+(?:\.\d+)*\s+Overview Installation\b/i, /^Overview Installation\b/i], 0) ||
    looseSectionByHeadings(operational, ["2.1 Environment Information", "Environment Information"], [
      "Installation artifacts",
      "Pre installation steps",
      "Pre-Installation Steps",
      "Installation Steps"
    ]) ||
    looseSectionByHeadings(operational, ["Overview Installation"], [
      "Pre installation steps",
      "Pre-Installation Steps",
      "Installation Steps"
    ]);
}

export function selectedEnvironmentMissingFromDocument(text: string, environment: string) {
  return environmentIsMissingInDocument(environmentSectionFromDocument(text), environment);
}

function normalizeManualBullets(content: string) {
  return content
    .split("\n")
    .map((line) => {
      if (/^\s*o\s*$/i.test(line)) return "";
      return line.replace(/^([ \t]*)[•]\s+/, "$1- ").replace(/^([ \t]*)o\s+/, "$1- ");
    })
    .join("\n");
}

function envLabelsFromLine(line: string) {
  const match = line.match(/^\s*[-•o]?\s*((?:Dev|Development|Regression|Test|Prod|Production|Pre[- ]?Prod|TE|PR)(?:\s*,\s*(?:Dev|Development|Regression|Test|Prod|Production|Pre[- ]?Prod|TE|PR))*)\s*:/i);
  if (!match) return [];
  return match[1].split(/\s*,\s*/).map(normalizeEnvironmentName).filter(Boolean);
}

function filterEnvironmentSpecificLines(content: string, selectedEnvironment: string) {
  const aliases = environmentAliases(selectedEnvironment);
  if (!aliases.length) return content;
  return content
    .split("\n")
    .filter((line) => {
      const labels = envLabelsFromLine(line);
      return !labels.length || labels.some((label) => aliases.includes(label));
    })
    .join("\n");
}

function lineEnvironmentBlockLabel(line: string) {
  const match = line.match(/^\s*(Dev|Development|Regression|Test|Pre[- ]?Prod|TE|Prod|Production)\b/i);
  return match?.[1] ? normalizeEnvironmentName(match[1]) : "";
}

function filterEnvironmentCredentialBlocks(content: string, selectedEnvironment: string) {
  const aliases = environmentAliases(selectedEnvironment);
  if (!aliases.length) return content;
  const lines = content.split("\n");
  if (!lines.some((line) => lineEnvironmentBlockLabel(line))) return content;
  const output: string[] = [];
  let includeBlock = true;
  let hasFilteredBlock = false;
  for (const line of lines) {
    const label = lineEnvironmentBlockLabel(line);
    if (label) {
      includeBlock = aliases.includes(label);
      hasFilteredBlock = true;
      if (includeBlock) output.push(line);
      continue;
    }
    if (includeBlock || !hasFilteredBlock) output.push(line);
  }
  return output.join("\n");
}

export function prepareManualPhaseContent(content: string, selectedEnvironment: string) {
  const normalized = normalizeManualBullets(content);
  const blockFiltered = filterEnvironmentCredentialBlocks(normalized, selectedEnvironment);
  return normalizeManualSection(filterEnvironmentSpecificLines(blockFiltered, selectedEnvironment).split("\n"));
}

export function hasNumberedInstructionSteps(text: string) {
  return /^\s*\d+\s*[.)-]\s+\S/m.test(text);
}
