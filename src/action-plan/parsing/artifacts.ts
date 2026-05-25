import { repairSpacedPdfText } from "./common";

function normalizeEnvironmentName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function quotedValues(value: string) {
  return Array.from(value.matchAll(/["“]([^"”]+)["”]/g))
    .map((match) => match[1].trim())
    .filter((item) => item && !/^https?:\/\//i.test(item));
}

function repairSplitArtifactFileNames(text: string) {
  return text
    .replace(/\b(ICWC-CX-\d+_)\s+(\d{4}_\d{2}\.\d{2}\.\d{4}\.iar)\b/gi, "$1$2")
    .replace(/\b([A-Z][A-Z0-9-]+_)\s+(\d{4}_\d{2}\.\d{2}\.\d{4}\.iar)\b/gi, "$1$2")
    .replace(/\b(OUT_PLM_ITEM_TO_LO)\s+(OKU_[A-Z0-9]+)\b/gi, "$1$2")
    .replace(/\b([A-Z0-9][A-Z0-9_.-]+_\d{2}\.\d{2}\.)\s+(\d{4}\.iar)\b/gi, "$1$2")
    .replace(/\b([A-Z0-9][A-Z0-9_.-]+_\d{2}\.\d{2}\.\d)\s+(\d{3}\.iar)\b/gi, "$1$2")
    .replace(/\b([A-Z0-9][A-Z0-9_.-]+_\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.iar)\b/gi, "$1$2")
    .replace(/\b([A-Z0-9][A-Z0-9_.-]+_\d{2}\.\d{2}\.\d{3})\s+(\d\.iar)\b/gi, "$1$2");
}

export function cleanArtifactCandidate(value: string) {
  return value
    .replace(/^["“”]+|["“”.,;:]+$/g, "")
    .replace(/\s+(integration|artifact|component|lookup|package|project)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyArtifactName(value: string) {
  const clean = cleanArtifactCandidate(value);
  if (!clean || /^https?:\/\//i.test(clean)) return false;
  if (/\.(?:iar|par|xml|wsdl|csv|zip|jar|sql)\b/i.test(clean)) return true;
  if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}$/i.test(clean)) return true;
  if (clean.length < 10) return false;
  if (/^(stop schedule|start schedule|confirm|release|test|prod|development|regression|pre-prod|home|schedule)$/i.test(clean)) {
    return false;
  }
  const words = clean.split(/\s+/);
  const hasTechnicalWord = words.some((word) => /^[A-Z0-9]{2,}$/.test(word) || /[A-Z][a-z]+[A-Z]/.test(word));
  return words.length >= 3 && hasTechnicalWord;
}

export function extractArtifactNames(text: string, options: { includeComponentNames?: boolean } = {}) {
  const repairedText = repairSplitArtifactFileNames(repairSpacedPdfText(text));
  const normalMatches = extractArtifactFileNames(repairedText);
  const compactText = repairedText.replace(/\s+/g, "");
  const compactMatches = extractArtifactFileNames(compactText);
  const fileArtifacts = [...normalMatches, ...compactMatches]
    .map((item) => cleanArtifactCandidate(item).replace(/\s+/g, ""))
    .map(cleanArtifactFileName)
    .filter(Boolean);
  if (!options.includeComponentNames || fileArtifacts.length) {
    return Array.from(new Map(fileArtifacts.map((artifact) => [artifact.toLowerCase(), artifact])).values());
  }
  const technicalMatches = repairedText.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}\b/g) ?? [];
  const wrappedTechnicalMatches = extractWrappedTechnicalNames(repairedText);
  const quotedMatches = quotedValues(repairedText).filter(isLikelyArtifactName);
  const contextualMatches = Array.from(
    repairedText.matchAll(/\b(?:integration|artifact|component|lookup|package|project)\b[^A-Z0-9\n]{0,24}["“]?([A-Z0-9][A-Z0-9_ .-]{5,90})["”]?/gi)
  )
    .map((match) => match[1])
    .filter(isLikelyArtifactName);
  const artifacts = [...fileArtifacts, ...technicalMatches, ...wrappedTechnicalMatches, ...quotedMatches, ...contextualMatches]
    .map((item) => cleanArtifactCandidate(item).replace(/\s+/g, " "))
    .filter(Boolean);
  const byKey = new Map<string, string>();
  for (const artifact of artifacts) byKey.set(artifact.toLowerCase(), artifact);
  const values = Array.from(byKey.values());
  return values.filter((artifact) => {
    const key = normalizeEnvironmentName(artifact);
    return !values.some((other) => {
      const otherKey = normalizeEnvironmentName(other);
      return otherKey !== key && otherKey.includes(key) && otherKey.length - key.length >= 4;
    });
  });
}

function cleanArtifactFileName(value: string) {
  const fileNames = extractArtifactFileNames(value);
  const match = fileNames.find((item) => !/\d\.\d[A-Z]/.test(item)) ?? fileNames[0];
  return match ?? "";
}

function extractArtifactFileNames(value: string) {
  const matches: string[] = [];
  const pattern = /(?:^|[\s"'“”‘’()[\]{}:;,\n])([A-Z0-9][A-Z0-9_.-]+?\.(?:iar|par|xml|wsdl|csv|zip|jar|sql))(?=$|[^A-Z0-9_.-]|[A-Z]{2,}_)/gi;
  for (const match of value.matchAll(pattern)) {
    const candidate = match[1];
    if (!/^[A-Z0-9]/.test(candidate)) continue;
    const extensionMatch = candidate.match(/\.([^.]+)$/);
    const baseName = extensionMatch ? candidate.slice(0, -extensionMatch[0].length) : candidate;
    const extension = extensionMatch?.[1]?.toLowerCase() ?? "";
    if (baseName.length > 140) continue;
    if (/\d\.\d[A-Z]/.test(baseName)) continue;
    if (extension !== "wsdl" && extension !== "zip" && /[a-z]/.test(baseName)) continue;
    if (extension !== "wsdl" && extension !== "csv" && !/[_.-]/.test(baseName)) continue;
    if (extension === "csv" && !/[_.-]/.test(baseName) && !/^[A-Z0-9]{5,}$/.test(baseName)) continue;
    matches.push(candidate);
  }
  return matches;
}

function extractArtifactFileNamesFromLine(value: string) {
  const exact = extractArtifactFileNames(value);
  if (exact.length) return exact;
  const trimmed = value.trim();
  const wholeToken = trimmed.match(/^([A-Z0-9][A-Z0-9_.-]+\.(?:iar|par|xml|wsdl|csv|zip|jar|sql))$/);
  if (!wholeToken) return [];
  return [wholeToken[1]];
}

export function artifactLinesFromText(value: string) {
  return Array.from(
    new Map(
      value
        .split(/\r?\n/)
        .flatMap((line) => {
          const fileNames = extractArtifactFileNamesFromLine(line);
          if (fileNames.length) return fileNames.map(cleanArtifactFileName).filter(Boolean);
          const trimmed = cleanArtifactCandidate(line);
          return isLikelyArtifactName(trimmed) ? [trimmed] : [];
        })
        .map((item) => [normalizeEnvironmentName(item), item])
    ).values()
  );
}

export function installableArtifactNames(text: string) {
  const repairedText = repairSplitArtifactFileNames(repairSpacedPdfText(text));
  const compactText = repairedText.replace(/\s+/g, "");
  const artifacts = [...extractArtifactFileNames(repairedText), ...extractArtifactFileNames(compactText)]
    .map((item) => cleanArtifactCandidate(item).replace(/\s+/g, ""))
    .map(cleanArtifactFileName)
    .filter(Boolean);
  return Array.from(new Map(artifacts.map((item) => [normalizeEnvironmentName(item), item])).values());
}

export function preferCanonicalOicIarArtifacts(items: string[]) {
  const hasCanonicalIar = items.some((item) => /^C2C_[A-Z0-9_]+_\d{2}\.\d{2}\.\d{4}\.iar$/i.test(item));
  return items.filter((item) => {
    if (hasCanonicalIar && /^ICWC-CX-\d+_[A-Z0-9_]+_\d{2}\.\d{2}\.\d{4}\.iar$/i.test(item)) return false;
    if (/^\d{4}_\d{2}\.\d{2}\.\d{4}\.iar$/i.test(item)) {
      return !items.some((other) => other !== item && other.toLowerCase().endsWith(`_${item.toLowerCase()}`));
    }
    return true;
  });
}

function extractWrappedTechnicalNames(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\b\d+(?:\.\d+)+\b.*$/, "").trim())
    .filter(Boolean);
  const names = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[A-Z][A-Z0-9]+_[A-Z0-9_]{4,}$/.test(lines[index])) continue;
    let joined = "";
    for (let window = 0; window < 3 && index + window < lines.length; window += 1) {
      const line = lines[index + window];
      if (!/^[A-Z0-9_]{3,}$/.test(line)) break;
      joined += line;
      if (joined.length > 90) break;
      if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){3,}$/.test(joined) && joined.length >= 18) {
        names.add(joined);
      }
    }
  }
  return Array.from(names);
}
