import { buildDatabaseSqlPlan, hasDatabaseInstructions } from "./database";
import { buildJavaWeblogicPlan, hasJavaWeblogicInstructions, javaConfigurationItems } from "./java";
import { buildMftConfigurationPlan, hasMftInstructions, mftConfigurationItems, mftManualPlanMetadata } from "./mft";
import { buildOdiTopologyPlan, hasOdiInstructions, isOdiProductName, odiConfigurationItems, odiManualPlanMetadata } from "./odi";
import { buildManualPhasesFromDocument, oicConfigurationItems } from "./oic";
import { buildOsbConfigurationPlan, hasOsbInstructions, osbConfigurationItems } from "./osb";
import type { ManualActionPhase } from "./types";

export function isMftManualPlan(productName: string, text: string) {
  return productName === "MFT" && hasMftInstructions(text);
}

export function isDatabaseManualPlan(productName: string, text: string) {
  return /^(?:Base de datos|Oracle Database|Database)$/i.test(productName.trim()) && hasDatabaseInstructions(text);
}

export function isOdiManualPlan(productName: string, text: string) {
  return isOdiProductName(productName) && hasOdiInstructions(text);
}

export function isOsbManualPlan(productName: string, text: string) {
  return productName === "OSB" && hasOsbInstructions(text);
}

export function isJavaManualPlan(productName: string, text: string) {
  return productName === "JAVA" && hasJavaWeblogicInstructions(text);
}

export function buildManualPhasesForProduct(productName: string, text: string, environment: string): ManualActionPhase[] {
  if (isMftManualPlan(productName, text)) return buildMftConfigurationPlan(text, environment);
  if (isDatabaseManualPlan(productName, text)) return buildDatabaseSqlPlan(text, environment);
  if (isOdiManualPlan(productName, text)) return buildOdiTopologyPlan(text, environment);
  if (isOsbManualPlan(productName, text)) return buildOsbConfigurationPlan(text, environment);
  if (isJavaManualPlan(productName, text)) return buildJavaWeblogicPlan(text, environment);
  return buildManualPhasesFromDocument(text, environment);
}

export function configurationItemsForProduct(productName: string, text: string) {
  if (productName === "OIC") return oicConfigurationItems(text);
  if (isMftManualPlan(productName, text)) return mftConfigurationItems(text);
  if (isOdiManualPlan(productName, text)) return odiConfigurationItems(text);
  if (isOsbManualPlan(productName, text)) return osbConfigurationItems(text);
  if (isJavaManualPlan(productName, text)) return javaConfigurationItems(text);
  return [];
}

export function manualPlanMetadataForProduct(productName: string, environmentName: string, instanceName: string, instructions: string) {
  if (isMftManualPlan(productName, instructions)) {
    return mftManualPlanMetadata(productName, environmentName, instanceName, instructions);
  }
  if (isOdiManualPlan(productName, instructions)) {
    return odiManualPlanMetadata(productName, environmentName, instanceName, instructions);
  }
  return "";
}
