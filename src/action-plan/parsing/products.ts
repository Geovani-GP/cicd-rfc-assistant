import { buildDatabaseSqlPlan, hasDatabaseInstructions } from "./database";
import { buildMftConfigurationPlan, hasMftInstructions, mftConfigurationItems, mftManualPlanMetadata } from "./mft";
import { buildManualPhasesFromDocument } from "./oic";
import type { ManualActionPhase } from "./types";

export function isMftManualPlan(productName: string, text: string) {
  return productName === "MFT" && hasMftInstructions(text);
}

export function isDatabaseManualPlan(productName: string, text: string) {
  return productName === "Base de datos" && hasDatabaseInstructions(text);
}

export function buildManualPhasesForProduct(productName: string, text: string, environment: string): ManualActionPhase[] {
  if (isMftManualPlan(productName, text)) return buildMftConfigurationPlan(text, environment);
  if (isDatabaseManualPlan(productName, text)) return buildDatabaseSqlPlan(text, environment);
  return buildManualPhasesFromDocument(text, environment);
}

export function configurationItemsForProduct(productName: string, text: string) {
  return isMftManualPlan(productName, text) ? mftConfigurationItems(text) : [];
}

export function manualPlanMetadataForProduct(productName: string, environmentName: string, instanceName: string, instructions: string) {
  if (isMftManualPlan(productName, instructions)) {
    return mftManualPlanMetadata(productName, environmentName, instanceName, instructions);
  }
  return "";
}
