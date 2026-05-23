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

export function hasDatabaseInstructions(text: string) {
  return hasSqlInstructions(text) || hasProfilePasswordLifeTimeRequest(text) || hasDatabasePasswordResetRequest(text);
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
  if (hasProfilePasswordLifeTimeRequest(text)) return buildProfilePasswordLifeTimePlan(text, selectedEnvironment);
  if (hasDatabaseComponentInstall(text)) return buildDatabaseComponentsPlan(text, selectedEnvironment);
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
