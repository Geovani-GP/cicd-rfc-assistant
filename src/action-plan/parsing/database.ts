import { asBullets, prepareManualPhaseContent } from "./common";
import type { ManualActionPhase } from "./types";

export function hasSqlInstructions(text: string) {
  return /\b(?:CREATE|ALTER|DROP|TRUNCATE|DELETE|UPDATE|PURGE|GRANT|REVOKE)\s+\w+\b/i.test(text) || /^\s*SQL>/im.test(text);
}

function hasProfilePasswordLifeTimeRequest(text: string) {
  return /\bPASSWORD[_\s-]*LIFE[_\s-]*TIME\b/i.test(text) &&
    (
      /\b(?:PROFILE|SCHEMA|SCHEMAS|USER|USERS|DBA_PROFILES|DBA_USERS|180\s*DAYS?|180\s*DIAS?|180DAYS?)\b/i.test(text) ||
      /^GB_[A-Z0-9_$#.-]+$/im.test(text)
    );
}

function hasDatabasePasswordResetRequest(text: string) {
  return /\b(?:RESET|CHANGE|UPDATE)\s+(?:PASS|PASSWORD)\b|\bPASSWORD\s+RESET\b/i.test(text) &&
    /\b(?:USER|USERS|DBA_USERS|ACCOUNT\s+UNLOCK|ALTER\s+USER)\b/i.test(text) &&
    /\bGB_[A-Z0-9_$#.-]+\b/i.test(text);
}

function hasDatabaseUnlockWithOicConnectionPasswordRequest(text: string) {
  return /\bunlock\b[\s\S]{0,120}\b(?:user|database|account)\b|\bACCOUNT\s+UNLOCK\b/i.test(text) &&
    /\bGB_[A-Z0-9_$#.-]+\b/i.test(text) &&
    /\b(?:OIC|connector|conector|connection)\b/i.test(text) &&
    /\b(?:password|contrase(?:n|ñ)a|credentials?)\b/i.test(text);
}

export function hasDatabaseDiscoveryInstructions(text: string) {
  const hasDiscoveryScript = /\b(?:Discovery_script\.zip|discovery_script\.sql|generate_html\.pl)\b/i.test(text);
  const hasSecurityScript = /\b(?:Security_script\.zip|security_features_status_(?:CDB|PDB)\.sql)\b/i.test(text);
  const hasHealthCheckScript = /\b(?:HCHECK_script\.zip|hout\.sql|hcheck\.sql)\b/i.test(text);
  const hasSysdbaExecution = /\bsqlplus\s+["']?\/\s+as\s+sysdba["']?/i.test(text);
  const hasContainerDatabaseSignals = /\bORACLE_PDB_SID\b|\bCON_ID\b[\s\S]{0,160}\bCON_NAME\b|\bPDB[A-Z0-9_$#.-]+\b/i.test(text);
  return hasDiscoveryScript && hasSecurityScript && hasHealthCheckScript && hasSysdbaExecution && hasContainerDatabaseSignals;
}

export function hasDatabaseInstructions(text: string) {
  return hasDatabaseDiscoveryInstructions(text) ||
    hasLaclsFiscalEventsDbPatchUpdate(text) ||
    hasLaclsColombiaMagneticMediaDbInstall(text) ||
    hasLaclsUruguayCommercialReceiptsDbInstall(text) ||
    hasDatabaseScriptInstallWithRestorePoint(text) ||
    hasDatabaseBackupPurgeInstructions(text) ||
    hasSqlInstructions(text) ||
    hasProfilePasswordLifeTimeRequest(text) ||
    hasDatabaseUnlockWithOicConnectionPasswordRequest(text) ||
    hasDatabasePasswordResetRequest(text);
}

function databaseObjectNames(text: string) {
  const matches = Array.from(
    text.matchAll(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\s+([A-Z0-9_$#.-]+)/gi)
  ).map((match) => match[1]);
  return Array.from(new Map(matches.map((name) => [name.toUpperCase(), name])).values());
}

function databaseUserNames(text: string) {
  const matches = [
    ...Array.from(text.matchAll(/\bALTER\s+USER\s+([A-Z0-9_$#.-]+)/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bGB_[A-Z0-9_$#.-]+\b/gi)).map((match) => match[0])
  ];
  return Array.from(new Map(matches.map((name) => [name.toUpperCase(), name])).values());
}

function oicConnectionNamesFromDatabaseRequest(text: string) {
  const matches = [
    ...Array.from(text.matchAll(/\b(?:connector|conector|connection)\s+([A-Z][A-Z0-9_$#.-]+)\b/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\b([A-Z][A-Z0-9_$#.-]*_DB[A-Z0-9_$#.-]*)\b/g)).map((match) => match[1])
  ];
  return uniqueValues(matches);
}

function uniqueValues(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    byKey.set(clean.toUpperCase(), clean);
  }
  return Array.from(byKey.values());
}

function sqlScriptNames(text: string) {
  return uniqueValues(text.match(/\b[A-Z0-9_.$#-]+\.sql\b/gi) ?? []);
}

function hasDatabaseScriptInstallWithRestorePoint(text: string) {
  return /\brestore_point\.sh\b/i.test(text) &&
    /\bsqlplus\s+\/\s+as\s+sysdba\b/i.test(text) &&
    /\b@[A-Z0-9_.#$-]+\.sql\b/i.test(text) &&
    /(?:\bpdbsid\s+PDB[A-Z0-9_$#.-]+\b|\bPDB[A-Z0-9_$#.-]+\b)/i.test(text);
}

function databaseScriptInstallScript(text: string) {
  return text.match(/@([A-Z0-9_.#$-]+\.sql)\b/i)?.[1] ??
    sqlScriptNames(text)[0] ??
    "<SCRIPT_NAME.sql>";
}

function databaseScriptInstallDirectory(text: string) {
  return text.match(/\bcd\s+([/~A-Z0-9_.$#-][^\s\r\n]*)/i)?.[1] ?? "<SCRIPT_DIRECTORY>";
}

function databaseScriptInstallRestoreCommand(text: string) {
  const match = text.match(/(\/usr\/local\/MAS\/ohsupg\/bin\/restore_point\.sh[\s\S]{0,160}?-pdbsid\s+PDB[A-Z0-9_$#.-]+)/i)?.[1];
  return match?.replace(/\s+-\s+/g, " -").replace(/\s+/g, " ").trim() ??
    "/usr/local/MAS/ohsupg/bin/restore_point.sh -mode create -tag <RFC_OR_TAG> -pdbsid <PDB_SID>";
}

function databaseScriptInstallPdb(text: string) {
  return text.match(/\bpdbsid\s+(PDB[A-Z0-9_$#.-]+)\b/i)?.[1] ??
    text.match(/\b(PDB[A-Z0-9_$#.-]+)\s+database\b/i)?.[1] ??
    "<PDB_SID>";
}

function databaseScriptInstallExpectedObject(text: string) {
  return text.match(/\b([A-Z0-9_$#.-]+\.[A-Z0-9_$#.-]+)\b(?=[\s\S]{0,80}(?:are|is)\s+created\s+successfully)/i)?.[1] ??
    text.match(/\btable\s+\(?([A-Z0-9_$#.-]+\.[A-Z0-9_$#.-]+)\)?/i)?.[1] ??
    "";
}

function databaseScriptInstallExpectedIntegration(text: string) {
  return uniqueValues(text.match(/\b(?:IN|OUT|INT|IEWC|ICWC|ICWE)[A-Z0-9_-]*(?:_[A-Z0-9_-]+)+\b/gi) ?? [])
    .find((item) => !/SCRIPT_INSTALLATION/i.test(item) && !/WO_Reception-TXN_Tables_Scripts/i.test(item)) ?? "";
}

function hasLaclsFiscalEventsDbPatchUpdate(text: string) {
  return /\bLACLS\b/i.test(text) &&
    /\b(?:Fiscal Events Control Solution|ReformaTributaria|Reforma Tributaria|Update Objects LACLS ATP|FISCAL_INTEG)\b/i.test(text) &&
    /\b(?:p39731462_11130_Generic\.zip|39731462|fix39731462\.sql)\b/i.test(text) &&
    /\b(?:ATP|Database|DB|sql|script|objects?)\b/i.test(text);
}

function laclsFiscalEventsPatchPackageNames(text: string) {
  const packages = uniqueValues(text.match(/\bp39731462_11130_Generic\.zip\b/gi) ?? []);
  return packages.length ? packages : ["p39731462_11130_Generic.zip"];
}

function laclsFiscalEventsPatchScript(text: string) {
  return sqlScriptNames(text).find((item) => /^fix39731462\.sql$/i.test(item)) ?? "fix39731462.sql";
}

function hasLaclsColombiaMagneticMediaDbInstall(text: string) {
  return /\bLACLS\b/i.test(text) &&
    /\bColombia\b/i.test(text) &&
    /\bMagnetic Media\b/i.test(text) &&
    /\bCREATE\/UPDATE DATABASE REPOSITORY\b|\bRunning Install script\b|\bInstall_co_mm_doc_equi\.sql\b/i.test(text);
}

function laclsDatabasePackageNames(text: string) {
  return uniqueValues(text.match(/\bLACLS Magnetic Media DB\.zip\b/gi) ?? []);
}

function laclsDatabaseInstallScript(text: string) {
  return sqlScriptNames(text).find((item) => /^Install_co_mm_doc_equi\.sql$/i.test(item)) ?? "Install_co_mm_doc_equi.sql";
}

function laclsDatabaseSqlScripts(text: string) {
  const scripts = sqlScriptNames(text);
  const installScript = laclsDatabaseInstallScript(text);
  const ordered = [
    installScript,
    ...scripts.filter((item) => !/^Install_co_mm_doc_equi\.sql$/i.test(item))
  ];
  return uniqueValues(ordered);
}

function hasLaclsUruguayCommercialReceiptsDbInstall(text: string) {
  return /\bLACLS\b/i.test(text) &&
    /\bUruguay\b|\bUruguayan\b|\bUY\b/i.test(text) &&
    /\bCommercial Receipts\b|\bR_COMERC\b|\bResguardo\b/i.test(text) &&
    /\bINSTALLING DATABASE COMPONENTS\b|\bInstall_uy_cr\.sql\b/i.test(text);
}

function laclsUruguayCommercialReceiptsPackageNames(text: string) {
  return uniqueValues(text.match(/\bLACLS_UY_COMMERCIAL_RECEIPTS_DB\.zip\b/gi) ?? []);
}

function laclsUruguayCommercialReceiptsInstallScript(text: string) {
  return sqlScriptNames(text).find((item) => /^Install_uy_cr\.sql$/i.test(item)) ?? "Install_uy_cr.sql";
}

function laclsUruguayCommercialReceiptsSqlScripts(text: string) {
  const scripts = sqlScriptNames(text);
  const installScript = laclsUruguayCommercialReceiptsInstallScript(text);
  return uniqueValues([
    installScript,
    ...scripts.filter((item) => !/^Install_uy_cr\.sql$/i.test(item))
  ]);
}

function databaseComponentSchema(text: string) {
  return text.match(/\bsqlplus\s+([A-Z0-9_$#.-]+)@/i)?.[1] ??
    text.match(/\bOWNER\s*=\s*'([A-Z0-9_$#.-]+)'/i)?.[1] ??
    text.match(/\bschema\s+([A-Z0-9_$#.-]+)/i)?.[1] ??
    "";
}

function databaseValidationObjects(text: string) {
  const objectList = Array.from(text.matchAll(/'([A-Z0-9_$#.-]+)'/gi))
    .map((match) => match[1])
    .filter((name) => /^GB_/i.test(name));
  return uniqueValues(objectList);
}

function hasDatabaseComponentInstall(text: string) {
  return /\bDATABASE COMPONENTS\b|\bCreate database components\b|\bExecute Next Scripts\b/i.test(text) &&
    sqlScriptNames(text).length > 0;
}

function databaseTargetName(text: string) {
  return text.match(/\bGBDB[A-Z0-9_$#.-]+\b/i)?.[0] ?? "";
}

function databaseNameInfoFromText(text: string) {
  const implementationPlanMatch = text.match(/\bDatabase\s*:\s*["']?([A-Z0-9_$#.-]+)["']?/i);
  if (implementationPlanMatch?.[1]) {
    return { name: implementationPlanMatch[1], source: "implementationPlan" as const };
  }
  const rfcCommentMatch = text.match(/\b(?:one\s+)?CDB\s+(?:which\s+)?(?:is|name\s+is|name\s*:)\s*["']?([A-Z0-9_$#.-]+)["']?/i);
  if (rfcCommentMatch?.[1]) {
    return { name: rfcCommentMatch[1], source: "rfcComment" as const };
  }
  return { name: "", source: "" as const };
}

function databaseNameFromText(text: string) {
  return databaseNameInfoFromText(text).name;
}

function cdbConnectIdentifierFromText(text: string) {
  return text.match(/\b(?:one\s+)?CDB\s+(?:which\s+)?(?:is|name\s+is|name\s*:)\s*["']?[A-Z0-9_$#.-]+["']?\s*\(([A-Z0-9_$#.-]+)\)/i)?.[1] ??
    "";
}

export function hasDatabaseDiscoveryMissingDatabaseName(text: string) {
  return hasDatabaseDiscoveryInstructions(text) && !databaseNameFromText(text);
}

function implementationTargetName(text: string) {
  return text.match(/\bImplementation Plan for\s+([A-Z0-9_$#.-]+)\b/i)?.[1] ??
    text.match(/\bTarget instance:\s*([A-Z0-9_$#.-]+)/i)?.[1] ??
    databaseTargetName(text);
}

function databaseDiscoveryArtifacts(text: string) {
  return uniqueValues(text.match(/\b(?:Discovery_script|Security_script|HCHECK_script)\.zip\b/gi) ?? []);
}

function databaseDiscoveryPdbs(text: string) {
  const rows = Array.from(text.matchAll(/^\s*(\d+)\s+((?:PDB)[A-Z0-9_$#.-]+)\s+READ\s+WRITE\s+(?:YES|NO)\b/gim))
    .map((match) => ({ conId: match[1], name: match[2] }));
  const exports = Array.from(text.matchAll(/\bORACLE_PDB_SID\s*=\s*((?:PDB)[A-Z0-9_$#.-]+)/gi))
    .map((match) => ({ conId: "", name: match[1] }));
  const byName = new Map<string, { conId: string; name: string }>();
  for (const pdb of [...rows, ...exports]) {
    const key = pdb.name.toUpperCase();
    const existing = byName.get(key);
    byName.set(key, existing?.conId ? existing : pdb);
  }
  return Array.from(byName.values());
}

type DatabaseBackupPurgePair = {
  sourceTable: string;
  backupTable: string;
  backupWhere: string;
  deleteWhere: string;
};

function statementSqlChunks(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(";")
    .map((chunk) => {
      const normalizedChunk = chunk
        .replace(/^\s*(?:>>\s*)?\$?\s*/gm, "")
        .replace(/\s+/g, " ")
        .trim();
      const match = normalizedChunk.match(/\b(?:CREATE\s+TABLE|DELETE\s+FROM)\b/i);
      if (!match || match.index === undefined) return "";
      return `${normalizedChunk.slice(match.index).trim()};`;
    })
    .filter(Boolean);
}

function countChar(value: string, char: string) {
  return Array.from(value).filter((item) => item === char).length;
}

function cleanSqlWhereClause(value: string) {
  let clean = value.trim().replace(/;$/, "").trim();
  while (clean.endsWith(")") && countChar(clean, ")") > countChar(clean, "(")) {
    clean = clean.slice(0, -1).trim();
  }
  return clean;
}

function normalizeSqlPredicate(value: string) {
  return cleanSqlWhereClause(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "$1");
}

function parseCreateTableAsSelect(statement: string) {
  const match = statement.match(/^CREATE\s+TABLE\s+([A-Z0-9_$#.-]+)\s+AS\s*\(?\s*SELECT\b[\s\S]*?\bFROM\s+([A-Z0-9_$#.-]+)\s+WHERE\s+([\s\S]*?)\s*;?$/i);
  if (!match) return null;
  return {
    backupTable: match[1],
    sourceTable: match[2],
    backupWhere: cleanSqlWhereClause(match[3])
  };
}

function parseDeleteFrom(statement: string) {
  const match = statement.match(/^DELETE\s+FROM\s+([A-Z0-9_$#.-]+)\s+WHERE\s+([\s\S]*?)\s*;?$/i);
  if (!match) return null;
  return {
    sourceTable: match[1],
    deleteWhere: cleanSqlWhereClause(match[2])
  };
}

function databaseBackupPurgePairs(text: string): DatabaseBackupPurgePair[] {
  const statements = statementSqlChunks(text);
  const creates = statements.map(parseCreateTableAsSelect).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const deletes = statements.map(parseDeleteFrom).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const usedDeleteIndexes = new Set<number>();
  const pairs: DatabaseBackupPurgePair[] = [];

  for (const create of creates) {
    const normalizedCreateTable = create.sourceTable.toUpperCase();
    const normalizedCreateWhere = normalizeSqlPredicate(create.backupWhere);
    const exactDeleteIndex = deletes.findIndex((deleteItem, index) =>
      !usedDeleteIndexes.has(index) &&
      deleteItem.sourceTable.toUpperCase() === normalizedCreateTable &&
      normalizeSqlPredicate(deleteItem.deleteWhere) === normalizedCreateWhere
    );
    const fallbackDeleteIndex = exactDeleteIndex >= 0
      ? exactDeleteIndex
      : deletes.findIndex((deleteItem, index) =>
          !usedDeleteIndexes.has(index) &&
          deleteItem.sourceTable.toUpperCase() === normalizedCreateTable
        );
    if (fallbackDeleteIndex < 0) continue;
    usedDeleteIndexes.add(fallbackDeleteIndex);
    pairs.push({
      ...create,
      deleteWhere: deletes[fallbackDeleteIndex].deleteWhere
    });
  }

  return pairs;
}

export function hasDatabaseBackupPurgeInstructions(text: string) {
  return databaseBackupPurgePairs(text).length > 0 &&
    /\b(?:BACK\s*UP|BACKUP|PURGE|DELETE\s+FROM)\b/i.test(text);
}

function tableSchemaName(tableName: string) {
  const parts = tableName.split(".");
  return parts.length > 1 ? parts[0] : "";
}

function tableObjectName(tableName: string) {
  const parts = tableName.split(".");
  return parts[parts.length - 1] || tableName;
}

function formatSqlCount(tableName: string, whereClause?: string, alias = "ROW_COUNT") {
  if (!whereClause?.trim()) {
    return [
      `SELECT COUNT(*) AS ${alias}`,
      `FROM ${tableName};`
    ].join("\n");
  }
  return [
    `SELECT COUNT(*) AS ${alias}`,
    `FROM ${tableName}`,
    `WHERE ${whereClause};`
  ].join("\n");
}

function formatCreateBackupSql(pair: DatabaseBackupPurgePair) {
  return [
    `CREATE TABLE ${pair.backupTable} AS`,
    "SELECT *",
    `FROM ${pair.sourceTable}`,
    `WHERE ${pair.backupWhere};`
  ].join("\n");
}

function formatDeleteSql(pair: DatabaseBackupPurgePair) {
  return [
    `DELETE FROM ${pair.sourceTable}`,
    `WHERE ${pair.deleteWhere};`
  ].join("\n");
}

function formatRestoreSql(pair: DatabaseBackupPurgePair) {
  return [
    `INSERT INTO ${pair.sourceTable}`,
    `SELECT * FROM ${pair.backupTable};`,
    "COMMIT;"
  ].join("\n");
}

export function databaseConfigurationItems(text: string) {
  if (hasDatabaseScriptInstallWithRestorePoint(text)) {
    const expectedObject = databaseScriptInstallExpectedObject(text);
    const expectedIntegration = databaseScriptInstallExpectedIntegration(text);
    return uniqueValues([
      `Script: ${databaseScriptInstallScript(text)}`,
      `Target PDB: ${databaseScriptInstallPdb(text)}`,
      expectedObject ? `Expected object: ${expectedObject}` : "",
      expectedIntegration ? `Related integration/process: ${expectedIntegration}` : "",
      `Restore point command: ${databaseScriptInstallRestoreCommand(text)}`
    ].filter(Boolean));
  }
  if (hasDatabaseBackupPurgeInstructions(text)) {
    const items = databaseBackupPurgePairs(text).flatMap((pair) => [
      `Table: ${pair.sourceTable}`,
      `Backup table: ${pair.backupTable}`
    ]);
    return uniqueValues(items);
  }
  if (hasLaclsColombiaMagneticMediaDbInstall(text)) {
    const packages = laclsDatabasePackageNames(text);
    const scripts = laclsDatabaseSqlScripts(text);
    return uniqueValues([
      ...packages.map((item) => `Package: ${item}`),
      `Install script: ${laclsDatabaseInstallScript(text)}`,
      scripts.length > 1 ? `Internal SQL scripts invoked by installer: ${scripts.length - 1}` : ""
    ].filter(Boolean));
  }
  if (hasLaclsFiscalEventsDbPatchUpdate(text)) {
    return uniqueValues([
      ...laclsFiscalEventsPatchPackageNames(text).map((item) => `Patch artifact: ${item}`),
      `Update script: ${laclsFiscalEventsPatchScript(text)}`,
      "Target schema/user: LACLS",
      "Dependency: RFC 4-B003ZMG completed"
    ]);
  }
  if (hasLaclsUruguayCommercialReceiptsDbInstall(text)) {
    const packages = laclsUruguayCommercialReceiptsPackageNames(text);
    const scripts = laclsUruguayCommercialReceiptsSqlScripts(text);
    return uniqueValues([
      ...packages.map((item) => `Package: ${item}`),
      `Install script: ${laclsUruguayCommercialReceiptsInstallScript(text)}`,
      scripts.length > 1 ? `Internal SQL scripts invoked by installer: ${scripts.length - 1}` : ""
    ].filter(Boolean));
  }
  if (hasDatabaseUnlockWithOicConnectionPasswordRequest(text)) {
    const users = databaseUserNames(text);
    const connections = oicConnectionNamesFromDatabaseRequest(text);
    return uniqueValues([
      ...users.map((item) => `Database user: ${item}`),
      ...connections.map((item) => `OIC connection: ${item}`)
    ]);
  }
  return databaseProfileCandidates(text);
}

function passwordRecipient(text: string) {
  return text.match(/\bsend\s+the\s+new\s+password\s+for\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i)?.[1]?.trim() ??
    text.match(/\bshare\s+password\s+with\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i)?.[1]?.trim() ??
    "<AUTHORIZED_RECIPIENT>";
}

export function databaseProfileCandidates(text: string) {
  const profileMatches = [
    ...Array.from(text.matchAll(/\bPROFILE\s*=\s*['"]?([A-Z0-9_$#.-]+)['"]?/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/\bALTER\s+PROFILE\s+([A-Z0-9_$#.-]+)/gi)).map((match) => match[1])
  ];
  const listedNames = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => /^[A-Z][A-Z0-9_$#.-]*(?:_[A-Z0-9_$#.-]+)+$/i.test(line));
  return Array.from(new Map([...profileMatches, ...listedNames].map((name) => [name.toUpperCase(), name])).values());
}

function classifyDatabaseOperation(text: string) {
  const normalized = text.toUpperCase();
  const isProfilePasswordLifeTime = /\bALTER\s+PROFILE\b[\s\S]*\bPASSWORD_LIFE_TIME\b|\bPASSWORD[_\s-]*LIFE[_\s-]*TIME\b[\s\S]*\b(?:PROFILE|SCHEMA|SCHEMAS)\b/.test(normalized);
  const isPassword = /\bALTER\s+USER\b[\s\S]*\bIDENTIFIED\s+BY\b/.test(normalized);
  const isPurge = /\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|PURGE)\b/.test(normalized);
  const isDml = /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|MERGE\s+INTO)\b/.test(normalized);
  const isCreate = /\bCREATE\s+(?:PROFILE|USER|TABLE|VIEW|INDEX|SEQUENCE|ROLE|SYNONYM)\b/.test(normalized);
  const restoreMentioned = /\b(?:RESTORE\s+POINT|FLASHBACK|EXPDP|BACKUP|SNAPSHOT|ROLLBACK)\b/.test(normalized);

  if (isProfilePasswordLifeTime) return { kind: "profilePasswordLifeTime", restoreMentioned };
  if (isPassword) return { kind: "password", restoreMentioned };
  if (isPurge) return { kind: "purge", restoreMentioned };
  if (isDml) return { kind: "dml", restoreMentioned };
  if (isCreate) return { kind: "create", restoreMentioned };
  return { kind: "general", restoreMentioned };
}

function validationQuery(schema: string, objects: string[]) {
  const owner = schema || "<SCHEMA_NAME>";
  const objectPredicate = objects.length
    ? objects.map((objectName, index) => `${index === 0 ? "" : "                   "}'${objectName}'`).join(",\n")
    : "'<OBJECT_NAME>'";
  return `SELECT OWNER,
       OBJECT_NAME,
       OBJECT_TYPE,
       STATUS,
       LAST_DDL_TIME
FROM ALL_OBJECTS
WHERE OWNER = '${owner}'
  AND OBJECT_NAME IN (${objectPredicate})
ORDER BY OBJECT_TYPE DESC;`;
}

function buildDatabaseComponentsPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const scripts = sqlScriptNames(text);
  const schema = databaseComponentSchema(text) || "<SCHEMA_NAME>";
  const objects = databaseValidationObjects(text).filter((objectName) => objectName.toUpperCase() !== schema.toUpperCase());
  const query = validationQuery(schema, objects);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, PDB access, and approved maintenance window.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target schema/user:\n- ${schema}`,
        "Confirm the execution account has privileges to connect to the target PDB and execute the provided scripts.",
        "Confirm all SQL scripts are available before execution.",
        "Set the SQL session to UTF-8 before connecting.",
        "Do not capture or expose database password values."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Capture current database object status before executing the scripts.",
        "Execute:",
        query,
        "If existing objects are returned, coordinate backup/export requirements with the DBA or request owner before continuing.",
        "Capture pre-change evidence and attach it to the RFC."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "Set UTF-8 in the bash session:",
        "export NLS_LANG=AMERICAN_AMERICA.AL32UTF8",
        `Connect to the target PDB using SQL*Plus or the approved SQL tool as:\n- ${schema}@PDBTRAN`,
        "Execute the SQL scripts in the following order:",
        scripts.map((scriptName, index) => `${index + 1}. ${scriptName}`).join("\n"),
        "Capture the execution output for each script.",
        "If any script returns an Oracle error, stop execution immediately, capture the error, and escalate to DBA/request owner before continuing."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database component installation."
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate database objects after script execution.",
        "Execute:",
        query,
        "Expected result:",
        "- All objects created or modified by the scripts must be returned.",
        "- STATUS must be VALID for the package and database objects.",
        "- Any INVALID object must be captured and escalated before closing the RFC."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If execution or validation fails, stop the change and capture the Oracle error.",
        "Do not continue with remaining scripts unless the DBA/request owner approves it.",
        "If rollback is required, restore the previous database objects from the approved backup/export or execute the DBA-approved rollback script.",
        "Escalate to DBA/request owner before retrying."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach pre-change object status evidence.",
        "Attach SQL script execution output for each script.",
        "Attach final object status validation.",
        "Attach error evidence and rollback evidence if applicable.",
        "Do not attach credential/password evidence."
      ].join("\n")
    }
  ];
}

function buildDatabaseScriptInstallWithRestorePointPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const targetHost = implementationTargetName(text) || databaseTargetName(text) || "<DATABASE_SERVER>";
  const environmentLabel = selectedEnvironment || "<ENVIRONMENT>";
  const scriptName = databaseScriptInstallScript(text);
  const scriptDirectory = databaseScriptInstallDirectory(text);
  const restoreCommand = databaseScriptInstallRestoreCommand(text);
  const pdbSid = databaseScriptInstallPdb(text);
  const expectedObject = databaseScriptInstallExpectedObject(text);
  const integrationName = databaseScriptInstallExpectedIntegration(text);
  const validationQuery = expectedObject.includes(".")
    ? `SELECT owner,
       object_name,
       object_type,
       status,
       last_ddl_time
FROM all_objects
WHERE owner = '${expectedObject.split(".")[0].toUpperCase()}'
  AND object_name = '${expectedObject.split(".")[1].toUpperCase()}';`
    : "";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved for database script installation.",
        `Target environment:\n- ${environmentLabel}`,
        `Target database/server:\n- ${targetHost}`,
        `Target PDB:\n- ${pdbSid}`,
        integrationName ? `Related integration/process:\n- ${integrationName}` : "",
        expectedObject ? `Expected database object:\n- ${expectedObject}` : "",
        `Required script:\n- ${scriptName}`,
        `Approved server path:\n- ${scriptDirectory}`,
        "Confirm the non-production reference RFC is Closed / Completed when the RFC provides one.",
        "Confirm access to the database server and privileges to create the restore point and execute the script as SYSDBA.",
        "Do not capture or expose database credential values in the Action Plan, SQL output, screenshots, or RFC evidence."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Restore Point",
      content: [
        "Login to the target database server using the approved OS account.",
        "Move to the script directory:",
        scriptDirectory !== "<SCRIPT_DIRECTORY>" ? `cd ${scriptDirectory}` : "cd <SCRIPT_DIRECTORY>",
        "Create the restore point before execution:",
        restoreCommand,
        "Capture restore point creation output as pre-change evidence."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Confirm the script exists in the approved directory:",
        `ls -l ${scriptName}`,
        "2. Connect to SQL*Plus as SYSDBA:",
        "sqlplus / as sysdba",
        "3. Execute the script:",
        `@${scriptName}`,
        "4. Monitor the execution until completion.",
        "5. Exit SQL*Plus:",
        "EXIT;",
        "6. Capture the full execution output/log."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database script installation. No application scheduler activation is requested.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Confirm the script completed successfully without ORA-, PLS-, or SP2- errors.",
        expectedObject ? `Validate the expected object was created in ${pdbSid}:\n- ${expectedObject}` : "Validate the expected database object was created in the target PDB.",
        validationQuery ? ["Execute validation query:", validationQuery].join("\n\n") : "",
        "If any error or missing object is detected, stop and escalate to the DBA/requester before closing the RFC."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the script fails, stop execution and capture the exact error output.",
        "Do not apply manual corrections unless approved by the DBA/requester.",
        "If rollback is required, use the restore point created before execution or follow DBA-approved recovery instructions.",
        "Do not rerun the script with modified content unless the requester/DBA approves it."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. RFC approval and non-production reference validation when applicable.",
        "2. Restore point creation output.",
        `3. Script execution output for ${scriptName}.`,
        expectedObject ? `4. Final validation showing ${expectedObject} was created successfully.` : "4. Final validation showing the expected database object was created successfully.",
        "5. Confirmation that no credentials or sensitive values were exposed."
      ].join("\n")
    }
  ];
}

function buildDatabasePasswordResetPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const users = databaseUserNames(text);
  const userList = users.length ? asBullets(users) : "- <DATABASE_USER>";
  const targetDatabase = databaseTargetName(text) || "<DATABASE_SERVER>";
  const recipient = passwordRecipient(text);
  const userPredicate = users.length
    ? users.map((user, index) => `${index === 0 ? "" : "                   "}'${user}'`).join(",\n")
    : "'<DATABASE_USER>'";
  const validationQuery = `SELECT username,
       account_status,
       profile
FROM dba_users
WHERE username IN (${userPredicate})
ORDER BY username;`;
  const resetStatements = users.length
    ? users.map((user) => `ALTER USER ${user}
IDENTIFIED BY "<NEW_SECURE_PASSWORD>"
ACCOUNT UNLOCK;`).join("\n\n")
    : `ALTER USER <DATABASE_USER>
IDENTIFIED BY "<NEW_SECURE_PASSWORD>"
ACCOUNT UNLOCK;`;

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, access, and approved maintenance window.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target database/server:\n- ${targetDatabase}`,
        "Confirm CTS/RFC approval before execution.",
        "Confirm the execution account has privileges to query DBA_USERS and execute ALTER USER.",
        `Requested database user(s):\n${userList}`,
        "Confirm the new password will be provided and shared only through the approved secure channel.",
        "Do not document password values in the Action Plan, execution output, screenshots, or RFC evidence."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Current User Status Validation",
      content: [
        "Connect to the DB server as oracle user.",
        "Connect to the database using SQL*Plus or the approved SQL execution tool.",
        "Change to PDBTRAN.",
        "SQL> alter session set container=PDBTRAN;",
        "Verify connection.",
        "SQL> show con_name;",
        "Validate requested users exist and capture current account status.",
        "Execute:",
        validationQuery,
        "Expected handling:",
        "- If a user does not exist, do not perform any action for that user.",
        "- Capture current account status before the reset."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Password Reset",
      content: [
        "Execute only for existing users validated in the previous step.",
        resetStatements,
        "Capture the execution output without exposing the password value.",
        "If ALTER USER returns an Oracle error:",
        "- Stop execution immediately.",
        "- Do not continue with additional users.",
        "- Capture the Oracle error message.",
        "- Escalate to DBA or request owner for review."
      ].join("\n\n")
    },
    {
      id: "validation",
      title: "Post-Reset Validation",
      content: [
        "Validate final account status.",
        "Execute:",
        validationQuery,
        "Expected result:",
        "- Existing users reset during this RFC must display account status as OPEN.",
        "- Missing users must be documented as \"No action performed.\"",
        "Check invalid objects.",
        "SQL> select count(*) from user_objects where status='INVALID';",
        "SQL> show errors;"
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency Plan",
      content: [
        "If validation fails, stop execution and capture the Oracle error message.",
        "If authentication fails after the reset, follow the approved credential reset process again with DBA/request owner approval.",
        "Do not attempt to restore or expose previous password values.",
        "Escalate to DBA or request owner before retrying."
      ].join("\n\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Current DBA_USERS validation result.",
        "2. ALTER USER execution output, if executed.",
        "3. Final DBA_USERS validation result.",
        "4. Invalid object check result.",
        "5. Evidence for no-action scenarios when a user does not exist.",
        `Share the new password with ${recipient} through the approved secure channel.`,
        "Do not attach or expose the password value in the RFC evidence."
      ].join("\n")
    }
  ];
}

function buildDatabaseUnlockWithOicConnectionPasswordPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const users = databaseUserNames(text);
  const connections = oicConnectionNamesFromDatabaseRequest(text);
  const targetDatabase = implementationTargetName(text) || databaseTargetName(text) || "<DATABASE_SERVER>";
  const user = users[0] ?? "<DATABASE_USER>";
  const connection = connections[0] ?? "<OIC_DB_CONNECTION>";
  const passwordCustodian = text.match(/\bDaniela\s+Gomez\b/i)?.[0] ?? "the authorized password custodian";

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved to unlock the database user and update the related OIC database connection password.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target database/server:\n- ${targetDatabase}`,
        `Database user:\n- ${user}`,
        `OIC database connection:\n- ${connection}`,
        `Coordinate a live secure session with ${passwordCustodian} to enter the approved password in the OIC connection.`,
        "Confirm access to the database using SYSTEM or another user with DBA privileges.",
        "Confirm the target PDB before executing ALTER USER.",
        "Do not capture, paste, store, or expose credential values in the RFC, screenshots, terminal output, logs, Action Plan, or evidence."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Pre-Change Validation",
      content: [
        "Login to the database server as oracle OS user.",
        "Connect to the database using SQL*Plus or the approved SQL execution tool.",
        "Validate current container:",
        "SHOW CON_NAME;",
        "If connected to CDB$ROOT, switch to the target PDB:",
        "ALTER SESSION SET CONTAINER = PDBTRAN;",
        "Validate current database account status:",
        `SELECT username,
       account_status,
       expiry_date,
       lock_date,
       profile
FROM dba_users
WHERE username = '${user}';`,
        "Capture the output as pre-change evidence.",
        "No OIC integration export backup is required because this activity updates connection credentials only. Capture current OIC connection name/status as evidence before changing it."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Execution Steps",
      content: [
        "Unlock the database account:",
        `ALTER USER ${user} ACCOUNT UNLOCK;`,
        "If password restore/reset is required during the live session, execute it only with the approved password provided by the authorized custodian:",
        `ALTER USER ${user}
IDENTIFIED BY "<approved_password>";`,
        "Do not expose the password value in evidence.",
        "Login to the OIC environment associated with the RFC.",
        "Navigate to Design > Connections.",
        `Search and edit the database connection:\n- ${connection}`,
        `During the live secure session, request ${passwordCustodian} to enter the approved password.`,
        "Save the connection.",
        "Run Test Connection."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable. No scheduler activation is requested for this account unlock and OIC connection credential update.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate database account status after the change:",
        `SELECT username,
       account_status,
       expiry_date,
       lock_date
FROM dba_users
WHERE username = '${user}';`,
        "Expected result:",
        "- ACCOUNT_STATUS = OPEN",
        `Validate OIC connection ${connection} with Test Connection.`,
        "Expected result:",
        "- Test Connection completed successfully.",
        `Validate affected integrations that use ${connection}, if applicable.`,
        "Monitor that the account does not return to LOCKED(TIMED):",
        `SELECT username,
       account_status,
       lock_date
FROM dba_users
WHERE username = '${user}';`,
        "Expected result:",
        "- The account remains OPEN."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the user does not exist, stop and escalate to the DBA/requester.",
        "If ALTER USER fails, capture the Oracle error and stop execution.",
        "If OIC Test Connection fails, coordinate with the authorized password custodian to re-enter the approved password.",
        "Do not perform repeated retries with unknown, guessed, or outdated passwords.",
        "If the account becomes LOCKED(TIMED) again, investigate whether an application, integration, scheduler, or external process is still using outdated credentials.",
        "If required, temporarily stop or disable the affected process before unlocking again, with customer/owner approval."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Pre-change database account status.",
        "2. Container/PDB validation.",
        "3. Account unlock execution confirmation.",
        "4. Post-change database account status showing OPEN.",
        `5. OIC connection ${connection} Test Connection successful.`,
        "6. Affected integration validation, if applicable.",
        "7. Final monitoring showing the account remains OPEN.",
        "Do not attach screenshots or logs that expose password or credential values."
      ].join("\n")
    }
  ];
}

function buildDatabaseDiscoveryPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const databaseMissing = hasDatabaseDiscoveryMissingDatabaseName(text);
  const databaseInfo = databaseNameInfoFromText(text);
  const targetDatabase = databaseInfo.name || "<DATABASE_NAME not provided in RFC>";
  const cdbConnectIdentifier = cdbConnectIdentifierFromText(text);
  const targetHost = implementationTargetName(text) || "<DATABASE_SERVER>";
  const artifacts = databaseDiscoveryArtifacts(text);
  const pdbs = databaseDiscoveryPdbs(text);
  const pdbList = pdbs.length
    ? pdbs.map((pdb) => `- ${pdb.name}${pdb.conId ? ` (CON_ID ${pdb.conId})` : ""}`).join("\n")
    : "- <PDB_NAME_1>\n- <PDB_NAME_2>";
  const artifactList = artifacts.length ? asBullets(artifacts) : "- Discovery_script.zip\n- Security_script.zip\n- HCHECK_script.zip";
  const discoveryPdbSteps = pdbs.length
    ? pdbs.map((pdb, index) => [
        `${index === 0 ? "First" : "Next"}, execute discovery for ${pdb.name}${pdb.conId ? ` using CON_ID ${pdb.conId}` : ""}:`,
        "sqlplus \"/ as sysdba\" @discovery_script.sql",
        pdb.conId
          ? `When prompted, select CON_ID ${pdb.conId} for ${pdb.name}.`
          : `When prompted, select the CON_ID for ${pdb.name}.`,
        `./generate_html.pl <${pdb.name}_discovery_output>.LST`
      ].join("\n")).join("\n\n")
    : [
        "Execute discovery_script.sql once per target PDB:",
        "sqlplus \"/ as sysdba\" @discovery_script.sql",
        "When prompted, select the CON_ID for the current PDB.",
        "./generate_html.pl <discovery_output>.LST"
      ].join("\n");
  const securityPdbSteps = (pdbs.length ? pdbs.map((pdb) => pdb.name) : ["<PDB_NAME_1>", "<PDB_NAME_2>"])
    .map((pdbName) => [
      `export ORACLE_PDB_SID=${pdbName}`,
      "sqlplus \"/ as sysdba\" @security_features_status_PDB.sql"
    ].join("\n"))
    .join("\n\n");
  const healthPdbSteps = (pdbs.length ? pdbs.map((pdb) => pdb.name) : ["<PDB_NAME_1>", "<PDB_NAME_2>"])
    .map((pdbName) => [
      `export ORACLE_PDB_SID=${pdbName}`,
      "sqlplus \"/ as sysdba\" @hout.sql",
      "sqlplus \"/ as sysdba\" @hcheck.sql"
    ].join("\n"))
    .join("\n\n");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved to execute database migration discovery scripts on the source system.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        `Target database/server:\n- ${targetHost}`,
        `Database:\n- ${targetDatabase}`,
        cdbConnectIdentifier ? `CDB/connect identifier:\n- ${cdbConnectIdentifier}` : "",
        databaseInfo.source === "rfcComment"
          ? "Database information source:\n- Confirmed by RFC activity/comment. The original implementation plan did not provide the CDB/database name."
          : "",
        `Target PDBs:\n${pdbList}`,
        `Required script packages:\n${artifactList}`,
        databaseMissing
          ? `Warning:\n- Database name was not provided in the RFC. Confirm the CDB/database name for ${targetHost} with the DBA/requester before execution.`
          : "",
        "Confirm the approved execution account can access the source server, unzip/copy files, run SQL*Plus as SYSDBA, and run Perl.",
        "Confirm an output directory and naming convention that identifies the database, CDB/PDB scope, and execution date.",
        "Do not capture or expose credential values in the Action Plan, terminal logs, or RFC evidence."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "This RFC is a discovery/report execution activity; no OIC/SOA deployment backup applies.",
        "Before execution, capture current CDB/PDB context and confirm the target PDBs are open read/write:",
        "sqlplus \"/ as sysdba\"",
        "show con_name;",
        "show pdbs;",
        "Capture a directory listing of the uploaded script packages after unzipping.",
        "If any script requests an unexpected destructive action or prompts outside the approved discovery scope, stop and escalate before continuing."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Execution Steps",
      content: [
        "1. DB Discovery script",
        "Download/unzip Discovery_script.zip and copy it to the approved server location.",
        "cd Discovery_script",
        "chmod 777 discovery_script.sql generate_html.pl",
        discoveryPdbSteps,
        "Generate the HTML report for each PDB LST file produced by the discovery script.",
        "",
        "2. Security Features script",
        "Download/unzip Security_script.zip and copy it to the approved server location.",
        "cd Security_script",
        "chmod 777 security_features_status_CDB.sql security_features_status_PDB.sql",
        "CDB level:",
        "sqlplus \"/ as sysdba\" @security_features_status_CDB.sql",
        "PDB level:",
        securityPdbSteps,
        "",
        "3. HealthCheckup scripts",
        "Download/unzip HCHECK_script.zip and copy it to the approved server location.",
        "cd HCHECK_script",
        "chmod 777 hout.sql hcheck.sql",
        "CDB level:",
        "sqlplus \"/ as sysdba\" @hout.sql",
        "sqlplus \"/ as sysdba\" @hcheck.sql",
        "PDB level:",
        healthPdbSteps
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable. This RFC only executes database discovery/report scripts; no scheduler or application activation is requested.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate that all requested outputs were generated without ORA-, SP2-, PLS-, shell, or Perl errors.",
        `Confirm DB Discovery outputs exist for each target PDB:\n${pdbList}`,
        "Confirm each discovery .LST file has a corresponding generated HTML report.",
        "Confirm Security Features output was generated for CDB level and for each target PDB.",
        "Confirm HealthCheckup output was generated for CDB level and for each target PDB.",
        "Confirm output file names or evidence captions identify the target database/server and PDB scope."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "This is a read-only discovery/report activity; rollback is not expected because no deployment or data change is requested.",
        "If any script fails, stop execution, capture the command, prompt, and error output, and notify the requester/DBA team.",
        "Do not rerun failed scripts or change database/session settings beyond the approved instructions unless the DBA/request owner confirms the correction.",
        "If temporary files must be removed or replaced, keep the failed logs/reports as evidence before cleanup."
      ].join("\n\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Pre-change CDB/PDB context evidence (`show con_name` and `show pdbs`).",
        "2. Directory listing showing the unzipped script folders/files.",
        "3. Terminal execution logs for Discovery, Security Features, and HealthCheckup scripts.",
        "4. Discovery .LST and generated HTML report for each target PDB.",
        "5. Security Features output for CDB level and each target PDB.",
        "6. HealthCheckup output for CDB level and each target PDB.",
        "7. Final summary confirming the outputs/reports were shared with the requester.",
        "Do not attach screenshots or files that expose credential values."
      ].join("\n")
    }
  ];
}

function backupTableExistenceQuery(tables: string[]) {
  const predicates = tables.map((tableName) => {
    const schema = tableSchemaName(tableName) || "<SCHEMA_NAME>";
    const objectName = tableObjectName(tableName).toUpperCase();
    return `(OWNER = '${schema.toUpperCase()}' AND TABLE_NAME = '${objectName}')`;
  });
  return [
    "SELECT OWNER, TABLE_NAME",
    "FROM ALL_TABLES",
    `WHERE ${predicates.length ? predicates.join("\n   OR ") : "TABLE_NAME = '<BACKUP_TABLE_NAME>'"}`,
    "ORDER BY OWNER, TABLE_NAME;"
  ].join("\n");
}

function buildDatabaseBackupPurgePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const pairs = databaseBackupPurgePairs(text);
  const targetHost = implementationTargetName(text) || databaseTargetName(text) || "<DATABASE_SERVER>";
  const environmentLabel = selectedEnvironment || "<Environment>";
  const sourceTables = uniqueValues(pairs.map((pair) => pair.sourceTable));
  const backupTables = uniqueValues(pairs.map((pair) => pair.backupTable));
  const schemaList = uniqueValues([...sourceTables, ...backupTables].map(tableSchemaName).filter(Boolean));
  const sourceTableList = sourceTables.length ? asBullets(sourceTables) : "- <SOURCE_TABLE>";
  const backupTableList = backupTables.length ? asBullets(backupTables) : "- <BACKUP_TABLE>";
  const schemaLine = schemaList.length ? `Target schema(s):\n${asBullets(schemaList)}` : "Target schema(s):\n- <SCHEMA_NAME>";
  const preCountQueries = pairs.map((pair, index) => [
    `-- Purge candidate count ${index + 1}: ${pair.sourceTable}`,
    formatSqlCount(pair.sourceTable, pair.deleteWhere, "PURGE_CANDIDATES")
  ].join("\n")).join("\n\n");
  const backupStatements = pairs.map((pair, index) => [
    `-- Backup ${index + 1}: ${pair.sourceTable} -> ${pair.backupTable}`,
    formatCreateBackupSql(pair)
  ].join("\n")).join("\n\n");
  const backupCountQueries = pairs.map((pair, index) => [
    `-- Backup row count ${index + 1}: ${pair.backupTable}`,
    formatSqlCount(pair.backupTable, "", "BACKUP_ROWS")
  ].join("\n")).join("\n\n");
  const deleteStatements = pairs.map((pair, index) => [
    `-- Purge ${index + 1}: ${pair.sourceTable}`,
    formatDeleteSql(pair)
  ].join("\n")).join("\n\n");
  const postCountQueries = pairs.map((pair, index) => [
    `-- Post-purge remaining candidate count ${index + 1}: ${pair.sourceTable}`,
    formatSqlCount(pair.sourceTable, pair.deleteWhere, "REMAINING_PURGE_CANDIDATES")
  ].join("\n")).join("\n\n");
  const restoreStatements = pairs.map((pair, index) => [
    `-- Restore option ${index + 1}: ${pair.backupTable} -> ${pair.sourceTable}`,
    formatRestoreSql(pair)
  ].join("\n")).join("\n\n");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved for database backup and purge execution.",
        `Target environment:\n- ${environmentLabel}`,
        `Target database/server:\n- ${targetHost}`,
        schemaLine,
        `Source table(s):\n${sourceTableList}`,
        `Backup table(s) to be created:\n${backupTableList}`,
        "Confirm the execution will be performed by an authorized DBA or approved database operator.",
        "Confirm the execution account has privileges to query the source tables, create backup tables, delete rows, and commit/rollback the transaction.",
        environmentLabel === "PROD"
          ? "Production warning: this RFC includes destructive DELETE statements. Continue only inside the approved change window and after backup validation succeeds."
          : "Destructive DML warning: this RFC includes DELETE statements. Continue only after backup validation succeeds.",
        "Do not capture or expose database credential values in the Action Plan, SQL output, screenshots, or RFC evidence."
      ].join("\n\n")
    },
    {
      id: "preAnalysis",
      title: "Pre-Execution Validation",
      content: [
        "Connect to the target database using the approved SQL execution tool.",
        "Confirm the target database/session context before running the purge.",
        "Validate that the backup tables do not already exist. Execute:",
        backupTableExistenceQuery(backupTables),
        "Expected result:",
        "- No rows returned for the requested backup table names.",
        "- If any backup table already exists, stop and confirm the required handling with the requester/DBA before continuing.",
        "Capture purge candidate counts before creating the backup tables. Execute:",
        preCountQueries || "<PRE_PURGE_COUNT_QUERY>",
        "Save the count for each table. These values must match the backup row counts before DELETE execution."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Backup Execution and Validation",
      content: [
        "Create backup tables using the same filters requested for the purge.",
        "Execute:",
        backupStatements || "<CREATE_BACKUP_TABLE_SQL>",
        "Validate backup row counts immediately after backup creation. Execute:",
        backupCountQueries || "<BACKUP_COUNT_QUERY>",
        "Required validation:",
        "- Each backup row count must match the corresponding pre-execution purge candidate count.",
        "- Do not continue to DELETE if any backup count does not match.",
        "- Capture the backup creation output and count validation as RFC evidence.",
        "Note: CREATE TABLE AS SELECT is DDL in Oracle and commits the backup table creation. The DELETE step must still be controlled and committed only after validation."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Purge Execution",
      content: [
        "Execute the DELETE statements only after the backup counts match the purge candidate counts.",
        "Execute:",
        deleteStatements || "<DELETE_SQL>",
        "Review and capture the affected row count returned for each DELETE statement.",
        "Required validation before commit:",
        "- Each DELETE affected-row count must match the corresponding validated backup row count.",
        "- If any count does not match or an Oracle error appears, execute ROLLBACK and escalate before retrying.",
        "Commit only after all DELETE counts are validated.",
        "COMMIT;"
      ].join("\n\n")
    },
    {
      id: "validation",
      title: "Post-Execution Validation",
      content: [
        "Validate that the purged candidate records no longer remain in the source tables.",
        "Execute:",
        postCountQueries || "<POST_PURGE_COUNT_QUERY>",
        "Expected result:",
        "- 0 rows for each validation query, unless the requester/DBA confirms a different acceptable result.",
        "Confirm the original integration failure condition is cleared or has been handed back to the integration/application owner for validation.",
        "Do not drop backup tables unless the RFC explicitly requests it and the DBA/requester approves it."
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If DELETE has not been committed and validation fails, execute:",
        "ROLLBACK;",
        "If DELETE was committed and restoration is required, restore only after DBA/requester approval using the backup tables created by this RFC.",
        "Potential restore statements:",
        restoreStatements || "<RESTORE_FROM_BACKUP_SQL>",
        "After any approved restore, validate row counts and capture evidence.",
        "Do not drop backup tables until the requester/DBA confirms the retention or cleanup plan."
      ].join("\n\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Target environment/database confirmation.",
        "2. Backup table existence validation before execution.",
        "3. Pre-execution purge candidate counts.",
        "4. Backup table creation output.",
        "5. Backup row count validation.",
        "6. DELETE affected-row counts.",
        "7. COMMIT confirmation, or ROLLBACK/error evidence if execution stops.",
        "8. Post-execution validation counts.",
        "9. Final confirmation shared with the requester/application owner.",
        "Do not attach credential/password evidence."
      ].join("\n")
    }
  ];
}

function buildLaclsColombiaMagneticMediaDbPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const targetHost = implementationTargetName(text) || databaseTargetName(text) || "<DATABASE_SERVER>";
  const environmentLabel = selectedEnvironment || "<ENVIRONMENT>";
  const packageList = laclsDatabasePackageNames(text);
  const installScript = laclsDatabaseInstallScript(text);
  const sqlScripts = laclsDatabaseSqlScripts(text);
  const internalScripts = sqlScripts.filter((script) => script.toUpperCase() !== installScript.toUpperCase());
  const validationScripts = sqlScripts.filter((script) => /^LACLS_CO_|^Install_/i.test(script));

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved to create/update the LACLS Colombia Magnetic Media and Equivalent Document database repository.",
        `Target environment:\n- ${environmentLabel}`,
        `Target database/server:\n- ${targetHost}`,
        "Confirm the execution is limited to the guide section requested by the RFC: pages 15 and 16, Create/Update Database Repository / Running Install script.",
        "Confirm the LACLS database user is available and has privileges to create/update the required tables, types, PL/SQL objects, ORDS/REST metadata, and related repository objects.",
        packageList.length ? `Required package:\n${asBullets(packageList)}` : "Required package:\n- LACLS Magnetic Media DB.zip",
        `Main install script:\n- ${installScript}`,
        internalScripts.length ? `Internal SQL scripts included in the DB package and expected to be invoked by the installer:\n${asBullets(internalScripts)}` : "",
        "Do not capture or expose database credential values in the Action Plan, SQL output, screenshots, or RFC evidence."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before execution, confirm an approved database backup, restore point, schema export, or DBA-approved rollback option is available.",
        "Capture the current target database/session context before running the installer.",
        "Capture current object status for the LACLS repository objects when available.",
        "If this is a first-time installation and no prior objects exist, document that object-level backup is not applicable and rely on the approved database-level backup/restore point."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Copy or unzip the LACLS Magnetic Media DB package into the approved stage area on the execution workstation/server.",
        "2. Confirm the DB package contains the main installer and the SQL scripts required by the guide.",
        "3. Open SQL*Plus, SQL Developer, or the approved SQL execution tool.",
        "4. Connect to the Oracle Database using the LACLS user.",
        "5. Run the main install script from the DB package path:",
        `@<PACK_PATH>/CO/DB/sql/${installScript}`,
        "6. Allow the install script to invoke the required internal SQL statements. Do not run the internal fix scripts individually unless the guide, DBA, or requester explicitly instructs it.",
        "7. Capture the full execution output/spool log."
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database repository installation. No scheduler activation is requested in the DB scope.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate that the install script completed without ORA-, PLS-, SP2-, or compilation errors.",
        "Confirm the expected LACLS Colombia DB repository objects were created or updated.",
        validationScripts.length ? `Validate relevant DB scripts/components from the package scope:\n${asBullets(validationScripts)}` : "",
        "Run or capture compilation validation if provided by the package, including LACLS_CO_COMPILE.sql when applicable.",
        "Confirm object status is VALID for packages, procedures, functions, views, and related repository objects affected by the installer.",
        "If ORDS/REST repository setup is included in the DB package, validate the related SQL completed successfully and hand off endpoint validation to the application/OIC owner if required."
      ].filter(Boolean).join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the installer fails before completion, stop execution and capture the exact command, script name, and error output.",
        "Do not rerun individual internal scripts or apply manual corrections unless confirmed by the DBA/requester.",
        "If rollback is required, use the approved database backup, restore point, schema export, or DBA-approved rollback procedure.",
        "Escalate to the DBA/requester before retrying with modified scripts, different users, or different package contents."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Target database/server and environment confirmation.",
        "2. DB package/stage area listing showing the installer script.",
        "3. Backup or restore point confirmation, or first-install no-prior-object note.",
        "4. SQL execution/spool output for the main install script.",
        "5. Validation evidence showing no ORA-, PLS-, SP2-, or compilation errors.",
        "6. Object status/compile validation evidence.",
        "7. Final confirmation shared with the requester/customer.",
        "Do not attach screenshots or files that expose credential values."
      ].join("\n")
    }
  ];
}

function buildLaclsFiscalEventsDbPatchUpdatePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const environmentLabel = selectedEnvironment || "<ENVIRONMENT>";
  const packageList = laclsFiscalEventsPatchPackageNames(text);
  const updateScript = laclsFiscalEventsPatchScript(text);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved to update LACLS Fiscal Events Control Solution database objects.",
        `Target environment:\n- ${environmentLabel}`,
        "Confirm dependency RFC 4-B003ZMG is Closed / Completed.",
        "Confirm the LACLS schema exists in the target ATP environment and has the required privileges to execute the patch scripts.",
        packageList.length ? `Required patch artifact:\n${asBullets(packageList)}` : "Required patch artifact:\n- p39731462_11130_Generic.zip",
        `Main database update script:\n- ${updateScript}`,
        "Confirm the requester clarification: patch 39619716 is the base LACLS solution, and p39731462_11130_Generic.zip contains the adjustment to execute for this RFC.",
        "Do not capture or expose database credential values in the Action Plan, SQL output, screenshots, or RFC evidence."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before execution, confirm an approved database backup, restore point, schema export, or DBA-approved rollback option is available.",
        "Capture the target ATP/database context and LACLS schema availability before running the script.",
        "Capture pre-change object status for LACLS database objects when available.",
        "If object-level backup is not applicable, document the approved database-level backup/restore option before proceeding."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Download or stage the patch artifact in the approved working directory:",
        asBullets(packageList),
        "2. Extract the patch artifact.",
        "3. Locate the database script referenced by the IM090:",
        `BR/FISCAL_INTEG/DB/sql/${updateScript}`,
        "4. Open SQL*Plus, SQL Developer, or the approved SQL execution tool.",
        "5. Connect to the target ATP/database using the LACLS schema user and approved credentials.",
        "6. Execute the database update script:",
        `@<PACK_PATH>/BR/FISCAL_INTEG/DB/sql/${updateScript}`,
        "7. Capture the full execution output/spool log."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this ATP database object update. No OIC scheduler activation is requested in this RFC scope.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate that the script completed successfully.",
        "Review the execution output and confirm there are no ORA-, PLS-, SP2-, or compilation errors.",
        "Validate that the LACLS database objects were created or updated according to the IM090.",
        "If validation queries or compilation checks are provided by the IM090/package, execute them and capture the results.",
        "Any INVALID object or script error must be captured and escalated to the requester/DBA before closing the RFC."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the script fails, stop the execution and capture the exact script name, command, and error output.",
        "Do not perform manual object corrections outside the approved IM090 scope.",
        "If rollback is required, follow the rollback instructions from the IM090, approved database backup/restore point, or requester/DBA guidance.",
        "Do not retry with modified scripts, different users, or different package contents unless approved by the requester/DBA."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. RFC approval and dependency validation for RFC 4-B003ZMG.",
        "2. Patch artifact staged/extracted.",
        "3. SQL script execution output for fix39731462.sql.",
        "4. Final validation showing successful execution and no ORA-, PLS-, SP2-, or compilation errors.",
        "5. Confirmation that no credentials or sensitive values were exposed."
      ].join("\n")
    }
  ];
}

function buildLaclsUruguayCommercialReceiptsDbPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const targetHost = implementationTargetName(text) || databaseTargetName(text) || "<DATABASE_SERVER>";
  const environmentLabel = selectedEnvironment || "<ENVIRONMENT>";
  const packageList = laclsUruguayCommercialReceiptsPackageNames(text);
  const installScript = laclsUruguayCommercialReceiptsInstallScript(text);
  const sqlScripts = laclsUruguayCommercialReceiptsSqlScripts(text);
  const internalScripts = sqlScripts.filter((script) => script.toUpperCase() !== installScript.toUpperCase());

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm the RFC is approved to install/update the LACLS Uruguay Commercial Receipts database components.",
        `Target environment:\n- ${environmentLabel}`,
        `Target database/server:\n- ${targetHost}`,
        "Confirm the execution is limited to the guide section requested by the RFC: pages 16 and 17, Installing Database Components / Execute the Install Script.",
        "Confirm the LACLS database user is available and has privileges to create/update the required tables, types, PL/SQL code, and related database objects.",
        packageList.length ? `Required package:\n${asBullets(packageList)}` : "Required package:\n- LACLS_UY_COMMERCIAL_RECEIPTS_DB.zip",
        `Main install script:\n- ${installScript}`,
        internalScripts.length ? `Internal SQL scripts included in the DB package and expected to be invoked by the installer:\n${asBullets(internalScripts)}` : "",
        "Do not capture or expose database credential values in the Action Plan, SQL output, screenshots, or RFC evidence."
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup / Pre-Change Evidence",
      content: [
        "Before execution, confirm an approved database backup, restore point, schema export, or DBA-approved rollback option is available.",
        "Capture the current target database/session context before running the installer.",
        "Capture current object status for the LACLS Uruguay Commercial Receipts objects when available.",
        "If this is a first-time installation and no prior objects exist, document that object-level backup is not applicable and rely on the approved database-level backup/restore point."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Copy or unzip the LACLS Uruguay Commercial Receipts DB package into the approved stage area on the execution workstation/server.",
        "2. Confirm the DB package contains the main installer and the SQL scripts required by the guide.",
        "3. Open SQL*Plus, SQL Developer, or the approved SQL execution tool.",
        "4. Connect to the Oracle Database using the LACLS user.",
        "5. Run the main install script from the DB package path:",
        `@<PACK_PATH>/UY/R_COMERC/DB/sql/${installScript}`,
        "6. Allow the install script to invoke all other statements needed to install the Commercial Receipts database objects.",
        "7. Capture the full execution output/spool log."
      ].join("\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database installation. No scheduler activation is requested in the DB scope.",
      defaultIncluded: false
    },
    {
      id: "validation",
      title: "Validation",
      content: [
        "Validate that the install script completed without ORA-, PLS-, SP2-, or compilation errors.",
        "Confirm the expected LACLS Uruguay Commercial Receipts database objects were created or updated.",
        "Confirm object status is VALID for packages, procedures, functions, views, tables, types, and related objects affected by the installer.",
        "If any object is INVALID, capture the object name and compilation error, then escalate to the DBA/requester before closing the RFC."
      ].join("\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: [
        "If the installer fails before completion, stop execution and capture the exact command, script name, and error output.",
        "Do not rerun individual internal scripts or apply manual corrections unless confirmed by the DBA/requester.",
        "If rollback is required, use the approved database backup, restore point, schema export, or DBA-approved rollback procedure.",
        "Escalate to the DBA/requester before retrying with modified scripts, different users, or different package contents."
      ].join("\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Target database/server and environment confirmation.",
        "2. DB package/stage area listing showing the installer script.",
        "3. Backup or restore point confirmation, or first-install no-prior-object note.",
        "4. SQL execution/spool output for the main install script.",
        "5. Validation evidence showing no ORA-, PLS-, SP2-, or compilation errors.",
        "6. Object status/compile validation evidence.",
        "7. Final confirmation shared with the requester/customer.",
        "Do not attach screenshots or files that expose credential values."
      ].join("\n")
    }
  ];
}

function databaseBackupGuidance(kind: string, restoreMentioned: boolean) {
  if (kind === "profilePasswordLifeTime") {
    return [
      "Capture current DBA_USERS and DBA_PROFILES query results before applying the change.",
      "Record the previous PASSWORD_LIFE_TIME value for rollback.",
      "Confirm CTS/RFC approval before execution."
    ];
  }
  if (kind === "password") {
    return [
      "Do not capture or store previous/new passwords in the Action Plan or evidence.",
      "Capture current user status from DBA_USERS before the change.",
      "Confirm the approved credential reset/rotation procedure and secure communication channel."
    ];
  }
  if (kind === "purge" || kind === "dml") {
    return [
      "Confirm restore point, export, snapshot, table backup, or approved DBA backup before execution.",
      "Capture backup/restore evidence before running the SQL.",
      "Capture pre-change row counts or validation queries for affected data.",
      restoreMentioned ? "Restore/backup instruction was detected in the source text." : "Do not proceed until backup or restore point evidence is available."
    ];
  }
  if (kind === "create") {
    return [
      "Capture current database object/profile configuration before applying changes.",
      "If the object does not exist, document that no backup applies.",
      "Prepare rollback statement only if it is approved for this RFC."
    ];
  }
  return [
    "Capture current database configuration before applying changes.",
    "Confirm backup, restore point, or rollback procedure with the DBA team when the change can affect data or access."
  ];
}

function databaseValidationGuidance(kind: string, objects: string[]) {
  const objectValidations = objects.length
    ? objects.map((objectName) => `- Validate ${objectName} exists and matches the requested configuration.`)
    : ["- Validate the requested database objects exist and match the requested configuration."];
  if (kind === "password") {
    return [
      "Validate the user account status, lock/expiry state, and required connectivity without exposing credentials.",
      "- Query DBA_USERS or the approved account validation view.",
      "- Confirm the application/customer can authenticate through the approved secure channel."
    ].join("\n");
  }
  if (kind === "profilePasswordLifeTime") {
    return [
      "Run post-change validation queries and capture the result.",
      "- PASSWORD_LIFE_TIME must display 180 only for profiles changed during this RFC.",
      "- If a profile was UNLIMITED, already 180, or the user/profile did not exist, capture the no-action evidence."
    ].join("\n");
  }
  if (kind === "purge" || kind === "dml") {
    return [
      "Run post-change validation queries and compare against the pre-change evidence.",
      "- Capture affected row counts.",
      "- Validate business/application impact with the request owner."
    ].join("\n");
  }
  return ["Run validation queries and capture the result.", ...objectValidations].join("\n");
}

function databaseReturnPointGuidance(kind: string, restoreMentioned: boolean) {
  if (kind === "profilePasswordLifeTime") {
    return "If rollback is required, restore the previous PASSWORD_LIFE_TIME value captured during pre-analysis. Stop execution and escalate to DBA/request owner if validation fails.";
  }
  if (kind === "password") {
    return "If authentication fails, follow the approved credential reset/rollback procedure. Do not expose credentials in logs or evidence.";
  }
  if (kind === "purge" || kind === "dml") {
    return restoreMentioned
      ? "Use the documented restore point/backup procedure if validation fails. Stop execution and escalate to DBA before retrying."
      : "If validation fails, stop the change and use the approved backup/restore plan. Do not continue without DBA approval.";
  }
  if (kind === "create") {
    return "If execution fails, stop the change, capture the error, and consult the DBA/technical team. Run rollback/drop statements only if approved.";
  }
  return "If execution fails, stop the change, capture the error, and consult the DBA/technical team before retrying.";
}

function buildProfilePasswordLifeTimePlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  const profiles = databaseProfileCandidates(text);
  const hasListedSchemaNames = profiles.some((profile) => /^[A-Z][A-Z0-9_$#.-]*(?:_[A-Z0-9_$#.-]+)+$/i.test(profile));
  const treatsCandidatesAsUsers = (/\b(?:SCHEMA|SCHEMAS|USER|USERS)\b/i.test(text) || hasListedSchemaNames) &&
    !/\b(?:ALTER\s+PROFILE|DBA_PROFILES|PROFILE\s*=)\b/i.test(text);
  const requestedList = profiles.length ? asBullets(profiles) : "- <USER_OR_PROFILE_NAME>";
  const profilePlaceholder = treatsCandidatesAsUsers ? "<PROFILE_NAME_FROM_ANALYSIS>" : "<PROFILE_NAME>";
  const profileList = treatsCandidatesAsUsers
    ? `- ${profilePlaceholder} (unique profile identified for the requested schema/user list)`
    : profiles.length
      ? asBullets(profiles)
      : `- ${profilePlaceholder}`;
  const profilePredicate = treatsCandidatesAsUsers || !profiles.length
    ? `'${profilePlaceholder}'`
    : profiles.map((profile, index) => `${index === 0 ? "" : "                   "}'${profile}'`).join(",\n");
  const currentValueQuery = `SELECT profile,
       resource_name,
       limit
FROM dba_profiles
WHERE profile IN (${profilePredicate})
  AND resource_name = 'PASSWORD_LIFE_TIME';`;
  const alterStatements = treatsCandidatesAsUsers || !profiles.length
    ? `ALTER PROFILE ${profilePlaceholder}
LIMIT PASSWORD_LIFE_TIME 180;`
    : profiles.map((profile) => `ALTER PROFILE ${profile}
LIMIT PASSWORD_LIFE_TIME 180;`).join("\n\n");

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, access, and approved maintenance window.",
        `Target environment:\n- ${selectedEnvironment || "<Environment>"}`,
        "Confirm CTS/RFC approval before execution.",
        "Confirm the execution account has privileges to query DBA_PROFILES and execute ALTER PROFILE.",
        `Requested ${treatsCandidatesAsUsers ? "schema/user" : "profile"} candidate(s):\n${requestedList}`,
        `Unique profile(s) to modify:\n${profileList}`,
        treatsCandidatesAsUsers
          ? "If all requested schemas/users share the same profile, execute the profile change only once for that profile."
          : "Execute the profile change only once per unique profile."
      ].join("\n\n")
    },
    {
      id: "backup",
      title: "Current Profile Value Validation",
      content: [
        "Validate the current PASSWORD_LIFE_TIME value for each unique profile before applying the change.",
        "Execute:",
        currentValueQuery,
        "Expected handling:",
        "- If PASSWORD_LIFE_TIME = 'UNLIMITED', do not modify that profile.",
        "- If PASSWORD_LIFE_TIME is already 180, do not modify that profile.",
        "- If PASSWORD_LIFE_TIME has a different finite value, continue with the profile modification.",
        "Capture the current value because rollback depends on this evidence."
      ].join("\n\n")
    },
    {
      id: "installation",
      title: "Profile Modification",
      content: [
        "Execute only for profiles validated with a finite PASSWORD_LIFE_TIME value different from 180.",
        alterStatements,
        "Capture and save the execution output.",
        "If ALTER PROFILE returns an Oracle error:",
        "- Stop execution immediately.",
        "- Do not continue with additional profiles.",
        "- Capture the Oracle error message.",
        "- Escalate to DBA or request owner for review."
      ].join("\n\n")
    },
    {
      id: "validation",
      title: "Post-Modification Validation",
      content: [
        "Validate the PASSWORD_LIFE_TIME value after the modification.",
        "Execute:",
        currentValueQuery,
        "Expected result:",
        "- Modified profiles must display PASSWORD_LIFE_TIME = 180.",
        "- Profiles skipped due to UNLIMITED or already 180 must be documented as \"No action performed.\""
      ].join("\n\n")
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency Plan",
      content: [
        "If rollback is required, restore the previous PASSWORD_LIFE_TIME value captured during the current value validation.",
        "Example:",
        "ALTER PROFILE <PROFILE_NAME>\nLIMIT PASSWORD_LIFE_TIME <PREVIOUS_VALUE>;",
        "If execution or validation fails:",
        "- Stop execution.",
        "- Capture the Oracle error message.",
        "- Escalate to DBA or request owner before retrying."
      ].join("\n\n")
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach the following evidence to the RFC/change record:",
        "1. Current PASSWORD_LIFE_TIME values by profile.",
        "2. ALTER PROFILE execution output, if executed.",
        "3. Final PASSWORD_LIFE_TIME validation by profile.",
        "4. Evidence for no-action scenarios:",
        "- PASSWORD_LIFE_TIME = UNLIMITED",
        "- PASSWORD_LIFE_TIME already equals 180"
      ].join("\n")
    }
  ];
}

export function buildDatabaseSqlPlan(text: string, selectedEnvironment: string): ManualActionPhase[] {
  if (hasDatabaseBackupPurgeInstructions(text)) return buildDatabaseBackupPurgePlan(text, selectedEnvironment);
  if (hasDatabaseDiscoveryInstructions(text)) return buildDatabaseDiscoveryPlan(text, selectedEnvironment);
  if (hasLaclsFiscalEventsDbPatchUpdate(text)) return buildLaclsFiscalEventsDbPatchUpdatePlan(text, selectedEnvironment);
  if (hasLaclsColombiaMagneticMediaDbInstall(text)) return buildLaclsColombiaMagneticMediaDbPlan(text, selectedEnvironment);
  if (hasLaclsUruguayCommercialReceiptsDbInstall(text)) return buildLaclsUruguayCommercialReceiptsDbPlan(text, selectedEnvironment);
  if (hasDatabaseScriptInstallWithRestorePoint(text)) return buildDatabaseScriptInstallWithRestorePointPlan(text, selectedEnvironment);
  if (hasProfilePasswordLifeTimeRequest(text)) return buildProfilePasswordLifeTimePlan(text, selectedEnvironment);
  if (hasDatabaseComponentInstall(text)) return buildDatabaseComponentsPlan(text, selectedEnvironment);
  if (hasDatabaseUnlockWithOicConnectionPasswordRequest(text)) return buildDatabaseUnlockWithOicConnectionPasswordPlan(text, selectedEnvironment);
  if (hasDatabasePasswordResetRequest(text)) return buildDatabasePasswordResetPlan(text, selectedEnvironment);

  const sql = prepareManualPhaseContent(text, selectedEnvironment);
  const objects = databaseObjectNames(text);
  const users = databaseUserNames(text);
  const operation = classifyDatabaseOperation(text);
  const backupGuidance = databaseBackupGuidance(operation.kind, operation.restoreMentioned);
  const validationGuidance = databaseValidationGuidance(operation.kind, objects);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Confirm target database environment, server, access, and approved maintenance window.",
        "Confirm the execution user has privileges to run the requested SQL.",
        objects.length ? `Database object(s):\n${asBullets(objects)}` : "",
        operation.kind === "password" && users.length
          ? `Target database user(s):\n${asBullets(users)}`
          : ""
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: backupGuidance.join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: [
        "1. Login into the target database server as the approved database/oracle user.",
        "2. Open SQL*Plus or the approved SQL execution tool.",
        "3. Execute the SQL below:",
        sql,
        "4. Capture the execution output."
      ].join("\n\n")
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: "Not applicable for this database change unless the RFC explicitly requests job/scheduler activation."
    },
    {
      id: "validation",
      title: "Validation",
      content: validationGuidance
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: databaseReturnPointGuidance(operation.kind, operation.restoreMentioned)
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Attach SQL execution output.",
        "Attach validation query result.",
        operation.kind === "password" ? "Do not attach password evidence." : "",
        "Share final result with the customer."
      ].filter(Boolean).join("\n")
    }
  ];
}
