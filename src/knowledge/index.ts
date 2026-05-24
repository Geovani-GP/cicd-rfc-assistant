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
