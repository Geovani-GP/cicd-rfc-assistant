import actionTemplateCatalog from "./action-templates.json";
import converterManifest from "./converters.manifest.json";

export type EmbeddedConverterTechnology = {
  id: string;
  name: string;
  version: string;
  previous: string;
  modules: string[];
};

export type EmbeddedKnowledgeManifest = {
  schemaVersion: number;
  knowledgeVersion: string;
  source: "embedded" | "local" | "remote";
  minAppVersion: string;
  products: EmbeddedConverterTechnology[];
};

export type EmbeddedActionTemplate = {
  id: string;
  product?: string;
  label: string;
  hint: string;
};

export const embeddedKnowledgeManifest = converterManifest as EmbeddedKnowledgeManifest;
export const embeddedConverterTechnologies = embeddedKnowledgeManifest.products;
export const embeddedActionTemplateOptions = actionTemplateCatalog.templates as EmbeddedActionTemplate[];

export type RuntimeKnowledgeSource = "embedded" | "local" | "remote";

export type RuntimeKnowledgeCatalog = {
  schemaVersion: number;
  knowledgeVersion: string;
  source: RuntimeKnowledgeSource;
  products: EmbeddedConverterTechnology[];
  templates: EmbeddedActionTemplate[];
  rules?: {
    schemaVersion: number;
    knowledgeVersion: string;
    rulesSchema?: string;
    products: Array<{
      id: string;
      path: string;
      detectors: number;
      extractors: number;
      phaseModel: number;
    }>;
  };
  basePath?: string;
  previousVersion?: string | null;
};

export function embeddedRuntimeKnowledge(): RuntimeKnowledgeCatalog {
  return {
    schemaVersion: embeddedKnowledgeManifest.schemaVersion,
    knowledgeVersion: embeddedKnowledgeManifest.knowledgeVersion,
    source: "embedded",
    products: embeddedConverterTechnologies,
    templates: embeddedActionTemplateOptions,
    previousVersion: null
  };
}
