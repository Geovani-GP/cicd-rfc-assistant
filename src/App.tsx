import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  ExternalLink,
  ImagePlus,
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  History,
  Info,
  Languages,
  Loader2,
  Menu,
  MessageSquareText,
  Palette,
  PanelRightOpen,
  Play,
  Plus,
  Copy,
  RefreshCw,
  Settings,
  Trash2,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CSSProperties } from "react";
import {
  artifactLinesFromText,
  extractArtifactNames,
  installableArtifactNames,
  preferCanonicalOicIarArtifacts
} from "./action-plan/parsing/artifacts";
import {
  actionPlanLinesFromIm090,
  availableEnvironmentMessage,
  availableEnvironmentsFromDocument,
  environmentSectionFromDocument,
  filterEnvironmentSection,
  hasNumberedInstructionSteps,
  looseSectionByHeadings,
  normalizeEnvironmentName,
  operationalIm090Text,
  repairSpacedPdfText,
  sectionByAnyHeading,
  selectedEnvironmentMissingFromDocument
} from "./action-plan/parsing/common";
import { formatManualPhaseForActionPlan } from "./action-plan/parsing/format";
import { databaseProfileCandidates } from "./action-plan/parsing/database";
import {
  buildManualPhasesForProduct,
  configurationItemsForProduct,
  isDatabaseManualPlan,
  isJavaManualPlan,
  isOdiManualPlan,
  isMftManualPlan,
  isOsbManualPlan,
  manualPlanMetadataForProduct
} from "./action-plan/parsing/products";
import type { ManualActionPhase } from "./action-plan/parsing/types";
import {
  embeddedRuntimeKnowledge
} from "./knowledge";
import type { RuntimeKnowledgeCatalog } from "./knowledge";
import type {
  ActionSourceDocument,
  ArtifactInspection,
  DraftSummary,
  EvidenceImage,
  FinalizeResult,
  Prerequisite,
  RepositoryInfo,
  SelectedFile
} from "./vite-env";

const projectUrl =
  "https://gbdevcsr13r1-aucgbss02.developer.ocp.oraclecloud.com/gbdevcsr13r1-aucgbss02/#projects/css-bimbo-cicd-project";

const defaultBasePath = "";
const desktopApi = window.cicd;
const releaseBranch = "release";
const pipelinePhases: PipelinePhase[] = ["DEV", "REG", "TEST", "PROD"];
const actionPlanEnvironments = ["DEV", "REG", "TEST", "PROD"];
const defaultCustomTheme = {
  colorA: "#d9c4ff",
  colorB: "#8fe8ff",
  colorC: "#ff8fe7",
  panel: "#34256f",
  sidebar: "#34256f",
  accent: "#4aa3ff",
  transparency: 0.94,
  blur: 18,
  gradient: "linear-gradient(135deg, #d9c4ff 0%, #8fe8ff 52%, #ff8fe7 100%)"
};
const defaultSidebarColor = "#312d2a";
const defaultProfile = {
  name: "Usuario General",
  email: "",
  phone: "",
  avatarStyle: "personas",
  avatarSeed: "general-dev"
};
const avatarStyles = [
  { id: "personas", label: "Personas" },
  { id: "avataaars", label: "Avataaars" },
  { id: "adventurer-neutral", label: "Adventurer" },
  { id: "bottts", label: "Bottts" },
  { id: "lorelei", label: "Lorelei" },
  { id: "micah", label: "Micah" },
  { id: "notionists", label: "Notionists" },
  { id: "thumbs", label: "Thumbs" }
];
const avatarOptions = ["general-dev", "cloud-dev", "release-lead", "pipeline-runner", "code-review", "night-build", "git-flow", "oic-owner"];
const historyPageSize = 10;
const executionDraftStorageKey = "rfcExecutionDraft";
const pendingWorkStorageKey = "pendingWorkSnapshots";
const actionMethodStorageKey = "actionPlanMethod";
const executionModeStorageKey = "rfcExecutionMode";
const customTemplatesStorageKey = "customActionTemplates";
const cloudflareKnowledgeUpdateUrl = "https://cicd-rfc-converters-updates.geovani-cicd-rfc.workers.dev/converters/latest";
const maxActionDocumentTextLength = 120000;

type KnowledgeRulesCatalog = NonNullable<RuntimeKnowledgeCatalog["rules"]>;
type KnowledgeRuleProduct = KnowledgeRulesCatalog["products"][number];

function runtimeProductMatchesRule(productName: string, rule: KnowledgeRuleProduct) {
  const normalizedProduct = productName.trim().toLowerCase();
  return normalizedProduct === rule.productName.toLowerCase() ||
    normalizedProduct === rule.id.toLowerCase() ||
    (normalizedProduct === "base de datos" && rule.id === "database");
}

function externalRegexWithGlobal(pattern: string, flags = "i") {
  const cleanFlags = Array.from(new Set(`${flags}g`.replace(/[^dgimsuvy]/g, "").split(""))).join("");
  return new RegExp(pattern, cleanFlags);
}

function firstExternalCapturedValue(match: RegExpMatchArray) {
  return match.slice(1).find((value) => value?.trim())?.trim() ?? match[0]?.trim() ?? "";
}

function normalizeExternalRuleValues(values: string[], normalize: string[] = []) {
  const requireUnderscore = normalize.includes("require-underscore");
  const splitPipeComma = normalize.includes("split-pipe-comma");
  const splitSlashPipeComma = normalize.includes("split-slash-pipe-comma");
  const uppercaseKey = normalize.includes("uppercase-key");
  const candidates = splitSlashPipeComma
    ? values.flatMap((value) => value.split(/\s*\/\s*|\s*\|\s*|,\s*/))
    : splitPipeComma
      ? values.flatMap((value) => value.split(/\s*\|\s*|,\s*/))
      : values;
  const byKey = new Map<string, string>();
  for (const candidate of candidates) {
    const value = candidate.replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
    if (!value || (requireUnderscore && !value.includes("_"))) continue;
    const key = uppercaseKey ? value.toUpperCase() : value.toLowerCase();
    byKey.set(key, value);
  }
  return Array.from(byKey.values()).slice(0, 20);
}

function titledPermission(value: string) {
  const upper = value.toUpperCase();
  if (upper === "READ") return "Read";
  if (upper === "WRITE") return "Write";
  if (upper === "LIST") return "List";
  if (upper === "DELETE") return "Delete";
  return value;
}

function labelExternalConfigurationItems(productName: string, extracted: Array<{ target: string; values: string[] }>) {
  const items: string[] = [];
  const normalizedProduct = productName.trim().toLowerCase();
  for (const item of extracted) {
    if (item.target === "configurationItems.connections") {
      for (const value of item.values) items.push(`Connection: ${value}`);
    } else if (item.target === "configurationItems.lookups") {
      for (const value of item.values) items.push(`Lookup: ${value}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.folders") {
      for (const value of item.values) items.push(`Folder: ${value}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.users") {
      for (const value of item.values) items.push(`User: ${value}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.permissions") {
      if (item.values.length) items.push(`Permissions: ${item.values.map(titledPermission).join("/")}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.transferRules") {
      for (const value of item.values) items.push(`Transfer Rule: ${value}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.destinations") {
      for (const value of item.values) items.push(`Target: ${value}`);
    } else if (normalizedProduct === "mft" && item.target === "configurationItems.processingActions") {
      for (const value of item.values) items.push(`Processing Action: ${value}`);
    }
  }
  return Array.from(new Map(items.map((item) => [item.toLowerCase(), item])).values());
}

function externalConfigurationItemsForProduct(productName: string, text: string, rulesCatalog?: KnowledgeRulesCatalog) {
  if (!rulesCatalog || !["OIC", "MFT"].includes(productName)) return null;
  const selectedRule = rulesCatalog.products.find((rule) => runtimeProductMatchesRule(productName, rule));
  if (!selectedRule) return null;
  const extracted = selectedRule.extractorRules.map((extractor) => {
    const values: string[] = [];
    for (const pattern of extractor.patterns) {
      try {
        const regex = externalRegexWithGlobal(pattern.pattern, pattern.flags || "i");
        for (const match of text.matchAll(regex)) values.push(firstExternalCapturedValue(match));
      } catch {
        // Invalid external patterns are ignored here so the embedded parser can remain the fallback.
      }
    }
    return {
      target: extractor.target,
      values: normalizeExternalRuleValues(values, extractor.normalize)
    };
  }).filter((item) => item.values.length);
  return labelExternalConfigurationItems(productName, extracted);
}

function externalPhaseModelForProduct(productName: string, rulesCatalog?: KnowledgeRulesCatalog) {
  if (!rulesCatalog || !["OIC", "MFT"].includes(productName)) return null;
  const selectedRule = rulesCatalog.products.find((rule) => runtimeProductMatchesRule(productName, rule));
  return selectedRule?.phaseRules ?? null;
}

function externalSafetyRulesForProduct(productName: string, rulesCatalog?: KnowledgeRulesCatalog) {
  if (!rulesCatalog) return null;
  const selectedRule = rulesCatalog.products.find((rule) => runtimeProductMatchesRule(productName, rule));
  return selectedRule?.safety ?? null;
}

function applyExternalPhaseModel(phases: ManualActionPhase[], phaseRules: KnowledgeRuleProduct["phaseRules"] | null) {
  if (!phaseRules?.length) return phases;
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const modeled: ManualActionPhase[] = [];
  const usedIds = new Set<string>();
  for (const rule of phaseRules) {
    const phase = phaseById.get(rule.id as ManualActionPhase["id"]);
    if (!phase) continue;
    modeled.push({
      ...phase,
      defaultIncluded: phase.defaultIncluded ?? rule.defaultIncluded
    });
    usedIds.add(phase.id);
  }
  const remaining = phases.filter((phase) => !usedIds.has(phase.id));
  return modeled.length ? [...modeled, ...remaining] : phases;
}

function escapeRegexLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function avatarUrl(seed: string, style = defaultProfile.avatarStyle) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

function readUiTextSize(): UiTextSize {
  const value = localStorage.getItem("uiTextSize");
  return value === "small" || value === "large" ? value : "medium";
}

function readUiBackgroundStyle(): UiBackgroundStyle {
  const value = localStorage.getItem("uiBackgroundStyle");
  return value === "mesh" || value === "aurora" || value === "grid" || value === "image" ? value : "default";
}

function readUiAnimationSpeed(): UiAnimationSpeed {
  const value = localStorage.getItem("uiAnimationSpeed");
  return value === "slow" || value === "fast" ? value : "medium";
}

function readUiAnimationMotion(): UiAnimationMotion {
  const value = localStorage.getItem("uiAnimationMotion");
  return value === "horizontal" || value === "vertical" || value === "zoom" ? value : "drift";
}

function readActionMethod(): ActionMethod {
  return localStorage.getItem(actionMethodStorageKey) === "manual" ? "manual" : "cicd";
}

function readExecutionMode(): ExecutionMode {
  return localStorage.getItem(executionModeStorageKey) === "cicd" ? "cicd" : "general";
}

function hexToRgbString(value: string) {
  const clean = value.replace("#", "").trim();
  const normalized = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "13, 19, 29";
  const number = Number.parseInt(normalized, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function readExecutionDraft(): ExecutionDraft | null {
  try {
    return JSON.parse(localStorage.getItem(executionDraftStorageKey) || "null");
  } catch {
    return null;
  }
}

function readPendingWorkSnapshots(): PendingWorkSnapshot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingWorkStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readCustomActionTemplates(): CustomActionTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(customTemplatesStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CustomActionTemplate =>
      typeof item?.id === "string" &&
      item.id.startsWith("custom:") &&
      typeof item.name === "string" &&
      typeof item.product === "string" &&
      typeof item.content === "string"
    );
  } catch {
    return [];
  }
}

type StepId = "actionPlan" | "package" | "review" | "pipeline";
type PipelinePhase = "DEV" | "REG" | "TEST" | "PROD";
type ExecutionMode = "general" | "cicd";
type ActionMethod = "cicd" | "manual";
type ActionTemplateId =
  | "auto"
  | "db-reset-password"
  | "db-unlock-user"
  | "db-update-row"
  | "db-truncate-table"
  | "db-script-restore-point"
  | "oic-reset-password"
  | "oic-tracing-enable"
  | "oic-tracing-disable"
  | "oic-cert-renewal"
  | "oic-install-agent"
  | "odi-add-user"
  | "odi-encrypt-password"
  | "osb-deployment"
  | "osb-patching"
  | "mft-users-dir"
  | "wls-add-user"
  | "wls-reset-password"
  | "wls-rolling-bounce"
  | `custom:${string}`;
type CustomActionTemplate = {
  id: ActionTemplateId;
  name: string;
  product: string;
  category: string;
  content: string;
  active: boolean;
  createdAt: string;
};
type Lang = "es" | "en" | "pt";
type EvidenceItem = EvidenceImage & {
  id: string;
  sessionId?: string;
  step: StepId;
  rfc?: string;
  pipelineStep?: number;
  pipelinePhase?: PipelinePhase;
  createdAt: string;
  note: string;
  source: "capture" | "region" | "file" | "clipboard";
};
type EvidenceLog = {
  id: string;
  sessionId?: string;
  at: string;
  step: StepId;
  rfc?: string;
  text: string;
};
type ExecutionDraft = {
  sessionId?: string;
  rfc?: string;
  devTargetEnvironment?: string;
  regTargetEnvironment?: string;
  testTargetEnvironment?: string;
  prodTargetEnvironment?: string;
  testPipelineName?: string;
  prodPipelineName?: string;
  testPipelineRun?: string;
  prodPipelineRun?: string;
  testPipelineRunUrl?: string;
  prodPipelineRunUrl?: string;
  executionMode?: ExecutionMode;
  pipelineExecutionPhase?: PipelinePhase;
  pipelineActionPlan?: string;
  actionPlanConfirmed?: boolean;
  actionPlanConfirmedAt?: string;
  executionSteps?: PipelineExecutionStep[];
  executionStepsConfirmed?: boolean;
  pipelineStepIndex?: number;
  pipelineStepComments?: Record<string, string>;
  pipelineStepFailures?: Record<string, boolean>;
  evidenceItems?: EvidenceItem[];
  evidenceLog?: EvidenceLog[];
};
type ExecutionHistoryItem = {
  id: string;
  rfc: string;
  phase: string;
  kind: "docx" | "pdf";
  path: string;
  exportedAt: string;
};
type PendingWorkSnapshot = {
  id: string;
  rfc: string;
  repository: string;
  environment: string;
  artifacts: string;
  product: string;
  method: string;
  stepName: string;
  currentStep: StepId;
  actionPlanReady: boolean;
  executionStepsReady: boolean;
  evidenceCount: number;
  pendingLabels: string[];
  updatedAt: string;
  draft?: {
    repoPath: string;
    outputFolder: string;
    rfc: string;
    actionProduct: string;
    actionMethod: ActionMethod;
    actionTemplateId?: ActionTemplateId;
    actionEnvironment: string;
    actionInstance: string;
    actionActivity: string;
    actionScopeNotes?: string;
    artifactText: string;
    actionPlan: string;
    actionPlanConfirmed: boolean;
    actionPlanConfirmedAt: string;
    manualInstructions: string;
    manualSourceText?: string;
    manualPhases: ManualActionPhase[];
    manualPhaseDisabledKeys?: string[];
    riceFolderPath: string;
    mode: "ADHOC" | "FULL";
    files: SelectedFile[];
    devTargetEnvironment: string;
    regTargetEnvironment: string;
    testTargetEnvironment: string;
    prodTargetEnvironment: string;
    testPipelineName: string;
    prodPipelineName: string;
    testPipelineRun: string;
    prodPipelineRun: string;
    testPipelineRunUrl: string;
    prodPipelineRunUrl: string;
    executionMode: ExecutionMode;
    pipelineExecutionPhase: PipelinePhase;
    pipelineActionPlan: string;
    executionSteps: PipelineExecutionStep[];
    executionStepsConfirmed: boolean;
    pipelineStepIndex: number;
    pipelineStepComments: Record<string, string>;
    pipelineStepFailures: Record<string, boolean>;
  };
};
type PipelineExecutionStep = {
  title: string;
  detail: string;
};

const StepCommentEditor = memo(function StepCommentEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="guided-comment">
      <label className="step-comment-label">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
      />
    </div>
  );
});

const cicdExecutionSteps: PipelineExecutionStep[] = [
  {
    title: "Abrir Visual Builder Studio",
    detail: "Acceder al proyecto CI/CD en Visual Builder Studio."
  },
  {
    title: "Crear Merge Request",
    detail: "Ir a Merge Requests, seleccionar el repositorio, target release y review branch con el RFC."
  },
  {
    title: "Solicitar aprobadores",
    detail: "Seleccionar revisores/aprobadores y dejar el merge request listo para revision."
  },
  {
    title: "Aprobar y completar merge",
    detail: "Dar seguimiento a la aprobacion y completar el merge hacia release."
  },
  {
    title: "Ejecutar pipeline",
    detail: "Ir a Builds > Pipelines, buscar el pipeline correspondiente y ejecutar el run."
  },
  {
    title: "Registrar run",
    detail: "Capturar el numero de run generado por Visual Builder Studio y validar la URL del run."
  },
  {
    title: "Dar seguimiento a aprobaciones",
    detail: "Monitorear aprobaciones del pipeline y validar que la ejecucion termine correctamente."
  },
  {
    title: "Validacion post-deployment",
    detail: "Validar los artefactos/componentes instalados en el ambiente destino."
  },
  {
    title: "Compartir evidencia",
    detail: "Descargar evidencia DOCX/PDF y adjuntarla al RFC."
  }
];

function manualPhaseKey(phase: ManualActionPhase | undefined, index: number) {
  return `${phase?.id || phase?.title || "phase"}-${index}`;
}

function manualPhaseDisabledKeysForDefaults(phases: ManualActionPhase[]) {
  return phases
    .map((phase, index) => (phase.defaultIncluded === false ? manualPhaseKey(phase, index) : ""))
    .filter(Boolean);
}

function oicManualScopeIgnoresLookups(text: string) {
  return /\b(?:ignore|exclude|do not (?:import|configure|modify|include)|no incluir|ignorar)\b[\s\S]{0,120}\blookups?\b|\blookups?\b[\s\S]{0,120}\b(?:separated RFC|separate RFC|another RFC|ignore|exclude)\b/i.test(text);
}

function stableTextHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return hash.toString(36);
}

type InstantTooltip = {
  text: string;
  x: number;
  y: number;
};
type SettingsTab = "language" | "environment" | "history" | "pending" | "themes" | "user" | "about";
type UiTextSize = "small" | "medium" | "large";
type UiBackgroundStyle = "default" | "mesh" | "aurora" | "grid" | "image";
type UiAnimationSpeed = "slow" | "medium" | "fast";
type UiAnimationMotion = "drift" | "horizontal" | "vertical" | "zoom";
type ThemeTone = "light" | "dark";
type ThemeId =
  | "oracle"
  | "pastel"
  | "frosted"
  | "glass"
  | "midnight"
  | "dracula"
  | "cobalt"
  | "nord"
  | "solarized"
  | "sunset"
  | "sage"
  | "rose"
  | "graphite"
  | "ocean"
  | "nordDark"
  | "solarizedDark"
  | "halloween"
  | "cyberpunk"
  | "nightowl"
  | "custom";

const languageNames: Record<Lang, string> = {
  es: "Espanol",
  en: "English",
  pt: "Portugues"
};

const uiTextSizeNames: Record<Lang, Record<UiTextSize, string>> = {
  es: {
    small: "Chico",
    medium: "Mediano",
    large: "Grande"
  },
  en: {
    small: "Small",
    medium: "Medium",
    large: "Large"
  },
  pt: {
    small: "Pequeno",
    medium: "Medio",
    large: "Grande"
  }
};

const uiBackgroundStyleNames: Record<Lang, Record<UiBackgroundStyle, string>> = {
  es: {
    default: "Normal",
    mesh: "Malla suave",
    aurora: "Aurora",
    grid: "Grid",
    image: "Imagen"
  },
  en: {
    default: "Default",
    mesh: "Soft mesh",
    aurora: "Aurora",
    grid: "Grid",
    image: "Image"
  },
  pt: {
    default: "Normal",
    mesh: "Malha suave",
    aurora: "Aurora",
    grid: "Grid",
    image: "Imagem"
  }
};

const uiAnimationSpeedNames: Record<Lang, Record<UiAnimationSpeed, string>> = {
  es: {
    slow: "Lenta",
    medium: "Media",
    fast: "Rapida"
  },
  en: {
    slow: "Slow",
    medium: "Medium",
    fast: "Fast"
  },
  pt: {
    slow: "Lenta",
    medium: "Media",
    fast: "Rapida"
  }
};

const uiAnimationMotionNames: Record<Lang, Record<UiAnimationMotion, string>> = {
  es: {
    drift: "Suave",
    horizontal: "Horizontal",
    vertical: "Vertical",
    zoom: "Ampliar"
  },
  en: {
    drift: "Smooth",
    horizontal: "Horizontal",
    vertical: "Vertical",
    zoom: "Zoom"
  },
  pt: {
    drift: "Suave",
    horizontal: "Horizontal",
    vertical: "Vertical",
    zoom: "Ampliar"
  }
};

const themeToneNames: Record<Lang, Record<ThemeTone, string>> = {
  es: {
    light: "Claro",
    dark: "Oscuro"
  },
  en: {
    light: "Light",
    dark: "Dark"
  },
  pt: {
    light: "Claro",
    dark: "Escuro"
  }
};

const themeTone: Record<ThemeId, ThemeTone> = {
  oracle: "light",
  pastel: "light",
  frosted: "dark",
  glass: "light",
  midnight: "dark",
  dracula: "dark",
  cobalt: "dark",
  nord: "dark",
  solarized: "light",
  sunset: "light",
  sage: "light",
  rose: "light",
  graphite: "dark",
  ocean: "dark",
  nordDark: "dark",
  solarizedDark: "dark",
  halloween: "dark",
  cyberpunk: "dark",
  nightowl: "dark",
  custom: "light"
};

const themeNames: Record<Lang, Record<ThemeId, string>> = {
  es: {
    oracle: "Oracle claro",
    pastel: "Pastel neon",
    frosted: "Frosted dark",
    glass: "Glass",
    midnight: "Nocturno",
    dracula: "Dracula",
    cobalt: "Cobalt",
    nord: "Nord",
    solarized: "Solarized",
    sunset: "Sunset",
    sage: "Sage",
    rose: "Rose",
    graphite: "Graphite",
    ocean: "Ocean",
    nordDark: "Nord Dark",
    solarizedDark: "Solarized Dark",
    halloween: "Halloween",
    cyberpunk: "Cyberpunk",
    nightowl: "Night Owl",
    custom: "Personalizado"
  },
  en: {
    oracle: "Oracle light",
    pastel: "Pastel neon",
    frosted: "Frosted dark",
    glass: "Glass",
    midnight: "Midnight",
    dracula: "Dracula",
    cobalt: "Cobalt",
    nord: "Nord",
    solarized: "Solarized",
    sunset: "Sunset",
    sage: "Sage",
    rose: "Rose",
    graphite: "Graphite",
    ocean: "Ocean",
    nordDark: "Nord Dark",
    solarizedDark: "Solarized Dark",
    halloween: "Halloween",
    cyberpunk: "Cyberpunk",
    nightowl: "Night Owl",
    custom: "Custom"
  },
  pt: {
    oracle: "Oracle claro",
    pastel: "Pastel neon",
    frosted: "Frosted dark",
    glass: "Glass",
    midnight: "Noturno",
    dracula: "Dracula",
    cobalt: "Cobalt",
    nord: "Nord",
    solarized: "Solarized",
    sunset: "Sunset",
    sage: "Sage",
    rose: "Rose",
    graphite: "Graphite",
    ocean: "Ocean",
    nordDark: "Nord Dark",
    solarizedDark: "Solarized Dark",
    halloween: "Halloween",
    cyberpunk: "Cyberpunk",
    nightowl: "Night Owl",
    custom: "Personalizado"
  }
};

const copy = {
  es: {
    app: "CI/CD Assistant",
    phase: "Fase 1",
    title: "Preparacion guiada de paquetes RFC",
    busy: "Trabajando",
    ready: "Listo",
    menu: "Menu",
    language: "Idioma",
    documentLanguage: "Idioma del documento",
    outputFolder: "Carpeta de salida",
    workspaceFolder: "Carpeta de repositorios",
    environmentSettings: "Entorno",
    refreshRepos: "Actualizar repositorios",
    chooseFolder: "Elegir carpeta",
    history: "Historial",
    noHistory: "Aun no hay documentos exportados.",
    noHistoryResults: "No hay resultados para esa busqueda.",
    historySearch: "Buscar por RFC",
    historyPage: "Pagina",
    pendingWork: "Pendientes",
    pendingSearch: "Buscar pendiente",
    noPendingWork: "No hay pendientes activos.",
    continuePendingWork: "Continuar",
    deletePendingWork: "Eliminar pendiente",
    pendingDeleteConfirm: "Eliminar el pendiente actual? Esto limpiara los datos en curso, pero no borrara documentos exportados.",
    pendingDetails: "Detalle",
    savePendingWork: "Guardar pendiente",
    newWork: "Nuevo",
    savePendingFirstConfirm: "Hay trabajo en curso. Quieres guardarlo como pendiente antes de iniciar uno nuevo?",
    newWithoutSavingConfirm: "Iniciar nuevo trabajo sin guardar el actual?",
    pendingOpenExecutionConfirm: "Este RFC ya tiene un Action Plan confirmado. Aceptar: iniciar RFC Execution con la misma carpeta del RFC. Cancelar: seguir en Action Plan.",
    pendingSaved: "Pendiente guardado.",
    noPendingToSave: "Captura datos del RFC antes de guardar un pendiente.",
    syncConverters: "Sincronizar",
    converterSyncTitle: "Sincronizar convertidores",
    converterSyncBody: "Actualiza o regresa la version del motor de conversion por tecnologia. La descarga desde la nube quedara conectada a Cloudflare.",
    converterVersion: "Version actual",
    converterKnowledge: "Paquete de conocimiento",
    converterSource: "Origen",
    converterRules: "Reglas",
    converterRulesAvailable: "Reglas externas cargadas",
    converterRulesMissing: "Sin reglas externas",
    converterInstallPackage: "Cargar paquete ZIP",
    converterUpdateUrl: "Endpoint de actualizacion",
    converterCheckUpdate: "Buscar actualizacion",
    converterInstallRemote: "Actualizar transformadores",
    converterUpdateAvailable: "Actualizacion disponible",
    converterNoUpdateUrl: "Endpoint de Cloudflare no configurado.",
    converterUpdate: "Actualizar",
    converterRollback: "Version anterior",
    converterUpdated: "Convertidor actualizado.",
    converterRolledBack: "Convertidor regresado a version anterior.",
    converterPackageInstalled: "Paquete de conocimiento instalado.",
    converterNoRollback: "No hay version anterior instalada.",
    historyRemoveConfirm: "Eliminar {{rfc}} del historial?",
    historyDiskConfirm: "Tambien quieres eliminar el documento del disco duro?",
    deleteHistoryItem: "Eliminar",
    openFile: "Abrir",
    openFolder: "Abrir carpeta",
    userData: "Usuario",
    userDataTitle: "Datos de usuario",
    userDataBody: "Genera un respaldo y elimina preferencias, historial, rutas, temas y logs locales de la app. No borra repositorios ni artefactos.",
    profileTitle: "Perfil local",
    profileBody: "Este registro es opcional y se guarda solo en esta computadora.",
    profileName: "Nombre",
    profileEmail: "Correo empresarial",
    profilePhone: "Telefono",
    profileAvatarStyle: "Estilo de avatar",
    profileAvatar: "Avatar",
    backupUserData: "Generar respaldo",
    deleteUserData: "Borrar datos de la app",
    deleteConfirmLabel: "Escribe BORRAR para confirmar",
    deleteConfirmPlaceholder: "BORRAR",
    backupCreated: "Respaldo generado en:",
    userDataDeleted: "Datos locales eliminados. La app quedo lista para configurarse de nuevo.",
    themes: "Temas",
    appTheme: "Tema de la app",
    textSize: "Tamano de texto",
    backgroundStyle: "Fondo",
    animatedBackground: "Animacion de fondo",
    animationSpeed: "Velocidad",
    animationMotion: "Movimiento",
    backgroundImage: "Imagen de fondo",
    chooseBackgroundImage: "Elegir imagen",
    clearBackgroundImage: "Quitar imagen",
    backgroundBlur: "Blur de imagen",
    customGradient: "Gradiente personalizado",
    resetCustomTheme: "Restablecer personalizado",
    backgroundA: "Fondo 1",
    backgroundB: "Fondo 2",
    backgroundC: "Fondo 3",
    panelColor: "Panel oscuro",
    panelTransparency: "Transparencia panel",
    panelBlur: "Blur panel",
    sidebarColor: "Sidebar",
    sidebarTransparency: "Transparencia sidebar",
    sidebarBlur: "Blur sidebar",
    accentColor: "Color principal",
    transparency: "Transparencia",
    blur: "Blur",
    languageTab: "Idioma",
    exportReadyTitle: "Evidencia exportada",
    exportReadyBody: "El documento se genero correctamente y quedo guardado en:",
    alertTitle: "Aviso",
    close: "Cerrar",
    settings: "Opciones",
    about: "About",
    openVbs: "Visual Builder Studio",
    caseFile: {
      title: "Expediente RFC",
      rfc: "RFC",
      repo: "Repositorio",
      environment: "Ambiente",
      artifacts: "Artefactos",
      run: "Run",
      pending: "Pendiente"
    },
    steps: {
      actionPlan: ["Action Plan", "Plantilla independiente"],
      setup: ["Instalacion", "Git, Node y carpeta base"],
      repositories: ["Repositorios", "Detectar o clonar region"],
      package: ["CI/CD RFC", "Artefactos y manifiestos"],
      review: ["CI/CD Confirmacion", "Resumen, logs y push"],
      pipeline: ["Ejecucion RFC", "Action Plan, evidencia y cierre"]
    },
    messages: {
      unexpected: "Ocurrio un error inesperado.",
      webMode: "Vista web activa. Abre la app con Electron para usar verificaciones locales.",
      folderElectron: "El selector de carpetas esta disponible al abrir la app con Electron.",
      scanElectron: "El escaneo de repositorios esta disponible al abrir la app con Electron.",
      cloneElectron: "El clonado desde la interfaz esta disponible al abrir la app con Electron.",
      filesElectron: "El selector de archivos esta disponible al abrir la app con Electron.",
      summaryElectron: "La vista previa con rutas locales esta disponible al abrir la app con Electron.",
      draftElectron: "La preparacion de borrador esta disponible al abrir la app con Electron.",
      pushElectron: "El commit y push estan disponibles al abrir la app con Electron.",
      verifyOk: "Verificacion completada.",
      reposOk: "Repositorios locales actualizados.",
      cloneUrl: "Pega la URL HTTPS del repositorio antes de clonar.",
      baseFolderRequired: "Elige una carpeta de trabajo antes de actualizar o clonar repositorios.",
      cloneOk: "Repositorio clonado correctamente.",
      dropPath: "No pude leer la ruta local de los archivos arrastrados. Haz click en el recuadro para seleccionarlos.",
      invalidFiles: "Solo se permiten artefactos .iar, .par, .xml, .wsdl, .csv, .zip, .jar o .sql.",
      summaryOk: "Resumen actualizado.",
      draftOk: "Borrador preparado localmente.",
      noFiles: "Agrega al menos un artefacto antes de continuar.",
      packageCleared: "Paquete limpiado. Agrega artefactos para continuar.",
      stepRequired: "Agrega comentario o evidencia antes de avanzar.",
      evidenceSetupRequired: "Completa RFC, ejecucion, ambiente y pasos antes de capturar evidencia.",
      exportNeedRfc: "Captura el numero de RFC antes de exportar evidencia.",
      exportNeedRun: "Captura el numero de run antes de exportar evidencia.",
      exportNeedStep: "Falta comentario o evidencia en el paso",
      exportOk: "Evidencia exportada correctamente.",
      done: "Proceso finalizado."
    },
    setup: {
      title: "Instalacion guiada",
      body: "La app revisa prerequisitos, muestra rutas de descarga y permite elegir la carpeta base de trabajo.",
      verify: "Verificar",
      download: "Descargar",
      baseFolder: "Carpeta base para repositorios",
      choose: "Elegir",
      next: "Continuar"
    },
    repos: {
      title: "Repositorios regionales",
      body: "Detecta repos existentes o clona uno nuevo con la URL HTTPS de Visual Builder Studio.",
      scan: "Escanear",
      branch: "Rama",
      missing: "sin detectar",
      dirty: "cambios locales",
      clean: "limpio",
      cloneUrl: "URL HTTPS para clonar",
      folderName: "Nombre de carpeta",
      clone: "Clonar",
      back: "Regresar",
      prepare: "Preparar RFC"
    },
    pkg: {
      title: "Paquete RFC CI/CD",
      body: "Flujo exclusivo de CI/CD: selecciona RFC, ruta destino y archivos OIC. La copia real ocurre al confirmar commit y push.",
      addFiles: "Agregar archivos",
      baseBranch: "Rama base",
      ricePath: "Ruta RICE_FOLDER_PATH",
      riceHelp: "Ruta que se escribe en inputs.properties; debe apuntar a la carpeta estandar del RFC sin incluir OIC.",
      mode: "Modo",
      modeHelp: "ADHOC usa int_adhoc.txt para desplegar solo lo listado. FULL usa int_full.txt para una lista completa/controlada.",
      dropTitle: "Arrastra archivos aqui o haz click para buscarlos",
      dropBody: "Acepta .iar, .par, .xml, .wsdl, lookups .csv, librerias .zip, paquetes OSB .jar y scripts .sql. Los .csv se colocan en OIC/Lookups.",
      preview: "Vista previa",
      clearPackage: "Limpiar paquete",
      prepareDraft: "Revisar paquete"
    },
    review: {
      title: "Confirmacion CI/CD",
      body: "Prepara la rama y cambios CI/CD para revisarlos antes de ejecutar add, commit y push.",
      refresh: "Actualizar",
      repository: "Repositorio",
      target: "Target OIC",
      manifest: "Manifiesto",
      empty: "Genera una vista previa para ver el resumen.",
      from: "desde",
      edit: "Editar paquete",
      openVbs: "Abrir VBS",
      commitLocal: "Preparar cambios",
      pushBranch: "Add, commit y push",
      undoCommit: "Descartar cambios",
      commitPush: "Commit y push"
    },
    pipeline: {
      title: "Ejecucion guiada",
      bodyTest: "Carga o usa el Action Plan para generar pasos de ejecucion, registrar evidencia y cerrar TEST.",
      bodyProd: "Carga o usa el Action Plan para generar pasos de ejecucion, registrar evidencia y cerrar PROD.",
      rfc: "RFC",
      mode: "CI/CD Tool",
      modeGeneral: "No",
      modeCicd: "Si",
      executionType: "Ejecucion",
      environment: "Ambiente",
      pipeline: "Pipeline",
      run: "Run",
      runUrl: "URL del run",
      actionPlan: "Action Plan base",
      loadActionPlan: "Cargar Action Plan",
      useGeneratedPlan: "Usar Action Plan generado",
      refreshSteps: "Actualizar pasos",
      reviewSteps: "Revisar pasos",
      confirmSteps: "Confirmar pasos",
      clearExecution: "Limpiar ejecucion",
      stepsLoaded: "Pasos generados desde el Action Plan.",
      stepsConfirmed: "Pasos confirmados para captura de evidencia.",
      editStepsHint: "Revisa la secuencia generada antes de capturar evidencia.",
      planPlaceholder: "Pega aqui el Action Plan o usa el que generaste en la app.",
      cicdHint: "En modo CI/CD Tool registra pipeline, run y URL para unir evidencia de Git con capturas de ejecucion.",
      checklist: "Ejecucion guiada",
      message: "Mensaje para actualizar RFC",
      finalMessage: "Cierre del seguimiento",
      currentEvidence: "Evidencia del paso",
      comment: "Comentario del paso",
      stepFailed: "Paso fallo",
      failedStepPrefix: "Paso marcado como fallido.",
      previous: "Anterior",
      next: "Siguiente",
      downloadDocx: "Descargar DOCX",
      downloadPdf: "Descargar PDF",
      prodMessage: "Mensaje PROD",
      prodMessageTitle: "Mensaje para continuar en PROD",
      prodMessageBody: "Revisa el texto y copialo al RFC para guiar la ejecucion productiva.",
      copy: "Copiar mensaje",
      openRun: "Abrir run",
      steps: [
        "Acceder al proyecto en Visual Builder Studio.",
        "Ir a Merge Requests y crear el merge request hacia release.",
        "Solicitar aprobadores y dejar el MR listo para revision.",
        "Dar seguimiento a la aprobacion y completar el merge.",
        "Ir a Builds > Pipelines, buscar el pipeline y ejecutar el run.",
        "Capturar el numero de run generado por Visual Builder Studio.",
        "Dar seguimiento a aprobaciones del pipeline y validar resultado.",
        "Actualizar el RFC con el mensaje del pipeline y adjuntar evidencia."
      ]
    },
    evidence: {
      title: "Evidencia",
      open: "Evidencia",
      log: "Log",
      captures: "Capturas",
      captureApp: "Capturar app",
      captureRegion: "Capturar region",
      addImage: "Agregar imagen",
      copyLog: "Copiar log",
      paste: "Pegar captura",
      saveImage: "Guardar captura",
      saveStepImages: "Guardar capturas del paso",
      saved: "Captura guardada.",
      savedMany: "Capturas guardadas.",
      empty: "Aun no hay evidencias.",
      note: "Nota de evidencia",
      copied: "Captura agregada a evidencia.",
      logCopied: "Log copiado al portapapeles.",
      noClipboard: "No encontre una imagen en el portapapeles.",
      exportedLater: "La exportacion DOCX/PDF queda lista para la siguiente iteracion."
    },
    badgeOther: "otro"
  },
  en: {
    app: "CI/CD Assistant",
    phase: "Phase 1",
    title: "Guided RFC package preparation",
    busy: "Working",
    ready: "Ready",
    menu: "Menu",
    language: "Language",
    documentLanguage: "Document language",
    outputFolder: "Output folder",
    workspaceFolder: "Repository folder",
    environmentSettings: "Environment",
    refreshRepos: "Refresh repositories",
    chooseFolder: "Choose folder",
    history: "History",
    noHistory: "No exported documents yet.",
    noHistoryResults: "No results for that search.",
    historySearch: "Search by RFC",
    historyPage: "Page",
    pendingWork: "Pending items",
    pendingSearch: "Search pending item",
    noPendingWork: "No active pending items.",
    continuePendingWork: "Continue",
    deletePendingWork: "Delete pending item",
    pendingDeleteConfirm: "Delete the current pending item? This will clear in-progress data, but exported documents will not be deleted.",
    pendingDetails: "Details",
    savePendingWork: "Save pending",
    newWork: "New",
    savePendingFirstConfirm: "There is work in progress. Save it as pending before starting a new one?",
    newWithoutSavingConfirm: "Start a new work item without saving the current one?",
    pendingOpenExecutionConfirm: "This RFC already has a confirmed Action Plan. OK: start RFC Execution with the same RFC folder. Cancel: continue in Action Plan.",
    pendingSaved: "Pending item saved.",
    noPendingToSave: "Capture RFC data before saving a pending item.",
    syncConverters: "Sync",
    converterSyncTitle: "Sync converters",
    converterSyncBody: "Update or roll back the conversion engine version by technology. Cloud download will be wired through Cloudflare.",
    converterVersion: "Current version",
    converterKnowledge: "Knowledge package",
    converterSource: "Source",
    converterRules: "Rules",
    converterRulesAvailable: "External rules loaded",
    converterRulesMissing: "No external rules",
    converterInstallPackage: "Load ZIP package",
    converterUpdateUrl: "Update endpoint",
    converterCheckUpdate: "Check update",
    converterInstallRemote: "Update transformers",
    converterUpdateAvailable: "Update available",
    converterNoUpdateUrl: "Cloudflare endpoint is not configured.",
    converterUpdate: "Update",
    converterRollback: "Previous version",
    converterUpdated: "Converter updated.",
    converterRolledBack: "Converter rolled back.",
    converterPackageInstalled: "Knowledge package installed.",
    converterNoRollback: "No previous version installed.",
    historyRemoveConfirm: "Remove {{rfc}} from history?",
    historyDiskConfirm: "Do you also want to delete the document from disk?",
    deleteHistoryItem: "Delete",
    openFile: "Open",
    openFolder: "Open folder",
    userData: "User",
    userDataTitle: "User data",
    userDataBody: "Create a backup and remove app preferences, history, paths, themes, and local logs. Repositories and artifacts are not deleted.",
    profileTitle: "Local profile",
    profileBody: "This registration is optional and stored only on this computer.",
    profileName: "Name",
    profileEmail: "Business email",
    profilePhone: "Phone",
    profileAvatarStyle: "Avatar style",
    profileAvatar: "Avatar",
    backupUserData: "Create backup",
    deleteUserData: "Delete app data",
    deleteConfirmLabel: "Type BORRAR to confirm",
    deleteConfirmPlaceholder: "BORRAR",
    backupCreated: "Backup created at:",
    userDataDeleted: "Local data deleted. The app is ready to be configured again.",
    themes: "Themes",
    appTheme: "App theme",
    textSize: "Text size",
    backgroundStyle: "Background",
    animatedBackground: "Background animation",
    animationSpeed: "Speed",
    animationMotion: "Motion",
    backgroundImage: "Background image",
    chooseBackgroundImage: "Choose image",
    clearBackgroundImage: "Clear image",
    backgroundBlur: "Image blur",
    customGradient: "Custom gradient",
    resetCustomTheme: "Reset custom theme",
    backgroundA: "Background 1",
    backgroundB: "Background 2",
    backgroundC: "Background 3",
    panelColor: "Dark panel",
    panelTransparency: "Panel transparency",
    panelBlur: "Panel blur",
    sidebarColor: "Sidebar",
    sidebarTransparency: "Sidebar transparency",
    sidebarBlur: "Sidebar blur",
    accentColor: "Accent color",
    transparency: "Transparency",
    blur: "Blur",
    languageTab: "Language",
    exportReadyTitle: "Evidence exported",
    exportReadyBody: "The document was generated successfully and saved at:",
    alertTitle: "Notice",
    close: "Close",
    settings: "Options",
    about: "About",
    openVbs: "Visual Builder Studio",
    caseFile: {
      title: "RFC file",
      rfc: "RFC",
      repo: "Repository",
      environment: "Environment",
      artifacts: "Artifacts",
      run: "Run",
      pending: "Pending"
    },
    steps: {
      actionPlan: ["Action Plan", "Independent template"],
      setup: ["Setup", "Git, Node, and base folder"],
      repositories: ["Repositories", "Detect or clone region"],
      package: ["CI/CD RFC", "Artifacts and manifests"],
      review: ["CI/CD Review", "Summary, logs, and push"],
      pipeline: ["RFC Execution", "Action Plan, evidence, and close"]
    },
    messages: {
      unexpected: "Something unexpected happened.",
      webMode: "Web preview is active. Open the Electron app to use local checks.",
      folderElectron: "Folder selection is available in the Electron app.",
      scanElectron: "Repository scanning is available in the Electron app.",
      cloneElectron: "Cloning from the interface is available in the Electron app.",
      filesElectron: "File selection is available in the Electron app.",
      summaryElectron: "Local path preview is available in the Electron app.",
      draftElectron: "Draft preparation is available in the Electron app.",
      pushElectron: "Commit and push are available in the Electron app.",
      verifyOk: "Verification completed.",
      reposOk: "Local repositories refreshed.",
      cloneUrl: "Paste the repository HTTPS URL before cloning.",
      baseFolderRequired: "Choose a workspace folder before refreshing or cloning repositories.",
      cloneOk: "Repository cloned successfully.",
      dropPath: "I could not read the local path for dropped files. Click the drop area to select them.",
      invalidFiles: "Only .iar, .par, .xml, .wsdl, .csv, .zip, .jar, or .sql artifacts are allowed.",
      summaryOk: "Summary refreshed.",
      draftOk: "Local draft prepared.",
      noFiles: "Add at least one artifact before continuing.",
      packageCleared: "Package cleared. Add artifacts to continue.",
      stepRequired: "Add a comment or evidence before continuing.",
      evidenceSetupRequired: "Complete RFC, execution, environment, and steps before capturing evidence.",
      exportNeedRfc: "Enter the RFC number before exporting evidence.",
      exportNeedRun: "Enter the run number before exporting evidence.",
      exportNeedStep: "Missing comment or evidence in step",
      exportOk: "Evidence exported successfully.",
      done: "Process completed."
    },
    setup: {
      title: "Guided setup",
      body: "The app checks prerequisites, shows download links, and lets users choose the base work folder.",
      verify: "Verify",
      download: "Download",
      baseFolder: "Base folder for repositories",
      choose: "Choose",
      next: "Continue"
    },
    repos: {
      title: "Regional repositories",
      body: "Detect existing repositories or clone a new one with the Visual Builder Studio HTTPS URL.",
      scan: "Scan",
      branch: "Branch",
      missing: "not detected",
      dirty: "local changes",
      clean: "clean",
      cloneUrl: "HTTPS URL to clone",
      folderName: "Folder name",
      clone: "Clone",
      back: "Back",
      prepare: "Prepare RFC"
    },
    pkg: {
      title: "CI/CD RFC package",
      body: "CI/CD-only flow: select RFC, target path, and OIC files. Files are copied only when commit and push are confirmed.",
      addFiles: "Add files",
      baseBranch: "Base branch",
      ricePath: "RICE_FOLDER_PATH",
      riceHelp: "Path written to inputs.properties; it should point to the RFC standard folder without OIC.",
      mode: "Mode",
      modeHelp: "ADHOC uses int_adhoc.txt to deploy only listed items. FULL uses int_full.txt for a complete/controlled list.",
      dropTitle: "Drop files here or click to browse",
      dropBody: "Accepts .iar, .par, .xml, .wsdl, lookup .csv files, library .zip files, OSB .jar packages, and .sql scripts. .csv files go into OIC/Lookups.",
      preview: "Preview",
      clearPackage: "Clear package",
      prepareDraft: "Review package"
    },
    review: {
      title: "CI/CD confirmation",
      body: "Prepare the CI/CD branch and changes for review before running add, commit, and push.",
      refresh: "Refresh",
      repository: "Repository",
      target: "Target OIC",
      manifest: "Manifest",
      empty: "Generate a preview to see the summary.",
      from: "from",
      edit: "Edit package",
      openVbs: "Open VBS",
      commitLocal: "Prepare changes",
      pushBranch: "Add, commit, push",
      undoCommit: "Discard changes",
      commitPush: "Commit and push"
    },
    pipeline: {
      title: "Guided execution",
      bodyTest: "Load or reuse the Action Plan to generate execution steps, capture evidence, and close TEST.",
      bodyProd: "Load or reuse the Action Plan to generate execution steps, capture evidence, and close PROD.",
      rfc: "RFC",
      mode: "CI/CD Tool",
      modeGeneral: "No",
      modeCicd: "Yes",
      executionType: "Execution",
      environment: "Environment",
      pipeline: "Pipeline",
      run: "Run",
      runUrl: "Run URL",
      actionPlan: "Base Action Plan",
      loadActionPlan: "Load Action Plan",
      useGeneratedPlan: "Use generated Action Plan",
      refreshSteps: "Refresh steps",
      reviewSteps: "Review steps",
      confirmSteps: "Confirm steps",
      clearExecution: "Clear execution",
      stepsLoaded: "Steps generated from the Action Plan.",
      stepsConfirmed: "Steps confirmed for evidence capture.",
      editStepsHint: "Review the generated sequence before capturing evidence.",
      planPlaceholder: "Paste the Action Plan here or use the one generated in the app.",
      cicdHint: "In CI/CD Tool mode, record pipeline, run, and URL to combine Git evidence with execution screenshots.",
      checklist: "Guided execution",
      message: "RFC update message",
      finalMessage: "Tracking closeout",
      currentEvidence: "Step evidence",
      comment: "Step comment",
      stepFailed: "Step failed",
      failedStepPrefix: "Step marked as failed.",
      previous: "Previous",
      next: "Next",
      downloadDocx: "Download DOCX",
      downloadPdf: "Download PDF",
      prodMessage: "PROD message",
      prodMessageTitle: "Message to continue in PROD",
      prodMessageBody: "Review the text and copy it to the RFC to guide the production execution.",
      copy: "Copy message",
      openRun: "Open run",
      steps: [
        "Open the project in Visual Builder Studio.",
        "Go to Merge Requests and create the merge request targeting release.",
        "Request approvers and leave the MR ready for review.",
        "Track approval and complete the merge.",
        "Go to Builds > Pipelines, find the pipeline, and start the run.",
        "Capture the run number generated by Visual Builder Studio.",
        "Track pipeline approvals and validate the result.",
        "Update the RFC with the pipeline message and attach evidence."
      ]
    },
    evidence: {
      title: "Evidence",
      open: "Evidence",
      log: "Log",
      captures: "Screenshots",
      captureApp: "Capture app",
      captureRegion: "Capture region",
      addImage: "Add image",
      copyLog: "Copy log",
      paste: "Paste screenshot",
      saveImage: "Save screenshot",
      saveStepImages: "Save step screenshots",
      saved: "Screenshot saved.",
      savedMany: "Screenshots saved.",
      empty: "No evidence yet.",
      note: "Evidence note",
      copied: "Screenshot added to evidence.",
      logCopied: "Log copied to clipboard.",
      noClipboard: "I could not find an image in the clipboard.",
      exportedLater: "DOCX/PDF export is ready for the next iteration."
    },
    badgeOther: "other"
  },
  pt: {
    app: "CI/CD Assistant",
    phase: "Fase 1",
    title: "Preparacao guiada de pacotes RFC",
    busy: "Trabalhando",
    ready: "Pronto",
    menu: "Menu",
    language: "Idioma",
    documentLanguage: "Idioma do documento",
    outputFolder: "Pasta de saida",
    workspaceFolder: "Pasta de repositorios",
    environmentSettings: "Ambiente",
    refreshRepos: "Atualizar repositorios",
    chooseFolder: "Escolher pasta",
    history: "Historico",
    noHistory: "Ainda nao ha documentos exportados.",
    noHistoryResults: "Nao ha resultados para essa busca.",
    historySearch: "Buscar por RFC",
    historyPage: "Pagina",
    pendingWork: "Pendentes",
    pendingSearch: "Buscar pendente",
    noPendingWork: "Nao ha pendentes ativos.",
    continuePendingWork: "Continuar",
    deletePendingWork: "Excluir pendente",
    pendingDeleteConfirm: "Excluir o pendente atual? Isso limpa os dados em andamento, mas nao apaga documentos exportados.",
    pendingDetails: "Detalhe",
    savePendingWork: "Salvar pendente",
    newWork: "Novo",
    savePendingFirstConfirm: "Ha trabalho em andamento. Deseja salvar como pendente antes de iniciar um novo?",
    newWithoutSavingConfirm: "Iniciar um novo trabalho sem salvar o atual?",
    pendingOpenExecutionConfirm: "Este RFC ja tem um Action Plan confirmado. OK: iniciar RFC Execution com a mesma pasta do RFC. Cancelar: continuar no Action Plan.",
    pendingSaved: "Pendente salvo.",
    noPendingToSave: "Capture dados do RFC antes de salvar um pendente.",
    syncConverters: "Sincronizar",
    converterSyncTitle: "Sincronizar conversores",
    converterSyncBody: "Atualize ou reverta a versao do motor de conversao por tecnologia. O download em nuvem sera conectado ao Cloudflare.",
    converterVersion: "Versao atual",
    converterKnowledge: "Pacote de conhecimento",
    converterSource: "Origem",
    converterRules: "Regras",
    converterRulesAvailable: "Regras externas carregadas",
    converterRulesMissing: "Sem regras externas",
    converterInstallPackage: "Carregar pacote ZIP",
    converterUpdateUrl: "Endpoint de atualizacao",
    converterCheckUpdate: "Buscar atualizacao",
    converterInstallRemote: "Atualizar transformadores",
    converterUpdateAvailable: "Atualizacao disponivel",
    converterNoUpdateUrl: "Endpoint do Cloudflare nao configurado.",
    converterUpdate: "Atualizar",
    converterRollback: "Versao anterior",
    converterUpdated: "Conversor atualizado.",
    converterRolledBack: "Conversor revertido.",
    converterPackageInstalled: "Pacote de conhecimento instalado.",
    converterNoRollback: "Nenhuma versao anterior instalada.",
    historyRemoveConfirm: "Excluir {{rfc}} do historico?",
    historyDiskConfirm: "Tambem deseja excluir o documento do disco?",
    deleteHistoryItem: "Excluir",
    openFile: "Abrir",
    openFolder: "Abrir pasta",
    userData: "Usuario",
    userDataTitle: "Dados do usuario",
    userDataBody: "Gera um backup e remove preferencias, historico, rotas, temas e logs locais do app. Nao apaga repositorios nem artefatos.",
    profileTitle: "Perfil local",
    profileBody: "Este registro e opcional e fica salvo apenas neste computador.",
    profileName: "Nome",
    profileEmail: "Email corporativo",
    profilePhone: "Telefone",
    profileAvatarStyle: "Estilo do avatar",
    profileAvatar: "Avatar",
    backupUserData: "Gerar backup",
    deleteUserData: "Apagar dados do app",
    deleteConfirmLabel: "Digite BORRAR para confirmar",
    deleteConfirmPlaceholder: "BORRAR",
    backupCreated: "Backup gerado em:",
    userDataDeleted: "Dados locais apagados. O app esta pronto para ser configurado novamente.",
    themes: "Temas",
    appTheme: "Tema do app",
    textSize: "Tamanho do texto",
    backgroundStyle: "Fundo",
    animatedBackground: "Animacao de fundo",
    animationSpeed: "Velocidade",
    animationMotion: "Movimento",
    backgroundImage: "Imagem de fundo",
    chooseBackgroundImage: "Escolher imagem",
    clearBackgroundImage: "Remover imagem",
    backgroundBlur: "Blur da imagem",
    customGradient: "Gradiente personalizado",
    resetCustomTheme: "Restaurar personalizado",
    backgroundA: "Fundo 1",
    backgroundB: "Fundo 2",
    backgroundC: "Fundo 3",
    panelColor: "Painel escuro",
    panelTransparency: "Transparencia painel",
    panelBlur: "Blur painel",
    sidebarColor: "Sidebar",
    sidebarTransparency: "Transparencia sidebar",
    sidebarBlur: "Blur sidebar",
    accentColor: "Cor principal",
    transparency: "Transparencia",
    blur: "Blur",
    languageTab: "Idioma",
    exportReadyTitle: "Evidencia exportada",
    exportReadyBody: "O documento foi gerado com sucesso e salvo em:",
    alertTitle: "Aviso",
    close: "Fechar",
    settings: "Opcoes",
    about: "About",
    openVbs: "Visual Builder Studio",
    caseFile: {
      title: "Expediente RFC",
      rfc: "RFC",
      repo: "Repositorio",
      environment: "Ambiente",
      artifacts: "Artefatos",
      run: "Run",
      pending: "Pendente"
    },
    steps: {
      actionPlan: ["Action Plan", "Template independente"],
      setup: ["Instalacao", "Git, Node e pasta base"],
      repositories: ["Repositorios", "Detectar ou clonar regiao"],
      package: ["CI/CD RFC", "Artefatos e manifestos"],
      review: ["CI/CD Confirmacao", "Resumo, logs e push"],
      pipeline: ["Execucao RFC", "Action Plan, evidencia e fechamento"]
    },
    messages: {
      unexpected: "Ocorreu um erro inesperado.",
      webMode: "Preview web ativo. Abra o app Electron para usar verificacoes locais.",
      folderElectron: "A selecao de pastas esta disponivel no app Electron.",
      scanElectron: "A busca de repositorios esta disponivel no app Electron.",
      cloneElectron: "O clone pela interface esta disponivel no app Electron.",
      filesElectron: "A selecao de arquivos esta disponivel no app Electron.",
      summaryElectron: "O preview com rotas locais esta disponivel no app Electron.",
      draftElectron: "A preparacao do rascunho esta disponivel no app Electron.",
      pushElectron: "Commit e push estao disponiveis no app Electron.",
      verifyOk: "Verificacao concluida.",
      reposOk: "Repositorios locais atualizados.",
      cloneUrl: "Cole a URL HTTPS do repositorio antes de clonar.",
      baseFolderRequired: "Escolha uma pasta de trabalho antes de atualizar ou clonar repositorios.",
      cloneOk: "Repositorio clonado com sucesso.",
      dropPath: "Nao foi possivel ler a rota local dos arquivos arrastados. Clique na area para seleciona-los.",
      invalidFiles: "Somente artefatos .iar, .par, .xml, .wsdl, .csv, .zip, .jar ou .sql sao permitidos.",
      summaryOk: "Resumo atualizado.",
      draftOk: "Rascunho local preparado.",
      noFiles: "Adicione pelo menos um artefato antes de continuar.",
      packageCleared: "Pacote limpo. Adicione artefatos para continuar.",
      stepRequired: "Adicione comentario ou evidencia antes de continuar.",
      evidenceSetupRequired: "Complete RFC, execucao, ambiente e passos antes de capturar evidencia.",
      exportNeedRfc: "Capture o numero do RFC antes de exportar evidencia.",
      exportNeedRun: "Capture o numero do run antes de exportar evidencia.",
      exportNeedStep: "Falta comentario ou evidencia no passo",
      exportOk: "Evidencia exportada com sucesso.",
      done: "Processo concluido."
    },
    setup: {
      title: "Instalacao guiada",
      body: "O app verifica prerequisitos, mostra links de download e permite escolher a pasta base de trabalho.",
      verify: "Verificar",
      download: "Baixar",
      baseFolder: "Pasta base para repositorios",
      choose: "Escolher",
      next: "Continuar"
    },
    repos: {
      title: "Repositorios regionais",
      body: "Detecte repositorios existentes ou clone um novo com a URL HTTPS do Visual Builder Studio.",
      scan: "Buscar",
      branch: "Branch",
      missing: "nao detectada",
      dirty: "mudancas locais",
      clean: "limpo",
      cloneUrl: "URL HTTPS para clonar",
      folderName: "Nome da pasta",
      clone: "Clonar",
      back: "Voltar",
      prepare: "Preparar RFC"
    },
    pkg: {
      title: "Pacote RFC CI/CD",
      body: "Fluxo exclusivo de CI/CD: selecione RFC, rota destino e arquivos OIC. A copia real ocorre ao confirmar commit e push.",
      addFiles: "Adicionar arquivos",
      baseBranch: "Branch base",
      ricePath: "Rota RICE_FOLDER_PATH",
      riceHelp: "Rota escrita no inputs.properties; deve apontar para a pasta padrao do RFC sem incluir OIC.",
      mode: "Modo",
      modeHelp: "ADHOC usa int_adhoc.txt para implantar apenas itens listados. FULL usa int_full.txt para uma lista completa/controlada.",
      dropTitle: "Arraste arquivos aqui ou clique para buscar",
      dropBody: "Aceita .iar, .par, .xml, .wsdl, lookups .csv, bibliotecas .zip, pacotes OSB .jar e scripts .sql. Arquivos .csv vao para OIC/Lookups.",
      preview: "Preview",
      clearPackage: "Limpar pacote",
      prepareDraft: "Revisar pacote"
    },
    review: {
      title: "Confirmacao CI/CD",
      body: "Prepare a branch e as mudancas CI/CD para revisar antes de executar add, commit e push.",
      refresh: "Atualizar",
      repository: "Repositorio",
      target: "Target OIC",
      manifest: "Manifesto",
      empty: "Gere um preview para ver o resumo.",
      from: "de",
      edit: "Editar pacote",
      openVbs: "Abrir VBS",
      commitLocal: "Preparar mudancas",
      pushBranch: "Add, commit e push",
      undoCommit: "Descartar mudancas",
      commitPush: "Commit e push"
    },
    pipeline: {
      title: "Execucao guiada",
      bodyTest: "Carregue ou reutilize o Action Plan para gerar passos de execucao, capturar evidencia e fechar TEST.",
      bodyProd: "Carregue ou reutilize o Action Plan para gerar passos de execucao, capturar evidencia e fechar PROD.",
      rfc: "RFC",
      mode: "CI/CD Tool",
      modeGeneral: "Nao",
      modeCicd: "Sim",
      executionType: "Execucao",
      environment: "Ambiente",
      pipeline: "Pipeline",
      run: "Run",
      runUrl: "URL do run",
      actionPlan: "Action Plan base",
      loadActionPlan: "Carregar Action Plan",
      useGeneratedPlan: "Usar Action Plan gerado",
      refreshSteps: "Atualizar passos",
      reviewSteps: "Revisar passos",
      confirmSteps: "Confirmar passos",
      clearExecution: "Limpar execucao",
      stepsLoaded: "Passos gerados a partir do Action Plan.",
      stepsConfirmed: "Passos confirmados para captura de evidencia.",
      editStepsHint: "Revise a sequencia gerada antes de capturar evidencia.",
      planPlaceholder: "Cole aqui o Action Plan ou use o que foi gerado no app.",
      cicdHint: "No modo CI/CD Tool, registre pipeline, run e URL para unir evidencia Git com capturas da execucao.",
      checklist: "Execucao guiada",
      message: "Mensagem para atualizar RFC",
      finalMessage: "Fechamento do acompanhamento",
      currentEvidence: "Evidencia do passo",
      comment: "Comentario do passo",
      stepFailed: "Passo falhou",
      failedStepPrefix: "Passo marcado como falho.",
      previous: "Anterior",
      next: "Proximo",
      downloadDocx: "Baixar DOCX",
      downloadPdf: "Baixar PDF",
      prodMessage: "Mensagem PROD",
      prodMessageTitle: "Mensagem para continuar em PROD",
      prodMessageBody: "Revise o texto e copie para o RFC para guiar a execucao produtiva.",
      copy: "Copiar mensagem",
      openRun: "Abrir run",
      steps: [
        "Acessar o projeto no Visual Builder Studio.",
        "Ir para Merge Requests e criar o merge request para release.",
        "Solicitar aprovadores e deixar o MR pronto para revisao.",
        "Acompanhar a aprovacao e completar o merge.",
        "Ir para Builds > Pipelines, buscar o pipeline e executar o run.",
        "Capturar o numero de run gerado pelo Visual Builder Studio.",
        "Acompanhar aprovacoes do pipeline e validar o resultado.",
        "Atualizar o RFC com a mensagem do pipeline e anexar evidencia."
      ]
    },
    evidence: {
      title: "Evidencia",
      open: "Evidencia",
      log: "Log",
      captures: "Capturas",
      captureApp: "Capturar app",
      captureRegion: "Capturar regiao",
      addImage: "Adicionar imagem",
      copyLog: "Copiar log",
      paste: "Colar captura",
      saveImage: "Salvar captura",
      saveStepImages: "Salvar capturas do passo",
      saved: "Captura salva.",
      savedMany: "Capturas salvas.",
      empty: "Ainda nao ha evidencias.",
      note: "Nota da evidencia",
      copied: "Captura adicionada a evidencia.",
      logCopied: "Log copiado para a area de transferencia.",
      noClipboard: "Nao encontrei uma imagem na area de transferencia.",
      exportedLater: "A exportacao DOCX/PDF fica para a proxima iteracao."
    },
    badgeOther: "outro"
  }
} as const;

const envCopy = {
  es: {
    title: "Entorno y area de trabajo",
    body: "Estos avisos confirman que la maquina esta lista y que la carpeta contiene los repos regionales.",
    checks: "Instalacion",
    workspace: "Area de trabajo",
    selectFolder: "Elegir carpeta",
    refresh: "Actualizar",
    repositories: "Repositorios disponibles",
    noRepos: "No hay repositorios Git en esta carpeta.",
    addRepo: "Agregar repositorio",
    hideClone: "Ocultar clonado",
    selected: "Seleccionado",
    useRepo: "Usar",
    cloneHint: "Pega la URL HTTPS del repositorio y elige el nombre de la carpeta destino.",
    currentFolder: "Carpeta actual"
  },
  en: {
    title: "Environment and workspace",
    body: "These notices confirm that the machine is ready and that the folder contains regional repositories.",
    checks: "Setup",
    workspace: "Workspace",
    selectFolder: "Choose folder",
    refresh: "Refresh",
    repositories: "Available repositories",
    noRepos: "There are no Git repositories in this folder.",
    addRepo: "Add repository",
    hideClone: "Hide clone",
    selected: "Selected",
    useRepo: "Use",
    cloneHint: "Paste the repository HTTPS URL and choose the destination folder name.",
    currentFolder: "Current folder"
  },
  pt: {
    title: "Ambiente e area de trabalho",
    body: "Estes avisos confirmam que a maquina esta pronta e que a pasta contem os repositorios regionais.",
    checks: "Instalacao",
    workspace: "Area de trabalho",
    selectFolder: "Escolher pasta",
    refresh: "Atualizar",
    repositories: "Repositorios disponiveis",
    noRepos: "Nao ha repositorios Git nesta pasta.",
    addRepo: "Adicionar repositorio",
    hideClone: "Ocultar clone",
    selected: "Selecionado",
    useRepo: "Usar",
    cloneHint: "Cole a URL HTTPS do repositorio e escolha o nome da pasta destino.",
    currentFolder: "Pasta atual"
  }
} as const;

const actionCopy = {
  es: {
    title: "Generar Action Plan",
    body: "Crea el plan del RFC con la plantilla CI/CD y los datos capturados antes de preparar el paquete.",
    product: "Producto",
    selectProduct: "Seleccionar producto",
    templateReference: "Template de referencia",
    selectTemplate: "Auto detect",
    templateHint: "Opcional. Fuerza un patron cuando el RFC es ambiguo; Auto detect usa el convertidor normal.",
    addTemplate: "Agregar template",
    customTemplateTitle: "Agregar template personalizado",
    templateName: "Nombre del template",
    templateCategory: "Categoria",
    templateContent: "Contenido / referencia",
    saveTemplate: "Guardar template",
    templateSaved: "Template personalizado guardado.",
    templateRequired: "Captura nombre, producto y contenido del template.",
    method: "Metodo",
    methodManual: "Manual",
    repository: "Repositorio",
    selectRepository: "Seleccionar repositorio",
    environment: "Ambiente",
    selectEnvironment: "Seleccionar ambiente",
    instance: "Instancia",
    activity: "Actividad / resumen RFC",
    scopeNotes: "Notas / alcance RFC",
    scopeNotesHint: "Pega aqui la descripcion del RFC o instrucciones especiales. Ejemplo: ignore Dashboard section and lookups import.",
    artifacts: "Artefactos",
    artifactsHint: "Un artefacto por linea. Ejemplo: GB_AR_HCR_LKP.csv, package.par o integration.iar",
    inspectArtifacts: "Inspeccionar artefactos",
    artifactInspectorTitle: "Inspector de artefactos RFC",
    artifactInspectorBody: "Carga los artefactos adjuntos al RFC para comparar el contenido real contra el IM090.",
    artifactCompare: "Comparacion IM090 vs artefactos",
    artifactDetails: "Contenido detectado",
    artifactDocument: "Documento",
    artifactLoaded: "Artefacto",
    artifactVersion: "Version",
    artifactStatus: "Estado",
    artifactExtra: "Contenido interno",
    artifactMissing: "No existe",
    artifactExists: "Existe",
    artifactPending: "Pendiente",
    noActionArtifacts: "No hay artefactos cargados para validar.",
    noArtifactComparison: "Carga el IM090 o captura artefactos para comparar.",
    sourceDocument: "Documento IM090 / instrucciones",
    loadDocument: "Cargar documento",
    processingDocument: "Procesando archivo...",
    noDocument: "Sin documento cargado",
    manualInstructions: "Instrucciones de instalacion",
    manualInstructionsHint: "Carga un IM090 .docx/.pdf o pega aqui las instrucciones manuales de instalacion.",
    reviewManual: "Revisar fases",
    manualReviewTitle: "Revisar Action Plan manual",
    manualReviewBody: "Confirma o ajusta las fases detectadas antes de generar el Action Plan.",
    includePhase: "Incluir fase",
    manualSelectOne: "Selecciona al menos una fase para generar el Action Plan.",
    acceptReview: "Generar Action Plan",
    generate: "Generar plan",
    clear: "Limpiar Action Plan",
    copy: "Copiar",
    supportOutput: "Copiar salida soporte",
    supportTitle: "Salida para soporte",
    supportBody: "Comparte este bloque cuando necesites revisar una conversion sin enviar capturas.",
    supportCopied: "Salida de soporte copiada al portapapeles.",
    confirm: "Confirmar Action Plan",
    confirmed: "Action Plan confirmado",
    confirmedSaved: "Action Plan confirmado y guardado en:",
    editedAfterConfirm: "Editado despues de confirmar",
    preview: "Action Plan generado",
    methodCicd: "CI/CD Tool"
  },
  en: {
    title: "Generate Action Plan",
    body: "Create the RFC plan with the CI/CD template and the captured data before preparing the package.",
    product: "Product",
    selectProduct: "Select product",
    templateReference: "Template reference",
    selectTemplate: "Auto detect",
    templateHint: "Optional. Forces a pattern when the RFC is ambiguous; Auto detect uses normal conversion.",
    addTemplate: "Add template",
    customTemplateTitle: "Add custom template",
    templateName: "Template name",
    templateCategory: "Category",
    templateContent: "Content / reference",
    saveTemplate: "Save template",
    templateSaved: "Custom template saved.",
    templateRequired: "Enter template name, product, and content.",
    method: "Method",
    methodManual: "Manual",
    repository: "Repository",
    selectRepository: "Select repository",
    environment: "Environment",
    selectEnvironment: "Select environment",
    instance: "Instance",
    activity: "Activity / RFC summary",
    scopeNotes: "RFC notes / scope",
    scopeNotesHint: "Paste the RFC description or special handling instructions. Example: ignore Dashboard section and lookups import.",
    artifacts: "Artifacts",
    artifactsHint: "One artifact per line. Example: GB_AR_HCR_LKP.csv, package.par, or integration.iar",
    inspectArtifacts: "Inspect artifacts",
    artifactInspectorTitle: "RFC artifacts inspector",
    artifactInspectorBody: "Load the RFC attached artifacts to compare real content against the IM090.",
    artifactCompare: "IM090 vs artifacts comparison",
    artifactDetails: "Detected content",
    artifactDocument: "Document",
    artifactLoaded: "Artifact",
    artifactVersion: "Version",
    artifactStatus: "Status",
    artifactExtra: "Internal content",
    artifactMissing: "Missing",
    artifactExists: "Exists",
    artifactPending: "Pending",
    noActionArtifacts: "No artifacts loaded for validation.",
    noArtifactComparison: "Load the IM090 or capture artifacts to compare.",
    sourceDocument: "IM090 / instructions document",
    loadDocument: "Load document",
    processingDocument: "Processing file...",
    noDocument: "No document loaded",
    manualInstructions: "Installation instructions",
    manualInstructionsHint: "Load an IM090 .docx/.pdf or paste the manual installation instructions here.",
    reviewManual: "Review phases",
    manualReviewTitle: "Review manual Action Plan",
    manualReviewBody: "Confirm or adjust the detected phases before generating the Action Plan.",
    includePhase: "Include phase",
    manualSelectOne: "Select at least one phase to generate the Action Plan.",
    acceptReview: "Generate Action Plan",
    generate: "Generate plan",
    clear: "Clear Action Plan",
    copy: "Copy",
    supportOutput: "Copy support output",
    supportTitle: "Support output",
    supportBody: "Share this block when a conversion needs review without screenshots.",
    supportCopied: "Support output copied to clipboard.",
    confirm: "Confirm Action Plan",
    confirmed: "Action Plan confirmed",
    confirmedSaved: "Action Plan confirmed and saved at:",
    editedAfterConfirm: "Edited after confirmation",
    preview: "Generated Action Plan",
    methodCicd: "CI/CD Tool"
  },
  pt: {
    title: "Gerar Action Plan",
    body: "Crie o plano do RFC com o template CI/CD e os dados capturados antes de preparar o pacote.",
    product: "Produto",
    selectProduct: "Selecionar produto",
    templateReference: "Template de referencia",
    selectTemplate: "Auto detect",
    templateHint: "Opcional. Forca um padrao quando o RFC e ambiguo; Auto detect usa a conversao normal.",
    addTemplate: "Adicionar template",
    customTemplateTitle: "Adicionar template personalizado",
    templateName: "Nome do template",
    templateCategory: "Categoria",
    templateContent: "Conteudo / referencia",
    saveTemplate: "Salvar template",
    templateSaved: "Template personalizado salvo.",
    templateRequired: "Informe nome, produto e conteudo do template.",
    method: "Metodo",
    methodManual: "Manual",
    repository: "Repositorio",
    selectRepository: "Selecionar repositorio",
    environment: "Ambiente",
    selectEnvironment: "Selecionar ambiente",
    instance: "Instancia",
    activity: "Atividade / resumo RFC",
    scopeNotes: "Notas / escopo RFC",
    scopeNotesHint: "Cole aqui a descricao do RFC ou instrucoes especiais. Exemplo: ignore Dashboard section and lookups import.",
    artifacts: "Artefatos",
    artifactsHint: "Um artefato por linha. Exemplo: GB_AR_HCR_LKP.csv, package.par ou integration.iar",
    inspectArtifacts: "Inspecionar artefatos",
    artifactInspectorTitle: "Inspetor de artefatos RFC",
    artifactInspectorBody: "Carregue os artefatos anexos ao RFC para comparar o conteudo real com o IM090.",
    artifactCompare: "Comparacao IM090 vs artefatos",
    artifactDetails: "Conteudo detectado",
    artifactDocument: "Documento",
    artifactLoaded: "Artefato",
    artifactVersion: "Versao",
    artifactStatus: "Status",
    artifactExtra: "Conteudo interno",
    artifactMissing: "Nao existe",
    artifactExists: "Existe",
    artifactPending: "Pendente",
    noActionArtifacts: "Nao ha artefatos carregados para validar.",
    noArtifactComparison: "Carregue o IM090 ou capture artefatos para comparar.",
    sourceDocument: "Documento IM090 / instrucoes",
    loadDocument: "Carregar documento",
    processingDocument: "Processando arquivo...",
    noDocument: "Sem documento carregado",
    manualInstructions: "Instrucoes de instalacao",
    manualInstructionsHint: "Carregue um IM090 .docx/.pdf ou cole aqui as instrucoes manuais de instalacao.",
    reviewManual: "Revisar fases",
    manualReviewTitle: "Revisar Action Plan manual",
    manualReviewBody: "Confirme ou ajuste as fases detectadas antes de gerar o Action Plan.",
    includePhase: "Incluir fase",
    manualSelectOne: "Selecione pelo menos uma fase para gerar o Action Plan.",
    acceptReview: "Gerar Action Plan",
    generate: "Gerar plano",
    clear: "Limpar Action Plan",
    copy: "Copiar",
    supportOutput: "Copiar saida suporte",
    supportTitle: "Saida para suporte",
    supportBody: "Compartilhe este bloco quando precisar revisar uma conversao sem capturas.",
    supportCopied: "Saida de suporte copiada para a area de transferencia.",
    confirm: "Confirmar Action Plan",
    confirmed: "Action Plan confirmado",
    confirmedSaved: "Action Plan confirmado e salvo em:",
    editedAfterConfirm: "Editado apos confirmar",
    preview: "Action Plan gerado",
    methodCicd: "CI/CD Tool"
  }
} as const;

const allowedArtifactExtensions = [".iar", ".par", ".xml", ".wsdl", ".csv", ".zip", ".jar", ".sql"];
type ActionTemplateOption = { id: ActionTemplateId; product?: string; label: string; hint: string; custom?: boolean };

function actionTemplateMatchesProduct(templateId: ActionTemplateId, product: string, options: ActionTemplateOption[]) {
  const option = options.find((item) => item.id === templateId);
  return !option?.product || option.product === product;
}

function actionTemplateHint(templateId: ActionTemplateId, options: ActionTemplateOption[]) {
  return options.find((item) => item.id === templateId)?.hint ?? "";
}

function readLe16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readLe32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function unescapeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function inflateRawBytes(bytes: Uint8Array) {
  return decompressBytes(bytes, "deflate-raw");
}

async function decompressBytes(bytes: Uint8Array, format: "deflate" | "deflate-raw") {
  const Decompression = (globalThis as unknown as {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!Decompression) throw new Error("Este navegador no soporta lectura comprimida de documentos.");
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new Decompression(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipText(buffer: ArrayBuffer, targetName: string) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readLe32(view, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("No se encontro la estructura ZIP del DOCX.");

  const decoder = new TextDecoder();
  const entryCount = readLe16(view, eocdOffset + 10);
  let offset = readLe32(view, eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (readLe32(view, offset) !== 0x02014b50) break;
    const compression = readLe16(view, offset + 10);
    const compressedSize = readLe32(view, offset + 20);
    const nameLength = readLe16(view, offset + 28);
    const extraLength = readLe16(view, offset + 30);
    const commentLength = readLe16(view, offset + 32);
    const localHeaderOffset = readLe32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === targetName) {
      const localNameLength = readLe16(view, localHeaderOffset + 26);
      const localExtraLength = readLe16(view, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      const data = compression === 0 ? compressed : await inflateRawBytes(compressed);
      return decoder.decode(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return "";
}

async function extractDocxTextFromBrowserFile(file: File) {
  const documentXml = (await readZipText(await file.arrayBuffer(), "word/document.xml"))
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:fldSimple\b[^>]*>[\s\S]*?<\/w:fldSimple>/g, "");
  return documentXml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => unescapeXmlText(line).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxActionDocumentTextLength);
}

function decodePdfLiteralText(value: string) {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3}|.)/g, (_match, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === "b") return "\b";
    if (escaped === "f") return "\f";
    if (/^[0-7]/.test(escaped)) return String.fromCharCode(parseInt(escaped, 8));
    return escaped;
  });
}

function decodePdfHexText(value: string) {
  const clean = value.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < clean.length; index += 2) {
    bytes.push(parseInt(clean.slice(index, index + 2).padEnd(2, "0"), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return text;
  }
  return String.fromCharCode(...bytes);
}

function extractPdfTextOperators(content: string) {
  const parts: string[] = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  const arrayPattern = /\[((?:.|\n|\r)*?)\]\s*TJ/g;

  for (const match of content.matchAll(literalPattern)) parts.push(decodePdfLiteralText(match[1]));
  for (const match of content.matchAll(hexPattern)) parts.push(decodePdfHexText(match[1]));
  for (const match of content.matchAll(arrayPattern)) {
    const arrayContent = match[1];
    for (const literal of arrayContent.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) parts.push(decodePdfLiteralText(literal[1]));
    for (const hex of arrayContent.matchAll(/<([0-9a-fA-F\s]+)>/g)) parts.push(decodePdfHexText(hex[1]));
  }

  return parts
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function isPdfBinaryResourceStream(dictionary: string) {
  return /\/Subtype\s*\/Image\b/i.test(dictionary) ||
    /\/FontFile\d?\b/i.test(dictionary) ||
    (/\/ColorSpace\b/i.test(dictionary) && /\/BitsPerComponent\b/i.test(dictionary));
}

function isUsefulPdfTextChunk(text: string) {
  const repaired = repairSpacedPdfText(text);
  if (!/[A-Za-z0-9_]{3,}/.test(repaired)) return false;
  if (/(?:IMSIM|HLRHLR|1-\*){12,}/.test(repaired)) return false;
  if (/\b(?:Environment Name|Installation artifacts|Installation Steps|Connection|Lookup|\.iar|\.csv)\b/i.test(repaired)) return true;
  const sample = repaired.slice(0, 2000);
  const printable = sample.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "").length;
  return printable / Math.max(sample.length, 1) > 0.45;
}

async function inflatePdfBytes(bytes: Uint8Array) {
  try {
    return await decompressBytes(bytes, "deflate");
  } catch {
    return decompressBytes(bytes, "deflate-raw");
  }
}

async function extractPdfTextFromBrowserFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder("latin1");
  const binary = decoder.decode(bytes);
  const chunks: string[] = [];
  let offset = 0;
  while (offset < binary.length) {
    const streamIndex = binary.indexOf("stream", offset);
    if (streamIndex < 0) break;
    let dataStart = streamIndex + "stream".length;
    if (binary[dataStart] === "\r" && binary[dataStart + 1] === "\n") dataStart += 2;
    else if (binary[dataStart] === "\n" || binary[dataStart] === "\r") dataStart += 1;
    const endIndex = binary.indexOf("endstream", dataStart);
    if (endIndex < 0) break;
    const dictionaryStart = Math.max(0, binary.lastIndexOf("<<", streamIndex));
    const dictionary = binary.slice(dictionaryStart, streamIndex);
    if (isPdfBinaryResourceStream(dictionary)) {
      offset = endIndex + "endstream".length;
      continue;
    }
    const raw = bytes.subarray(dataStart, endIndex);
    try {
      const data = /\/FlateDecode\b/.test(dictionary) ? await inflatePdfBytes(raw) : raw;
      const text = extractPdfTextOperators(decoder.decode(data));
      if (text && isUsefulPdfTextChunk(text)) chunks.push(text);
    } catch {
      // Ignore non-text streams.
    }
    offset = endIndex + "endstream".length;
  }
  return repairSpacedPdfText(Array.from(new Set(chunks))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxActionDocumentTextLength));
}

async function buildBrowserActionDocument(file: File): Promise<ActionSourceDocument> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".sql")) {
    return {
      path: "",
      name: file.name,
      kind: "sql",
      text: await file.text()
    };
  }
  if (lowerName.endsWith(".docx")) {
    const text = await extractDocxTextFromBrowserFile(file);
    return {
      path: "",
      name: file.name,
      kind: "docx",
      text,
      warning: text ? undefined : "No se pudo extraer texto del documento DOCX."
    };
  }
  const text = await extractPdfTextFromBrowserFile(file);
  return {
    path: "",
    name: file.name,
    kind: "pdf",
    text,
    warning: text ? undefined : "PDF cargado como referencia. No se detecto texto seleccionable; puede requerir OCR si es escaneado."
  };
}

function isDashboardSourceDocument(document: ActionSourceDocument) {
  return /\bdashboard\b|visual builder|cloud integration dashboard/i.test(`${document.name}\n${document.text.slice(0, 5000)}`);
}

function preferOperationalActionDocument(documents: ActionSourceDocument[]) {
  const selected = documents.find((document) => !isDashboardSourceDocument(document)) ?? documents[0];
  if (!selected) return null;
  const ignoredDocuments = documents
    .filter((document) => document !== selected)
    .map((document) => ({
      path: document.path,
      name: document.name,
      kind: document.kind,
      textLength: document.text.length,
      warning: document.warning,
      reason: isDashboardSourceDocument(document)
        ? "Dashboard / Visual Builder document ignored while selecting the primary operational IM090."
        : "Additional document not selected as the primary operational IM090."
    }));
  return ignoredDocuments.length ? { ...selected, ignoredDocuments } : selected;
}

function regionFromRepo(name: string) {
  const match = name.match(/BIMBO-(R\d)-REPOSITORY/i);
  return match?.[1] ?? "R?";
}

function classifyDroppedFile(path: string): SelectedFile["kind"] {
    const clean = path.toLowerCase();
    if (clean.endsWith(".iar")) return "integration";
    if (clean.endsWith(".par") || clean.endsWith(".jar")) return "package";
  if (clean.endsWith(".csv")) return "lookup";
  if (clean.endsWith(".xml") || clean.endsWith(".wsdl")) return "xml";
  if (clean.endsWith(".sql")) return "sql";
  return "other";
}

function isAllowedArtifact(path: string) {
  const clean = path.toLowerCase();
  return allowedArtifactExtensions.some((extension) => clean.endsWith(extension));
}

function pipelineInstanceFrom(instance: string) {
  return instance.trim().replace(/(TE|PR)$/i, "");
}

function trimExecutionStepTitle(value: string) {
  return value
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+(?:\.\d+)*\s*[-.)]\s*/, "")
    .replace(/^[a-z]\s*[-.)]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[:.]\s*$/, "")
    .trim();
}

function splitActionPlanSections(text: string) {
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^=+$/.test(line));
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^(\d+|[A-Z])\s*[-.)]\s*(.+)$/);
    if (heading) {
      current = { title: trimExecutionStepTitle(heading[2]), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}

function quotedValues(value: string) {
  return Array.from(value.matchAll(/["“]([^"”]+)["”]/g))
    .map((match) => match[1].trim())
    .filter((item) => item && !/^https?:\/\//i.test(item));
}

function replaceExecutionArtifact(value: string, currentArtifact: string | null, nextArtifact: string) {
  if (!nextArtifact.trim()) return value;
  if (currentArtifact && value.includes(currentArtifact)) {
    return value.split(currentArtifact).join(nextArtifact);
  }
  if (/search\s+for\b/i.test(value)) {
    return value.replace(/"[^"]+"/, `"${nextArtifact}"`);
  }
  return value;
}

type RepeatTarget = {
  label: string;
  ip?: string;
};

function extractRepeatTargets(text: string): RepeatTarget[] {
  const targets = text
    .split("\n")
    .map((line) => line.trim())
    .map((line): RepeatTarget | null => {
      const withIp = line.match(/^(.+?\((\d{1,3}(?:\.\d{1,3}){3})\).*)$/);
      if (withIp) return { label: withIp[1].replace(/\s*-+>\s*.*$/, "").trim(), ip: withIp[2] };
      const ipOnly = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
      if (ipOnly) return { label: line, ip: ipOnly[1] };
      return null;
    })
    .filter((target): target is RepeatTarget => Boolean(target));
  const byKey = new Map<string, RepeatTarget>();
  for (const target of targets) byKey.set(target.ip ?? target.label.toLowerCase(), target);
  return Array.from(byKey.values());
}

function firstIpFromSteps(steps: PipelineExecutionStep[]) {
  for (const step of steps) {
    const match = `${step.title}\n${step.detail}`.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    if (match) return match[1];
  }
  return null;
}

function replaceExecutionTarget(value: string, sourceIp: string | null, target: RepeatTarget) {
  return sourceIp && target.ip ? value.split(sourceIp).join(target.ip) : value;
}

function addExecutionTargetDetail(value: string, sourceIp: string | null, target: RepeatTarget) {
  return [replaceExecutionTarget(value, sourceIp, target), `Target node: ${target.label}`].filter(Boolean).join("\n");
}

function expandRepeatedExecutionSteps(steps: PipelineExecutionStep[]) {
  const output: PipelineExecutionStep[] = [];

  for (const step of steps) {
    const repeat = step.title.match(/\brepeat\s+(?:the\s+)?steps?(?:\s+from)?\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/i);
    const nextArtifact = quotedValues(`${step.title}\n${step.detail}`).at(-1);
    const repeatTargets = extractRepeatTargets(step.detail);
    if (!repeat || (!nextArtifact && !repeatTargets.length)) {
      output.push(step);
      continue;
    }

    const start = Number(repeat[1]);
    const end = Number(repeat[2] ?? repeat[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start || start > output.length) {
      output.push(step);
      continue;
    }

    const sourceSteps = output.slice(start - 1, Math.min(end, output.length));
    if (nextArtifact) {
      const currentArtifact = sourceSteps.flatMap((sourceStep) => quotedValues(`${sourceStep.title}\n${sourceStep.detail}`))[0] ?? null;
      for (const sourceStep of sourceSteps) {
        output.push({
          title: replaceExecutionArtifact(sourceStep.title, currentArtifact, nextArtifact),
          detail: replaceExecutionArtifact(sourceStep.detail, currentArtifact, nextArtifact)
        });
      }
      continue;
    }

    const sourceIp = firstIpFromSteps(sourceSteps);
    for (const target of repeatTargets) {
      for (const sourceStep of sourceSteps) {
        output.push({
          title: replaceExecutionTarget(sourceStep.title, sourceIp, target),
          detail: addExecutionTargetDetail(sourceStep.detail, sourceIp, target)
        });
      }
    }
  }

  return output;
}

function parseActionPlanExecutionSteps(text: string, fallbackSteps: readonly string[]): PipelineExecutionStep[] {
  const sections = splitActionPlanSections(text);
  const steps: PipelineExecutionStep[] = [];

  for (const section of sections) {
    const substeps: PipelineExecutionStep[] = [];
    let current: PipelineExecutionStep | null = null;
    for (const line of section.lines) {
      const substep = line.match(/^(\d+\.\d+|[a-z])\s*[-.)]\s*(.+)$/i);
      if (substep) {
        current = {
          title: trimExecutionStepTitle(substep[2]),
          detail: section.title
        };
        substeps.push(current);
        continue;
      }
      if (current && !/^(https?:\/\/|Pipeline >)/i.test(line)) {
        current.detail = [current.detail, line].filter(Boolean).join("\n");
      }
    }

    if (substeps.length) {
      steps.push(...substeps);
    } else if (section.title) {
      steps.push({
        title: section.title,
        detail: section.lines.join("\n")
      });
    }
  }

  const source = steps.length
    ? steps
    : fallbackSteps.map((title) => ({ title, detail: "" }));

  const seen = new Set<string>();
  const normalized = source
    .map((step) => ({
      title: trimExecutionStepTitle(step.title),
      detail: step.detail.trim()
    }))
    .filter((step) => step.title && !/^Action Plan$/i.test(step.title))
    .filter((step) => {
      const key = `${step.title}\n${step.detail}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return expandRepeatedExecutionSteps(normalized);
}

export function App() {
  const actionDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const executionPlanInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement | null>(null);
  const manualPhaseTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const executionDraftRef = useRef<ExecutionDraft | null>(readExecutionDraft());
  const initialExecutionDraft = executionDraftRef.current;
  const [activeStep, setActiveStep] = useState<StepId>("actionPlan");
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("lang") as Lang) || "es");
  const [documentLang, setDocumentLang] = useState<Lang>(() => (localStorage.getItem("documentLang") as Lang) || "en");
  const [outputFolder, setOutputFolder] = useState(() => localStorage.getItem("outputFolder") || "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("language");
  const [userDataConfirm, setUserDataConfirm] = useState("");
  const [userDataBackupPath, setUserDataBackupPath] = useState("");
  const [profileName, setProfileName] = useState(() => localStorage.getItem("profileName") || defaultProfile.name);
  const [profileEmail, setProfileEmail] = useState(() => localStorage.getItem("profileEmail") || defaultProfile.email);
  const [profilePhone, setProfilePhone] = useState(() => localStorage.getItem("profilePhone") || defaultProfile.phone);
  const [profileAvatarStyle, setProfileAvatarStyle] = useState(() => localStorage.getItem("profileAvatarStyle") || defaultProfile.avatarStyle);
  const [profileAvatarSeed, setProfileAvatarSeed] = useState(() => localStorage.getItem("profileAvatarSeed") || defaultProfile.avatarSeed);
  const [themeId, setThemeId] = useState<ThemeId>(() => (localStorage.getItem("themeId") as ThemeId) || "oracle");
  const [customThemeTone, setCustomThemeTone] = useState<ThemeTone>(() => {
    const storedTone = localStorage.getItem("customThemeTone");
    return storedTone === "dark" || storedTone === "light" ? storedTone : "light";
  });
  const [customGradient, setCustomGradient] = useState(
    () => localStorage.getItem("customGradient") || defaultCustomTheme.gradient
  );
  const [customColorA, setCustomColorA] = useState(() => localStorage.getItem("customColorA") || defaultCustomTheme.colorA);
  const [customColorB, setCustomColorB] = useState(() => localStorage.getItem("customColorB") || defaultCustomTheme.colorB);
  const [customColorC, setCustomColorC] = useState(() => localStorage.getItem("customColorC") || defaultCustomTheme.colorC);
  const [customPanelColor, setCustomPanelColor] = useState(() => localStorage.getItem("customPanelColor") || defaultCustomTheme.panel);
  const [customSidebar, setCustomSidebar] = useState(() => localStorage.getItem("customSidebar") || defaultCustomTheme.sidebar);
  const [uiSidebarColor, setUiSidebarColor] = useState(() => localStorage.getItem("uiSidebarColor") || defaultSidebarColor);
  const [sidebarTransparency, setSidebarTransparency] = useState(() => Number(localStorage.getItem("sidebarTransparency") || "0.94"));
  const [sidebarBlur, setSidebarBlur] = useState(() => Number(localStorage.getItem("sidebarBlur") || "0"));
  const [customAccent, setCustomAccent] = useState(() => localStorage.getItem("customAccent") || defaultCustomTheme.accent);
  const [themeTransparency, setThemeTransparency] = useState(() =>
    Number(localStorage.getItem("themeTransparency") || String(defaultCustomTheme.transparency))
  );
  const [themeBlur, setThemeBlur] = useState(() => Number(localStorage.getItem("themeBlur") || String(defaultCustomTheme.blur)));
  const [uiTextSize, setUiTextSize] = useState<UiTextSize>(readUiTextSize);
  const [uiBackgroundStyle, setUiBackgroundStyle] = useState<UiBackgroundStyle>(readUiBackgroundStyle);
  const [animatedBackground, setAnimatedBackground] = useState(() => localStorage.getItem("animatedBackground") === "true");
  const [uiAnimationSpeed, setUiAnimationSpeed] = useState<UiAnimationSpeed>(readUiAnimationSpeed);
  const [uiAnimationMotion, setUiAnimationMotion] = useState<UiAnimationMotion>(readUiAnimationMotion);
  const [customBackgroundImage, setCustomBackgroundImage] = useState(() => localStorage.getItem("customBackgroundImage") || "");
  const [backgroundImageBlur, setBackgroundImageBlur] = useState(() => Number(localStorage.getItem("backgroundImageBlur") || "10"));
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("executionHistory") || "[]");
    } catch {
      return [];
    }
  });
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingWorkSnapshots, setPendingWorkSnapshots] = useState<PendingWorkSnapshot[]>(readPendingWorkSnapshots);
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [converterSyncOpen, setConverterSyncOpen] = useState(false);
  const [knowledgeCatalog, setKnowledgeCatalog] = useState<RuntimeKnowledgeCatalog>(() => embeddedRuntimeKnowledge());
  const [remoteKnowledgeVersion, setRemoteKnowledgeVersion] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionDocumentProcessing, setActionDocumentProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [basePath, setBasePath] = useState(() => localStorage.getItem("basePath") || defaultBasePath);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneName, setCloneName] = useState("BIMBO-R2-REPOSITORY");
  const [repos, setRepos] = useState<RepositoryInfo[]>([]);
  const [repoPath, setRepoPath] = useState("");
  const [rfc, setRfc] = useState(initialExecutionDraft?.rfc ?? "");
  const [actionProduct, setActionProduct] = useState("");
  const [actionMethod, setActionMethod] = useState<ActionMethod>(readActionMethod);
  const [actionTemplateId, setActionTemplateId] = useState<ActionTemplateId>("auto");
  const [customActionTemplates, setCustomActionTemplates] = useState<CustomActionTemplate[]>(readCustomActionTemplates);
  const [customTemplateOpen, setCustomTemplateOpen] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplateProduct, setCustomTemplateProduct] = useState("Base de datos");
  const [customTemplateCategory, setCustomTemplateCategory] = useState("");
  const [customTemplateContent, setCustomTemplateContent] = useState("");
  const [actionEnvironment, setActionEnvironment] = useState("");
  const [availableDocumentEnvironments, setAvailableDocumentEnvironments] = useState<string[]>([]);
  const [actionInstance, setActionInstance] = useState("");
  const [actionActivity, setActionActivity] = useState("");
  const [actionScopeNotes, setActionScopeNotes] = useState("");
  const [artifactText, setArtifactText] = useState("");
  const [actionSourceDocument, setActionSourceDocument] = useState<ActionSourceDocument | null>(null);
  const [manualInstructions, setManualInstructions] = useState("");
  const [manualSourceText, setManualSourceText] = useState("");
  const [manualReviewOpen, setManualReviewOpen] = useState(false);
  const [manualPhaseIndex, setManualPhaseIndex] = useState(0);
  const [manualPhases, setManualPhases] = useState<ManualActionPhase[]>([]);
  const [manualPhaseDisabledKeys, setManualPhaseDisabledKeys] = useState<string[]>([]);
  const [manualPhaseSourceKey, setManualPhaseSourceKey] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [actionPlanConfirmed, setActionPlanConfirmed] = useState(false);
  const [actionPlanConfirmedAt, setActionPlanConfirmedAt] = useState("");
  const [supportOutputOpen, setSupportOutputOpen] = useState(false);
  const [supportOutputText, setSupportOutputText] = useState("");
  const [riceFolderPath, setRiceFolderPath] = useState("");
  const [mode, setMode] = useState<"ADHOC" | "FULL">("ADHOC");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<string[]>([]);
  const [artifactInspections, setArtifactInspections] = useState<ArtifactInspection[]>([]);
  const [actionArtifactModalOpen, setActionArtifactModalOpen] = useState(false);
  const [actionArtifactFiles, setActionArtifactFiles] = useState<SelectedFile[]>([]);
  const [isDraggingActionArtifacts, setIsDraggingActionArtifacts] = useState(false);
  const [expandedActionArtifactFiles, setExpandedActionArtifactFiles] = useState<string[]>([]);
  const [actionArtifactInspections, setActionArtifactInspections] = useState<ArtifactInspection[]>([]);
  const [summary, setSummary] = useState<DraftSummary | null>(null);
  const [finalOutput, setFinalOutput] = useState("");
  const [localCommitResult, setLocalCommitResult] = useState<FinalizeResult | null>(null);
  const [devTargetEnvironment, setDevTargetEnvironment] = useState(initialExecutionDraft?.devTargetEnvironment ?? "");
  const [regTargetEnvironment, setRegTargetEnvironment] = useState(initialExecutionDraft?.regTargetEnvironment ?? "");
  const [testTargetEnvironment, setTestTargetEnvironment] = useState(initialExecutionDraft?.testTargetEnvironment ?? "");
  const [prodTargetEnvironment, setProdTargetEnvironment] = useState(initialExecutionDraft?.prodTargetEnvironment ?? "");
  const [testPipelineName, setTestPipelineName] = useState(initialExecutionDraft?.testPipelineName ?? "");
  const [prodPipelineName, setProdPipelineName] = useState(initialExecutionDraft?.prodPipelineName ?? "");
  const [testPipelineRun, setTestPipelineRun] = useState(initialExecutionDraft?.testPipelineRun ?? "");
  const [prodPipelineRun, setProdPipelineRun] = useState(initialExecutionDraft?.prodPipelineRun ?? "");
  const [testPipelineRunUrl, setTestPipelineRunUrl] = useState(initialExecutionDraft?.testPipelineRunUrl ?? "");
  const [prodPipelineRunUrl, setProdPipelineRunUrl] = useState(initialExecutionDraft?.prodPipelineRunUrl ?? "");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(initialExecutionDraft?.executionMode ?? readExecutionMode());
  const [pipelineExecutionPhase, setPipelineExecutionPhase] = useState<PipelinePhase>(
    initialExecutionDraft?.pipelineExecutionPhase ?? "TEST"
  );
  const [pipelineActionPlan, setPipelineActionPlan] = useState(initialExecutionDraft?.pipelineActionPlan ?? "");
  const [executionSteps, setExecutionSteps] = useState<PipelineExecutionStep[]>(initialExecutionDraft?.executionSteps ?? []);
  const [executionStepsConfirmed, setExecutionStepsConfirmed] = useState(
    Boolean(initialExecutionDraft?.executionStepsConfirmed)
  );
  const [executionStepsReviewOpen, setExecutionStepsReviewOpen] = useState(
    !Boolean(initialExecutionDraft?.executionStepsConfirmed)
  );
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [executionSessionId, setExecutionSessionId] = useState(
    initialExecutionDraft?.sessionId ?? createClientId("execution")
  );
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>(initialExecutionDraft?.evidenceItems ?? []);
  const [evidenceLog, setEvidenceLog] = useState<EvidenceLog[]>(initialExecutionDraft?.evidenceLog ?? []);
  const [lastExportPath, setLastExportPath] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [prodMessageOpen, setProdMessageOpen] = useState(false);
  const [pipelineStepIndex, setPipelineStepIndex] = useState(initialExecutionDraft?.pipelineStepIndex ?? 0);
  const [pipelineStepComments, setPipelineStepComments] = useState<Record<string, string>>(
    initialExecutionDraft?.pipelineStepComments ?? {}
  );
  const [pipelineStepFailures, setPipelineStepFailures] = useState<Record<string, boolean>>(
    initialExecutionDraft?.pipelineStepFailures ?? {}
  );
  const [imagePreview, setImagePreview] = useState<EvidenceItem | null>(null);
  const [instantTooltip, setInstantTooltip] = useState<InstantTooltip | null>(null);

  const t = copy[lang];
  const e = envCopy[lang];
  const a = actionCopy[lang];
  const activeThemeTone = themeId === "custom" ? customThemeTone : themeTone[themeId];
  const generatedCustomGradient = `linear-gradient(135deg, ${customColorA} 0%, ${customColorB} 52%, ${customColorC} 100%)`;
  const resetThemePersonalization = () => {
    setUiSidebarColor(defaultSidebarColor);
    setSidebarTransparency(0.94);
    setSidebarBlur(0);
    setUiBackgroundStyle("default");
    setAnimatedBackground(false);
    setUiAnimationSpeed("medium");
    setUiAnimationMotion("drift");
    setCustomBackgroundImage("");
    setBackgroundImageBlur(10);
  };
  const resetCustomTheme = () => {
    setThemeId("custom");
    setCustomThemeTone("light");
    setCustomColorA(defaultCustomTheme.colorA);
    setCustomColorB(defaultCustomTheme.colorB);
    setCustomColorC(defaultCustomTheme.colorC);
    setCustomPanelColor(defaultCustomTheme.panel);
    setCustomSidebar(defaultCustomTheme.sidebar);
    setUiSidebarColor(defaultCustomTheme.sidebar);
    setSidebarTransparency(0.94);
    setSidebarBlur(0);
    setCustomAccent(defaultCustomTheme.accent);
    setThemeTransparency(defaultCustomTheme.transparency);
    setThemeBlur(defaultCustomTheme.blur);
    setUiBackgroundStyle("default");
    setAnimatedBackground(false);
    setUiAnimationSpeed("medium");
    setUiAnimationMotion("drift");
    setCustomBackgroundImage("");
    setBackgroundImageBlur(10);
    setCustomGradient(defaultCustomTheme.gradient);
  };
  const applyCustomSeedFromTheme = (sourceTheme: ThemeId) => {
    const seeds: Record<ThemeId, { a: string; b: string; c: string; panel: string; sidebar: string; accent: string }> = {
      oracle: { a: "#f6f7f9", b: "#f4f1ef", c: "#ffffff", panel: "#ffffff", sidebar: "#312d2a", accent: "#c74634" },
      pastel: { a: "#d5c2ff", b: "#a6d7ff", c: "#f7b6fb", panel: "#ffffff", sidebar: "#384c9b", accent: "#238cff" },
      frosted: { a: "#90989e", b: "#4c5661", c: "#151c26", panel: "#151c26", sidebar: "#0b1018", accent: "#ffb15d" },
      glass: { a: "#fff7f4", b: "#eef6ff", c: "#f8f1ff", panel: "#ffffff", sidebar: "#312d2a", accent: "#c74634" },
      midnight: { a: "#15110f", b: "#28202d", c: "#102737", panel: "#1e1720", sidebar: "#14110f", accent: "#d95d4c" },
      dracula: { a: "#1e1f29", b: "#282a36", c: "#3b2f4a", panel: "#282a36", sidebar: "#282a36", accent: "#ff5555" },
      cobalt: { a: "#071629", b: "#102a43", c: "#075985", panel: "#102a43", sidebar: "#071629", accent: "#ffc857" },
      nord: { a: "#242933", b: "#2e3440", c: "#3b4252", panel: "#2e3440", sidebar: "#2e3440", accent: "#88c0d0" },
      solarized: { a: "#fdf6e3", b: "#eee8d5", c: "#d8e7df", panel: "#fdf6e3", sidebar: "#073642", accent: "#268bd2" },
      sunset: { a: "#fff8ed", b: "#f6e6d8", c: "#e7eef7", panel: "#ffffff", sidebar: "#2b2420", accent: "#c74634" },
      sage: { a: "#f7fbf2", b: "#e8f2e6", c: "#dcece9", panel: "#ffffff", sidebar: "#21362d", accent: "#3f7d5c" },
      rose: { a: "#fff7fb", b: "#f8e3eb", c: "#edf1ff", panel: "#ffffff", sidebar: "#3a2530", accent: "#b64f72" },
      graphite: { a: "#101418", b: "#1f2937", c: "#111827", panel: "#1f2937", sidebar: "#101418", accent: "#f59e0b" },
      ocean: { a: "#061b24", b: "#0f2f3a", c: "#164e63", panel: "#0f2f3a", sidebar: "#061b24", accent: "#22d3ee" },
      nordDark: { a: "#1f242f", b: "#2e3440", c: "#3b4252", panel: "#2e3440", sidebar: "#1b2029", accent: "#88c0d0" },
      solarizedDark: { a: "#002b36", b: "#073642", c: "#0b3f4a", panel: "#073642", sidebar: "#00212a", accent: "#2aa198" },
      halloween: { a: "#120b16", b: "#2b1234", c: "#3a1d09", panel: "#2b1234", sidebar: "#160d1c", accent: "#ff8a00" },
      cyberpunk: { a: "#120022", b: "#25104b", c: "#001f3f", panel: "#25104b", sidebar: "#10001f", accent: "#ff2bd6" },
      nightowl: { a: "#011627", b: "#0b2942", c: "#152b4a", panel: "#0b2942", sidebar: "#01111f", accent: "#82aaff" },
      custom: { a: customColorA, b: customColorB, c: customColorC, panel: customPanelColor, sidebar: uiSidebarColor, accent: customAccent }
    };
    const seed = seeds[sourceTheme];
    setCustomThemeTone(themeTone[sourceTheme]);
    setCustomColorA(seed.a);
    setCustomColorB(seed.b);
    setCustomColorC(seed.c);
    setCustomPanelColor(seed.panel);
    setUiSidebarColor(seed.sidebar);
    setCustomSidebar(seed.sidebar);
    setCustomAccent(seed.accent);
    setCustomGradient(`linear-gradient(135deg, ${seed.a} 0%, ${seed.b} 52%, ${seed.c} 100%)`);
  };
  const selectTheme = (theme: ThemeId) => {
    if (theme === "custom" && themeId !== "custom") applyCustomSeedFromTheme(themeId);
    if (theme !== "custom") resetThemePersonalization();
    setThemeId(theme);
  };
  const backgroundAnimationDuration = uiAnimationSpeed === "slow" ? "28s" : uiAnimationSpeed === "fast" ? "8s" : "14s";
  const appStyle = {
    ...(themeId === "custom"
      ? {
          "--custom-gradient": customGradient || generatedCustomGradient,
          "--custom-bg-a": customColorA,
          "--custom-bg-b": customColorB,
          "--custom-bg-c": customColorC,
          "--custom-panel-color": customPanelColor,
          "--custom-panel-rgb": hexToRgbString(customPanelColor),
          "--custom-sidebar": uiSidebarColor,
          "--oracle-red": customAccent,
          "--oracle-red-dark": customAccent,
          "--custom-panel-alpha": String(themeTransparency),
          "--custom-blur": `${themeBlur}px`
        }
      : {}),
    "--custom-background-image": customBackgroundImage ? `url(${customBackgroundImage})` : "none",
    "--background-image-blur": `${backgroundImageBlur}px`,
    "--bg-animation-duration": backgroundAnimationDuration,
    "--sidebar-bg": uiSidebarColor,
    "--sidebar-alpha": `${Math.round(sidebarTransparency * 100)}%`,
    "--sidebar-blur": `${sidebarBlur}px`
  } as CSSProperties;
  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.path === repoPath) ?? null,
    [repos, repoPath]
  );
  const filteredExecutionHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return executionHistory;
    return executionHistory.filter((item) =>
      [item.rfc, item.phase, item.kind, item.path].some((value) => value.toLowerCase().includes(query))
    );
  }, [executionHistory, historySearch]);
  const converterTechnologies = knowledgeCatalog.products;
  const converterRuleSummaries = useMemo(
    () => new Map((knowledgeCatalog.rules?.products ?? []).map((rule) => [rule.id, rule])),
    [knowledgeCatalog.rules]
  );
  const actionTemplateOptions = useMemo<ActionTemplateOption[]>(
    () => knowledgeCatalog.templates as ActionTemplateOption[],
    [knowledgeCatalog.templates]
  );
  function runtimeConfigurationItemsForProduct(productName: string, text: string) {
    const externalItems = externalConfigurationItemsForProduct(productName, text, knowledgeCatalog.rules);
    if (externalItems?.length) return externalItems;
    return configurationItemsForProduct(productName, text);
  }
  function runtimeManualPhasesForProduct(productName: string, text: string, environment: string) {
    const phases = buildManualPhasesForProduct(productName, text, environment);
    return applyExternalPhaseModel(phases, externalPhaseModelForProduct(productName, knowledgeCatalog.rules));
  }
  const customTemplateOptions = useMemo<ActionTemplateOption[]>(
    () => customActionTemplates
      .filter((template) => template.active !== false)
      .map((template) => ({
        id: template.id,
        product: template.product,
        label: `Custom - ${template.name}`,
        hint: [
          `Custom template reference: ${template.name}`,
          template.category ? `Category: ${template.category}` : "",
          template.content
        ].filter(Boolean).join("\n\n"),
        custom: true
      })),
    [customActionTemplates]
  );
  const allActionTemplateOptions = useMemo<ActionTemplateOption[]>(
    () => [...actionTemplateOptions, ...customTemplateOptions],
    [actionTemplateOptions, customTemplateOptions]
  );
  const visibleActionTemplateOptions = useMemo(
    () => allActionTemplateOptions.filter((option) => actionTemplateMatchesProduct(option.id, actionProduct, allActionTemplateOptions)),
    [actionProduct, allActionTemplateOptions]
  );
  const historyTotalPages = Math.max(1, Math.ceil(filteredExecutionHistory.length / historyPageSize));
  const visibleExecutionHistory = filteredExecutionHistory.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );
  const readyForDraft = Boolean(repoPath && rfc.trim() && riceFolderPath.trim() && files.length);
  const canCommit = Boolean(summary && readyForDraft && summary.filesToCopy.length > 0);
  const canPushBranch = Boolean(localCommitResult?.ok && localCommitResult.branch === rfc.trim());
  const isProdPipelineStep = pipelineExecutionPhase === "PROD";
  const trackingEnvironment = pipelineExecutionPhase;
  const pipelineBody = isProdPipelineStep
    ? t.pipeline.bodyProd
    : t.pipeline.bodyTest.replace(/\bTEST\b/g, pipelineExecutionPhase);
  const targetEnvironment =
    pipelineExecutionPhase === "DEV"
      ? devTargetEnvironment
      : pipelineExecutionPhase === "REG"
        ? regTargetEnvironment
        : pipelineExecutionPhase === "PROD"
          ? prodTargetEnvironment
          : testTargetEnvironment;
  const setTargetEnvironmentForPhase = (value: string) => {
    if (pipelineExecutionPhase === "DEV") {
      setDevTargetEnvironment(value);
      return;
    }
    if (pipelineExecutionPhase === "REG") {
      setRegTargetEnvironment(value);
      return;
    }
    if (pipelineExecutionPhase === "PROD") {
      setProdTargetEnvironment(value);
      return;
    }
    setTestTargetEnvironment(value);
  };
  const executionActionPlan = executionMode === "cicd" ? "" : pipelineActionPlan.trim();
  const hasExecutionActionPlan = executionMode === "cicd" || Boolean(executionActionPlan.trim());
  const parsedExecutionSteps = useMemo(
    () => (executionActionPlan.trim() ? parseActionPlanExecutionSteps(executionActionPlan, t.pipeline.steps) : []),
    [executionActionPlan, t.pipeline.steps]
  );
  const currentPipelineSteps = useMemo(
    () => {
      if (executionMode === "cicd") return cicdExecutionSteps;
      return executionStepsConfirmed ? executionSteps : [];
    },
    [executionMode, executionSteps, executionStepsConfirmed]
  );
  const defaultPipelineName = `${(selectedRepo?.name ?? "BIMBO-R2-REPOSITORY").replace("BIMBO-", "").replace("-REPOSITORY", "")}-${pipelineInstanceFrom(actionInstance)}-OIC-DEPLOYMENT_PIPELINE`;
  const pipelineNameValue = isProdPipelineStep ? prodPipelineName : testPipelineName;
  const pipelineRunValue = isProdPipelineStep ? prodPipelineRun : testPipelineRun;
  const pipelineRunUrlValue = isProdPipelineStep ? prodPipelineRunUrl : testPipelineRunUrl;
  const pipelineDisplayName = pipelineNameValue.trim() || defaultPipelineName;
  const pipelineDisplayUrl =
    pipelineRunUrlValue.trim() ||
    (pipelineRunValue.trim()
      ? `${projectUrl}/cibuild/pipelines/${pipelineDisplayName}/runs/${pipelineRunValue.trim()}`
      : "");
  const artifactCount = files.length || artifactLinesFromText(artifactText).length;
  const currentPendingWorkSnapshot = useMemo<PendingWorkSnapshot | null>(() => {
    const currentRfc = rfc.trim();
    if (!currentRfc) return null;
    const hasMeaningfulWork = Boolean(
      repoPath ||
      actionProduct ||
      actionTemplateId !== "auto" ||
      actionEnvironment ||
      actionInstance ||
      actionActivity.trim() ||
      actionScopeNotes.trim() ||
      artifactText.trim() ||
      actionPlan.trim() ||
      manualInstructions.trim() ||
      manualSourceText.trim() ||
      manualPhases.length ||
      riceFolderPath.trim() ||
      files.length ||
      devTargetEnvironment.trim() ||
      regTargetEnvironment.trim() ||
      testTargetEnvironment.trim() ||
      prodTargetEnvironment.trim() ||
      testPipelineName.trim() ||
      prodPipelineName.trim() ||
      testPipelineRun.trim() ||
      prodPipelineRun.trim() ||
      testPipelineRunUrl.trim() ||
      prodPipelineRunUrl.trim() ||
      pipelineActionPlan.trim() ||
      actionPlanConfirmed ||
      executionSteps.length ||
      executionStepsConfirmed ||
      evidenceItems.length
    );
    if (!hasMeaningfulWork) return null;
    const environmentValue = targetEnvironment || actionEnvironment || actionInstance;
    const stepName = executionMode === "cicd"
      ? t.steps.pipeline[0]
      : executionStepsConfirmed
        ? t.pipeline.checklist
        : actionPlanConfirmed
          ? a.confirmed
        : t.steps.actionPlan[0];
    const currentStep = executionMode === "cicd"
      ? "pipeline"
      : executionStepsConfirmed || pipelineActionPlan.trim() || actionPlanConfirmed
        ? "pipeline"
        : "actionPlan";
    const pendingLabels = [
      selectedRepo ? "" : t.caseFile.repo,
      environmentValue ? "" : t.caseFile.environment,
      artifactCount ? "" : t.caseFile.artifacts,
      actionPlan.trim() || pipelineActionPlan.trim() ? "" : t.steps.actionPlan[0],
      evidenceItems.length ? "" : t.evidence.title
    ].filter(Boolean);
    return {
      id: `rfc-${currentRfc}`,
      rfc: currentRfc,
      repository: selectedRepo?.name ?? t.caseFile.pending,
      environment: environmentValue || t.caseFile.pending,
      artifacts: artifactCount ? String(artifactCount) : t.caseFile.pending,
      product: actionProduct || t.caseFile.pending,
      method: actionMethod.toUpperCase(),
      stepName,
      currentStep,
      actionPlanReady: Boolean(actionPlan.trim() || pipelineActionPlan.trim()),
      executionStepsReady: executionMode === "cicd" || executionStepsConfirmed,
      evidenceCount: evidenceItems.length,
      pendingLabels,
      updatedAt: new Date().toISOString(),
      draft: {
        repoPath,
        outputFolder,
        rfc: currentRfc,
        actionProduct,
        actionMethod,
        actionTemplateId,
        actionEnvironment,
        actionInstance,
        actionActivity,
        actionScopeNotes,
        artifactText,
        actionPlan,
        actionPlanConfirmed,
        actionPlanConfirmedAt,
        manualInstructions,
        manualSourceText,
        manualPhases,
        manualPhaseDisabledKeys,
        riceFolderPath,
        mode,
        files,
        devTargetEnvironment,
        regTargetEnvironment,
        testTargetEnvironment,
        prodTargetEnvironment,
        testPipelineName,
        prodPipelineName,
        testPipelineRun,
        prodPipelineRun,
        testPipelineRunUrl,
        prodPipelineRunUrl,
        executionMode,
        pipelineExecutionPhase,
        pipelineActionPlan,
        executionSteps,
        executionStepsConfirmed,
        pipelineStepIndex,
        pipelineStepComments,
        pipelineStepFailures
      }
    };
  }, [a.confirmed, actionActivity, actionEnvironment, actionInstance, actionMethod, actionPlan, actionPlanConfirmed, actionPlanConfirmedAt, actionProduct, actionScopeNotes, actionTemplateId, artifactCount, artifactText, devTargetEnvironment, evidenceItems.length, executionMode, executionSteps, executionStepsConfirmed, files, manualInstructions, manualPhaseDisabledKeys, manualPhases, manualSourceText, mode, outputFolder, pipelineActionPlan, pipelineExecutionPhase, pipelineStepComments, pipelineStepFailures, pipelineStepIndex, prodPipelineName, prodPipelineRun, prodPipelineRunUrl, prodTargetEnvironment, regTargetEnvironment, repoPath, rfc, riceFolderPath, selectedRepo?.name, t.caseFile.artifacts, t.caseFile.environment, t.caseFile.pending, t.caseFile.repo, t.evidence.title, t.pipeline.checklist, t.steps.actionPlan, t.steps.pipeline, targetEnvironment, testPipelineName, testPipelineRun, testPipelineRunUrl, testTargetEnvironment]);
  const pendingWorkItems = useMemo(() => pendingWorkSnapshots.filter((item) => {
    const draft = item.draft;
    if (!draft) return true;
    return Boolean(
      draft.repoPath ||
      draft.actionProduct ||
      draft.actionEnvironment ||
      draft.actionInstance ||
      draft.actionActivity.trim() ||
      draft.actionScopeNotes?.trim() ||
      draft.artifactText.trim() ||
      draft.actionPlan.trim() ||
      draft.manualInstructions.trim() ||
      draft.manualSourceText?.trim() ||
      draft.manualPhases.length ||
      draft.riceFolderPath.trim() ||
      draft.files.length ||
      draft.devTargetEnvironment?.trim() ||
      draft.regTargetEnvironment?.trim() ||
      draft.testTargetEnvironment.trim() ||
      draft.prodTargetEnvironment.trim() ||
      draft.testPipelineName.trim() ||
      draft.prodPipelineName.trim() ||
      draft.testPipelineRun.trim() ||
      draft.prodPipelineRun.trim() ||
      draft.testPipelineRunUrl.trim() ||
      draft.prodPipelineRunUrl.trim() ||
      draft.pipelineActionPlan.trim() ||
      draft.executionSteps.length ||
      draft.executionStepsConfirmed ||
      Object.values(draft.pipelineStepFailures ?? {}).some(Boolean)
    );
  }), [pendingWorkSnapshots]);
  const hasHiddenEmptyPendingWork = pendingWorkItems.length !== pendingWorkSnapshots.length;
  const filteredPendingWorkItems = useMemo(() => {
    const query = pendingSearch.trim().toLowerCase();
    if (!query) return pendingWorkItems;
    return pendingWorkItems.filter((item) =>
      [
        item.rfc,
        item.repository,
        item.environment,
        item.artifacts,
        item.product,
        item.method,
        item.stepName,
        item.pendingLabels.join(" ")
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [pendingSearch, pendingWorkItems]);
  const pendingTotalPages = Math.max(1, Math.ceil(filteredPendingWorkItems.length / historyPageSize));
  const visiblePendingWorkItems = filteredPendingWorkItems.slice(
    (pendingPage - 1) * historyPageSize,
    pendingPage * historyPageSize
  );
  function buildPipelineRfcMessage(language: Lang) {
    const pendingRun = language === "en" ? "<run pending>" : language === "pt" ? "<run pendente>" : "<run pendiente>";
    const prodClose =
      language === "en"
        ? "PROD execution recorded. Validate the result and share final evidence."
        : language === "pt"
          ? "Execucao PROD registrada. Validar resultado e compartilhar evidencia final."
          : "Ejecucion PROD registrada. Validar resultado y compartir evidencia final.";
    const testClose =
      language === "en"
        ? "TEST execution recorded. For PROD, continue this flow using the same artifacts validated in TEST."
        : language === "pt"
          ? "Execucao TEST registrada. Para PROD, continuar este fluxo usando os mesmos artefatos validados em TEST."
          : "Ejecucion TEST registrada. Para PROD, retomar este flujo usando los mismos artefactos validados en TEST.";
    return `Pipeline > ${pipelineDisplayName} > ${pipelineRunValue.trim() || pendingRun}${pipelineDisplayUrl ? `\n${pipelineDisplayUrl}` : ""}\n\n${
      isProdPipelineStep ? prodClose : testClose
    }`;
  }
  const pipelineRfcMessage = buildPipelineRfcMessage(lang);
  const documentPipelineRfcMessage = buildPipelineRfcMessage(documentLang);
  const pipelineSearchName = pipelineDisplayName.replace(/^R\d+-/, "").replace(/-OIC-DEPLOYMENT_PIPELINE$/i, "");
  const prodContinuationMessage = [
    `1. Login to ${projectUrl}`,
    "2. Validate the necessary connections and devices in the production environment.",
    "3. Click on Builds.",
    "4. Click on Pipelines.",
    `5. Search "${pipelineSearchName || "<Pipeline search>"}".`,
    `6. Pipeline > ${pipelineDisplayName || "<Pipeline>"} > ${pipelineRunValue.trim() || "<Run>"}`,
    `   ${pipelineDisplayUrl || "<Run URL>"}`,
    "7. Validate the installation of the integrations."
  ].join("\n");
  const currentPipelineStep = currentPipelineSteps[pipelineStepIndex] ?? currentPipelineSteps[0];
  const isPipelineTrackingStep = activeStep === "pipeline";
  const isFinalPipelineStep = pipelineStepIndex === currentPipelineSteps.length - 1;
  const pipelineStepKey = `${activeStep}-${trackingEnvironment}-${pipelineStepIndex}`;
  const failedPipelineStepIndex = currentPipelineSteps.findIndex(
    (_, index) => pipelineStepFailures[`${activeStep}-${trackingEnvironment}-${index}`]
  );
  const currentRfc = rfc.trim();
  const matchesCurrentRfc = (recordRfc?: string, text = "") => {
    if (!currentRfc) return !recordRfc;
    if (recordRfc) return recordRfc === currentRfc;
    return text.includes(currentRfc);
  };
  const matchesCurrentExecution = (recordRfc?: string, text = "", sessionId?: string) => {
    if (sessionId) return sessionId === executionSessionId;
    if (recordRfc) return !currentRfc || recordRfc === currentRfc;
    if (activeStep === "pipeline") return true;
    return matchesCurrentRfc(recordRfc, text);
  };
  const sortEvidenceDescending = (items: EvidenceItem[]) =>
    items.slice().sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const currentStepEvidence = sortEvidenceDescending(
    evidenceItems.filter(
      (item) =>
        item.step === activeStep &&
        matchesCurrentExecution(item.rfc, "", item.sessionId) &&
        item.pipelineStep === pipelineStepIndex &&
        (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
    )
  );
  const currentStepComment = pipelineStepComments[pipelineStepKey]?.trim() ?? "";
  const currentStepFailed = Boolean(pipelineStepFailures[pipelineStepKey]);
  const canExportCurrentEvidence = isFinalPipelineStep || currentStepFailed;
  const currentStepComplete = Boolean(currentStepComment || currentStepEvidence.length || currentStepFailed);
  const evidenceFormReady =
    activeStep !== "pipeline" ||
    Boolean(currentRfc && targetEnvironment.trim() && hasExecutionActionPlan && currentPipelineSteps.length && currentPipelineStep);
  const inspectionByPath = useMemo(
    () => new Map(artifactInspections.map((inspection) => [inspection.filePath, inspection])),
    [artifactInspections]
  );
  const actionInspectionByPath = useMemo(
    () => new Map(actionArtifactInspections.map((inspection) => [inspection.filePath, inspection])),
    [actionArtifactInspections]
  );
  const actionArtifactRows = useMemo(
    () => actionArtifactComparisonRows(),
    [actionSourceDocument, actionScopeNotes, artifactText, manualInstructions, manualSourceText, actionArtifactFiles, actionArtifactInspections]
  );
  const activeStepLog = evidenceLog.filter(
    (entry) => entry.step === activeStep && matchesCurrentExecution(entry.rfc, entry.text, entry.sessionId)
  );

  function fileBadge(kind: SelectedFile["kind"]) {
    if (kind === "integration") return ".iar";
    if (kind === "package") return ".par";
    if (kind === "lookup") return "lookup";
    if (kind === "xml") return ".xml";
    if (kind === "sql") return ".sql";
    return t.badgeOther;
  }

  function isInspectableArtifact(file: SelectedFile) {
    return file.kind === "integration" || file.kind === "package";
  }

  function componentBadge(kind: ArtifactInspection["components"][number]["kind"]) {
    if (kind === "connection") return "Conexion";
    if (kind === "schedule") return "Scheduler";
    if (kind === "pipeline") return "Pipeline";
    if (kind === "proxyService") return "Proxy Service";
    if (kind === "businessService") return "Business Service";
    if (kind === "serviceAccount") return "Service Account";
    return "DVM";
  }

  function artifactInspectionStatus(file: SelectedFile, inspection?: ArtifactInspection) {
    if (!isInspectableArtifact(file)) return { state: "exists", label: "Existe" };
    if (!inspection) return { state: "pending", label: "Pendiente" };
    if (inspection.kind === "error") return { state: "missing", label: "No existe" };
    const hasDetectedContent = inspection.projects.length > 0 || inspection.components.length > 0 || inspection.entries.length > 0 || Boolean(inspection.internalArtifacts?.length);
    return hasDetectedContent ? { state: "exists", label: "Existe" } : { state: "missing", label: "No detectado" };
  }

  function actionArtifactInspectionStatus(file: SelectedFile, inspection?: ArtifactInspection) {
    const status = artifactInspectionStatus(file, inspection);
    const labelMap = {
      exists: a.artifactExists,
      missing: status.label === "No detectado" ? "No detectado" : a.artifactMissing,
      pending: a.artifactPending
    };
    return { ...status, label: labelMap[status.state as keyof typeof labelMap] };
  }

  function normalizeArtifactCompareKey(value: string) {
    return normalizeEnvironmentName(
      value
        .replace(/\.(?:iar|par|xml|wsdl|csv|zip|jar|sql)$/i, "")
        .replace(/_\d{2}[._]\d{2}[._]\d{4}$/i, "")
        .replace(/\bV(?:ERSION)?\d+$/i, "")
    );
  }

  function artifactDisplayName(value: string) {
    return value
      .replace(/\.(?:iar|par|xml|wsdl|csv|zip|jar|sql)$/i, "")
      .replace(/_\d{2}[._]\d{2}[._]\d{4}$/i, "");
  }

  function artifactVersionFromName(value: string) {
    const match = value.match(/_(\d{2}[._]\d{2}[._]\d{4})(?:\.(?:iar|par|xml|wsdl|csv|zip|jar|sql))?$/i);
    return match?.[1]?.replace(/_/g, ".") ?? undefined;
  }

  function artifactInspectionTextForPlan(inspections = actionArtifactInspections) {
    const lines: string[] = [];
    for (const inspection of inspections) {
      lines.push(`Artifact file: ${inspection.fileName}`);
      for (const project of inspection.projects) {
        lines.push(`Integration: ${[project.code, project.name, project.version].filter(Boolean).join(" | ")}`);
      }
      for (const component of inspection.components) {
        lines.push(`${component.kind}: ${component.name}`);
        lines.push(`Component path: ${component.path}`);
      }
      for (const entry of inspection.entries.filter((item) => /\.(?:Pipeline|BusinessService|ServiceAccount)$/i.test(item))) {
        lines.push(`Package entry: ${entry}`);
      }
      for (const internalArtifact of inspection.internalArtifacts ?? []) {
        lines.push(`Artifact file: ${internalArtifact.name}`);
        for (const project of internalArtifact.projects) {
          lines.push(`Integration: ${[project.code, project.name, project.version].filter(Boolean).join(" | ")}`);
        }
        for (const component of internalArtifact.components) {
          lines.push(`${component.kind}: ${component.name}`);
          lines.push(`Component path: ${component.path}`);
        }
      }
    }
    return lines.filter(Boolean).join("\n");
  }

  function manualDetectionSourceText() {
    const documentText = actionSourceDocument?.text?.trim() || "";
    const editedText = manualInstructions.trim();
    const sourceText = documentText && editedText && editedText !== documentText
      ? `${documentText}\n\nRFC complementary instructions:\n${editedText}`
      : documentText || manualSourceText.trim() || editedText;
    const templateHint = actionTemplateId === "auto" ? "" : actionTemplateHint(actionTemplateId, allActionTemplateOptions);
    if (actionProduct === "Base de datos" || actionProduct === "OSB" || actionProduct === "OIC" || actionProduct === "MFT") {
      const loadedArtifactText = actionArtifactFiles.map((file) => file.name).join("\n");
      const targetInstanceText = actionInstance.trim() ? `Target instance: ${actionInstance.trim()}` : "";
      return [templateHint, actionActivity, targetInstanceText, actionScopeNotes, sourceText, artifactText, loadedArtifactText, artifactInspectionTextForPlan()]
        .filter((value) => value.trim())
        .join("\n\n");
    }
    return [templateHint, actionScopeNotes, sourceText].filter((value) => value.trim()).join("\n\n");
  }

  function manualPhaseSourceKeyFor(text: string, environment = actionEnvironment, product = actionProduct) {
    return [product || "<product>", environment || "<environment>", text.length, stableTextHash(text)].join("|");
  }

  function manualPhasesAreCurrent(text = manualDetectionSourceText()) {
    return Boolean(manualPhases.length && manualPhaseSourceKey === manualPhaseSourceKeyFor(text));
  }

  function actionDocumentArtifactNames() {
    const entered = artifactLinesFromText(artifactText);
    const sourceText = manualDetectionSourceText();
    const ignoreOicLookups = actionProduct === "OIC" && oicManualScopeIgnoresLookups(sourceText);
    const filterOicLookupArtifacts = (items: string[]) =>
      ignoreOicLookups ? items.filter((item) => !/\.csv$/i.test(item)) : items;
    const filterOicArtifacts = (items: string[]) =>
      actionProduct === "OIC" ? preferCanonicalOicIarArtifacts(filterOicLookupArtifacts(items)) : filterOicLookupArtifacts(items);
    const enteredFiltered = filterOicLookupArtifacts(entered);
    const enteredInstallable = filterOicArtifacts(installableArtifactNames(artifactText));
    const installableArtifacts = filterOicArtifacts(installableArtifactNames(sourceText));
    const combinedInstallable = actionProduct === "OIC"
      ? Array.from(
          new Map(
            [...enteredInstallable, ...installableArtifacts].map((item) => [
              normalizeArtifactCompareKey(item),
              item
            ])
          ).values()
        )
      : enteredInstallable;
    const detected = enteredFiltered.length
      ? combinedInstallable.length
        ? combinedInstallable
        : !installableArtifacts.length
          ? enteredFiltered
          : installableArtifacts
      : installableArtifacts.length
        ? installableArtifacts
        : filterOicArtifacts(extractArtifactNames(sourceText, { includeComponentNames: true }));
    return Array.from(new Map(detected.map((item) => [normalizeArtifactCompareKey(item), item])).values());
  }

  function actionLoadedArtifactItems() {
    const items: Array<{ name: string; version?: string; source: string }> = [];
    for (const file of actionArtifactFiles) {
      items.push({ name: artifactDisplayName(file.name), version: artifactVersionFromName(file.name), source: file.name });
    }
    for (const inspection of actionArtifactInspections) {
      for (const project of inspection.projects) {
        if (project.code) items.push({ name: project.code, version: project.version, source: inspection.fileName });
        if (project.name) items.push({ name: project.name, version: project.version, source: inspection.fileName });
      }
      for (const internalArtifact of inspection.internalArtifacts ?? []) {
        items.push({ name: artifactDisplayName(internalArtifact.name), version: artifactVersionFromName(internalArtifact.name), source: inspection.fileName });
        for (const project of internalArtifact.projects) {
          if (project.code) items.push({ name: project.code, version: project.version, source: internalArtifact.name });
          if (project.name) items.push({ name: project.name, version: project.version, source: internalArtifact.name });
        }
        for (const component of internalArtifact.components) {
          items.push({ name: component.name, source: internalArtifact.name });
        }
      }
      for (const component of inspection.components) {
        items.push({ name: component.name, source: inspection.fileName });
      }
    }
    return Array.from(new Map(items.map((item) => [`${normalizeArtifactCompareKey(item.name)}-${item.source}`, item])).values());
  }

  function actionArtifactComparisonRows() {
    const sourceText = manualDetectionSourceText();
    if (actionProduct === "OIC" && runtimeConfigurationItemsForProduct(actionProduct, sourceText).length && !installableArtifactNames(sourceText).length) {
      return [];
    }
    const documentItems = actionDocumentArtifactNames();
    const loadedItems = actionLoadedArtifactItems();
    const matchedKeys = new Set<string>();
    const rows = documentItems.map((documentName) => {
      const documentKey = normalizeArtifactCompareKey(documentName);
      const match = loadedItems.find((item) => {
        const loadedKey = normalizeArtifactCompareKey(item.name);
        const isMatch = artifactKeysMatch(documentKey, loadedKey);
        if (isMatch) matchedKeys.add(`${loadedKey}-${item.source}`);
        return isMatch;
      });
      return {
        documentName,
        artifactName: match?.name ?? "-",
        version: match?.version ?? "-",
        status: match ? "exists" : "missing"
      };
    });
    for (const item of loadedItems) {
      const key = `${normalizeArtifactCompareKey(item.name)}-${item.source}`;
      if (!matchedKeys.has(key)) {
        rows.push({
          documentName: "-",
          artifactName: item.name,
          version: item.version ?? "-",
          status: "extra"
        });
      }
    }
    return rows;
  }

  function artifactKeysMatch(documentKey: string, loadedKey: string) {
    if (!documentKey || !loadedKey) return false;
    if (loadedKey === documentKey) return true;
    const shorter = documentKey.length <= loadedKey.length ? documentKey : loadedKey;
    const longer = documentKey.length > loadedKey.length ? documentKey : loadedKey;
    if (shorter.length < 14) return false;
    const ratio = shorter.length / longer.length;
    return ratio >= 0.72 && longer.includes(shorter);
  }

  function actionArtifactValidationBlock() {
    if (!actionArtifactFiles.length) return "";
    const rows = actionArtifactComparisonRows();
    const lines = rows.length
      ? rows.map((row) => {
          const status = row.status === "exists" ? "Exists" : row.status === "missing" ? "Missing artifact" : "Internal content";
          const version = row.version && row.version !== "-" ? ` | Version: ${row.version}` : "";
          return `- ${row.documentName !== "-" ? row.documentName : row.artifactName}: ${status}${version}`;
        })
      : ["- No document components were available to compare. Validate loaded artifacts manually."];
    return ["Artifact validation:", ...lines].join("\n");
  }

  function renderInspectionProjects(projects: ArtifactInspection["projects"], keyPrefix: string) {
    if (!projects.length) return null;
    return (
      <div className="project-list">
        <div className="project-row project-header">
          <span>Codigo</span>
          <span>Integracion</span>
          <span>Version / estado</span>
        </div>
        {projects.map((project, index) => (
          <div className="project-row" key={`${keyPrefix}-project-${index}`}>
            <span data-label="Codigo">{project.code ?? "N/A"}</span>
            <strong data-label="Integracion">{project.name ?? "Unnamed"}</strong>
            <small data-label="Version / estado">v{project.version ?? "N/A"} · {project.type ?? "N/A"} · {project.state ?? "N/A"}</small>
          </div>
        ))}
      </div>
    );
  }

  function renderInspectionComponents(components: ArtifactInspection["components"], keyPrefix: string) {
    if (!components.length) return null;
    return (
      <div className="component-list">
        <strong>Componentes incluidos</strong>
        {components.map((component) => (
          <div className="component-row" key={`${keyPrefix}-component-${component.path}`}>
            <span>{componentBadge(component.kind)}</span>
            <div>
              <strong>{component.name}</strong>
              <small>{component.path}</small>
              <span className="artifact-status-badge exists inline">
                <CheckCircle2 size={13} />
                Existe
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderInspectionEntries(entries: string[], keyPrefix: string, limit = 40) {
    if (!entries.length) return null;
    return (
      <div className="package-entry-list">
        {entries.slice(0, limit).map((entry) => (
          <span key={`${keyPrefix}-entry-${entry}`}>{entry}</span>
        ))}
        {entries.length > limit && <small>+{entries.length - limit} elementos adicionales</small>}
      </div>
    );
  }

  function renderInternalArtifacts(inspection: ArtifactInspection) {
    if (!inspection.internalArtifacts?.length) return null;
    return (
      <div className="internal-artifact-list">
        <strong>Artefactos internos</strong>
        {inspection.internalArtifacts.map((artifact, index) => (
          <details className="internal-artifact" key={`${inspection.filePath}-internal-${artifact.path}-${index}`}>
            <summary>
              <span className="badge">.{artifact.kind === "error" ? "iar" : artifact.kind}</span>
              <strong>{artifact.name}</strong>
              <span className={`artifact-status-badge ${artifact.kind === "error" ? "missing" : "exists"}`}>
                {artifact.kind === "error" ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                {artifact.kind === "error" ? "No detectado" : "Existe"}
              </span>
            </summary>
            {artifact.kind === "error" ? (
              <p>{artifact.error}</p>
            ) : (
              <div className="internal-artifact-body">
                {renderInspectionProjects(artifact.projects, `${inspection.filePath}-${artifact.path}`)}
                {renderInspectionComponents(artifact.components, `${inspection.filePath}-${artifact.path}`)}
                {!artifact.projects.length && !artifact.components.length && renderInspectionEntries(artifact.entries, `${inspection.filePath}-${artifact.path}`, 30)}
              </div>
            )}
          </details>
        ))}
      </div>
    );
  }

  function renderArtifactInspectionContent(inspection: ArtifactInspection | undefined, file: SelectedFile, entryLimit = 40) {
    if (!inspection) return <div className="empty-inline">Inspeccionando o pendiente de leer este {fileBadge(file.kind)}.</div>;
    if (inspection.kind === "error") return <p>{inspection.error}</p>;
    const hasDetails =
      inspection.projects.length ||
      inspection.components.length ||
      inspection.internalArtifacts?.length ||
      inspection.entries.length;
    if (!hasDetails) return <p>No se detecto contenido legible dentro del {fileBadge(file.kind)}.</p>;
    return (
      <>
        {renderInternalArtifacts(inspection)}
        {renderInspectionProjects(inspection.projects, inspection.filePath)}
        {renderInspectionComponents(inspection.components, inspection.filePath)}
        {!inspection.projects.length && !inspection.components.length && !inspection.internalArtifacts?.length && renderInspectionEntries(inspection.entries, inspection.filePath, entryLimit)}
      </>
    );
  }

  function stepTitle(step: StepId) {
    return t.steps[step]?.[0] ?? t.pipeline.title;
  }

  function ensureEvidenceFormReady() {
    if (evidenceFormReady) return true;
    setMessage(t.messages.evidenceSetupRequired);
    return false;
  }

  function addLog(text: string, step = activeStep) {
    setEvidenceLog((current) => [
      {
        id: createClientId("log"),
        sessionId: executionSessionId,
        at: new Date().toISOString(),
        step,
        rfc: rfc.trim() || undefined,
        text
      },
      ...current
    ]);
  }

  function addEvidence(image: EvidenceImage, source: EvidenceItem["source"], note = "") {
    const item: EvidenceItem = {
      ...image,
      id: createClientId("evidence"),
      sessionId: executionSessionId,
      step: activeStep,
      rfc: rfc.trim() || undefined,
      pipelineStep: isPipelineTrackingStep ? pipelineStepIndex : undefined,
      pipelinePhase: isPipelineTrackingStep ? trackingEnvironment : undefined,
      createdAt: new Date().toISOString(),
      note,
      source
    };
    setEvidenceItems((current) => [item, ...current]);
    setMessage(t.evidence.copied);
  }

  function updateEvidenceNote(id: string, note: string) {
    setEvidenceItems((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
  }

  function removeEvidence(id: string) {
    setEvidenceItems((current) => current.filter((item) => item.id !== id));
    addLog("Evidencia eliminada");
  }

  async function saveEvidenceImage(item: EvidenceItem) {
    if (!desktopApi?.saveEvidenceImage) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const output = await runTask(() =>
      desktopApi.saveEvidenceImage({
        rfc: currentRfc || item.rfc || "RFC",
        phase: trackingEnvironment,
        outputDirectory: outputFolder.trim() || undefined,
        name: item.name,
        dataUrl: item.dataUrl
      })
    );
    if (!output) return;
    setMessage(`${t.evidence.saved} ${output}`);
  }

  async function saveCurrentStepEvidence() {
    if (!desktopApi?.saveEvidenceImages) {
      setMessage(t.messages.filesElectron);
      return;
    }
    if (!currentStepEvidence.length) {
      setMessage(t.evidence.empty);
      return;
    }
    const result = await runTask(() =>
      desktopApi.saveEvidenceImages({
        rfc: currentRfc || "RFC",
        phase: trackingEnvironment,
        outputDirectory: outputFolder.trim() || undefined,
        images: currentStepEvidence.map((item) => ({ name: item.name, dataUrl: item.dataUrl }))
      })
    );
    if (!result) return;
    setMessage(`${t.evidence.savedMany} ${result.directory}`);
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function handleBackgroundImageInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage(t.messages.invalidFiles);
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      setCustomBackgroundImage(dataUrl);
      setUiBackgroundStyle("image");
    } catch {
      setMessage(t.messages.unexpected);
    }
  }

  async function captureAppEvidence() {
    if (!ensureEvidenceFormReady()) return;
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    const image = await runTask(() => desktopApi.captureAppWindow());
    addEvidence(image, "capture", stepTitle(activeStep));
  }

  async function captureRegionEvidence() {
    if (!ensureEvidenceFormReady()) return;
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    const image = await runTask(() => desktopApi.captureScreenRegion());
    addEvidence(image, "region", String(currentPipelineStep?.title ?? stepTitle(activeStep)));
  }

  async function addEvidenceImages() {
    if (!ensureEvidenceFormReady()) return;
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const images = await runTask(() => desktopApi.selectEvidenceImages());
    for (const image of images ?? []) addEvidence(image, "file");
  }

  async function pasteEvidenceImage() {
    if (!ensureEvidenceFormReady()) return;
    try {
      const items = await navigator.clipboard?.read?.();
      for (const item of items ?? []) {
        const type = item.types.find((entry) => entry.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const dataUrl = await blobToDataUrl(blob);
        addEvidence({ name: `captura-portapapeles-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, dataUrl }, "clipboard");
        return;
      }
      setMessage(t.evidence.noClipboard);
    } catch {
      setMessage(t.evidence.noClipboard);
    }
  }

  const updatePipelineStepComment = useCallback((value: string) => {
    setPipelineStepComments((current) => ({ ...current, [pipelineStepKey]: value }));
  }, [pipelineStepKey]);

  const toggleCurrentPipelineStepFailure = useCallback(() => {
    setPipelineStepFailures((current) => ({
      ...current,
      [pipelineStepKey]: !current[pipelineStepKey]
    }));
  }, [pipelineStepKey]);

  function movePipelineStep(direction: 1 | -1) {
    if (direction > 0 && !isFinalPipelineStep && !currentStepComplete) {
      setMessage(t.messages.stepRequired);
      return;
    }
    setPipelineStepIndex((current) => Math.min(Math.max(current + direction, 0), currentPipelineSteps.length - 1));
  }

  function buildEvidencePayload() {
    const documentCopy = copy[documentLang];
    const documentSteps = executionMode === "cicd"
      ? cicdExecutionSteps
      : executionStepsConfirmed && executionSteps.length
        ? executionSteps
        : documentCopy.pipeline.steps.map((title) => ({ title, detail: "" }));
    const exportStepLimit = failedPipelineStepIndex >= 0 ? failedPipelineStepIndex + 1 : documentSteps.length;
    return {
      rfc,
      phase: trackingEnvironment,
      documentLanguage: documentLang,
      outputDirectory: outputFolder.trim() || undefined,
      preparedBy: "",
      preparedByEmail: "",
      preparedByPhone: "",
      environment: targetEnvironment,
      pipeline: executionMode === "cicd" ? pipelineDisplayName : "",
      run: executionMode === "cicd" ? pipelineRunValue.trim() : "",
      runUrl: executionMode === "cicd" ? pipelineDisplayUrl : "",
      message: executionMode === "cicd" ? redactSupportOutputText(documentPipelineRfcMessage) : "",
      steps: documentSteps.slice(0, exportStepLimit).map((step, index) => {
        const stepKey = `${activeStep}-${trackingEnvironment}-${index}`;
        return {
          index: index + 1,
          title: redactSupportOutputText(step.title),
          comment: redactSupportOutputText([
            step.detail,
            pipelineStepFailures[stepKey] ? documentCopy.pipeline.failedStepPrefix : "",
            pipelineStepComments[stepKey]
          ]
            .filter((value) => value?.trim())
            .join("\n\n")),
          images: evidenceItems
            .filter(
              (item) =>
                item.step === activeStep &&
                matchesCurrentExecution(item.rfc, "", item.sessionId) &&
                item.pipelineStep === index &&
                (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
            )
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
            .map((item) => ({ name: item.name, dataUrl: item.dataUrl, createdAt: item.createdAt }))
        };
      }),
      logs: []
    };
  }

  async function chooseOutputFolder() {
    if (!desktopApi) {
      setMessage(t.messages.folderElectron);
      return;
    }
    const folder = await runTask(() => desktopApi.selectDirectory());
    if (folder) setOutputFolder(folder);
  }

  function openLocalPath(path: string) {
    desktopApi?.openExternal(`file://${encodeURI(path)}`);
  }

  function showItemInFolder(path: string) {
    if (desktopApi?.showItemInFolder) {
      desktopApi.showItemInFolder(path);
      return;
    }
    openLocalPath(path);
  }

  async function removeHistoryItem(item: ExecutionHistoryItem) {
    const removeFromHistory = window.confirm(t.historyRemoveConfirm.replace("{{rfc}}", item.rfc));
    if (!removeFromHistory) return;
    setExecutionHistory((current) => current.filter((entry) => entry.id !== item.id));
    const removeFromDisk = window.confirm(t.historyDiskConfirm);
    if (!removeFromDisk) return;
    try {
      await runTask(async () => {
        if (desktopApi?.deleteLocalFile) return desktopApi.deleteLocalFile(item.path);
        return false;
      }, t.messages.done);
    } catch {
      setMessage(t.messages.unexpected);
    }
  }

  function clearCurrentWorkState() {
    localStorage.removeItem(executionDraftStorageKey);
    setRfc("");
    setRepoPath("");
    setActionProduct("");
    setActionTemplateId("auto");
    setActionEnvironment("");
    setAvailableDocumentEnvironments([]);
    setActionInstance("");
    setActionActivity("");
    setArtifactText("");
    setActionSourceDocument(null);
    setManualInstructions("");
    setManualSourceText("");
    setManualPhases([]);
    setManualPhaseDisabledKeys([]);
    setManualPhaseSourceKey("");
    setManualPhaseIndex(0);
    setManualReviewOpen(false);
    setActionArtifactModalOpen(false);
    setActionArtifactFiles([]);
    setActionArtifactInspections([]);
    setExpandedActionArtifactFiles([]);
    setActionPlan("");
    setActionPlanConfirmed(false);
    setActionPlanConfirmedAt("");
    setRiceFolderPath("");
    setMode("ADHOC");
    setFiles([]);
    setExpandedFiles([]);
    setArtifactInspections([]);
    setSummary(null);
    setFinalOutput("");
    setLocalCommitResult(null);
    setDevTargetEnvironment("");
    setRegTargetEnvironment("");
    setTestTargetEnvironment("");
    setProdTargetEnvironment("");
    setTestPipelineName("");
    setProdPipelineName("");
    setTestPipelineRun("");
    setProdPipelineRun("");
    setTestPipelineRunUrl("");
    setProdPipelineRunUrl("");
    setPipelineExecutionPhase("TEST");
    setPipelineActionPlan("");
    setExecutionSteps([]);
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setExecutionSessionId(createClientId("execution"));
    setEvidenceItems([]);
    setEvidenceLog([]);
    setPipelineStepIndex(0);
    setPipelineStepComments({});
    setPipelineStepFailures({});
  }

  function saveCurrentPendingWork() {
    if (!currentPendingWorkSnapshot) {
      setMessage(t.noPendingToSave);
      return false;
    }
    setPendingWorkSnapshots((current) => {
      const withoutCurrent = current.filter((item) => item.id !== currentPendingWorkSnapshot.id);
      const next = [currentPendingWorkSnapshot, ...withoutCurrent].slice(0, 50);
      localStorage.setItem(pendingWorkStorageKey, JSON.stringify(next));
      return next;
    });
    setMessage(t.pendingSaved);
    return true;
  }

  async function installLocalKnowledgePackage() {
    if (!desktopApi?.selectFiles || !desktopApi?.installKnowledgePackage) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const files = await runTask(() => desktopApi.selectFiles(["zip"]));
    const file = files?.[0];
    if (!file?.path) return;
    const catalog = await runTask(() => desktopApi.installKnowledgePackage(file.path));
    if (!catalog) return;
    setKnowledgeCatalog(catalog);
    setMessage(`${t.converterPackageInstalled} ${catalog.knowledgeVersion}`);
  }

  function knowledgeUpdatePayload() {
    const manifestUrl = cloudflareKnowledgeUpdateUrl.trim();
    if (!manifestUrl) {
      setMessage(t.converterNoUpdateUrl);
      return null;
    }
    return {
      manifestUrl
    };
  }

  async function checkRemoteKnowledgeUpdate() {
    if (!desktopApi?.checkKnowledgeUpdate) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const payload = knowledgeUpdatePayload();
    if (!payload) return;
    const manifest = await runTask(() => desktopApi.checkKnowledgeUpdate(payload));
    if (!manifest) return;
    setRemoteKnowledgeVersion(manifest.knowledgeVersion);
    setMessage(`${t.converterUpdateAvailable}: ${manifest.knowledgeVersion}`);
  }

  async function installRemoteKnowledgeUpdate() {
    if (!desktopApi?.installKnowledgeUpdate) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const payload = knowledgeUpdatePayload();
    if (!payload) return;
    const catalog = await runTask(() => desktopApi.installKnowledgeUpdate(payload));
    if (!catalog) return;
    setKnowledgeCatalog(catalog);
    setRemoteKnowledgeVersion(catalog.knowledgeVersion);
    setMessage(`${t.converterPackageInstalled} ${catalog.knowledgeVersion}`);
  }

  async function rollbackLocalKnowledgePackage() {
    if (!desktopApi?.rollbackKnowledgePackage) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const catalog = await runTask(() => desktopApi.rollbackKnowledgePackage());
    if (!catalog) {
      setMessage(t.converterNoRollback);
      return;
    }
    setKnowledgeCatalog(catalog);
    setMessage(`${t.converterRolledBack} ${catalog.knowledgeVersion}`);
  }

  function saveCustomTemplate() {
    const name = customTemplateName.trim();
    const product = customTemplateProduct.trim();
    const content = customTemplateContent.trim();
    if (!name || !product || !content) {
      setMessage(a.templateRequired);
      return;
    }
    const template: CustomActionTemplate = {
      id: `custom:${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`,
      name,
      product,
      category: customTemplateCategory.trim(),
      content,
      active: true,
      createdAt: new Date().toISOString()
    };
    setCustomActionTemplates((current) => {
      const next = [template, ...current].slice(0, 100);
      localStorage.setItem(customTemplatesStorageKey, JSON.stringify(next));
      return next;
    });
    setActionProduct(product);
    setActionTemplateId(template.id);
    setCustomTemplateName("");
    setCustomTemplateCategory("");
    setCustomTemplateContent("");
    setCustomTemplateOpen(false);
    setMessage(a.templateSaved);
  }

  function startNewWork() {
    if (currentPendingWorkSnapshot) {
      const shouldSave = window.confirm(t.savePendingFirstConfirm);
      if (shouldSave) {
        saveCurrentPendingWork();
      } else if (!window.confirm(t.newWithoutSavingConfirm)) {
        return;
      }
    }
    clearCurrentWorkState();
    setSettingsOpen(false);
    setActiveStep("actionPlan");
  }

  function removePendingWork(itemId?: string) {
    const confirmed = window.confirm(t.pendingDeleteConfirm);
    if (!confirmed) return;
    const currentId = itemId ?? currentPendingWorkSnapshot?.id ?? "";
    setPendingWorkSnapshots((current) => {
      const next = current.filter((item) => item.id !== currentId);
      localStorage.setItem(pendingWorkStorageKey, JSON.stringify(next));
      return next;
    });
    if (!currentId || currentId === currentPendingWorkSnapshot?.id) clearCurrentWorkState();
  }

  function continuePendingWork(item: PendingWorkSnapshot) {
    const draft = item.draft;
    let nextStep = item.currentStep;
    if (draft) {
      setRepoPath(draft.repoPath);
      if (draft.outputFolder) setOutputFolder(draft.outputFolder);
      setRfc(draft.rfc);
      setActionProduct(draft.actionProduct);
      setActionMethod(draft.actionMethod);
      setActionTemplateId(draft.actionTemplateId ?? "auto");
      setActionEnvironment(draft.actionEnvironment);
      setActionInstance(draft.actionInstance);
      setActionActivity(draft.actionActivity);
      setActionScopeNotes(draft.actionScopeNotes ?? "");
      setArtifactText(draft.artifactText);
      setActionPlan(draft.actionPlan);
      setActionPlanConfirmed(Boolean(draft.actionPlanConfirmed));
      setActionPlanConfirmedAt(draft.actionPlanConfirmedAt ?? "");
      setManualInstructions(draft.manualInstructions);
      setManualSourceText(draft.manualSourceText ?? draft.manualInstructions);
      setManualPhases(draft.manualPhases);
      setManualPhaseDisabledKeys(draft.manualPhaseDisabledKeys ?? []);
      setManualPhaseSourceKey("");
      setManualPhaseIndex(0);
      setRiceFolderPath(draft.riceFolderPath);
      setMode(draft.mode);
      setFiles(draft.files);
      setDevTargetEnvironment(draft.devTargetEnvironment ?? "");
      setRegTargetEnvironment(draft.regTargetEnvironment ?? "");
      setTestTargetEnvironment(draft.testTargetEnvironment);
      setProdTargetEnvironment(draft.prodTargetEnvironment);
      setTestPipelineName(draft.testPipelineName);
      setProdPipelineName(draft.prodPipelineName);
      setTestPipelineRun(draft.testPipelineRun);
      setProdPipelineRun(draft.prodPipelineRun);
      setTestPipelineRunUrl(draft.testPipelineRunUrl);
      setProdPipelineRunUrl(draft.prodPipelineRunUrl);
      setExecutionMode(draft.executionMode);
      setPipelineExecutionPhase(draft.pipelineExecutionPhase);
      const wantsExecution = Boolean(
        draft.executionMode === "cicd" ||
        draft.pipelineActionPlan.trim() ||
        draft.executionStepsConfirmed ||
        draft.executionSteps.length ||
        (draft.actionPlanConfirmed && draft.actionPlan.trim() && window.confirm(t.pendingOpenExecutionConfirm))
      );
      const restoredPipelineActionPlan = wantsExecution && !draft.pipelineActionPlan.trim()
        ? draft.actionPlan
        : draft.pipelineActionPlan;
      const restoredExecutionSteps = wantsExecution && !draft.executionSteps.length && restoredPipelineActionPlan.trim()
        ? parseActionPlanExecutionSteps(restoredPipelineActionPlan, t.pipeline.steps)
        : draft.executionSteps;
      setPipelineActionPlan(restoredPipelineActionPlan);
      setExecutionSteps(restoredExecutionSteps);
      setExecutionStepsConfirmed(draft.executionStepsConfirmed);
      setExecutionStepsReviewOpen(!draft.executionStepsConfirmed);
      setPipelineStepIndex(draft.pipelineStepIndex);
      setPipelineStepComments(draft.pipelineStepComments);
      setPipelineStepFailures(draft.pipelineStepFailures ?? {});
      nextStep = wantsExecution
        ? "pipeline"
        : "actionPlan";
    } else {
      setRfc(item.rfc);
    }
    setSettingsOpen(false);
    setActiveStep(nextStep);
  }

  function collectUserDataBackup() {
    return {
      localStorage: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      currentSession: {
        lang,
        documentLang,
        outputFolder,
        basePath,
        themeId,
        customGradient,
        customColorA,
        customColorB,
        customColorC,
        customPanelColor,
        customSidebar,
        uiSidebarColor,
        sidebarTransparency,
        sidebarBlur,
        customAccent,
        themeTransparency,
        themeBlur,
        uiBackgroundStyle,
        animatedBackground,
        uiAnimationSpeed,
        customBackgroundImage,
        backgroundImageBlur,
        executionHistory,
        pendingWorkSnapshots,
        rfc,
        repoPath,
        actionProduct,
        actionMethod,
        actionEnvironment,
        actionInstance,
        actionActivity,
        actionScopeNotes,
        artifactText,
        actionSourceDocument,
        actionPlan,
        actionPlanConfirmed,
        actionPlanConfirmedAt,
        manualInstructions,
        riceFolderPath,
        testTargetEnvironment,
        prodTargetEnvironment,
        testPipelineName,
        prodPipelineName,
        executionMode,
        pipelineExecutionPhase,
        pipelineActionPlan,
        executionSteps,
        executionStepsConfirmed,
        evidenceItems,
        evidenceLog,
        profileName,
        profileEmail,
        profilePhone,
        profileAvatarStyle,
        profileAvatarSeed
      }
    };
  }

  async function backupUserData() {
    const backup = collectUserDataBackup();
    if (!desktopApi?.backupUserData) {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: backup }, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rfc-assistant-user-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(t.backupCreated);
      return "";
    }
    const path = await runTask(
      () => desktopApi.backupUserData({ outputDirectory: outputFolder.trim() || undefined, data: backup }),
      t.backupCreated
    );
    if (path) setUserDataBackupPath(path);
    return path ?? "";
  }

  async function deleteUserData() {
    if (userDataConfirm.trim() !== "BORRAR") return;
    const backupPath = await backupUserData();
    if (desktopApi?.clearUserFiles) await desktopApi.clearUserFiles();
    localStorage.clear();
    setActiveStep("actionPlan");
    setLang("es");
    setDocumentLang("en");
    setOutputFolder("");
    setBasePath(defaultBasePath);
    setRepos([]);
    setRepoPath("");
    setRfc("");
    setActionProduct("");
    setActionEnvironment("");
    setAvailableDocumentEnvironments([]);
    setActionInstance("");
    setActionActivity("");
    setArtifactText("");
    setActionPlan("");
    setRiceFolderPath("");
    setMode("ADHOC");
    setFiles([]);
    setExpandedFiles([]);
    setArtifactInspections([]);
    setSummary(null);
    setFinalOutput("");
    setLocalCommitResult(null);
    setDevTargetEnvironment("");
    setRegTargetEnvironment("");
    setTestTargetEnvironment("");
    setProdTargetEnvironment("");
    setTestPipelineName("");
    setProdPipelineName("");
    setTestPipelineRun("");
    setProdPipelineRun("");
    setTestPipelineRunUrl("");
    setProdPipelineRunUrl("");
    setPipelineExecutionPhase("TEST");
    setPipelineActionPlan("");
    setExecutionSteps([]);
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setEvidenceItems([]);
    setEvidenceLog([]);
    setExecutionHistory([]);
    setPendingWorkSnapshots([]);
    setThemeId("oracle");
    setCustomColorA(defaultCustomTheme.colorA);
    setCustomColorB(defaultCustomTheme.colorB);
    setCustomColorC(defaultCustomTheme.colorC);
    setCustomPanelColor(defaultCustomTheme.panel);
    setCustomSidebar(defaultCustomTheme.sidebar);
    setUiSidebarColor(defaultSidebarColor);
    setSidebarTransparency(0.94);
    setSidebarBlur(0);
    setCustomAccent(defaultCustomTheme.accent);
    setThemeTransparency(defaultCustomTheme.transparency);
    setThemeBlur(defaultCustomTheme.blur);
    setUiBackgroundStyle("default");
    setAnimatedBackground(false);
    setUiAnimationSpeed("medium");
    setCustomBackgroundImage("");
    setBackgroundImageBlur(10);
    setCustomGradient(defaultCustomTheme.gradient);
    setPipelineStepIndex(0);
    setPipelineStepComments({});
    setPipelineStepFailures({});
    setImagePreview(null);
    setProfileName(defaultProfile.name);
    setProfileEmail(defaultProfile.email);
    setProfilePhone(defaultProfile.phone);
    setProfileAvatarStyle(defaultProfile.avatarStyle);
    setProfileAvatarSeed(defaultProfile.avatarSeed);
    setUserDataConfirm("");
    setUserDataBackupPath(backupPath);
    setMessage(t.userDataDeleted);
  }

  function validateEvidenceForExport() {
    if (!rfc.trim()) {
      setMessage(t.messages.exportNeedRfc);
      return false;
    }
    if (!hasExecutionActionPlan || currentPipelineSteps.length === 0) {
      setMessage(executionMode === "general" ? t.pipeline.editStepsHint : t.pipeline.planPlaceholder);
      return false;
    }
    if (!targetEnvironment.trim()) {
      setMessage(t.messages.evidenceSetupRequired);
      return false;
    }
    const stepsToValidate = failedPipelineStepIndex >= 0
      ? currentPipelineSteps.slice(0, failedPipelineStepIndex + 1)
      : currentPipelineSteps;
    const missingStepIndex = stepsToValidate.findIndex((_, index) => {
      const stepKey = `${activeStep}-${trackingEnvironment}-${index}`;
      const comment = pipelineStepComments[stepKey]?.trim();
      const failed = pipelineStepFailures[stepKey];
      const images = evidenceItems.filter(
        (item) =>
          item.step === activeStep &&
          matchesCurrentExecution(item.rfc, "", item.sessionId) &&
          item.pipelineStep === index &&
          (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
      );
      return !comment && images.length === 0 && !failed;
    });
    if (missingStepIndex >= 0) {
      setMessage(`${t.messages.exportNeedStep} ${missingStepIndex + 1}.`);
      return false;
    }
    return true;
  }

  async function exportEvidence(kind: "docx" | "pdf") {
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    if (!validateEvidenceForExport()) return;
    const payload = buildEvidencePayload();
    const output = await runTask(() =>
      kind === "docx" ? desktopApi.exportEvidenceDocx(payload) : desktopApi.exportEvidencePdf(payload)
    );
    if (output) {
      setLastExportPath(output);
      setExportModalOpen(true);
      addLog(`Evidencia exportada: ${output}`);
      setExecutionHistory((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          rfc: rfc.trim(),
          phase: trackingEnvironment,
          kind,
          path: output,
          exportedAt: new Date().toISOString()
        },
        ...current
      ]);
      if (currentPendingWorkSnapshot?.id) {
        setPendingWorkSnapshots((current) => {
          const next = current.filter((item) => item.id !== currentPendingWorkSnapshot.id);
          localStorage.setItem(pendingWorkStorageKey, JSON.stringify(next));
          return next;
        });
      }
    }
  }

  async function runTask<T>(task: () => Promise<T>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await task();
      if (success) setMessage(success);
      return result;
    } catch (error) {
      const err = error as Error;
      setMessage(err.message || t.messages.unexpected);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function checkPrerequisites(showSuccess = true) {
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    const result = await runTask(() => desktopApi.checkPrerequisites(), showSuccess ? t.messages.verifyOk : undefined);
    setPrerequisites(result ?? []);
  }

  async function chooseBasePath() {
    if (!desktopApi) {
      setMessage(t.messages.folderElectron);
      return;
    }
    const directory = await desktopApi.selectDirectory();
    if (directory) {
      setBasePath(directory);
      await scanReposIn(directory);
    }
  }

  async function scanReposIn(pathToScan = basePath, showSuccess = true) {
    if (!desktopApi) {
      setMessage(t.messages.scanElectron);
      return;
    }
    if (!pathToScan.trim()) {
      setRepos([]);
      setRepoPath("");
      setMessage(t.messages.baseFolderRequired);
      return;
    }
    const result = await runTask(() => desktopApi.scanRepositories(pathToScan), showSuccess ? t.messages.reposOk : undefined);
    setRepos(result ?? []);
    if (result?.[0] && !result.some((repo) => repo.path === repoPath)) {
      setRepoPath(result[0].path);
    }
    if (!result?.length) {
      setRepoPath("");
      setCloneOpen(true);
    }
  }

  async function scanRepos() {
    await scanReposIn(basePath);
  }

  async function cloneRepository() {
    if (!desktopApi) {
      setMessage(t.messages.cloneElectron);
      return;
    }
    if (!cloneUrl.trim()) {
      setMessage(t.messages.cloneUrl);
      return;
    }
    if (!basePath.trim()) {
      setMessage(t.messages.baseFolderRequired);
      return;
    }
    const destination = `${basePath.replace(/\/$/, "")}/${cloneName.trim() || "BIMBO-REPOSITORY"}`;
    const repo = await runTask(
      () => desktopApi.cloneRepository({ url: cloneUrl.trim(), destination }),
      t.messages.cloneOk
    );
    if (repo) {
      setRepos((current) => [...current.filter((item) => item.path !== repo.path), repo]);
      setRepoPath(repo.path);
      setCloneOpen(false);
    }
  }

  async function selectFiles() {
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const result = await desktopApi.selectFiles(["iar", "par", "csv", "xml", "wsdl", "zip", "jar", "sql"]);
    if (!result.length) return;
    const allowed = result.filter((file) => isAllowedArtifact(file.path));
    if (allowed.length !== result.length) setMessage(t.messages.invalidFiles);
    if (!allowed.length) return;
    setFiles((current) => {
      const byPath = new Map(current.map((file) => [file.path, file]));
      for (const file of allowed) byPath.set(file.path, file);
      return Array.from(byPath.values());
    });
    addLog(`Artefactos agregados: ${allowed.map((file) => file.name).join(", ")}`);
    const inspectablePaths = allowed.filter(isInspectableArtifact).map((file) => file.path);
    if (inspectablePaths.length) {
      setExpandedFiles((current) => Array.from(new Set([...current, ...inspectablePaths])));
      await inspectArtifacts(inspectablePaths);
    }
  }

  async function selectActionArtifacts() {
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const result = await desktopApi.selectFiles(["iar", "par", "csv", "xml", "wsdl", "zip", "jar", "sql"]);
    if (!result.length) return;
    const allowed = result.filter((file) => isAllowedArtifact(file.path));
    if (allowed.length !== result.length) setMessage(t.messages.invalidFiles);
    addActionArtifactFiles(allowed);
  }

  function addActionArtifactFiles(allowed: SelectedFile[]) {
    if (!allowed.length) return;
    setActionArtifactFiles((current) => {
      const byPath = new Map(current.map((file) => [file.path, file]));
      for (const file of allowed) byPath.set(file.path, file);
      return Array.from(byPath.values());
    });
    const inspectablePaths = allowed.filter(isInspectableArtifact).map((file) => file.path);
    if (inspectablePaths.length) {
      setExpandedActionArtifactFiles((current) => Array.from(new Set([...current, ...inspectablePaths])));
      inspectActionArtifacts(inspectablePaths).catch(() => undefined);
    }
    addLog(`Artefactos de Action Plan agregados: ${allowed.map((file) => file.name).join(", ")}`, "actionPlan");
  }

  async function selectActionDocument() {
    if (!desktopApi?.selectActionDocument) {
      actionDocumentInputRef.current?.click();
      return;
    }
    setActionDocumentProcessing(true);
    setMessage(a.processingDocument);
    try {
      const document = await runTask(() => desktopApi.selectActionDocument());
      if (!document) return;
      prepareManualDocumentReview(document);
    } finally {
      setActionDocumentProcessing(false);
    }
  }

  async function handleActionDocumentInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setActionDocumentProcessing(true);
    setMessage(a.processingDocument);
    try {
      const documents = await Promise.all(files.map(buildBrowserActionDocument));
      const document = preferOperationalActionDocument(documents);
      if (!document) return;
      prepareManualDocumentReview(document);
    } catch (error) {
      setMessage((error as Error).message || "No pude leer el documento seleccionado.");
    } finally {
      setActionDocumentProcessing(false);
    }
  }

  function applyManualEnvironment(environment: string, text = manualDetectionSourceText()) {
    if (!text.trim()) return;
    const available = availableEnvironmentsFromDocument(text);
    setAvailableDocumentEnvironments(available);
    const phases = runtimeManualPhasesForProduct(actionProduct, text, environment);
    setManualPhases(phases);
    setManualPhaseSourceKey(manualPhaseSourceKeyFor(text, environment));
    setManualPhaseDisabledKeys(manualPhaseDisabledKeysForDefaults(phases));
    setManualPhaseIndex(0);
    if (selectedEnvironmentMissingFromDocument(text, environment)) {
      setMessage(availableEnvironmentMessage(environment, available));
    }
  }

  function handleActionEnvironmentChange(environment: string) {
    setActionEnvironment(environment);
    applyManualEnvironment(environment);
  }

  function prepareManualDocumentReview(document: ActionSourceDocument) {
    const text = document.text.trim();
    setActionSourceDocument(document);
    setManualInstructions(text);
    setManualSourceText(text);
    if (text) {
      const available = availableEnvironmentsFromDocument(text);
      setAvailableDocumentEnvironments(available);
      const phases = runtimeManualPhasesForProduct(actionProduct, text, actionEnvironment);
      setManualPhases(phases);
      setManualPhaseSourceKey(manualPhaseSourceKeyFor(text));
      setManualPhaseDisabledKeys(manualPhaseDisabledKeysForDefaults(phases));
      setManualPhaseIndex(0);
      const operational = operationalIm090Text(text);
      const lines = actionPlanLinesFromIm090(text);
      const artifactSection =
        sectionByAnyHeading(lines, [/^2\.\d+\s+Installation artifacts\b/i, /^Installation artifacts\b/i]) ||
        looseSectionByHeadings(operational, ["Installation artifacts"], ["Pre installation steps", "Installation Steps"]);
      const artifactDetectionText = [artifactSection, operational].filter(Boolean).join("\n");
      const installableArtifacts = installableArtifactNames(artifactDetectionText);
      const detectedArtifacts = installableArtifacts.length
        ? installableArtifacts
        : isMftManualPlan(actionProduct, text)
          ? runtimeConfigurationItemsForProduct(actionProduct, text)
          : extractArtifactNames(artifactSection || operational, { includeComponentNames: true });
      if (detectedArtifacts.length) setArtifactText(detectedArtifacts.join("\n"));
      setManualReviewOpen(true);
      if (!actionEnvironment.trim()) {
        setMessage("IM090 cargado. Selecciona el ambiente para filtrar las instrucciones antes de generar el Action Plan.");
      } else if (selectedEnvironmentMissingFromDocument(text, actionEnvironment)) {
        setMessage(availableEnvironmentMessage(actionEnvironment, available));
      }
    } else {
      setManualPhases([]);
      setManualPhaseSourceKey("");
      setManualPhaseDisabledKeys([]);
      setAvailableDocumentEnvironments([]);
    }
    if (document.warning) setMessage(document.warning);
    addLog(`Documento cargado para Action Plan: ${document.name}`, "actionPlan");
  }

  function updateManualPhaseContent(content: string) {
    setManualPhases((current) => current.map((phase, index) => index === manualPhaseIndex ? { ...phase, content } : phase));
  }

  function toggleManualPhaseEnabled(index: number, enabled: boolean) {
    const phase = manualPhases[index];
    if (!phase) return;
    const key = manualPhaseKey(phase, index);
    setManualPhaseDisabledKeys((current) =>
      enabled
        ? current.filter((item) => item !== key)
        : current.includes(key)
          ? current
          : [...current, key]
    );
  }

  function selectedManualPhases(phases = manualPhases) {
    return phases.filter((phase, index) => !manualPhaseDisabledKeys.includes(manualPhaseKey(phase, index)));
  }

  function reviewManualPhases() {
    const sourceText = manualDetectionSourceText();
    if (!sourceText.trim()) {
      setManualReviewOpen(true);
      return;
    }
    const phases = runtimeManualPhasesForProduct(actionProduct, sourceText, actionEnvironment);
    const available = availableEnvironmentsFromDocument(sourceText);
    setAvailableDocumentEnvironments(available);
    setManualPhases(phases);
    setManualPhaseSourceKey(manualPhaseSourceKeyFor(sourceText));
    setManualPhaseDisabledKeys(manualPhaseDisabledKeysForDefaults(phases));
    setManualPhaseIndex(0);
    setManualReviewOpen(true);
    if (!actionEnvironment.trim()) {
      setMessage("IM090 cargado. Selecciona el ambiente para filtrar las instrucciones antes de generar el Action Plan.");
    } else if (selectedEnvironmentMissingFromDocument(sourceText, actionEnvironment)) {
      setMessage(availableEnvironmentMessage(actionEnvironment, available));
    }
  }

  function buildManualActionPlan(phases: ManualActionPhase[]) {
    const sourceText = manualDetectionSourceText();
    const enteredArtifacts = artifactLinesFromText(artifactText);
    const ignoreOicLookups = actionProduct === "OIC" && oicManualScopeIgnoresLookups(sourceText);
    const filterOicLookupArtifacts = (items: string[]) =>
      ignoreOicLookups ? items.filter((item) => !/\.csv$/i.test(item)) : items;
    const filterOicArtifacts = (items: string[]) =>
      actionProduct === "OIC" ? preferCanonicalOicIarArtifacts(filterOicLookupArtifacts(items)) : filterOicLookupArtifacts(items);
    const enteredInstallableArtifacts = filterOicArtifacts(installableArtifactNames(artifactText));
    const sourceInstallableArtifacts = filterOicArtifacts(installableArtifactNames(sourceText));
    const oicInstallableArtifacts = actionProduct === "OIC"
      ? Array.from(
          new Map(
            [...enteredInstallableArtifacts, ...sourceInstallableArtifacts].map((item) => [
              normalizeArtifactCompareKey(item),
              item
            ])
          ).values()
        )
      : enteredInstallableArtifacts;
    const databaseItems = actionProduct === "Base de datos" ? databaseProfileCandidates(sourceText) : [];
    const oicConfigurationItems = actionProduct === "OIC" ? runtimeConfigurationItemsForProduct(actionProduct, sourceText) : [];
    const isOdiPlan = isOdiManualPlan(actionProduct, sourceText);
    const isOsbPlan = isOsbManualPlan(actionProduct, sourceText);
    const isJavaPlan = isJavaManualPlan(actionProduct, sourceText);
    const sourceHasInstallableArtifacts = actionProduct !== "MFT" && !isOdiPlan && !isOsbPlan && !isJavaPlan && sourceInstallableArtifacts.length > 0;
    const detectedArtifacts = enteredArtifacts.length
      ? []
      : isMftManualPlan(actionProduct, sourceText)
        ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : isOdiPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : isOsbPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : isJavaPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : databaseItems.length
          ? databaseItems
        : oicConfigurationItems.length
          ? oicConfigurationItems
        : sourceInstallableArtifacts.length
          ? sourceInstallableArtifacts
          : filterOicArtifacts(extractArtifactNames(sourceText, { includeComponentNames: true }));
    const artifacts = enteredArtifacts.length
      ? databaseItems.length
        ? databaseItems
        : oicConfigurationItems.length
          ? oicConfigurationItems
        : isOdiPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : isOsbPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : isJavaPlan
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
        : oicInstallableArtifacts.length
        ? oicInstallableArtifacts
        : sourceHasInstallableArtifacts
          ? sourceInstallableArtifacts
          : enteredArtifacts
      : detectedArtifacts;
    const isMftPlan = isMftManualPlan(actionProduct, sourceText);
    const itemLabel = isMftPlan || isOdiPlan || isOsbPlan || isJavaPlan || oicConfigurationItems.length ? "Configuration item(s)" : "Artifact(s) / component(s)";
    const fallbackItem = isMftPlan || isOdiPlan || isOsbPlan || isJavaPlan || oicConfigurationItems.length ? "- Confirm configuration items listed in the instructions." : "- Confirm artifacts listed in the IM090.";
    const artifactLines = artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : fallbackItem;
    const validationBlock = actionArtifactValidationBlock();
    const productName = isJavaPlan
      ? "JAVA / WebLogic"
      : actionProduct === "Base de datos"
      ? "Oracle Database"
      : actionProduct.trim() || "Oracle Integration Cloud";
    const environmentName = actionEnvironment.trim() || "<Environment>";
    const instanceName = actionInstance.trim() || "<Instance>";
    const isMftFolderAccessPlan = isMftPlan && /\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|\bUser:\s*|\bPermissions?:\s*/i.test(sourceText);
    const activityName = actionActivity.trim() || (isMftFolderAccessPlan ? "Create MFT folders and assign user permissions" : isMftPlan ? "Update MFT Transfer Rule" : "Manual installation");
    const rfcNumber = rfc.trim();
    const sourceDocumentName = actionSourceDocument?.name ?? (
      sourceText.trim()
        ? isMftPlan
          ? `Customer-provided implementation instructions${rfcNumber ? ` for RFC ${rfcNumber}` : ""}`
          : "Pasted installation instructions"
        : "<IM090 / instructions document>"
    );
    const metadata = manualPlanMetadataForProduct(productName, environmentName, instanceName, sourceText);
    const normalizePhaseOutput = !isMftPlan && !isOdiPlan && !isOsbPlan && !isJavaPlan && !isDatabaseManualPlan(actionProduct, sourceText);
    const sourceDocumentLine = (actionProduct === "Base de datos" || isOdiPlan || isOsbPlan || isJavaPlan) && !actionSourceDocument
      ? ""
      : `Source document: ${sourceDocumentName}\n`;
    const phaseBlocks = phases.map((phase, index) => {
      const letter = String.fromCharCode(65 + index);
      const content = normalizePhaseOutput ? formatManualPhaseForActionPlan(phase) : phase.content.trim();
      return `${letter}) ${phase.title}\n\n${content || "<Add execution details>"}`;
    }).join(isMftPlan ? "\n\n-----------------------------------------------------------------\n\n" : "\n\n");

    if (isMftPlan) {
      return `======================= Action Plan =============================\n\nActivity: ${activityName} (${environmentName} - ${instanceName})\nProduct: ${productName}\n\nSource Document:\n${sourceDocumentName}\n\n${itemLabel}:\n${artifactLines}${validationBlock ? `\n\n${validationBlock}` : ""}${metadata ? `\n\n${metadata}` : ""}\n\n=================================================================\n\n${phaseBlocks}\n\n===============================================================`;
    }

    return `======================= Action Plan =============================\n\nActivity: ${activityName} (${environmentName} - ${instanceName})\nProduct: ${productName}\n${sourceDocumentLine}${itemLabel}:\n${artifactLines}${validationBlock ? `\n\n${validationBlock}` : ""}${metadata ? `\n\n${metadata}` : ""}\n\n${phaseBlocks}\n\n===============================================================`;
  }

  function acceptManualReview() {
    const sourceText = manualDetectionSourceText();
    const currentSourceKey = manualPhaseSourceKeyFor(sourceText);
    const reviewedPhases = manualPhases.length && manualPhaseSourceKey === currentSourceKey
      ? manualPhases
      : runtimeManualPhasesForProduct(actionProduct, sourceText, actionEnvironment);
    const disabledKeys = manualPhaseSourceKey === currentSourceKey ? manualPhaseDisabledKeys : manualPhaseDisabledKeysForDefaults(reviewedPhases);
    const enabledPhases = reviewedPhases.filter((phase, index) => !disabledKeys.includes(manualPhaseKey(phase, index)));
    if (!enabledPhases.length) {
      setMessage(a.manualSelectOne);
      return;
    }
    setManualPhases(reviewedPhases);
    setManualPhaseSourceKey(currentSourceKey);
    setManualPhaseDisabledKeys(disabledKeys);
    setActionPlan(buildManualActionPlan(enabledPhases));
    setActionPlanConfirmed(false);
    setActionPlanConfirmedAt("");
    setManualReviewOpen(false);
    addLog("Action Plan manual generado desde fases revisadas", "actionPlan");
  }

  function addDroppedFiles(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const dropped = Array.from(event.dataTransfer.files)
      .map((file) => {
        const path =
          desktopApi?.getPathForFile?.(file) ||
          (file as File & { path?: string }).path ||
          "";
        if (!path) return null;
        return { path, name: file.name, kind: classifyDroppedFile(path) };
      })
      .filter(Boolean) as SelectedFile[];
    const allowed = dropped.filter((file) => isAllowedArtifact(file.path));
    if (dropped.length !== allowed.length) setMessage(t.messages.invalidFiles);
    if (!dropped.length) {
      setMessage(t.messages.dropPath);
      return;
    }
    if (!allowed.length) return;
    setFiles((current) => {
      const byPath = new Map(current.map((file) => [file.path, file]));
      for (const file of allowed) byPath.set(file.path, file);
      return Array.from(byPath.values());
    });
    addLog(`Artefactos arrastrados: ${allowed.map((file) => file.name).join(", ")}`);
    const inspectablePaths = allowed.filter(isInspectableArtifact).map((file) => file.path);
    if (inspectablePaths.length) {
      setExpandedFiles((current) => Array.from(new Set([...current, ...inspectablePaths])));
      inspectArtifacts(inspectablePaths).catch(() => undefined);
    }
  }

  function addDroppedActionArtifacts(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingActionArtifacts(false);
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const dropped = Array.from(event.dataTransfer.files)
      .map((file) => {
        const path =
          desktopApi?.getPathForFile?.(file) ||
          (file as File & { path?: string }).path ||
          "";
        if (!path) return null;
        return { path, name: file.name, kind: classifyDroppedFile(path) };
      })
      .filter(Boolean) as SelectedFile[];
    const allowed = dropped.filter((file) => isAllowedArtifact(file.path));
    if (dropped.length !== allowed.length) setMessage(t.messages.invalidFiles);
    if (!dropped.length) {
      setMessage(t.messages.dropPath);
      return;
    }
    addActionArtifactFiles(allowed);
  }

  function removeFile(path: string) {
    setFiles((current) => current.filter((file) => file.path !== path));
    setArtifactInspections((current) => current.filter((inspection) => inspection.filePath !== path));
    setExpandedFiles((current) => current.filter((item) => item !== path));
    addLog(`Artefacto eliminado: ${path.split("/").pop() ?? path}`);
  }

  function removeActionArtifact(path: string) {
    setActionArtifactFiles((current) => current.filter((file) => file.path !== path));
    setActionArtifactInspections((current) => current.filter((inspection) => inspection.filePath !== path));
    setExpandedActionArtifactFiles((current) => current.filter((item) => item !== path));
  }

  function clearActionArtifacts() {
    setActionArtifactFiles([]);
    setActionArtifactInspections([]);
    setExpandedActionArtifactFiles([]);
  }

  function clearPackage() {
    setFiles([]);
    setArtifactInspections([]);
    setExpandedFiles([]);
    setSummary(null);
    setFinalOutput("");
    setLocalCommitResult(null);
    setMessage(t.messages.packageCleared);
    addLog("Paquete limpiado");
  }

  function resetActionPlanFields() {
    setRfc("");
    setActionProduct("");
    setActionTemplateId("auto");
    setActionEnvironment("");
    setActionInstance("");
    setActionActivity("");
    setActionScopeNotes("");
    setArtifactText("");
    setActionSourceDocument(null);
    setManualInstructions("");
    setManualSourceText("");
    setManualPhases([]);
    setManualPhaseDisabledKeys([]);
    setManualPhaseSourceKey("");
    setManualPhaseIndex(0);
    setManualReviewOpen(false);
    setActionPlan("");
    setActionPlanConfirmed(false);
    setActionPlanConfirmedAt("");
    setPipelineActionPlan("");
    setExecutionSteps([]);
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setMessage(a.clear);
    setLocalCommitResult(null);
  }

  function resetExecutionFields() {
    localStorage.removeItem(executionDraftStorageKey);
    setExecutionSessionId(createClientId("execution"));
    setRfc("");
    setPipelineExecutionPhase("TEST");
    setDevTargetEnvironment("");
    setRegTargetEnvironment("");
    setTestTargetEnvironment("");
    setProdTargetEnvironment("");
    setTestPipelineName("");
    setProdPipelineName("");
    setTestPipelineRun("");
    setProdPipelineRun("");
    setTestPipelineRunUrl("");
    setProdPipelineRunUrl("");
    setPipelineActionPlan("");
    setExecutionSteps([]);
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setPipelineStepIndex(0);
    setPipelineStepComments({});
    setPipelineStepFailures({});
    setLocalCommitResult(null);
    setEvidenceItems((current) => current.filter((item) => item.step !== "pipeline"));
    setEvidenceLog((current) => current.filter((entry) => entry.step !== "pipeline"));
    setImagePreview(null);
    setMessage(t.pipeline.clearExecution);
  }

  function toggleFileDetails(path: string) {
    setExpandedFiles((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  }

  function toggleActionArtifactDetails(path: string) {
    setExpandedActionArtifactFiles((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFiles(false);
    }
  }

  async function inspectArtifacts(paths = files.filter(isInspectableArtifact).map((file) => file.path)) {
    if (!desktopApi) return;
    if (!paths.length) return;
    const result = await runTask(() => desktopApi.inspectArtifacts(paths));
    setArtifactInspections((current) => {
      const byPath = new Map(current.map((item) => [item.filePath, item]));
      for (const item of result ?? []) byPath.set(item.filePath, item);
      return Array.from(byPath.values());
    });
  }

  async function inspectActionArtifacts(paths = actionArtifactFiles.filter(isInspectableArtifact).map((file) => file.path)) {
    if (!desktopApi) return;
    if (!paths.length) return;
    const result = await runTask(() => desktopApi.inspectArtifacts(paths));
    setActionArtifactInspections((current) => {
      const byPath = new Map(current.map((item) => [item.filePath, item]));
      for (const item of result ?? []) byPath.set(item.filePath, item);
      return Array.from(byPath.values());
    });
  }

  async function refreshSummary() {
    if (!desktopApi) {
      setMessage(t.messages.summaryElectron);
      return;
    }
    if (!readyForDraft) {
      setSummary(null);
      setFinalOutput("");
      setMessage(t.messages.noFiles);
      return;
    }
    const payload = { repoPath, baseBranch: releaseBranch, rfc, riceFolderPath, mode, files };
    const result = await runTask(() => desktopApi.getDraftSummary(payload), t.messages.summaryOk);
    setSummary(result ?? null);
    addLog("Vista previa de paquete generada");
  }

  async function prepareDraft() {
    if (!desktopApi) {
      setMessage(t.messages.draftElectron);
      return;
    }
    if (!readyForDraft) {
      setSummary(null);
      setFinalOutput("");
      setMessage(t.messages.noFiles);
      return;
    }
    const payload = { repoPath, baseBranch: releaseBranch, rfc, riceFolderPath, mode, files };
    const result = await runTask(() => desktopApi.prepareRfcDraft(payload), t.messages.draftOk);
    setSummary(result ?? null);
    addLog("Paquete revisado y enviado a confirmacion");
    setActiveStep("review");
  }

  function currentDraftPayload() {
    return { repoPath, baseBranch: releaseBranch, rfc, riceFolderPath, mode, files };
  }

  async function commitRfcLocal() {
    if (!desktopApi) {
      setMessage(t.messages.pushElectron);
      return;
    }
    if (!canCommit) {
      setMessage(t.messages.noFiles);
      return;
    }
    const result = await runTask(() => desktopApi.commitRfcLocal(currentDraftPayload()), t.messages.done);
    setFinalOutput(result?.output ?? "");
    setLocalCommitResult(result?.ok ? result : null);
    addLog(`RFC ${rfc.trim()}: preparacion local ${result?.ok ? "completada" : "con observaciones"}`, "review");
  }

  async function pushRfcBranch() {
    if (!desktopApi) {
      setMessage(t.messages.pushElectron);
      return;
    }
    if (!canPushBranch) {
      setMessage("Primero prepara los cambios.");
      return;
    }
    const result = await runTask(() => desktopApi.pushRfcBranch(currentDraftPayload()), t.messages.done);
    setFinalOutput(result?.output ?? "");
    if (result?.ok) setLocalCommitResult(null);
    addLog(`RFC ${rfc.trim()}: push ${result?.ok ? "completado" : "con observaciones"}`, "review");
  }

  async function undoRfcLocalCommit() {
    if (!desktopApi) {
      setMessage(t.messages.pushElectron);
      return;
    }
    if (!canPushBranch) {
      setMessage("No hay cambios preparados pendientes de push.");
      return;
    }
    const confirmed = window.confirm("Se descartaran los cambios locales preparados en la rama RFC. La rama no se eliminara.");
    if (!confirmed) return;
    const result = await runTask(() => desktopApi.undoRfcLocalCommit(currentDraftPayload()), t.messages.done);
    setFinalOutput(result?.output ?? "");
    if (result?.ok) setLocalCommitResult(null);
    addLog(`RFC ${rfc.trim()}: cambios locales ${result?.ok ? "descartados" : "no pudieron descartarse"}`, "review");
  }

  function generateActionPlan() {
    setActionPlanConfirmed(false);
    setActionPlanConfirmedAt("");
    const sourceText = manualDetectionSourceText();
    const ignoreOicLookups = actionProduct === "OIC" && oicManualScopeIgnoresLookups(sourceText);
    const filterOicLookupArtifacts = (items: string[]) =>
      ignoreOicLookups ? items.filter((item) => !/\.csv$/i.test(item)) : items;
    const filterOicArtifacts = (items: string[]) =>
      actionProduct === "OIC" ? preferCanonicalOicIarArtifacts(filterOicLookupArtifacts(items)) : filterOicLookupArtifacts(items);
    const enteredArtifacts = artifactLinesFromText(artifactText);
    const enteredInstallableArtifacts = filterOicArtifacts(installableArtifactNames(artifactText));
    const sourceInstallableArtifacts = filterOicArtifacts(installableArtifactNames(sourceText));
    const sourceHasInstallableArtifacts = actionProduct !== "MFT" && sourceInstallableArtifacts.length > 0;
    const detectedManualArtifacts =
      actionMethod === "manual" && !enteredArtifacts.length
        ? isMftManualPlan(actionProduct, sourceText)
          ? runtimeConfigurationItemsForProduct(actionProduct, sourceText)
          : sourceInstallableArtifacts.length
            ? sourceInstallableArtifacts
            : filterOicArtifacts(extractArtifactNames(sourceText, { includeComponentNames: true }))
        : [];
    const artifacts = enteredArtifacts.length
      ? enteredInstallableArtifacts.length
        ? enteredInstallableArtifacts
        : sourceHasInstallableArtifacts
          ? sourceInstallableArtifacts
          : enteredArtifacts
      : detectedManualArtifacts;
    const repoName = selectedRepo?.name ?? "<Repository>";
    const branchName = rfc.trim() || "<RFC>";
    const artifactLines = artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : "- <artifact>";
    const firstArtifact = artifacts[0] ?? "<artifact>";
    const productName = actionProduct.trim() || "<Product>";
    const componentNames = artifacts.length ? artifacts.map((item) => item.replace(/\.[^.]+$/, "")) : [firstArtifact.replace(/\.[^.]+$/, "")];
    const componentLines = componentNames.map((item) => `- ${item}`).join("\n");
    const oicComponentBlock = productName === "OIC" ? `\nLookup/component(s):\n${componentLines}` : "";
    const environmentName = actionEnvironment.trim() || "<Environment>";
    const instanceName = actionInstance.trim() || "<Instance>";
    const activityName = actionActivity.trim() || "Deploy artifacts";
    const manualInstructionText = manualInstructions.trim() || sourceText || "<Installation instructions>";

    if (actionMethod === "manual") {
      if (sourceText.trim()) {
        const currentSourceKey = manualPhaseSourceKeyFor(sourceText);
        const phases = manualPhases.length && manualPhaseSourceKey === currentSourceKey
          ? manualPhases
          : runtimeManualPhasesForProduct(actionProduct, sourceText, actionEnvironment);
        const disabledKeys = manualPhaseSourceKey === currentSourceKey
          ? manualPhaseDisabledKeys
          : manualPhaseDisabledKeysForDefaults(phases);
        const enabledPhases = phases.filter((phase, index) => !disabledKeys.includes(manualPhaseKey(phase, index)));
        if (!enabledPhases.length) {
          setMessage(a.manualSelectOne);
          return;
        }
        setManualPhases(phases);
        setManualPhaseSourceKey(currentSourceKey);
        setManualPhaseDisabledKeys(disabledKeys);
        setActionPlan(buildManualActionPlan(enabledPhases));
        addLog("Action Plan manual generado", "actionPlan");
        return;
      }
      const sourceDocumentName = actionSourceDocument?.name ?? (sourceText.trim() ? "Pasted installation instructions" : "<IM090 / instructions document>");
      const itemLabel = actionProduct === "MFT" ? "Component(s) / configuration item(s)" : "Artifact(s) / component(s)";
      const manualPlan = `==========================================================\n\nActivity: ${activityName} (${environmentName} - ${instanceName})\nMethod: Manual\nProduct: ${productName}\nSource document: ${sourceDocumentName}\n${itemLabel}:\n${artifactLines}\n\n1- Review installation instructions:\n1.1- Open the source document and validate the scope for RFC ${branchName}.\n1.2- Confirm the target environment and instance:\n- Environment: ${environmentName}\n- Instance: ${instanceName}\n1.3- Confirm the ${itemLabel.toLowerCase()} listed for this change:\n${artifactLines}\n\n2- Execute manual installation:\n${manualInstructionText}\n\n3- Post-deployment validation (${environmentName} - ${instanceName}):\n3.1- Validate the deployed artifact/component(s):\n${componentLines}\n3.2- Confirm the latest values/configuration are reflected.\n\n4- Share the evidence.\n\n==========================================================`;

      setActionPlan(manualPlan);
      addLog("Action Plan manual generado", "actionPlan");
      return;
    }

    const pipelineInstance = actionInstance.trim() ? pipelineInstanceFrom(actionInstance) : "<Instance>";
    const repoPipelinePrefix = selectedRepo ? repoName.replace("BIMBO-", "").replace("-REPOSITORY", "") : "<Repository>";
    const pipelineName = `${repoPipelinePrefix}-${pipelineInstance}-OIC-DEPLOYMENT_PIPELINE`;

    const cicdPlan = `==========================================================\n\nActivity: ${activityName} via CI/CD (${environmentName} - ${instanceName})\nRepository: ${repoName}\nBranch: release\nArtifact to import:\n${artifactLines}${oicComponentBlock}\n\n1- Prepare deployment package (${repoName}):\n1.1- Open the CI/CD Assistant.\n1.2- Confirm the selected repository is on the \"release\" branch and pull latest changes.\n1.3- Create the RFC branch using the RFC number:\n- ${branchName}\n1.4- Add the artifact(s) attached to this RFC:\n${artifactLines}\n1.5- Review the package summary generated by the CI/CD Assistant.\n1.6- Commit changes with the RFC number and push the branch ${branchName}.\n1.7- Return the local repository to the release branch.\n\n2- Merge Request:\n2.1- Login to the CI-CD Tool:\n${projectUrl}\n2.2- Click on Merge Requests and create a Merge Request.\n2.3- Select Repository (${repoName}) -> Target Branch \"release\" -> Review Branch \"${branchName}\".\n2.4- Select reviewers and create the merge request.\n2.5- Once reviewers approve, merge the changes into release.\n\n3- Run pipeline (${environmentName}):\n3.1- Click on Builds > Pipeline.\n3.2- Select ${pipelineName} and click on Run.\n3.3- Approve the deployment when the RFC is approved, if an approval gate is present.\n3.4- Monitor execution logs. If it does not finish successfully, review logs, correct and re-run as per change control.\n\n4- Post-deployment validation (${environmentName} - ${instanceName}):\n4.1- Login to the target ${productName} environment.\n4.2- Validate the deployed artifact/component(s):\n${componentLines}\n4.3- Confirm the latest values/configuration are reflected.\n\n5- Share the evidence.\n\n==========================================================`;

    setActionPlan(cicdPlan);
    addLog("Action Plan generado", "actionPlan");
  }

  async function copyActionPlan() {
    if (!actionPlan) return;
    await navigator.clipboard?.writeText(actionPlan);
  }

  function redactSupportOutputText(value: string) {
    const exactPersonalValues = [profileName, profileEmail, profilePhone]
      .map((item) => item.trim())
      .filter((item) => item && item !== defaultProfile.name);
    const safetyTerms = [
      "password",
      "pwd",
      "pass",
      "token",
      "secret",
      "credential",
      "email",
      "correo",
      "phone",
      "telefono",
      "teléfono",
      "contact",
      "contacto",
      "prepared by",
      "solicitante",
      "requester",
      ...(externalSafetyRulesForProduct(actionProduct, knowledgeCatalog.rules)?.redactPatterns ?? [])
    ];
    let redacted = value
      .replace(/\b((?:new\s+|confirm\s+)?password\s*[:=]\s*)([^\n\r]+)/gi, "$1<REDACTED>")
      .replace(/\b((?:pwd|pass)\s*[:=]\s*)([^\n\r]+)/gi, "$1<REDACTED>")
      .replace(/\b(password\s+for\s+this\s+information,\s*)([^\n\r]+)/gi, "$1<REDACTED>")
      .replace(/(<[^>\n\r]*password[^>\n\r]*>)(.*?)(<\/[^>\n\r]+>)/gi, "$1<REDACTED>$3")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<REDACTED_EMAIL>")
      .replace(/(?:\+\d{1,3}[\s()-]*)?(?:\d[\s()-]*){8,}\d/g, "<REDACTED_PHONE>")
      .replace(/\/Users\/[^/\s]+/g, "/Users/<REDACTED_USER>")
      .replace(/\\Users\\[^\\\s]+/g, "\\Users\\<REDACTED_USER>");
    for (const term of Array.from(new Set(safetyTerms.map((item) => item.trim()).filter(Boolean)))) {
      const label = escapeRegexLiteral(term);
      redacted = redacted.replace(new RegExp(`\\b(${label}\\b\\s*[:=]\\s*)([^\\n\\r]+)`, "gi"), "$1<REDACTED>");
    }
    for (const personalValue of exactPersonalValues) {
      redacted = redacted.replace(new RegExp(escapeRegexLiteral(personalValue), "gi"), "<REDACTED_USER>");
    }
    return redacted;
  }

  function supportSection(title: string, content: string) {
    return [`## ${title}`, content.trim() || "<empty>"].join("\n");
  }

  function regexWithGlobal(pattern: string, flags = "i") {
    const cleanFlags = Array.from(new Set(`${flags}g`.replace(/[^dgimsuvy]/g, "").split(""))).join("");
    return new RegExp(pattern, cleanFlags);
  }

  function firstCapturedValue(match: RegExpMatchArray) {
    return match.slice(1).find((value) => value?.trim())?.trim() ?? match[0]?.trim() ?? "";
  }

  function normalizedDiagnosticValues(values: string[], normalize: string[] = []) {
    return normalizeExternalRuleValues(values, normalize);
  }

  function productMatchesRule(productName: string, rule: NonNullable<RuntimeKnowledgeCatalog["rules"]>["products"][number]) {
    const normalizedProduct = productName.trim().toLowerCase();
    return normalizedProduct === rule.productName.toLowerCase() ||
      normalizedProduct === rule.id.toLowerCase() ||
      (normalizedProduct === "base de datos" && rule.id === "database");
  }

  function buildExternalRulesDiagnostic(sourceText: string, detectedPhaseCount: number) {
    const rulesCatalog = knowledgeCatalog.rules;
    if (!rulesCatalog) return "External rules package: <none>";
    if (!sourceText.trim()) return `External rules package: ${rulesCatalog.knowledgeVersion}\nSource text: <empty>`;

    const detectorResults = rulesCatalog.products.map((product) => {
      let score = 0;
      const matches: string[] = [];
      for (const detector of product.detectorRules) {
        try {
          const regex = new RegExp(detector.pattern, detector.flags || "i");
          if (regex.test(sourceText)) {
            score += detector.weight ?? 1;
            matches.push(detector.id);
          }
        } catch {
          matches.push(`${detector.id}: invalid pattern`);
        }
      }
      return { product, score, matches };
    }).sort((left, right) => right.score - left.score);

    const selectedRule = rulesCatalog.products.find((rule) => productMatchesRule(actionProduct, rule)) ?? detectorResults.find((item) => item.score > 0)?.product;
    const extracted = selectedRule
      ? selectedRule.extractorRules.map((extractor) => {
          const values: string[] = [];
          for (const pattern of extractor.patterns) {
            try {
              const regex = regexWithGlobal(pattern.pattern, pattern.flags || "i");
              for (const match of sourceText.matchAll(regex)) {
                values.push(firstCapturedValue(match));
              }
            } catch {
              values.push(`<invalid pattern: ${pattern.id}>`);
            }
          }
          return {
            target: extractor.target,
            values: normalizedDiagnosticValues(values, extractor.normalize)
          };
        }).filter((item) => item.values.length)
      : [];

    const top = detectorResults[0];
    const selectedDetector = selectedRule ? detectorResults.find((item) => item.product.id === selectedRule.id) : null;
    const phaseDelta = selectedRule ? selectedRule.phaseRules.length - detectedPhaseCount : 0;
    const safetySummary = selectedRule?.safety
      ? [
          `Safety redact patterns: ${selectedRule.safety.redactPatterns?.join(", ") || "<none>"}`,
          `Safety evidence exclusions: ${selectedRule.safety.evidenceExclusions?.join(", ") || "<none>"}`
        ].join("\n")
      : "";

    return [
      `External rules package: ${rulesCatalog.knowledgeVersion}`,
      `Current parser product: ${actionProduct || "<empty>"}`,
      top ? `Top rules detector: ${top.product.productName} (${top.product.id}) | Score: ${top.score} | Matches: ${top.matches.join(", ") || "<none>"}` : "Top rules detector: <none>",
      selectedRule ? `Selected rules product: ${selectedRule.productName} (${selectedRule.id}) | Score: ${selectedDetector?.score ?? 0}` : "Selected rules product: <none>",
      selectedRule ? `Phase model comparison: parser=${detectedPhaseCount}, rules=${selectedRule.phaseRules.length}, delta=${phaseDelta}` : "",
      selectedRule ? `Rules phase model:\n${selectedRule.phaseRules.map((phase) => `- ${phase.title} (${phase.id}, ${phase.defaultIncluded ? "enabled" : "disabled"})`).join("\n")}` : "",
      safetySummary,
      extracted.length
        ? [
            "Rules extracted items:",
            ...extracted.map((item) => `- ${item.target}: ${item.values.join(", ")}`)
          ].join("\n")
        : "Rules extracted items: <none>"
    ].filter(Boolean).join("\n");
  }

  function buildActionPlanSupportOutput() {
    const sourceText = manualDetectionSourceText();
    const currentSourceKey = manualPhaseSourceKeyFor(sourceText);
    const detectedPhases = manualPhases.length && manualPhaseSourceKey === currentSourceKey
      ? manualPhases
      : sourceText.trim()
        ? runtimeManualPhasesForProduct(actionProduct, sourceText, actionEnvironment)
        : [];
    const disabledKeys = manualPhaseSourceKey === currentSourceKey && manualPhaseDisabledKeys.length
      ? manualPhaseDisabledKeys
      : manualPhaseDisabledKeysForDefaults(detectedPhases);
    const selectedTemplate = allActionTemplateOptions.find((option) => option.id === actionTemplateId);
    const phaseText = detectedPhases.map((phase, index) => {
      const key = manualPhaseKey(phase, index);
      const status = disabledKeys.includes(key) ? "disabled" : "enabled";
      return [
        `### ${index + 1}. ${phase.title} (${phase.id}, ${status})`,
        phase.content
      ].join("\n");
    }).join("\n\n");
    const sourceDocumentInfo = actionSourceDocument
      ? [
          `Name: ${actionSourceDocument.name}`,
          `Kind: ${actionSourceDocument.kind}`,
          `Path: ${actionSourceDocument.path || "<browser upload>"}`,
          `Warning: ${actionSourceDocument.warning || "<none>"}`,
          `Extracted text length: ${actionSourceDocument.text.length}`,
          actionSourceDocument.ignoredDocuments?.length
            ? [
                "Ignored / auxiliary documents:",
                ...actionSourceDocument.ignoredDocuments.map((document) =>
                  `- ${document.name} | ${document.kind} | ${document.path || "<browser upload>"} | Text length: ${document.textLength} | Reason: ${document.reason}`
                )
              ].join("\n")
            : ""
        ].join("\n")
      : "<none>";
    const actionArtifactInfo = actionArtifactFiles.length
      ? actionArtifactFiles.map((file) => `- ${file.name} | ${file.kind} | ${file.path}`).join("\n")
      : "<none>";
    const inspectionInfo = actionArtifactInspections.length
      ? actionArtifactInspections.map((inspection) => {
          const projects = inspection.projects.map((project) => [project.code, project.name, project.version, project.type, project.state].filter(Boolean).join(" | "));
          const components = inspection.components.map((component) => `${component.kind}: ${component.name} (${component.path})`);
          const internalArtifacts = (inspection.internalArtifacts ?? []).map((item) => {
            const internalProjects = item.projects.map((project) => [project.code, project.name, project.version, project.type, project.state].filter(Boolean).join(" | "));
            const internalComponents = item.components.map((component) => `${component.kind}: ${component.name} (${component.path})`);
            return [
              `  Internal artifact: ${item.name}`,
              internalProjects.length ? internalProjects.map((project) => `  - Project: ${project}`).join("\n") : "",
              internalComponents.length ? internalComponents.map((component) => `  - Component: ${component}`).join("\n") : "",
              item.error ? `  - Error: ${item.error}` : ""
            ].filter(Boolean).join("\n");
          });
          return [
            `File: ${inspection.fileName}`,
            `Kind: ${inspection.kind}`,
            inspection.error ? `Error: ${inspection.error}` : "",
            projects.length ? projects.map((project) => `- Project: ${project}`).join("\n") : "",
            components.length ? components.map((component) => `- Component: ${component}`).join("\n") : "",
            internalArtifacts.join("\n")
          ].filter(Boolean).join("\n");
        }).join("\n\n")
      : "<none>";
    const comparisonInfo = actionArtifactRows.length
      ? actionArtifactRows.map((row) => `- Document: ${row.documentName} | Loaded: ${row.artifactName} | Version: ${row.version} | Status: ${row.status}`).join("\n")
      : "<none>";
    const externalRulesDiagnostic = buildExternalRulesDiagnostic(sourceText, detectedPhases.length);

    const metadata = [
      `Generated at: ${new Date().toISOString()}`,
      `RFC: ${rfc.trim() || "<empty>"}`,
      `Method: ${actionMethod}`,
      `Product: ${actionProduct || "<empty>"}`,
      `Template: ${selectedTemplate?.label || actionTemplateId}`,
      `Environment: ${actionEnvironment || "<empty>"}`,
      `Instance: ${actionInstance || "<empty>"}`,
      `Activity: ${actionActivity || "<empty>"}`,
      `Scope notes present: ${actionScopeNotes.trim() ? "yes" : "no"}`,
      `Action Plan confirmed: ${actionPlanConfirmed ? "yes" : "no"}`,
      `Action Plan confirmed at: ${actionPlanConfirmedAt || "<empty>"}`,
      `Available document environments: ${availableDocumentEnvironments.join(", ") || "<none>"}`
    ].join("\n");

    return redactSupportOutputText([
      "======================= Codex Support Output =======================",
      "Purpose: share this block with Codex/support instead of screenshots.",
      "",
      supportSection("RFC Metadata", metadata),
      supportSection("Source Document", sourceDocumentInfo),
      supportSection("Artifact Text Field", artifactText),
      supportSection("Loaded Action Artifacts", actionArtifactInfo),
      supportSection("Artifact Comparison", comparisonInfo),
      supportSection("Artifact Inspection", inspectionInfo),
      supportSection("RFC Scope Notes Field", actionScopeNotes),
      supportSection("Manual Instructions Field", manualInstructions),
      supportSection("Converter Source Text", sourceText),
      supportSection("Detected Manual Phases", phaseText),
      supportSection("External Rules Diagnostic", externalRulesDiagnostic),
      supportSection("Generated Action Plan", actionPlan),
      "===================================================================="
    ].join("\n\n"));
  }

  async function copyActionPlanSupportOutput() {
    const output = buildActionPlanSupportOutput();
    setSupportOutputText(output);
    setSupportOutputOpen(true);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(output);
      setMessage(a.supportCopied);
    }
    addLog("Salida de soporte de Action Plan copiada", "actionPlan");
  }

  async function confirmActionPlan() {
    if (!actionPlan.trim()) return;
    if (!desktopApi?.saveActionPlanText) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const output = await runTask(() =>
      desktopApi.saveActionPlanText({
        rfc: rfc.trim() || "RFC",
        outputDirectory: outputFolder.trim() || undefined,
        content: actionPlan
      })
    );
    if (!output) return;
    const outputPath = typeof output === "string" ? output : output.path;
    const outputBaseDirectory = typeof output === "string" ? outputFolder : output.baseDirectory;
    if (outputBaseDirectory) setOutputFolder(outputBaseDirectory);
    const confirmedAt = new Date().toISOString();
    setActionPlanConfirmed(true);
    setActionPlanConfirmedAt(confirmedAt);
    if (currentPendingWorkSnapshot?.draft) {
      const confirmedSnapshot: PendingWorkSnapshot = {
        ...currentPendingWorkSnapshot,
        stepName: a.confirmed,
        currentStep: "pipeline",
        actionPlanReady: true,
        updatedAt: confirmedAt,
        draft: {
          ...currentPendingWorkSnapshot.draft,
          outputFolder: outputBaseDirectory || currentPendingWorkSnapshot.draft.outputFolder,
          actionPlan,
          actionPlanConfirmed: true,
          actionPlanConfirmedAt: confirmedAt
        }
      };
      setPendingWorkSnapshots((current) => {
        const withoutCurrent = current.filter((item) => item.id !== confirmedSnapshot.id);
        const next = [confirmedSnapshot, ...withoutCurrent].slice(0, 50);
        localStorage.setItem(pendingWorkStorageKey, JSON.stringify(next));
        return next;
      });
    }
    setMessage(`${a.confirmedSaved} ${outputPath}`);
  }

  async function copyActiveStepLog() {
    if (!activeStepLog.length) return;
    const text = activeStepLog
      .slice()
      .reverse()
      .map((entry) => `[${new Date(entry.at).toLocaleString()}] ${stepTitle(entry.step)}: ${entry.text}`)
      .join("\n");
    await navigator.clipboard?.writeText(redactSupportOutputText(text));
    setMessage(t.evidence.logCopied);
  }

  async function copyPipelineMessage() {
    await navigator.clipboard?.writeText(pipelineRfcMessage);
  }

  async function copyProdContinuationMessage() {
    await navigator.clipboard?.writeText(prodContinuationMessage);
    setMessage(t.pipeline.copy);
  }

  async function loadExecutionActionPlanFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPipelineActionPlan(text);
    setExecutionSteps(parseActionPlanExecutionSteps(text, t.pipeline.steps));
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setPipelineStepIndex(0);
    setPipelineStepFailures({});
    setMessage(t.pipeline.stepsLoaded);
    event.target.value = "";
  }

  function useGeneratedActionPlanForExecution() {
    if (!actionPlan.trim()) return;
    setPipelineActionPlan(actionPlan);
    setExecutionSteps(parseActionPlanExecutionSteps(actionPlan, t.pipeline.steps));
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setPipelineStepIndex(0);
    setPipelineStepFailures({});
    setMessage(t.pipeline.stepsLoaded);
  }

  function refreshExecutionSteps() {
    setExecutionSteps(parsedExecutionSteps);
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
    setPipelineStepIndex(0);
    setPipelineStepFailures({});
    setMessage(t.pipeline.stepsLoaded);
  }

  function updateExecutionStep(index: number, field: keyof PipelineExecutionStep, value: string) {
    setExecutionSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, [field]: value } : step)));
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
  }

  function removeExecutionStep(index: number) {
    setExecutionSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
    setPipelineStepIndex((current) => Math.max(0, Math.min(current, executionSteps.length - 2)));
    setPipelineStepFailures({});
    setExecutionStepsConfirmed(false);
    setExecutionStepsReviewOpen(true);
  }

  function confirmExecutionSteps() {
    const cleanSteps = executionSteps
      .map((step) => ({ title: step.title.trim(), detail: step.detail.trim() }))
      .filter((step) => step.title);
    setExecutionSteps(cleanSteps);
    setExecutionStepsConfirmed(Boolean(cleanSteps.length));
    setExecutionStepsReviewOpen(false);
    setPipelineStepIndex(0);
    setPipelineStepFailures({});
    setMessage(cleanSteps.length ? t.pipeline.stepsConfirmed : t.pipeline.planPlaceholder);
  }

  useEffect(() => {
    if (desktopApi) checkPrerequisites(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    desktopApi?.loadKnowledge?.()
      .then((catalog) => {
        if (!cancelled && catalog) setKnowledgeCatalog(catalog);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pipelineStepIndex >= currentPipelineSteps.length) {
      setPipelineStepIndex(Math.max(0, currentPipelineSteps.length - 1));
    }
  }, [currentPipelineSteps.length, pipelineStepIndex]);

  useEffect(() => {
    if (manualPhaseTextareaRef.current) manualPhaseTextareaRef.current.scrollTop = 0;
  }, [manualPhaseIndex]);

  useEffect(() => {
    let activeElement: HTMLElement | null = null;

    const tooltipTarget = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[title], [data-instant-tooltip], button[aria-label]") : null;

    const placeTooltip = (text: string, x: number, y: number) => {
      const clampedX = Math.min(Math.max(x, 18), window.innerWidth - 18);
      const clampedY = Math.min(Math.max(y, 22), window.innerHeight - 12);
      setInstantTooltip({ text, x: clampedX, y: clampedY });
    };

    const showTooltip = (target: EventTarget | null, x?: number, y?: number) => {
      const element = tooltipTarget(target);
      if (!element) return;
      const title = element.getAttribute("title");
      const ariaLabel = element.getAttribute("aria-label");
      const text = element.dataset.instantTooltip || title || ariaLabel || "";
      if (!text.trim()) return;
      if (title) {
        element.dataset.instantTooltip = title;
        if (!element.getAttribute("aria-label")) element.setAttribute("aria-label", title);
        element.removeAttribute("title");
      } else if (!element.dataset.instantTooltip && ariaLabel) {
        element.dataset.instantTooltip = ariaLabel;
      }
      activeElement = element;
      const rect = element.getBoundingClientRect();
      placeTooltip(text, x ?? rect.left + rect.width / 2, y ?? rect.top);
    };

    const hideTooltip = () => {
      activeElement = null;
      setInstantTooltip(null);
    };

    const handleMouseOver = (event: MouseEvent) => showTooltip(event.target, event.clientX, event.clientY);
    const handleMouseMove = (event: MouseEvent) => {
      if (!activeElement) return;
      const text = activeElement.dataset.instantTooltip || "";
      if (!text) return;
      placeTooltip(text, event.clientX, event.clientY);
    };
    const handleMouseOut = (event: MouseEvent) => {
      if (!activeElement || !(event.relatedTarget instanceof Node) || !activeElement.contains(event.relatedTarget)) {
        hideTooltip();
      }
    };
    const handleFocusIn = (event: FocusEvent) => showTooltip(event.target);

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", hideTooltip, true);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", hideTooltip, true);
      window.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
    };
  }, []);

  useEffect(() => {
    if (desktopApi && basePath) scanReposIn(basePath, false).catch(() => undefined);
  }, []);

  useEffect(() => {
    const currentPaths = new Set(files.map((file) => file.path));
    setArtifactInspections((current) => {
      const next = current.filter((inspection) => currentPaths.has(inspection.filePath));
      return next.length === current.length ? current : next;
    });
    setExpandedFiles((current) => {
      const next = current.filter((path) => currentPaths.has(path));
      return next.length === current.length ? current : next;
    });
  }, [files]);

  useEffect(() => {
    setSummary(null);
    setFinalOutput("");
    setLocalCommitResult(null);
  }, [repoPath, rfc, riceFolderPath, mode, files]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("documentLang", documentLang);
  }, [documentLang]);

  useEffect(() => {
    localStorage.setItem("outputFolder", outputFolder);
  }, [outputFolder]);

  useEffect(() => {
    localStorage.setItem("basePath", basePath);
  }, [basePath]);

  useEffect(() => {
    localStorage.setItem(actionMethodStorageKey, actionMethod);
  }, [actionMethod]);

  useEffect(() => {
    localStorage.setItem(executionModeStorageKey, executionMode);
  }, [executionMode]);

  useEffect(() => {
    localStorage.setItem("executionHistory", JSON.stringify(executionHistory.slice(0, 50)));
  }, [executionHistory]);

  useEffect(() => {
    const draft: ExecutionDraft = {
      sessionId: executionSessionId,
      rfc,
      devTargetEnvironment,
      regTargetEnvironment,
      testTargetEnvironment,
      prodTargetEnvironment,
      testPipelineName,
      prodPipelineName,
      testPipelineRun,
      prodPipelineRun,
      testPipelineRunUrl,
      prodPipelineRunUrl,
      executionMode,
      pipelineExecutionPhase,
      pipelineActionPlan,
      actionPlanConfirmed,
      actionPlanConfirmedAt,
      executionSteps,
      executionStepsConfirmed,
      pipelineStepIndex,
      pipelineStepComments,
      pipelineStepFailures,
      evidenceItems,
      evidenceLog
    };
    try {
      localStorage.setItem(executionDraftStorageKey, JSON.stringify(draft));
    } catch {
      // Evidence screenshots can exceed browser storage. Keep the live session intact.
    }
  }, [
    executionSessionId,
    rfc,
    devTargetEnvironment,
    regTargetEnvironment,
    testTargetEnvironment,
    prodTargetEnvironment,
    testPipelineName,
    prodPipelineName,
    testPipelineRun,
    prodPipelineRun,
    testPipelineRunUrl,
    prodPipelineRunUrl,
    executionMode,
    pipelineExecutionPhase,
    pipelineActionPlan,
    actionPlanConfirmed,
    actionPlanConfirmedAt,
    executionSteps,
    executionStepsConfirmed,
    pipelineStepIndex,
    pipelineStepComments,
    pipelineStepFailures,
    evidenceItems,
    evidenceLog
  ]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch]);

  useEffect(() => {
    setPendingPage(1);
  }, [pendingSearch]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (pendingPage > pendingTotalPages) setPendingPage(pendingTotalPages);
  }, [pendingPage, pendingTotalPages]);

  useEffect(() => {
    if (!hasHiddenEmptyPendingWork) return;
    setPendingWorkSnapshots(pendingWorkItems);
    localStorage.setItem(pendingWorkStorageKey, JSON.stringify(pendingWorkItems));
  }, [hasHiddenEmptyPendingWork, pendingWorkItems]);

  useEffect(() => {
    localStorage.setItem("themeId", themeId);
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem("customThemeTone", customThemeTone);
  }, [customThemeTone]);

  useEffect(() => {
    localStorage.setItem("customGradient", customGradient);
  }, [customGradient]);

  useEffect(() => {
    localStorage.setItem("customColorA", customColorA);
  }, [customColorA]);

  useEffect(() => {
    localStorage.setItem("customColorB", customColorB);
  }, [customColorB]);

  useEffect(() => {
    localStorage.setItem("customColorC", customColorC);
  }, [customColorC]);

  useEffect(() => {
    localStorage.setItem("customPanelColor", customPanelColor);
  }, [customPanelColor]);

  useEffect(() => {
    localStorage.setItem("customSidebar", customSidebar);
  }, [customSidebar]);

  useEffect(() => {
    localStorage.setItem("uiSidebarColor", uiSidebarColor);
  }, [uiSidebarColor]);

  useEffect(() => {
    localStorage.setItem("sidebarTransparency", String(sidebarTransparency));
  }, [sidebarTransparency]);

  useEffect(() => {
    localStorage.setItem("sidebarBlur", String(sidebarBlur));
  }, [sidebarBlur]);

  useEffect(() => {
    localStorage.setItem("customAccent", customAccent);
  }, [customAccent]);

  useEffect(() => {
    localStorage.setItem("themeTransparency", String(themeTransparency));
  }, [themeTransparency]);

  useEffect(() => {
    localStorage.setItem("themeBlur", String(themeBlur));
  }, [themeBlur]);

  useEffect(() => {
    localStorage.setItem("uiTextSize", uiTextSize);
  }, [uiTextSize]);

  useEffect(() => {
    localStorage.setItem("uiBackgroundStyle", uiBackgroundStyle);
  }, [uiBackgroundStyle]);

  useEffect(() => {
    localStorage.setItem("animatedBackground", String(animatedBackground));
  }, [animatedBackground]);

  useEffect(() => {
    localStorage.setItem("uiAnimationSpeed", uiAnimationSpeed);
  }, [uiAnimationSpeed]);

  useEffect(() => {
    localStorage.setItem("uiAnimationMotion", uiAnimationMotion);
  }, [uiAnimationMotion]);

  useEffect(() => {
    localStorage.setItem("customBackgroundImage", customBackgroundImage);
  }, [customBackgroundImage]);

  useEffect(() => {
    localStorage.setItem("backgroundImageBlur", String(backgroundImageBlur));
  }, [backgroundImageBlur]);

  useEffect(() => {
    localStorage.setItem("profileName", profileName);
  }, [profileName]);

  useEffect(() => {
    localStorage.setItem("profileEmail", profileEmail);
  }, [profileEmail]);

  useEffect(() => {
    localStorage.setItem("profilePhone", profilePhone);
  }, [profilePhone]);

  useEffect(() => {
    localStorage.setItem("profileAvatarStyle", profileAvatarStyle);
  }, [profileAvatarStyle]);

  useEffect(() => {
    localStorage.setItem("profileAvatarSeed", profileAvatarSeed);
  }, [profileAvatarSeed]);

  useEffect(() => {
    if (selectedRepo && !riceFolderPath && rfc) {
      const region = regionFromRepo(selectedRepo.name);
      setRiceFolderPath(`Generic/${rfc}_${region}`);
    }
  }, [rfc, selectedRepo, riceFolderPath]);

  useEffect(() => {
    if (!actionInstance.trim()) return;
    if (actionEnvironment === "PROD") {
      setProdTargetEnvironment(actionInstance);
      return;
    }
    if (actionEnvironment === "DEV") {
      setDevTargetEnvironment(actionInstance);
      return;
    }
    if (actionEnvironment === "REG") {
      setRegTargetEnvironment(actionInstance);
      return;
    }
    if (actionEnvironment === "TEST") {
      setTestTargetEnvironment(actionInstance);
    }
  }, [actionEnvironment, actionInstance]);

  return (
    <div
      className={`app-shell theme-${themeId} theme-tone-${activeThemeTone} custom-tone-${customThemeTone} ui-text-${uiTextSize} bg-style-${uiBackgroundStyle} bg-motion-${uiAnimationMotion} ${animatedBackground ? "bg-animated" : ""}`}
      style={appStyle}
    >
      <aside className="sidebar">
        <div
          className="brand"
          role="button"
          tabIndex={0}
          onClick={() => {
            setSettingsTab("user");
            setSettingsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSettingsTab("user");
            setSettingsOpen(true);
          }}
          title={t.profileTitle}
        >
          <img className="brand-avatar" src={avatarUrl(profileAvatarSeed, profileAvatarStyle)} alt={profileName || t.userData} />
          <div>
            <strong>{t.app}</strong>
            <span>{profileName || defaultProfile.name}</span>
          </div>
        </div>

        <nav className="steps">
          <button
            className={`step standalone ${activeStep === "actionPlan" ? "active" : ""}`}
            onClick={() => setActiveStep("actionPlan")}
          >
            <span>AP</span>
            <div>
              <strong>{t.steps.actionPlan[0]}</strong>
              <small>{t.steps.actionPlan[1]}</small>
            </div>
          </button>

          <div className="step-group-label">CI/CD Tool</div>
          {(["package", "review"] as const).map((stepId, index) => (
            <button
              key={stepId}
              className={`step ${activeStep === stepId ? "active" : ""}`}
              onClick={() => setActiveStep(stepId)}
            >
              <span>{index === 0 ? "RFC" : "OK"}</span>
              <div>
                <strong>{t.steps[stepId][0]}</strong>
                <small>{t.steps[stepId][1]}</small>
              </div>
            </button>
          ))}

          <div className="step-group-label">Ejecucion RFC</div>
          <button
            className={`step upcoming ${activeStep === "pipeline" ? "active" : ""}`}
            onClick={() => setActiveStep("pipeline")}
          >
            <span>RUN</span>
            <div>
              <strong>{t.steps.pipeline[0]}</strong>
              <small>{t.steps.pipeline[1]}</small>
            </div>
          </button>
        </nav>

        <button className="secondary full" onClick={() => desktopApi?.openExternal(projectUrl)}>
          <ExternalLink size={16} />
          {t.openVbs}
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t.phase}</p>
            <h1>{t.title}</h1>
          </div>

          <div className="top-actions">
            <label className="repo-select-label">
              <span>{t.review.repository} / {t.repos.branch}</span>
              <select value={repoPath} onChange={(event) => setRepoPath(event.target.value)}>
                {repos.length === 0 && <option value="">{e.noRepos}</option>}
                {repos.map((repo) => (
                  <option key={repo.path} value={repo.path}>
                    {repo.name} - {releaseBranch}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary compact" onClick={saveCurrentPendingWork} disabled={!currentPendingWorkSnapshot}>
              <Download size={15} />
              {t.savePendingWork}
            </button>
            <button className="secondary compact" onClick={startNewWork}>
              <Plus size={15} />
              {t.newWork}
            </button>
            <button className="secondary compact" onClick={() => setConverterSyncOpen(true)}>
              <RefreshCw size={15} />
              {t.syncConverters}
            </button>
            <button className="status-pill status-button" onClick={() => setWorkspaceOpen(true)}>
              {busy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              {busy ? t.busy : t.ready}
            </button>
            <div className="menu-wrap">
              <button
                className={`menu-button icon-only evidence-toggle log-menu-button ${evidenceOpen ? "active" : ""}`}
                onClick={() => setEvidenceOpen((open) => !open)}
                title={t.evidence.log}
                aria-label={t.evidence.log}
              >
                <PanelRightOpen size={18} />
              </button>
              <button className="menu-button icon-only settings-menu-button" onClick={() => setSettingsOpen(true)} title={t.settings}>
                <Menu size={17} />
              </button>
            </div>
          </div>
        </header>

        {workspaceOpen && (
          <div className="modal-backdrop" onMouseDown={() => setWorkspaceOpen(false)}>
            <section className="workspace-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h2>{e.title}</h2>
                  <p>{e.body}</p>
                </div>
                <button className="icon-close" onClick={() => setWorkspaceOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="workspace-actions modal-actions">
                <button className="secondary" onClick={() => checkPrerequisites()}>
                  <RefreshCw size={16} />
                  {t.setup.verify}
                </button>
                <button className="secondary" onClick={() => scanRepos()}>
                  <RefreshCw size={16} />
                  {e.refresh}
                </button>
              </div>

              <div className="environment-grid modal-grid">
                <div className="environment-card">
                  <div className="section-kicker">{e.checks}</div>
                  <div className="mini-checks">
                    {prerequisites.map((item) => (
                      <div className={`mini-check ${item.installed ? "ok" : "warn"}`} key={item.name}>
                        {item.installed ? <CheckCircle2 size={17} /> : <Download size={17} />}
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.installed ? item.version : item.fix}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="environment-card workspace-card">
                  <div className="section-kicker">{e.workspace}</div>
                  <div className="workspace-folder">
                    <label>
                      {e.currentFolder}
                      <input placeholder={e.selectFolder} value={basePath} onChange={(event) => setBasePath(event.target.value)} />
                    </label>
                    <button className="secondary" onClick={chooseBasePath}>
                      <Folder size={16} />
                      {e.selectFolder}
                    </button>
                  </div>

                  <div className="repo-header">
                    <strong>{e.repositories}</strong>
                    <button className="link-button" onClick={() => setCloneOpen((open) => !open)}>
                      <Plus size={14} />
                      {cloneOpen ? e.hideClone : e.addRepo}
                    </button>
                  </div>

                  {repos.length > 0 ? (
                    <div className="repo-strip">
                      {repos.map((repo) => (
                        <button
                          key={repo.path}
                          className={`repo-pill ${repo.path === repoPath ? "selected" : ""}`}
                          onClick={() => setRepoPath(repo.path)}
                        >
                          <GitBranch size={16} />
                          <div>
                            <strong>{repo.name}</strong>
                            <small>
                              {repo.path === repoPath ? e.selected : e.useRepo} - {releaseBranch}
                            </small>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-inline">{e.noRepos}</div>
                  )}

                  {cloneOpen && (
                    <div className="clone-box">
                      <p>{e.cloneHint}</p>
                      <div className="split">
                        <label>
                          {t.repos.cloneUrl}
                          <input
                            placeholder="https://usuario@.../scm/BIMBO-R2-REPOSITORY.git"
                            value={cloneUrl}
                            onChange={(event) => setCloneUrl(event.target.value)}
                          />
                        </label>
                        <label>
                          {t.repos.folderName}
                          <input value={cloneName} onChange={(event) => setCloneName(event.target.value)} />
                        </label>
                        <button onClick={cloneRepository}>
                          <Download size={16} />
                          {t.repos.clone}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {converterSyncOpen && (
          <div className="modal-backdrop" onMouseDown={() => setConverterSyncOpen(false)}>
            <section className="workspace-modal converter-sync-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h2>{t.converterSyncTitle}</h2>
                  <p>{t.converterSyncBody}</p>
                  <p>
                    {t.converterKnowledge}: {knowledgeCatalog.knowledgeVersion} · {t.converterSource}: {knowledgeCatalog.source}
                  </p>
                  <p>
                    {t.converterRules}: {knowledgeCatalog.rules ? `${t.converterRulesAvailable} (${knowledgeCatalog.rules.products.length})` : t.converterRulesMissing}
                  </p>
                </div>
                <button className="icon-close" onClick={() => setConverterSyncOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="inline-actions converter-package-actions">
                <button className="primary" onClick={installLocalKnowledgePackage}>
                  <UploadCloud size={16} />
                  {t.converterInstallPackage}
                </button>
                <button className="secondary" onClick={rollbackLocalKnowledgePackage} disabled={!knowledgeCatalog.previousVersion}>
                  <ChevronLeft size={16} />
                  {t.converterRollback}
                </button>
              </div>
              <div className="clone-box">
                <p>{t.converterUpdateUrl}: {cloudflareKnowledgeUpdateUrl}</p>
                {remoteKnowledgeVersion && (
                  <p>{t.converterUpdateAvailable}: {remoteKnowledgeVersion}</p>
                )}
                <div className="inline-actions converter-package-actions">
                  <button className="secondary" onClick={checkRemoteKnowledgeUpdate}>
                    <RefreshCw size={16} />
                    {t.converterCheckUpdate}
                  </button>
                  <button className="primary" onClick={installRemoteKnowledgeUpdate}>
                    <Download size={16} />
                    {t.converterInstallRemote}
                  </button>
                </div>
              </div>
              <div className="converter-list">
                {converterTechnologies.map((converter) => (
                  <article className="converter-row" key={converter.id}>
                    <div>
                      <strong>{converter.name}</strong>
                      <span>{t.converterVersion}: {converter.version}</span>
                      {(() => {
                        const rules = converterRuleSummaries.get(converter.id);
                        return (
                          <span>
                            {t.converterRules}: {rules ? `${rules.detectors}D / ${rules.extractors}E / ${rules.phaseModel}P` : t.converterRulesMissing}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="inline-actions compact-actions">
                      <button className="secondary" onClick={installLocalKnowledgePackage}>
                        <RefreshCw size={16} />
                        {t.converterUpdate}
                      </button>
                      <button className="secondary" onClick={rollbackLocalKnowledgePackage} disabled={!knowledgeCatalog.previousVersion}>
                        <ChevronLeft size={16} />
                        {t.converterRollback}: {converter.previous}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeStep === "actionPlan" && (
          <section className="panel action-plan-panel">
            <div className="panel-heading">
              <div>
                <h2>{a.title}</h2>
                <p>{a.body}</p>
              </div>
              <button className="icon-button" onClick={resetActionPlanFields} title={a.clear} aria-label={a.clear}>
                <Trash2 size={16} />
              </button>
            </div>

            <div className="action-plan-grid">
              <div className="action-method-toggle">
                <span>CI/CD Tool</span>
                <div className="binary-toggle" role="group" aria-label="CI/CD Tool">
                  <button
                    type="button"
                    className={actionMethod === "manual" ? "active" : ""}
                    onClick={() => setActionMethod("manual")}
                    aria-pressed={actionMethod === "manual"}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className={actionMethod === "cicd" ? "active" : ""}
                    onClick={() => setActionMethod("cicd")}
                    aria-pressed={actionMethod === "cicd"}
                  >
                    Yes
                  </button>
                </div>
                <small>
                  Modo: {actionMethod === "manual" ? a.methodManual : a.methodCicd}
                </small>
              </div>
              <label className="action-rfc-field">
                RFC
                <input placeholder="4-B002S34" value={rfc} onChange={(event) => setRfc(event.target.value)} />
              </label>
              <label className="action-product-field">
                {a.product}
                <select
                  value={actionProduct}
                  onChange={(event) => {
                    const nextProduct = event.target.value;
                    setActionProduct(nextProduct);
                    setActionTemplateId((current) => actionTemplateMatchesProduct(current, nextProduct, allActionTemplateOptions) ? current : "auto");
                  }}
                >
                  <option value="" disabled>
                    {a.selectProduct}
                  </option>
                  <option value="OIC">OIC</option>
                  <option value="MFT">MFT</option>
                  <option value="Base de datos">Base de datos</option>
                  <option value="SOA">SOA</option>
                  <option value="JAVA">JAVA</option>
                  <option value="ODI Studio">ODI Studio</option>
                  <option value="OSB">OSB</option>
                </select>
              </label>
              {actionMethod === "cicd" && (
                <label className="action-repo-field">
                  {a.repository}
                  <select value={repoPath} onChange={(event) => setRepoPath(event.target.value)}>
                    <option value="" disabled>
                      {repos.length ? a.selectRepository : e.noRepos}
                    </option>
                    {repos.map((repo) => (
                      <option key={repo.path} value={repo.path}>
                        {repo.name} - {releaseBranch}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="action-environment-field">
                {a.environment}
                <select value={actionEnvironment} onChange={(event) => handleActionEnvironmentChange(event.target.value)}>
                  <option value="" disabled>
                    {a.selectEnvironment}
                  </option>
                  {actionPlanEnvironments.map((environment) => (
                    <option key={environment} value={environment}>
                      {environment}
                    </option>
                  ))}
                  {availableDocumentEnvironments
                    .filter(
                      (environment) =>
                        !actionPlanEnvironments.some(
                          (option) => normalizeEnvironmentName(option) === normalizeEnvironmentName(environment)
                        )
                    )
                    .map((environment) => (
                      <option key={environment} value={environment}>
                        {environment}
                      </option>
                    ))}
                </select>
              </label>
              <label className="action-instance-field">
                  {a.instance}
                  <input value={actionInstance} onChange={(event) => setActionInstance(event.target.value)} />
              </label>
              <label className="action-activity-field">
                {a.activity}
                <input
                  placeholder="Deploy Lookup / Install Integration"
                  value={actionActivity}
                  onChange={(event) => setActionActivity(event.target.value)}
                />
              </label>
              {actionMethod === "manual" && (
                <label className="action-scope-field">
                  {a.scopeNotes}
                  <textarea
                    value={actionScopeNotes}
                    onChange={(event) => setActionScopeNotes(event.target.value)}
                    placeholder={a.scopeNotesHint}
                  />
                </label>
              )}
              {actionMethod === "manual" && (
                <label className="action-document-field">
                  {a.sourceDocument}
                  <div className="action-document-picker">
                    <button
                      type="button"
                      className="secondary"
                      disabled={actionDocumentProcessing}
                      onClick={selectActionDocument}
                      title={actionDocumentProcessing ? a.processingDocument : a.loadDocument}
                    >
                      {actionDocumentProcessing ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
                      {actionDocumentProcessing ? a.processingDocument : a.loadDocument}
                    </button>
                    <span>
                      {actionDocumentProcessing
                        ? a.processingDocument
                        : actionSourceDocument
                          ? `${actionSourceDocument.name}${actionSourceDocument.ignoredDocuments?.length ? ` (+${actionSourceDocument.ignoredDocuments.length} ignored)` : ""}`
                          : a.noDocument}
                    </span>
                  </div>
                </label>
              )}
              {actionMethod === "manual" && (
                <label className="action-template-field">
                  {a.templateReference}
                  <div className="action-document-picker">
                    <select value={actionTemplateId} onChange={(event) => setActionTemplateId(event.target.value as ActionTemplateId)}>
                      {visibleActionTemplateOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.id === "auto" ? a.selectTemplate : option.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="secondary compact" onClick={() => {
                      setCustomTemplateProduct(actionProduct || "Base de datos");
                      setCustomTemplateOpen(true);
                    }}>
                      <Plus size={15} />
                      {a.addTemplate}
                    </button>
                  </div>
                  <small>{a.templateHint}</small>
                </label>
              )}
              {actionMethod === "cicd" && (
                <div className="action-plan-generate-field">
                  <button className="action-plan-generate" onClick={generateActionPlan} title={a.generate}>
                    <FileText size={16} />
                    {a.generate}
                  </button>
                </div>
              )}
            </div>

            {actionMethod === "manual" && (
              <div className="artifact-input">
                <div className="artifact-input-head">
                  <span>{a.manualInstructions}</span>
                  <div className="inline-actions compact-actions">
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={!manualPhases.length}
                      onClick={reviewManualPhases}
                      title={a.reviewManual}
                    >
                      {a.reviewManual}
                    </button>
                    <button className="action-plan-generate" onClick={generateActionPlan} title={a.generate}>
                      <FileText size={16} />
                      {a.generate}
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={a.manualInstructions}
                  value={manualInstructions}
                  onChange={(event) => {
                    setManualInstructions(event.target.value);
                    setManualSourceText(event.target.value);
                    setActionSourceDocument(null);
                  }}
                  placeholder={a.manualInstructionsHint}
                />
              </div>
            )}
            {actionMethod === "manual" && (
              <input
                ref={actionDocumentInputRef}
                className="hidden-file-input"
                type="file"
                accept=".docx,.pdf,.sql"
                multiple
                onChange={handleActionDocumentInput}
              />
            )}

            <div className="artifact-input">
              <div className="artifact-input-head">
                <span>{a.artifacts}</span>
                <button type="button" className="secondary compact" onClick={() => setActionArtifactModalOpen(true)}>
                  <UploadCloud size={15} />
                  {a.inspectArtifacts}
                </button>
              </div>
              <textarea
                value={artifactText}
                onChange={(event) => setArtifactText(event.target.value)}
                onBlur={() => {
                  const cleanedArtifacts = actionProduct === "Base de datos"
                    ? databaseProfileCandidates(artifactText)
                    : artifactLinesFromText(artifactText);
                  if (cleanedArtifacts.length) setArtifactText(cleanedArtifacts.join("\n"));
                }}
                placeholder={a.artifactsHint}
              />
            </div>

            <div className="action-plan-output">
              <div className="output-head">
                <strong>{a.preview}</strong>
                <div>
                  {actionPlanConfirmed && (
                    <span className="action-plan-status">
                      <CheckCircle2 size={15} />
                      {a.confirmed}
                    </span>
                  )}
                  <button className="secondary" disabled={!actionPlan.trim()} onClick={confirmActionPlan} title={a.confirm}>
                    <CheckCircle2 size={16} />
                    {a.confirm}
                  </button>
                  <button className="secondary" disabled={!actionPlan} onClick={copyActionPlan} title={a.copy}>
                    <Copy size={16} />
                    {a.copy}
                  </button>
                  <button className="secondary" onClick={copyActionPlanSupportOutput} title={a.supportOutput}>
                    <MessageSquareText size={16} />
                    {a.supportOutput}
                  </button>
                </div>
              </div>
              <textarea
                className="action-plan-text"
                value={actionPlan}
                onChange={(event) => {
                  setActionPlan(event.target.value);
                  if (actionPlanConfirmed) {
                    setActionPlanConfirmed(false);
                    setActionPlanConfirmedAt("");
                  }
                }}
                placeholder="=========================================================="
              />
              {actionPlanConfirmedAt && (
                <small className="action-plan-confirmed-at">
                  {a.confirmed}: {new Date(actionPlanConfirmedAt).toLocaleString()}
                </small>
              )}
            </div>
          </section>
        )}

        {activeStep === "package" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{t.pkg.title}</h2>
                <p>{t.pkg.body}</p>
              </div>
            </div>

            <div className="form-grid">
              <label>
                RFC
                <input placeholder="4-B002N59" value={rfc} onChange={(event) => setRfc(event.target.value)} />
              </label>
              <label className="wide-field">
                {t.pkg.ricePath}
                <input
                  placeholder="R2/GLR2TE/4-B002N59"
                  value={riceFolderPath}
                  onChange={(event) => setRiceFolderPath(event.target.value)}
                />
                <small>{t.pkg.riceHelp}</small>
              </label>
              <label>
                {t.pkg.mode}
                <div className="segmented">
                  <button className={mode === "ADHOC" ? "active" : ""} onClick={() => setMode("ADHOC")}>
                    ADHOC
                  </button>
                  <button className={mode === "FULL" ? "active" : ""} onClick={() => setMode("FULL")}>
                    FULL
                  </button>
                </div>
                <small>{t.pkg.modeHelp}</small>
              </label>
            </div>

            <div
              className={`file-drop ${isDraggingFiles ? "drag-active" : ""}`}
              onClick={selectFiles}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={addDroppedFiles}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectFiles();
                }
              }}
            >
              <UploadCloud size={28} />
              <strong>{t.pkg.dropTitle}</strong>
              <span>{t.pkg.dropBody}</span>
            </div>

            <div className="file-list">
              {files.map((file) => {
                const inspection = inspectionByPath.get(file.path);
                const inspectionStatus = artifactInspectionStatus(file, inspection);
                const isExpanded = expandedFiles.includes(file.path);
                return (
                  <div className="file-card" key={file.path}>
                    <div className="file-row">
                      <span className="badge">{fileBadge(file.kind)}</span>
                      <div>
                        <strong>{file.name}</strong>
                        <small>{file.path}</small>
                      </div>
                      <span className={`artifact-status-badge ${inspectionStatus.state}`}>
                        {inspectionStatus.state === "exists" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        {inspectionStatus.label}
                      </span>
                      {isInspectableArtifact(file) && (
                        <button className="icon-button" onClick={() => toggleFileDetails(file.path)} title={`Ver contenido del ${fileBadge(file.kind)}`}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      )}
                      <button className="icon-button" onClick={() => removeFile(file.path)} title="Quitar archivo">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {isInspectableArtifact(file) && isExpanded && (
                      <div className="file-details">
                        <div className="output-head compact">
                          <strong>Contenido detectado</strong>
                          <button className="secondary compact" onClick={() => inspectArtifacts([file.path])}>
                            <RefreshCw size={16} />
                            Inspeccionar
                          </button>
                        </div>

                        {renderArtifactInspectionContent(inspection, file)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <button
                className="icon-button"
                disabled={!files.length}
                onClick={clearPackage}
                title={t.pkg.clearPackage}
                aria-label={t.pkg.clearPackage}
              >
                <Trash2 size={16} />
              </button>
              <button className="secondary" disabled={!readyForDraft} onClick={refreshSummary}>
                <History size={16} />
                {t.pkg.preview}
              </button>
              <button disabled={!readyForDraft} onClick={prepareDraft}>
                <Plus size={16} />
                {t.pkg.prepareDraft}
              </button>
            </div>
          </section>
        )}

        {activeStep === "review" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{t.review.title}</h2>
                <p>{t.review.body}</p>
              </div>
              <button disabled={!readyForDraft} onClick={refreshSummary}>
                <RefreshCw size={16} />
                {t.review.refresh}
              </button>
            </div>

            {summary ? (
              <div className="summary">
                <div>
                  <span>{t.review.repository}</span>
                  <strong>{selectedRepo?.name ?? repoPath}</strong>
                </div>
                <div>
                  <span>{t.review.target}</span>
                  <strong>{summary.targetPath}</strong>
                </div>
                <div>
                  <span>{t.review.manifest}</span>
                  <strong>{summary.manifestPath}</strong>
                </div>
                <div>
                  <span>inputs.properties</span>
                  <strong>
                    {Object.entries(summary.inputUpdates)
                      .map(([key, value]) => `${key}=${value}`)
                      .join(" | ")}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">{t.review.empty}</div>
            )}

            {summary && (
              <div className="review-list">
                {summary.filesToCopy.map((file) => (
                  <div className="review-row" key={`${file.source}-${file.destination}`}>
                    <span className="badge">{file.kind}</span>
                    <div>
                      <strong>{file.destination}</strong>
                      <small>
                        {t.review.from} {file.source}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {finalOutput && <pre className="terminal">{finalOutput}</pre>}

            <div className="actions">
              <button className="secondary" onClick={() => setActiveStep("package")}>
                {t.review.edit}
              </button>
              <button className="secondary" onClick={() => desktopApi?.openExternal(projectUrl)}>
                <GitPullRequest size={16} />
                {t.review.openVbs}
              </button>
              <button disabled={!canCommit} onClick={commitRfcLocal}>
                <Play size={16} />
                {t.review.commitLocal}
              </button>
              <button className="secondary" disabled={!canPushBranch} onClick={undoRfcLocalCommit}>
                <Trash2 size={16} />
                {t.review.undoCommit}
              </button>
              <button disabled={!canPushBranch} onClick={pushRfcBranch}>
                <UploadCloud size={16} />
                {t.review.pushBranch}
              </button>
            </div>
          </section>
        )}

        {activeStep === "pipeline" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{t.pipeline.title}</h2>
                <p>{pipelineBody}</p>
              </div>
              <div className="inline-actions compact-actions">
                <button
                  className="icon-button"
                  onClick={resetExecutionFields}
                  title={t.pipeline.clearExecution}
                  aria-label={t.pipeline.clearExecution}
                >
                  <Trash2 size={16} />
                </button>
                <button className="secondary" onClick={() => desktopApi?.openExternal(projectUrl)}>
                  <ExternalLink size={16} />
                  {t.review.openVbs}
                </button>
              </div>
            </div>

            <div className="pipeline-grid pipeline-top-grid general-execution-grid">
              <label className="execution-mode-field">
                {t.pipeline.mode}
                <div className="segmented">
                  <button
                    type="button"
                    className={executionMode === "general" ? "active" : ""}
                    onClick={() => {
                      setExecutionMode("general");
                      setPipelineStepIndex(0);
                      setPipelineStepComments({});
                      setPipelineStepFailures({});
                      setExecutionStepsConfirmed(false);
                      setExecutionStepsReviewOpen(true);
                    }}
                  >
                    {t.pipeline.modeGeneral}
                  </button>
                  <button
                    type="button"
                    className={executionMode === "cicd" ? "active" : ""}
                    onClick={() => {
                      setExecutionMode("cicd");
                      setPipelineActionPlan("");
                      setExecutionSteps([]);
                      setExecutionStepsConfirmed(false);
                      setExecutionStepsReviewOpen(true);
                      setPipelineStepIndex(0);
                      setPipelineStepComments({});
                      setPipelineStepFailures({});
                    }}
                  >
                    {t.pipeline.modeCicd}
                  </button>
                </div>
              </label>
              <label>
                {t.pipeline.rfc}
                <input placeholder="4-B002VTZ" value={rfc} onChange={(event) => setRfc(event.target.value)} />
              </label>
              <label>
                {t.pipeline.executionType}
                <select
                  value={pipelineExecutionPhase}
                  onChange={(event) => {
                    setPipelineExecutionPhase(event.target.value as PipelinePhase);
                    setPipelineStepIndex(0);
                  }}
                >
                  {pipelinePhases.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.pipeline.environment}
                <input
                  value={targetEnvironment}
                  onChange={(event) => setTargetEnvironmentForPhase(event.target.value)}
                />
              </label>
            </div>

            {executionMode === "cicd" && (
              <>
                <label className="artifact-input pipeline-name-field">
                  {t.pipeline.pipeline}
                  <input
                    value={pipelineNameValue}
                    onChange={(event) =>
                      isProdPipelineStep ? setProdPipelineName(event.target.value) : setTestPipelineName(event.target.value)
                    }
                  />
                </label>

                <div className="pipeline-grid execution-cicd-grid">
                  <label>
                    {t.pipeline.run}
                    <input
                    value={pipelineRunValue}
                    onChange={(event) =>
                      isProdPipelineStep ? setProdPipelineRun(event.target.value) : setTestPipelineRun(event.target.value)
                    }
                    />
                  </label>
                  <label>
                    {t.pipeline.runUrl}
                    <input
                    value={pipelineRunUrlValue}
                    onChange={(event) =>
                      isProdPipelineStep ? setProdPipelineRunUrl(event.target.value) : setTestPipelineRunUrl(event.target.value)
                    }
                    />
                  </label>
                </div>
              </>
            )}

            {executionMode === "general" && (
            <div className="pipeline-action-plan">
              <div className="output-head">
                <strong>{t.pipeline.actionPlan}</strong>
                <div className="inline-actions compact-actions">
                  <button className="secondary" onClick={() => executionPlanInputRef.current?.click()} title={t.pipeline.loadActionPlan}>
                    <UploadCloud size={16} />
                    {t.pipeline.loadActionPlan}
                  </button>
                  <button className="secondary" disabled={!actionPlan.trim()} onClick={useGeneratedActionPlanForExecution}>
                    <FileText size={16} />
                    {t.pipeline.useGeneratedPlan}
                  </button>
                  <button className="secondary" onClick={refreshExecutionSteps}>
                    <RefreshCw size={16} />
                    {t.pipeline.refreshSteps}
                  </button>
                </div>
              </div>
              <textarea
                className="pipeline-plan-text"
                value={pipelineActionPlan}
                onChange={(event) => {
                  const value = event.target.value;
                  setPipelineActionPlan(value);
                  setExecutionSteps(parseActionPlanExecutionSteps(value, t.pipeline.steps));
                  setExecutionStepsConfirmed(false);
                  setExecutionStepsReviewOpen(true);
                  setPipelineStepIndex(0);
                  setPipelineStepFailures({});
                }}
                placeholder={t.pipeline.planPlaceholder}
                wrap="soft"
              />
              <input
                ref={executionPlanInputRef}
                type="file"
                accept=".txt,.md,.log"
                className="hidden-file-input"
                onChange={loadExecutionActionPlanFile}
              />
            </div>
            )}

            {executionMode === "general" && hasExecutionActionPlan && executionSteps.length > 0 && (
              <div className="pipeline-action-plan execution-steps-review">
                <div className="output-head">
                  <div>
                    <strong>{t.pipeline.reviewSteps}</strong>
                    <p>{t.pipeline.editStepsHint}</p>
                  </div>
                  {executionStepsConfirmed && !executionStepsReviewOpen ? (
                    <button className="secondary" onClick={() => setExecutionStepsReviewOpen(true)}>
                      <FileText size={16} />
                      {t.pipeline.reviewSteps}
                    </button>
                  ) : (
                    <button className="secondary" onClick={confirmExecutionSteps}>
                      <CheckCircle2 size={16} />
                      {t.pipeline.confirmSteps}
                    </button>
                  )}
                </div>
                {executionStepsConfirmed && !executionStepsReviewOpen ? (
                  <div className="execution-steps-collapsed">
                    {executionSteps.length} {t.pipeline.stepsConfirmed}
                  </div>
                ) : (
                  <div className="execution-step-editor">
                    {executionSteps.map((step, index) => (
                      <article className="execution-step-row" key={index}>
                        <span>{index + 1}</span>
                        <div>
                          <input
                            value={step.title}
                            onChange={(event) => updateExecutionStep(index, "title", event.target.value)}
                          />
                          <textarea
                            value={step.detail}
                            onChange={(event) => updateExecutionStep(index, "detail", event.target.value)}
                            placeholder={t.pipeline.comment}
                          />
                        </div>
                        <button className="icon-button" onClick={() => removeExecutionStep(index)} title={t.deleteHistoryItem}>
                          <Trash2 size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentPipelineSteps.length > 0 && (
              <>
            <div className="pipeline-layout guided-card">
              <div className="guided-rail" aria-label={t.pipeline.checklist}>
                {currentPipelineSteps.map((step, index) => (
                  <button
                    key={`${step.title}-${index}`}
                    className={`rail-step ${pipelineStepIndex === index ? "active" : ""} ${
                      pipelineStepFailures[`${activeStep}-${trackingEnvironment}-${index}`] ? "failed" : ""
                    }`}
                    onClick={() => setPipelineStepIndex(index)}
                    title={step.title}
                  >
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>

              <div className="guided-main">
                <div className="guided-head">
                  <div>
                    <strong>{t.pipeline.checklist}</strong>
                    <h3>{currentPipelineStep?.title}</h3>
                    {currentPipelineStep?.detail && <p className="guided-step-detail">{currentPipelineStep.detail}</p>}
                  </div>
                  <div className="guided-actions">
                    <button
                      className="icon-action"
                      disabled={!evidenceFormReady}
                      onClick={captureRegionEvidence}
                      title={evidenceFormReady ? t.evidence.captureRegion : t.messages.evidenceSetupRequired}
                    >
                      <Camera size={18} />
                    </button>
                    <button
                      className="icon-action"
                      disabled={!evidenceFormReady}
                      onClick={addEvidenceImages}
                      title={evidenceFormReady ? t.evidence.addImage : t.messages.evidenceSetupRequired}
                    >
                      <ImagePlus size={18} />
                    </button>
                    <button
                      className="icon-action"
                      disabled={!evidenceFormReady}
                      onClick={pasteEvidenceImage}
                      title={evidenceFormReady ? t.evidence.paste : t.messages.evidenceSetupRequired}
                    >
                      <ClipboardPaste size={18} />
                    </button>
                    {pipelineStepIndex === 0 && (
                      <button className="icon-action" onClick={() => desktopApi?.openExternal(projectUrl)} title={t.review.openVbs}>
                        <ExternalLink size={18} />
                      </button>
                    )}
                    <div className="pipeline-nav-actions guided-nav-actions">
                      <button className="secondary" disabled={pipelineStepIndex === 0} onClick={() => movePipelineStep(-1)}>
                        {t.pipeline.previous}
                      </button>
                      <button disabled={isFinalPipelineStep} onClick={() => movePipelineStep(1)}>
                        {t.pipeline.next}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="guided-body">
                  <div className="guided-comment-stack">
                    <StepCommentEditor
                      label={t.pipeline.comment}
                      value={pipelineStepComments[pipelineStepKey] ?? ""}
                      onChange={updatePipelineStepComment}
                    />
                    <button
                      type="button"
                      className={`failure-toggle ${currentStepFailed ? "active" : ""}`}
                      onClick={toggleCurrentPipelineStepFailure}
                      aria-pressed={currentStepFailed}
                    >
                      <AlertCircle size={16} />
                      {t.pipeline.stepFailed}
                    </button>
                  </div>
                  <div className="guided-preview">
                    <div className="evidence-preview-head">
                      <strong>{t.pipeline.currentEvidence}</strong>
                      <button
                        className="icon-button"
                        onClick={saveCurrentStepEvidence}
                        disabled={!currentStepEvidence.length}
                        title={t.evidence.saveStepImages}
                        aria-label={t.evidence.saveStepImages}
                      >
                        <Download size={15} />
                      </button>
                    </div>
                    {currentStepEvidence.length ? (
                      currentStepEvidence.map((item) => (
                        <article className="step-evidence-card preview-card" key={item.id}>
                          <button className="image-preview-button" onClick={() => setImagePreview(item)}>
                            <img src={item.dataUrl} alt={item.name} />
                          </button>
                          <div>
                            <strong>{item.name}</strong>
                            {item.note && <span>{item.note}</span>}
                          </div>
                          <button
                            className="icon-button evidence-save"
                            onClick={() => saveEvidenceImage(item)}
                            title={t.evidence.saveImage}
                            aria-label={t.evidence.saveImage}
                          >
                            <Download size={15} />
                          </button>
                          <button className="icon-button evidence-remove" onClick={() => removeEvidence(item.id)}>
                            <Trash2 size={15} />
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="empty-inline evidence-placeholder">{t.evidence.empty}</div>
                    )}
                  </div>
                </div>

                {canExportCurrentEvidence && (
                  <div className="guided-final actions inline-actions">
                    <button className="secondary" onClick={() => exportEvidence("docx")}>
                      <Download size={16} />
                      {t.pipeline.downloadDocx}
                    </button>
                    <button className="secondary" onClick={() => exportEvidence("pdf")}>
                      <Download size={16} />
                      {t.pipeline.downloadPdf}
                    </button>
                    {executionMode === "cicd" && (
                      <button className="secondary" onClick={() => setProdMessageOpen(true)}>
                        <MessageSquareText size={16} />
                        {t.pipeline.prodMessage}
                      </button>
                    )}
                  </div>
                )}

              </div>
            </div>

            <div className="summary pipeline-summary">
              <div>
                <span>RFC</span>
                <strong>{rfc || "<RFC>"}</strong>
              </div>
              <div>
                <span>{t.pipeline.environment}</span>
                <strong>{targetEnvironment}</strong>
              </div>
            </div>
              </>
            )}
          </section>
        )}
      </main>

      <aside className={`evidence-drawer ${evidenceOpen ? "open" : ""}`}>
        <div className="evidence-head">
          <div>
            <strong>{t.evidence.log}</strong>
            <span>{stepTitle(activeStep)} · {rfc || "<RFC>"}</span>
          </div>
          <div className="evidence-head-actions">
            <button
              className="icon-button"
              onClick={copyActiveStepLog}
              disabled={!activeStepLog.length}
              title={t.evidence.copyLog}
              aria-label={t.evidence.copyLog}
            >
              <Copy size={17} />
            </button>
            <button className="icon-button" onClick={() => setEvidenceOpen(false)} title={t.close} aria-label={t.close}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="evidence-section">
          <div className="evidence-log">
            {activeStepLog.length === 0 && <p className="empty-inline">{t.evidence.empty}</p>}
            {activeStepLog.map((entry) => (
              <div key={entry.id}>
                <span>[{new Date(entry.at).toLocaleString()}] {stepTitle(entry.step)}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {actionArtifactModalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setActionArtifactModalOpen(false)}>
          <section className="workspace-modal action-artifact-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{a.artifactInspectorTitle}</h2>
                <p>{a.artifactInspectorBody}</p>
              </div>
              <button className="icon-close" onClick={() => setActionArtifactModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div
              className={`file-drop action-artifact-drop ${isDraggingActionArtifacts ? "dragging" : ""}`}
              onClick={selectActionArtifacts}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setIsDraggingActionArtifacts(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingActionArtifacts(false);
              }}
              onDrop={addDroppedActionArtifacts}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectActionArtifacts();
                }
              }}
            >
              <UploadCloud size={26} />
              <strong>{a.inspectArtifacts}</strong>
              <span>{t.pkg.dropBody}</span>
            </div>

            <div className="artifact-compare-section">
              <div className="output-head compact">
                <strong>{a.artifactCompare}</strong>
                <div className="inline-actions compact-actions">
                  <button className="secondary compact" disabled={!actionArtifactFiles.length} onClick={() => inspectActionArtifacts()}>
                    <RefreshCw size={15} />
                    {a.inspectArtifacts}
                  </button>
                  <button className="secondary compact" disabled={!actionArtifactFiles.length} onClick={clearActionArtifacts}>
                    <Trash2 size={15} />
                    {a.clear}
                  </button>
                </div>
              </div>

              {actionArtifactRows.length ? (
                <div className="artifact-compare-table">
                  <div className="artifact-compare-row artifact-compare-header">
                    <span>{a.artifactDocument}</span>
                    <span>{a.artifactLoaded}</span>
                    <span>{a.artifactVersion}</span>
                    <span>{a.artifactStatus}</span>
                  </div>
                  {actionArtifactRows.map((row, index) => {
                    const statusLabel = row.status === "exists" ? a.artifactExists : row.status === "missing" ? a.artifactMissing : a.artifactExtra;
                    const statusClass = row.status === "extra" ? "extra" : row.status;
                    return (
                      <div className="artifact-compare-row" key={`${row.documentName}-${row.artifactName}-${index}`}>
                        <span data-label={a.artifactDocument}>{row.documentName}</span>
                        <span data-label={a.artifactLoaded}>{row.artifactName}</span>
                        <span data-label={a.artifactVersion}>{row.version}</span>
                        <span data-label={a.artifactStatus} className={`artifact-status-badge ${statusClass}`}>
                          {row.status === "exists" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-inline">{actionArtifactFiles.length ? a.noArtifactComparison : a.noActionArtifacts}</p>
              )}
            </div>

            <div className="artifact-compare-section">
              <strong>{a.artifactDetails}</strong>
              <div className="file-list action-artifact-list">
                {actionArtifactFiles.map((file) => {
                  const inspection = actionInspectionByPath.get(file.path);
                  const inspectionStatus = actionArtifactInspectionStatus(file, inspection);
                  const isExpanded = expandedActionArtifactFiles.includes(file.path);
                  return (
                    <div className="file-card" key={file.path}>
                      <div className="file-row">
                        <span className="badge">{fileBadge(file.kind)}</span>
                        <div>
                          <strong>{file.name}</strong>
                          <small>{file.path}</small>
                        </div>
                        <span className={`artifact-status-badge ${inspectionStatus.state}`}>
                          {inspectionStatus.state === "exists" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                          {inspectionStatus.label}
                        </span>
                        {isInspectableArtifact(file) && (
                          <button className="icon-button" onClick={() => toggleActionArtifactDetails(file.path)} title={`Ver contenido del ${fileBadge(file.kind)}`}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        <button className="icon-button" onClick={() => removeActionArtifact(file.path)} title="Quitar archivo">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {isInspectableArtifact(file) && isExpanded && (
                        <div className="file-details">
                          {renderArtifactInspectionContent(inspection, file, 30)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {customTemplateOpen && (
        <div className="modal-backdrop" onMouseDown={() => setCustomTemplateOpen(false)}>
          <section className="workspace-modal action-artifact-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{a.customTemplateTitle}</h2>
                <p>{a.templateHint}</p>
              </div>
              <button className="icon-close" onClick={() => setCustomTemplateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-grid">
              <label>
                {a.templateName}
                <input value={customTemplateName} onChange={(event) => setCustomTemplateName(event.target.value)} placeholder="DB - Reset password regional" />
              </label>
              <label>
                {a.product}
                <select value={customTemplateProduct} onChange={(event) => setCustomTemplateProduct(event.target.value)}>
                  <option value="OIC">OIC</option>
                  <option value="MFT">MFT</option>
                  <option value="Base de datos">Base de datos</option>
                  <option value="SOA">SOA</option>
                  <option value="JAVA">JAVA</option>
                  <option value="ODI Studio">ODI Studio</option>
                  <option value="OSB">OSB</option>
                </select>
              </label>
              <label>
                {a.templateCategory}
                <input value={customTemplateCategory} onChange={(event) => setCustomTemplateCategory(event.target.value)} placeholder="Reset password / Deployment / Patching" />
              </label>
            </div>

            <label className="artifact-input">
              {a.templateContent}
              <textarea
                value={customTemplateContent}
                onChange={(event) => setCustomTemplateContent(event.target.value)}
                placeholder="Pega aqui el template o los pasos base. La app lo usara como referencia manual, no como regla automatica."
              />
            </label>

            <div className="workspace-actions modal-actions">
              <button className="secondary" onClick={() => setCustomTemplateOpen(false)}>
                {a.clear}
              </button>
              <button className="primary" onClick={saveCustomTemplate}>
                <Plus size={16} />
                {a.saveTemplate}
              </button>
            </div>
          </section>
        </div>
      )}

      {manualReviewOpen && manualPhases.length > 0 && (
        <div className="modal-backdrop" onMouseDown={() => setManualReviewOpen(false)}>
          <section className="workspace-modal manual-review-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{a.manualReviewTitle}</h2>
                <p>{a.manualReviewBody}</p>
              </div>
              <button className="icon-close" onClick={() => setManualReviewOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="manual-review-layout">
              <nav className="manual-phase-tabs" aria-label={a.manualReviewTitle}>
                {manualPhases.map((phase, index) => {
                  const phaseKey = manualPhaseKey(phase, index);
                  const enabled = !manualPhaseDisabledKeys.includes(phaseKey);
                  return (
                    <div
                      key={phaseKey}
                      className={`manual-phase-tab ${manualPhaseIndex === index ? "active" : ""} ${enabled ? "" : "excluded"}`}
                    >
                      <label className="manual-phase-check" title={a.includePhase}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => toggleManualPhaseEnabled(index, event.target.checked)}
                        />
                        <span className="sr-only">{a.includePhase}</span>
                      </label>
                      <button type="button" onClick={() => setManualPhaseIndex(index)}>
                        <span>{String.fromCharCode(65 + index)}</span>
                        {phase.title}
                      </button>
                    </div>
                  );
                })}
              </nav>
              <label className={`manual-phase-editor ${manualPhaseDisabledKeys.includes(manualPhaseKey(manualPhases[manualPhaseIndex], manualPhaseIndex)) ? "excluded" : ""}`}>
                {manualPhases[manualPhaseIndex]?.title}
                <textarea
                  ref={manualPhaseTextareaRef}
                  value={manualPhases[manualPhaseIndex]?.content ?? ""}
                  onChange={(event) => updateManualPhaseContent(event.target.value)}
                />
              </label>
            </div>

            <div className="workspace-actions modal-actions">
              <button
                className="secondary"
                disabled={manualPhaseIndex === 0}
                onClick={() => setManualPhaseIndex((index) => Math.max(0, index - 1))}
              >
                Anterior
              </button>
              <button
                className="secondary"
                disabled={manualPhaseIndex === manualPhases.length - 1}
                onClick={() => setManualPhaseIndex((index) => Math.min(manualPhases.length - 1, index + 1))}
              >
                Siguiente
              </button>
              <button onClick={acceptManualReview}>
                <FileText size={16} />
                {a.acceptReview}
              </button>
            </div>
          </section>
        </div>
      )}

      {supportOutputOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSupportOutputOpen(false)}>
          <section className="workspace-modal action-artifact-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{a.supportTitle}</h2>
                <p>{a.supportBody}</p>
              </div>
              <button className="icon-close" onClick={() => setSupportOutputOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <label className="artifact-input">
              {a.supportOutput}
              <textarea
                className="action-plan-text"
                value={supportOutputText}
                onChange={(event) => setSupportOutputText(event.target.value)}
              />
            </label>

            <div className="workspace-actions modal-actions">
              <button className="secondary" onClick={() => setSupportOutputOpen(false)}>
                {a.clear}
              </button>
              <button
                className="primary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(supportOutputText);
                  setMessage(a.supportCopied);
                }}
              >
                <Copy size={16} />
                {a.copy}
              </button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="workspace-modal settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{t.settings}</h2>
                <p>
                  {settingsTab === "history" && outputFolder
                    ? `${t.outputFolder}: ${outputFolder}`
                    : settingsTab === "pending"
                      ? t.pendingWork
                      : settingsTab === "environment"
                        ? `${t.workspaceFolder}: ${basePath}`
                        : t.app}
                </p>
              </div>
              <button className="icon-close" onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="settings-layout">
              <nav className="settings-tabs" aria-label={t.settings}>
                <button className={settingsTab === "language" ? "active" : ""} onClick={() => setSettingsTab("language")}>
                  <Languages size={16} />
                  {t.languageTab}
                </button>
                <button className={settingsTab === "environment" ? "active" : ""} onClick={() => setSettingsTab("environment")}>
                  <Folder size={16} />
                  {t.environmentSettings}
                </button>
                <button className={settingsTab === "history" ? "active" : ""} onClick={() => setSettingsTab("history")}>
                  <History size={16} />
                  {t.history}
                </button>
                <button className={settingsTab === "pending" ? "active" : ""} onClick={() => setSettingsTab("pending")}>
                  <AlertCircle size={16} />
                  {t.pendingWork}
                </button>
                <button className={settingsTab === "themes" ? "active" : ""} onClick={() => setSettingsTab("themes")}>
                  <Palette size={16} />
                  {t.themes}
                </button>
                <button className={settingsTab === "user" ? "active" : ""} onClick={() => setSettingsTab("user")}>
                  <UserRound size={16} />
                  {t.userData}
                </button>
                <button className={settingsTab === "about" ? "active" : ""} onClick={() => setSettingsTab("about")}>
                  <Info size={16} />
                  {t.about}
                </button>
              </nav>

              <div className="settings-content">
                {settingsTab === "language" && (
                  <div className="settings-section-grid">
                    <section className="settings-section">
                      <div className="section-kicker">{t.language}</div>
                      <div className="option-grid">
                        {(Object.keys(languageNames) as Lang[]).map((language) => (
                          <button
                            key={language}
                            className={`option-tile ${lang === language ? "selected" : ""}`}
                            onClick={() => setLang(language)}
                          >
                            {languageNames[language]}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="settings-section">
                      <div className="section-kicker">{t.documentLanguage}</div>
                      <div className="option-grid">
                        {(Object.keys(languageNames) as Lang[]).map((language) => (
                          <button
                            key={`doc-${language}`}
                            className={`option-tile ${documentLang === language ? "selected" : ""}`}
                            onClick={() => setDocumentLang(language)}
                          >
                            {languageNames[language]}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "environment" && (
                  <div className="settings-section-grid">
                    <section className="settings-section wide-settings-section">
                      <div className="section-kicker">{t.workspaceFolder}</div>
                      <div className="workspace-folder">
                        <label>
                          {e.currentFolder}
                          <input placeholder={t.chooseFolder} value={basePath} onChange={(event) => setBasePath(event.target.value)} />
                        </label>
                        <button className="secondary" onClick={chooseBasePath}>
                          <Folder size={16} />
                          {t.chooseFolder}
                        </button>
                        <button className="secondary" onClick={scanRepos}>
                          <RefreshCw size={16} />
                          {t.refreshRepos}
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "history" && (
                  <>
                    <div className="workspace-actions modal-actions">
                      <label className="history-search">
                        {t.historySearch}
                        <input
                          value={historySearch}
                          onChange={(event) => setHistorySearch(event.target.value)}
                          placeholder="4-B002VTZ"
                        />
                      </label>
                      <button
                        className="icon-button"
                        onClick={chooseOutputFolder}
                        title={outputFolder || t.chooseFolder}
                        aria-label={outputFolder || t.chooseFolder}
                      >
                        <Folder size={16} />
                      </button>
                    </div>
                    <div className="history-list">
                      {executionHistory.length === 0 && <div className="empty-inline">{t.noHistory}</div>}
                      {executionHistory.length > 0 && filteredExecutionHistory.length === 0 && (
                        <div className="empty-inline">{t.noHistoryResults}</div>
                      )}
                      {visibleExecutionHistory.map((item) => (
                        <article className="history-row" key={item.id}>
                          <div>
                            <strong>{item.rfc} · {item.phase} · {item.kind.toUpperCase()}</strong>
                            <span>{new Date(item.exportedAt).toLocaleString()}</span>
                            <small>{item.path}</small>
                          </div>
                          <div className="history-actions">
                            <button
                              className="icon-button"
                              onClick={() => showItemInFolder(item.path)}
                              title={t.openFolder}
                              aria-label={t.openFolder}
                            >
                              <Folder size={16} />
                            </button>
                            <button className="secondary" onClick={() => openLocalPath(item.path)}>
                              <ExternalLink size={16} />
                              {t.openFile}
                            </button>
                            <button className="secondary danger-outline" onClick={() => removeHistoryItem(item)}>
                              <Trash2 size={16} />
                              {t.deleteHistoryItem}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {filteredExecutionHistory.length > historyPageSize && (
                      <div className="history-pagination">
                        <button
                          className="icon-button"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                          title={t.pipeline.previous}
                          aria-label={t.pipeline.previous}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          {t.historyPage} {historyPage} / {historyTotalPages}
                        </span>
                        <button
                          className="icon-button"
                          disabled={historyPage === historyTotalPages}
                          onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                          title={t.pipeline.next}
                          aria-label={t.pipeline.next}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {settingsTab === "pending" && (
                  <>
                    <div className="workspace-actions modal-actions">
                      <label className="history-search">
                        {t.pendingSearch}
                        <input
                          value={pendingSearch}
                          onChange={(event) => setPendingSearch(event.target.value)}
                          placeholder="4-B0034NK"
                        />
                      </label>
                    </div>
                    <div className="pending-work-list">
                      {pendingWorkItems.length === 0 && <div className="empty-inline">{t.noPendingWork}</div>}
                      {pendingWorkItems.length > 0 && filteredPendingWorkItems.length === 0 && (
                        <div className="empty-inline">{t.noHistoryResults}</div>
                      )}
                      {visiblePendingWorkItems.map((item) => (
                        <article className="pending-work-row pending-work-row-detailed" key={item.id}>
                          <div>
                            <strong>{item.rfc}</strong>
                            <span>{t.caseFile.repo}: {item.repository}</span>
                            <span>{t.caseFile.environment}: {item.environment}</span>
                            <span>{t.caseFile.artifacts}: {item.artifacts}</span>
                            <span>{a.product}: {item.product}</span>
                            <span>{a.method}: {item.method}</span>
                            <span>{t.pendingDetails}: {item.stepName}</span>
                            <span>{t.evidence.title}: {item.evidenceCount}</span>
                            <span>{t.pipeline.actionPlan}: {item.actionPlanReady ? t.ready : t.caseFile.pending}</span>
                            <span>{t.pipeline.checklist}: {item.executionStepsReady ? t.ready : t.caseFile.pending}</span>
                            {item.pendingLabels.length > 0 && (
                              <small>{t.caseFile.pending}: {item.pendingLabels.join(", ")}</small>
                            )}
                          </div>
                          <div className="history-actions">
                            <button className="secondary" onClick={() => continuePendingWork(item)}>
                              <Play size={16} />
                              {t.continuePendingWork}
                            </button>
                            <button className="secondary danger-outline" onClick={() => removePendingWork(item.id)}>
                              <Trash2 size={16} />
                              {t.deletePendingWork}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {filteredPendingWorkItems.length > historyPageSize && (
                      <div className="history-pagination">
                        <button
                          className="icon-button"
                          disabled={pendingPage === 1}
                          onClick={() => setPendingPage((page) => Math.max(1, page - 1))}
                          title={t.pipeline.previous}
                          aria-label={t.pipeline.previous}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span>
                          {t.historyPage} {pendingPage} / {pendingTotalPages}
                        </span>
                        <button
                          className="icon-button"
                          disabled={pendingPage === pendingTotalPages}
                          onClick={() => setPendingPage((page) => Math.min(pendingTotalPages, page + 1))}
                          title={t.pipeline.next}
                          aria-label={t.pipeline.next}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {settingsTab === "user" && (
                  <div className="settings-section-grid">
                    <section className="settings-section wide-settings-section profile-section">
                      <div className="profile-editor-head">
                        <img src={avatarUrl(profileAvatarSeed, profileAvatarStyle)} alt={profileName || t.userData} />
                        <div>
                          <div className="section-kicker">{t.profileTitle}</div>
                          <p>{t.profileBody}</p>
                        </div>
                      </div>
                      <div className="profile-form-grid">
                        <label>
                          {t.profileName}
                          <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={defaultProfile.name} />
                        </label>
                        <label>
                          {t.profileEmail}
                          <input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="usuario@empresa.com" />
                        </label>
                        <label>
                          {t.profilePhone}
                          <input value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="+52" />
                        </label>
                      </div>
                      <div className="section-kicker avatar-kicker">{t.profileAvatarStyle}</div>
                      <div className="avatar-style-grid">
                        {avatarStyles.map((style) => (
                          <button
                            key={style.id}
                            className={`avatar-style-option ${profileAvatarStyle === style.id ? "selected" : ""}`}
                            onClick={() => setProfileAvatarStyle(style.id)}
                          >
                            <img src={avatarUrl(profileAvatarSeed, style.id)} alt="" />
                            <span>{style.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="section-kicker avatar-kicker">{t.profileAvatar}</div>
                      <div className="avatar-grid">
                        {avatarOptions.map((seed) => (
                          <button
                            key={seed}
                            className={`avatar-option ${profileAvatarSeed === seed ? "selected" : ""}`}
                            onClick={() => setProfileAvatarSeed(seed)}
                            aria-label={`${t.profileAvatar} ${seed}`}
                          >
                            <img src={avatarUrl(seed, profileAvatarStyle)} alt="" />
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="settings-section wide-settings-section user-data-section">
                      <div className="section-kicker">{t.userDataTitle}</div>
                      <p>{t.userDataBody}</p>
                      <div className="user-data-actions">
                        <button className="secondary" onClick={backupUserData}>
                          <Download size={16} />
                          {t.backupUserData}
                        </button>
                        <label>
                          {t.deleteConfirmLabel}
                          <input
                            value={userDataConfirm}
                            onChange={(event) => setUserDataConfirm(event.target.value)}
                            placeholder={t.deleteConfirmPlaceholder}
                          />
                        </label>
                        <button className="danger-button" disabled={userDataConfirm.trim() !== "BORRAR"} onClick={deleteUserData}>
                          <Trash2 size={16} />
                          {t.deleteUserData}
                        </button>
                      </div>
                      {userDataBackupPath && (
                        <div className="backup-path">
                          <span>{t.backupCreated}</span>
                          <button className="link-button" onClick={() => openLocalPath(userDataBackupPath)}>
                            {userDataBackupPath}
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {settingsTab === "themes" && (
                  <div className="settings-section-grid">
                    <section className="settings-section">
                      <div className="section-kicker">{t.appTheme}</div>
                      <div className="theme-grid">
                        {(Object.keys(themeNames[lang]) as ThemeId[]).map((theme) => (
                          <button
                            key={theme}
                            className={`theme-card theme-swatch-${theme} ${themeId === theme ? "selected" : ""}`}
                            onClick={() => selectTheme(theme)}
                          >
                            <span />
                            <div className="theme-card-copy">
                              <strong>{themeNames[lang][theme]}</strong>
                              <small
                                className="theme-tone-indicator"
                                aria-label={themeToneNames[lang][theme === "custom" ? customThemeTone : themeTone[theme]]}
                                title={themeToneNames[lang][theme === "custom" ? customThemeTone : themeTone[theme]]}
                              >
                                <i className={`theme-tone-dot ${theme === "custom" ? customThemeTone : themeTone[theme]}`} />
                              </small>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="settings-section">
                      <div className="section-kicker">{t.textSize}</div>
                      <div className="option-grid text-size-grid">
                        {(Object.keys(uiTextSizeNames[lang]) as UiTextSize[]).map((size) => (
                          <button
                            key={size}
                            className={`text-size-option ${size} ${uiTextSize === size ? "selected" : ""}`}
                            onClick={() => setUiTextSize(size)}
                            title={uiTextSizeNames[lang][size]}
                            aria-label={uiTextSizeNames[lang][size]}
                          >
                            <span className={`text-size-letter ${size}`}>A</span>
                          </button>
                        ))}
                      </div>
                    </section>
                    {themeId === "custom" && (
                      <>
                        <section className="settings-section">
                          <div className="section-kicker">{t.backgroundStyle}</div>
                          <div className="option-grid background-style-grid">
                            {(Object.keys(uiBackgroundStyleNames[lang]) as UiBackgroundStyle[]).map((style) => (
                              <button
                                key={style}
                                className={`option-tile ${uiBackgroundStyle === style ? "selected" : ""}`}
                                onClick={() => setUiBackgroundStyle(style)}
                              >
                                {uiBackgroundStyleNames[lang][style]}
                              </button>
                            ))}
                          </div>
                          <label className="toggle-row">
                            <input
                              type="checkbox"
                              checked={animatedBackground}
                              onChange={(event) => setAnimatedBackground(event.target.checked)}
                            />
                            {t.animatedBackground}
                          </label>
                          {animatedBackground && (
                            <>
                              <div className="section-kicker nested-kicker">{t.animationSpeed}</div>
                              <div className="option-grid text-size-grid">
                                {(Object.keys(uiAnimationSpeedNames[lang]) as UiAnimationSpeed[]).map((speed) => (
                                  <button
                                    key={speed}
                                    className={`option-tile ${uiAnimationSpeed === speed ? "selected" : ""}`}
                                    onClick={() => setUiAnimationSpeed(speed)}
                                  >
                                    {uiAnimationSpeedNames[lang][speed]}
                                  </button>
                                ))}
                              </div>
                              <div className="section-kicker nested-kicker">{t.animationMotion}</div>
                              <div className="option-grid motion-grid">
                                {(Object.keys(uiAnimationMotionNames[lang]) as UiAnimationMotion[]).map((motion) => (
                                  <button
                                    key={motion}
                                    className={`option-tile ${uiAnimationMotion === motion ? "selected" : ""}`}
                                    onClick={() => setUiAnimationMotion(motion)}
                                  >
                                    {uiAnimationMotionNames[lang][motion]}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <div className="background-image-actions">
                            <button className="secondary" onClick={() => backgroundImageInputRef.current?.click()}>
                              <ImagePlus size={16} />
                              {t.chooseBackgroundImage}
                            </button>
                            <button
                              className="secondary"
                              disabled={!customBackgroundImage}
                              onClick={() => {
                                setCustomBackgroundImage("");
                                if (uiBackgroundStyle === "image") setUiBackgroundStyle("default");
                              }}
                            >
                              <Trash2 size={16} />
                              {t.clearBackgroundImage}
                            </button>
                          </div>
                          <input
                            ref={backgroundImageInputRef}
                            className="hidden-file-input"
                            type="file"
                            accept="image/*"
                            onChange={handleBackgroundImageInput}
                          />
                          <label>
                            {t.backgroundBlur}
                            <input
                              type="range"
                              min="0"
                              max="24"
                              step="1"
                              value={backgroundImageBlur}
                              onChange={(event) => setBackgroundImageBlur(Number(event.target.value))}
                            />
                          </label>
                        </section>
                        <section className="settings-section">
                          <div className="section-title-row">
                            <div className="section-kicker">{t.customGradient}</div>
                            <button className="secondary compact" onClick={resetCustomTheme}>
                              <RefreshCw size={15} />
                              {t.resetCustomTheme}
                            </button>
                          </div>
                          <div className="color-picker-grid">
                            <label>
                              {t.backgroundA}
                              <input
                                type="color"
                                value={customColorA}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setCustomColorA(next);
                                  setCustomGradient(`linear-gradient(135deg, ${next} 0%, ${customColorB} 52%, ${customColorC} 100%)`);
                                }}
                              />
                            </label>
                            <label>
                              {t.backgroundB}
                              <input
                                type="color"
                                value={customColorB}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setCustomColorB(next);
                                  setCustomGradient(`linear-gradient(135deg, ${customColorA} 0%, ${next} 52%, ${customColorC} 100%)`);
                                }}
                              />
                            </label>
                            <label>
                              {t.backgroundC}
                              <input
                                type="color"
                                value={customColorC}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setCustomColorC(next);
                                  setCustomGradient(`linear-gradient(135deg, ${customColorA} 0%, ${customColorB} 52%, ${next} 100%)`);
                                }}
                              />
                            </label>
                            <label>
                              {t.panelColor}
                              <input
                                type="color"
                                value={customPanelColor}
                                onChange={(event) => setCustomPanelColor(event.target.value)}
                              />
                            </label>
                            <label>
                              {t.panelTransparency}
                              <input
                                type="range"
                                min="0.62"
                                max="1"
                                step="0.02"
                                value={themeTransparency}
                                onChange={(event) => setThemeTransparency(Number(event.target.value))}
                              />
                            </label>
                            <label>
                              {t.panelBlur}
                              <input
                                type="range"
                                min="0"
                                max="28"
                                step="1"
                                value={themeBlur}
                                onChange={(event) => setThemeBlur(Number(event.target.value))}
                              />
                            </label>
                            <label>
                              {t.sidebarColor}
                              <input
                                type="color"
                                value={uiSidebarColor}
                                onChange={(event) => {
                                  setUiSidebarColor(event.target.value);
                                  setCustomSidebar(event.target.value);
                                }}
                              />
                            </label>
                            <label>
                              {t.accentColor}
                              <input
                                type="color"
                                value={customAccent}
                                onChange={(event) => setCustomAccent(event.target.value)}
                              />
                            </label>
                          </div>
                          <label>
                            {t.sidebarTransparency}
                            <input
                              type="range"
                              min="0.56"
                              max="1"
                              step="0.02"
                              value={sidebarTransparency}
                              onChange={(event) => setSidebarTransparency(Number(event.target.value))}
                            />
                          </label>
                          <label>
                            {t.sidebarBlur}
                            <input
                              type="range"
                              min="0"
                              max="28"
                              step="1"
                              value={sidebarBlur}
                              onChange={(event) => setSidebarBlur(Number(event.target.value))}
                            />
                          </label>
                        </section>
                      </>
                    )}
                  </div>
                )}

                {settingsTab === "about" && (
                  <section className="about-panel" aria-label={t.about}>
                    <div className="about-oracle-mark">ORACLE</div>
                    <p className="about-kicker">ABOUT</p>
                    <h3>CSS Ops Hub</h3>
                    <div className="about-rule" />
                    <p className="about-muted">Developed by:</p>
                    <strong>Geovani Gomez Perez</strong>
                    <strong>CSS Team Mex / EU</strong>
                    <p>Software Developer, CSS Global SaaS & Apps Delivery</p>
                    <dl>
                      <div>
                        <dt>Version:</dt>
                        <dd>1.0 beta</dd>
                      </div>
                      <div>
                        <dt>Company:</dt>
                        <dd>Oracle Corporation</dd>
                      </div>
                    </dl>
                    <p className="about-internal">Internal use only.</p>
                  </section>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {exportModalOpen && lastExportPath && (
        <div className="modal-backdrop" onMouseDown={() => setExportModalOpen(false)}>
          <section className="workspace-modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="export-success-icon">
              <CheckCircle2 size={30} />
            </div>
            <h2>{t.exportReadyTitle}</h2>
            <p>{t.exportReadyBody}</p>
            <div className="export-path">{lastExportPath}</div>
            <div className="actions export-actions">
              <button onClick={() => openLocalPath(lastExportPath)}>
                <ExternalLink size={16} />
                {t.openFile}
              </button>
              <button className="secondary" onClick={() => setExportModalOpen(false)}>
                {t.close}
              </button>
            </div>
          </section>
        </div>
      )}

      {prodMessageOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProdMessageOpen(false)}>
          <section className="workspace-modal prod-message-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{t.pipeline.prodMessageTitle}</h2>
                <p>{t.pipeline.prodMessageBody}</p>
              </div>
              <button className="icon-close" onClick={() => setProdMessageOpen(false)} title={t.close} aria-label={t.close}>
                <X size={18} />
              </button>
            </div>
            <pre className="prod-message-text">{prodContinuationMessage}</pre>
            <div className="actions export-actions">
              <button onClick={copyProdContinuationMessage}>
                <Copy size={16} />
                {t.pipeline.copy}
              </button>
              <button className="secondary" onClick={() => setProdMessageOpen(false)}>
                {t.close}
              </button>
            </div>
          </section>
        </div>
      )}

      {message && !exportModalOpen && !prodMessageOpen && (
        <div className="notice-modal-backdrop" onMouseDown={() => setMessage(null)}>
          <section className="workspace-modal notice-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="notice-modal-icon">
              <AlertCircle size={26} />
            </div>
            <h2>{t.alertTitle}</h2>
            <p>{message}</p>
            <div className="actions export-actions">
              {lastExportPath && message.startsWith(t.messages.exportOk) && (
                <button className="secondary" onClick={() => openLocalPath(lastExportPath)}>
                  <ExternalLink size={16} />
                  {t.openFile}
                </button>
              )}
              <button onClick={() => setMessage(null)}>{t.close}</button>
            </div>
          </section>
        </div>
      )}

      {imagePreview && (
        <div className="image-modal-backdrop" onMouseDown={() => setImagePreview(null)}>
          <div className="image-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="image-modal-head">
              <div>
                <strong>{imagePreview.name}</strong>
                <span>{stepTitle(imagePreview.step)} · {new Date(imagePreview.createdAt).toLocaleString()}</span>
              </div>
              <div className="image-modal-actions">
                <button
                  className="icon-button"
                  onClick={() => saveEvidenceImage(imagePreview)}
                  title={t.evidence.saveImage}
                  aria-label={t.evidence.saveImage}
                >
                  <Download size={18} />
                </button>
                <button className="icon-button" onClick={() => setImagePreview(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <img src={imagePreview.dataUrl} alt={imagePreview.name} />
          </div>
        </div>
      )}

      {instantTooltip && (
        <div className="instant-tooltip" style={{ left: instantTooltip.x, top: instantTooltip.y }}>
          {instantTooltip.text}
        </div>
      )}
    </div>
  );
}
