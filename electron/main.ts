import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, shell } from "electron";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile, copyFile, appendFile, unlink, rm } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inflateRawSync, inflateSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

type RepositoryInfo = {
  name: string;
  path: string;
  branch: string | null;
  dirty: boolean;
  remote: string | null;
};

type SelectedFile = {
  path: string;
  name: string;
  kind: "integration" | "package" | "lookup" | "xml" | "other";
};

type ActionSourceDocument = {
  path: string;
  name: string;
  kind: "docx" | "pdf";
  text: string;
  warning?: string;
};

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type DraftPayload = {
  repoPath: string;
  baseBranch?: string;
  rfc: string;
  riceFolderPath: string;
  mode: "ADHOC" | "FULL";
  files: SelectedFile[];
};

type EvidenceExportPayload = {
  rfc: string;
  phase: string;
  documentLanguage?: "en" | "es" | "pt";
  outputDirectory?: string;
  environment: string;
  pipeline: string;
  run: string;
  runUrl: string;
  message: string;
  steps: Array<{
    index: number;
    title: string;
    comment: string;
    images: Array<{ name: string; dataUrl: string; createdAt: string }>;
  }>;
  logs: Array<{ at: string; step: string; text: string }>;
};

type UserDataBackupPayload = {
  outputDirectory?: string;
  data: Record<string, unknown>;
};

const releaseBranch = "release";

const projectUrl =
  "https://gbdevcsr13r1-aucgbss02.developer.ocp.oraclecloud.com/gbdevcsr13r1-aucgbss02/#projects/css-bimbo-cicd-project";
const appDisplayName = "CI/CD Assistant";
const appProcessName = "CICD Assistant";

app.setName(appProcessName);
app.setAboutPanelOptions({
  applicationName: appDisplayName,
  applicationVersion: app.getVersion(),
  version: app.getVersion()
});

function appIconPath() {
  return app.isPackaged ? join(process.resourcesPath, "icon.png") : join(__dirname, "../build/icon.png");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function contentTypeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html";
  if (ext === ".js") return "text/javascript";
  if (ext === ".css") return "text/css";
  if (ext === ".json") return "application/json";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = join(__dirname, "../dist", pathname);
    const data = await readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": contentTypeFor(filePath)
      }
    });
  });
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const iconPath = appIconPath();
  const win = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 1040,
    minHeight: 720,
    title: appDisplayName,
    icon: iconPath,
    backgroundColor: isMac ? "#00000000" : "#f4f6f8",
    titleBarStyle: "default",
    transparent: false,
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadURL("app://local/index.html");
  }

  win.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      { role: "selectAll" }
    ]).popup({ window: win });
  });
}

app.whenReady().then(async () => {
  await registerAppProtocol();
  if (process.platform === "darwin") {
    app.dock?.setIcon(nativeImage.createFromPath(appIconPath()));
  }
  createWindow();
});
app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    {
      label: appDisplayName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open Visual Builder Studio",
          click: () => shell.openExternal(projectUrl)
        },
        {
          label: "Download Git",
          click: () => shell.openExternal("https://git-scm.com/downloads")
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function run(command: string, args: string[], cwd?: string) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: 120000,
      windowsHide: true
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() || err.message || "Unknown error"
    };
  }
}

async function git(args: string[], cwd: string) {
  return run("git", args, cwd);
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function getRepositoryInfo(repoPath: string): Promise<RepositoryInfo> {
  const branch = await git(["branch", "--show-current"], repoPath);
  const status = await git(["status", "--porcelain"], repoPath);
  const remote = await git(["remote", "get-url", "origin"], repoPath);
  return {
    name: basename(repoPath),
    path: repoPath,
    branch: branch.ok && branch.stdout ? branch.stdout : null,
    dirty: status.ok && status.stdout.length > 0,
    remote: remote.ok && remote.stdout ? remote.stdout : null
  };
}

function classifyFile(filePath: string): SelectedFile["kind"] {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".iar") return "integration";
  if (ext === ".par") return "package";
  if (ext === ".csv") return "lookup";
  if (ext === ".xml") return "xml";
  return "other";
}

function isAllowedArtifact(filePath: string) {
  return classifyFile(filePath) !== "other";
}

function readUInt16(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlUnescape(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) return { mime: "image/png", ext: "png", buffer: Buffer.alloc(0) };
  const mime = match[1].replace("image/jpg", "image/jpeg");
  return {
    mime,
    ext: mime.endsWith("jpeg") ? "jpg" : mime.split("/")[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Buffer }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const dataCrc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(dataCrc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, file.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(dataCrc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function textRun(text: string, bold = false) {
  return `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}${textRun(text)}</w:p>`;
}

function labeledParagraph(label: string, value: string) {
  if (!value.trim()) return "";
  return `<w:p>${textRun(`${label}: `, true)}${textRun(value)}</w:p>`;
}

function heading(text: string, level = 1) {
  return paragraph(text, `Heading${level}`);
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function imageRun(relId: string, docPrId: number) {
  return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="5486400" cy="3086100"/><wp:docPr id="${docPrId}" name="Evidence ${docPrId}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Evidence ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function hasEvidenceStepContent(step: EvidenceExportPayload["steps"][number]) {
  return Boolean(step.comment.trim() || step.images.length);
}

function evidenceLabels(language: EvidenceExportPayload["documentLanguage"]) {
  if (language === "es") {
    return {
      subtitle: "Evidencia de ejecucion CI/CD",
      environment: "Ambiente",
      execution: "Ejecucion RFC",
      phase: "Fase",
      message: "Mensaje RFC",
      steps: "Pasos",
      log: "Log"
    };
  }
  if (language === "pt") {
    return {
      subtitle: "Evidencia de execucao CI/CD",
      environment: "Ambiente",
      execution: "Execucao RFC",
      phase: "Fase",
      message: "Mensagem RFC",
      steps: "Passos",
      log: "Log"
    };
  }
  return {
    subtitle: "CI/CD execution evidence",
    environment: "Environment",
    execution: "RFC Execution",
    phase: "Phase",
    message: "RFC message",
    steps: "Steps",
    log: "Log"
  };
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:lang w:val="es-MX"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:color w:val="C74634"/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="320"/></w:pPr><w:rPr><w:i/><w:color w:val="5F5650"/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="312D2A"/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="C74634"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`;
}

function buildEvidenceHtml(payload: EvidenceExportPayload) {
  const labels = evidenceLabels(payload.documentLanguage);
  const steps = payload.steps.filter(hasEvidenceStepContent);
  const messageBlock = payload.message.trim() ? `<h2>${labels.message}</h2><pre>${xmlEscape(payload.message)}</pre>` : "";
  const metaRows = [
    [labels.phase, payload.phase],
    ["Pipeline", payload.pipeline],
    ["Run", payload.run],
    ["URL", payload.runUrl]
  ].filter(([, value]) => value.trim());
  const metaBlock = metaRows.length
    ? `<div class="meta">${metaRows.map(([label, value]) => `<strong>${xmlEscape(label)}</strong><span>${xmlEscape(value)}</span>`).join("")}</div>`
    : "";
  const logBlock = payload.logs.length
    ? `<h2>${labels.log}</h2><div class="log">${payload.logs.map((log) => `[${log.at}] ${log.step}: ${log.text}`).join("\n")}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#272321;margin:36px}h1{color:#c74634}h2{border-bottom:1px solid #ddd;padding-bottom:6px}.meta{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;margin:18px 0}.step{page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:14px;margin:14px 0}.comment{white-space:pre-wrap;background:#f7f4f2;padding:10px;border-radius:6px}img{max-width:100%;border:1px solid #ddd;border-radius:6px;margin-top:8px}.log{font-family:monospace;font-size:12px;white-space:pre-wrap}</style></head><body><h1>RFC ${xmlEscape(payload.rfc || "")}</h1><p>${labels.environment}: ${xmlEscape(payload.environment)}</p><p>${new Date().toLocaleDateString()}</p><h2>${labels.execution}</h2>${metaBlock}${messageBlock}<h2>${labels.steps}</h2>${steps.map((step) => `<section class="step"><h3>${step.index}. ${xmlEscape(step.title)}</h3>${step.comment.trim() ? `<div class="comment">${xmlEscape(step.comment)}</div>` : ""}${step.images.map((image) => `<p><strong>${xmlEscape(image.name)}</strong> ${xmlEscape(image.createdAt)}</p><img src="${image.dataUrl}">`).join("")}</section>`).join("")}${logBlock}</body></html>`;
}

function buildEvidenceDocx(payload: EvidenceExportPayload) {
  const labels = evidenceLabels(payload.documentLanguage);
  const media: Array<{ name: string; data: Buffer; relId: string }> = [];
  let imageIndex = 1;
  const steps = payload.steps.filter(hasEvidenceStepContent);
  const body: string[] = [
    paragraph(`RFC ${payload.rfc || ""}`, "Title"),
    paragraph(labels.subtitle, "Subtitle"),
    labeledParagraph(labels.environment, payload.environment),
    paragraph(new Date().toLocaleDateString(), "Subtitle"),
    pageBreak(),
    paragraph(labels.execution, "Title"),
    labeledParagraph(labels.phase, payload.phase),
    labeledParagraph("Pipeline", payload.pipeline),
    labeledParagraph("Run", payload.run),
    labeledParagraph("URL", payload.runUrl)
  ];
  if (payload.message.trim()) {
    body.push(heading(labels.message), paragraph(payload.message));
  }
  body.push(
    heading(labels.steps)
  );
  for (const step of steps) {
    body.push(heading(`${step.index}. ${step.title}`, 2));
    if (step.comment.trim()) body.push(paragraph(step.comment));
    for (const image of step.images) {
      const parsed = dataUrlToBuffer(image.dataUrl);
      const relId = `rIdImage${imageIndex}`;
      const name = `image${imageIndex}.${parsed.ext}`;
      media.push({ name, data: parsed.buffer, relId });
      body.push(paragraph(`${image.name} - ${image.createdAt}`), imageRun(relId, imageIndex));
      imageIndex += 1;
    }
  }
  if (payload.logs.length) {
    body.push(heading(labels.log), ...payload.logs.map((log) => paragraph(`[${log.at}] ${log.step}: ${log.text}`)));
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((image) => `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.name}"/>`).join("")}</Relationships>`;
  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/document.xml", data: Buffer.from(documentXml) },
    { name: "word/styles.xml", data: Buffer.from(buildStylesXml()) },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(rels) },
    ...media.map((image) => ({ name: `word/media/${image.name}`, data: image.data }))
  ]);
}

function listZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (readUInt32(buffer, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP central directory not found.");

  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralDirOffset = readUInt32(buffer, eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  for (let index = 0; index < entryCount; index++) {
    if (readUInt32(buffer, offset) !== 0x02014b50) break;
    const compression = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const uncompressedSize = readUInt32(buffer, offset + 24);
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;
  if (readUInt32(buffer, offset) !== 0x04034b50) throw new Error(`Invalid local header for ${entry.name}`);
  const nameLength = readUInt16(buffer, offset + 26);
  const extraLength = readUInt16(buffer, offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.compression}`);
}

function extractDocxText(buffer: Buffer) {
  const entries = listZipEntries(buffer);
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml");
  if (!documentEntry) return "";
  const xml = readZipEntry(buffer, documentEntry)
    .toString("utf8")
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:fldSimple\b[^>]*>[\s\S]*?<\/w:fldSimple>/g, "");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => xmlUnescape(line).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
}

function decodePdfLiteral(value: string) {
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

function decodePdfHex(value: string) {
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
  return Buffer.from(bytes).toString("latin1");
}

function extractPdfTextOperators(content: string) {
  const parts: string[] = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  const arrayPattern = /\[((?:.|\n|\r)*?)\]\s*TJ/g;

  for (const match of content.matchAll(literalPattern)) parts.push(decodePdfLiteral(match[1]));
  for (const match of content.matchAll(hexPattern)) parts.push(decodePdfHex(match[1]));
  for (const match of content.matchAll(arrayPattern)) {
    const arrayContent = match[1];
    for (const literal of arrayContent.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) parts.push(decodePdfLiteral(literal[1]));
    for (const hex of arrayContent.matchAll(/<([0-9a-fA-F\s]+)>/g)) parts.push(decodePdfHex(hex[1]));
  }

  return parts
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function inflatePdfStream(data: Buffer) {
  try {
    return inflateSync(data);
  } catch {
    return inflateRawSync(data);
  }
}

function extractPdfText(buffer: Buffer) {
  const binary = buffer.toString("latin1");
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
    const dictionary = binary.slice(Math.max(0, streamIndex - 1000), streamIndex);
    const raw = Buffer.from(binary.slice(dataStart, endIndex).replace(/\r?\n$/, ""), "latin1");
    try {
      const data = /\/FlateDecode\b/.test(dictionary) ? inflatePdfStream(raw) : raw;
      const text = extractPdfTextOperators(data.toString("latin1"));
      if (text) chunks.push(text);
    } catch {
      // Ignore streams that are not text/content streams.
    }
    offset = endIndex + "endstream".length;
  }
  return Array.from(new Set(chunks))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 12000);
}

function cleanExtractedPdfText(text: string) {
  const cleaned = text
    .replace(/^\(null\)$/i, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.slice(0, 12000);
}

async function extractPdfTextWithSpotlight(filePath: string) {
  if (platform() !== "darwin") return "";
  try {
    const { stdout } = await execFileAsync("/usr/bin/mdls", ["-raw", "-name", "kMDItemTextContent", filePath], {
      maxBuffer: 1024 * 1024 * 8
    });
    return cleanExtractedPdfText(stdout);
  } catch {
    return "";
  }
}

async function extractPdfTextWithPdfKit(filePath: string) {
  if (platform() !== "darwin") return "";
  try {
    const moduleCachePath = join(tmpdir(), "cicd-rfc-assistant-swift-cache");
    await mkdir(moduleCachePath, { recursive: true });
    const script = [
      "import Foundation",
      "import PDFKit",
      "let path = ProcessInfo.processInfo.environment[\"CICD_PDF_PATH\"] ?? \"\"",
      "if let doc = PDFDocument(url: URL(fileURLWithPath: path)) { print(doc.string ?? \"\") }"
    ].join("\n");
    const { stdout } = await execFileAsync("/usr/bin/swift", ["-module-cache-path", moduleCachePath, "-e", script], {
      env: { ...process.env, CICD_PDF_PATH: filePath },
      maxBuffer: 1024 * 1024 * 20
    });
    return cleanExtractedPdfText(stdout);
  } catch {
    return "";
  }
}

async function extractPdfTextFromFile(filePath: string) {
  const pdfKitText = await extractPdfTextWithPdfKit(filePath);
  if (pdfKitText) return pdfKitText;
  const spotlightText = await extractPdfTextWithSpotlight(filePath);
  if (spotlightText) return spotlightText;
  return cleanExtractedPdfText(extractPdfText(await readFile(filePath)));
}

function parseProperties(text: string) {
  const props: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    props[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/\\=/g, "=");
  }
  return props;
}

function baseNameWithoutExtension(pathName: string) {
  return basename(pathName).replace(/\.[^.]+$/, "");
}

function inspectPackageComponents(entries: ZipEntry[]) {
  const visible = entries.map((entry) => entry.name).filter((name) => !name.endsWith("/"));
  return visible
    .map((entryPath) => {
      if (entryPath.startsWith("icspackage/appinstances/")) {
        return { kind: "connection" as const, name: baseNameWithoutExtension(entryPath), path: entryPath };
      }
      if (entryPath.startsWith("icspackage/schedule/")) {
        return { kind: "schedule" as const, name: baseNameWithoutExtension(entryPath), path: entryPath };
      }
      if (entryPath.startsWith("icspackage/dvms/")) {
        return { kind: "dvm" as const, name: baseNameWithoutExtension(entryPath), path: entryPath };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 80);
}

async function inspectArtifact(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".iar" && ext !== ".par") {
    return {
      filePath,
      fileName: basename(filePath),
      kind: "unsupported",
      projects: [],
      components: [],
      entries: []
    };
  }
  try {
    const buffer = await readFile(filePath);
    const entries = listZipEntries(buffer);
    const projectEntries = entries.filter((entry) => entry.name.endsWith("ics_project_attributes.properties"));
    const visibleEntries = entries
      .map((entry) => entry.name)
      .filter((name) => !name.endsWith("/"))
      .slice(0, 120);
    const projects = projectEntries.map((entry) => {
      const props = parseProperties(readZipEntry(buffer, entry).toString("utf8"));
      return {
        code: props.project_code,
        name: props.project_name,
        version: props.project_version,
        type: props.project_type,
        state: props.project_persisted_state
      };
    });
    return {
      filePath,
      fileName: basename(filePath),
      kind: ext.slice(1),
      projects,
      components: inspectPackageComponents(entries),
      entries: visibleEntries
    };
  } catch (error) {
    const err = error as Error;
    return {
      filePath,
      fileName: basename(filePath),
      kind: "error",
      projects: [],
      components: [],
      entries: [],
      error: err.message
    };
  }
}

function safeRfc(rfc: string) {
  return rfc.trim().replace(/[^\w.-]/g, "_");
}

function getManifestName(mode: DraftPayload["mode"]) {
  return mode === "FULL" ? "int_full.txt" : "int_adhoc.txt";
}

function buildDraft(payload: DraftPayload) {
  const cleanRfc = safeRfc(payload.rfc);
  const riceFolderPath = payload.riceFolderPath.trim().replace(/^\/+|\/+$/g, "");
  const targetPath = join(payload.repoPath, riceFolderPath, "OIC");
  const manifestPath = join(targetPath, getManifestName(payload.mode));
  const inputUpdates = {
    DEPLOY_CHOICE: "OIC",
    RICE_FOLDER_PATH: riceFolderPath,
    FULL_OR_ADHOC: payload.mode,
    CHANGE_REQUEST_ID: cleanRfc
  };
  const filesToCopy = payload.files.map((file) => {
    const destination =
      file.kind === "lookup"
        ? join(targetPath, "Lookups", basename(file.path))
        : join(targetPath, basename(file.path));
    return { source: file.path, destination, kind: file.kind };
  });
  const manifestEntries = payload.files
    .filter((file) => file.kind === "integration" || file.kind === "package" || file.kind === "xml")
    .map((file) => basename(file.path));
  const warnings: string[] = [];
  if (!cleanRfc) warnings.push("El RFC está vacío.");
  if (!riceFolderPath) warnings.push("La ruta RICE_FOLDER_PATH está vacía.");
  if (payload.files.length === 0) warnings.push("No hay archivos seleccionados.");
  if (manifestEntries.length === 0) warnings.push("No hay .iar, .par o .xml para listar en el manifiesto.");
  return { targetPath, filesToCopy, manifestPath, manifestEntries, inputUpdates, warnings };
}

async function writeLog(rfc: string, lines: string[]) {
  const root = join(app.getPath("userData"), "logs", safeRfc(rfc));
  await mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(root, `${stamp}.log`);
  await writeFile(logPath, lines.join("\n") + "\n", "utf8");
  return logPath;
}

async function updateInputs(repoPath: string, values: Record<string, string>) {
  const inputsPath = join(repoPath, "DevOps", "inputs", "inputs.properties");
  const existing = (await pathExists(inputsPath)) ? await readFile(inputsPath, "utf8") : "[inputs]\n";
  const lines = existing.split(/\r?\n/);
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    const match = line.match(/^\s*([A-Z_]+)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in values)) return line;
    seen.add(key);
    return `${key} = ${values[key]}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) updated.push(`${key} = ${value}`);
  }
  await mkdir(dirname(inputsPath), { recursive: true });
  await writeFile(inputsPath, updated.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
  return inputsPath;
}

async function applyDraft(payload: DraftPayload) {
  const summary = buildDraft(payload);
  if (summary.warnings.some((warning) => warning.includes("vacío"))) return summary;

  const logLines = [`[${new Date().toISOString()}] Preparando borrador RFC ${payload.rfc}`];
  await mkdir(summary.targetPath, { recursive: true });
  for (const file of summary.filesToCopy) {
    await mkdir(dirname(file.destination), { recursive: true });
    await copyFile(file.source, file.destination);
    logLines.push(`[${new Date().toISOString()}] Archivo copiado: ${file.destination}`);
  }
  await writeFile(summary.manifestPath, summary.manifestEntries.join("\n") + "\n", "utf8");
  logLines.push(`[${new Date().toISOString()}] Manifiesto actualizado: ${summary.manifestPath}`);
  const inputsPath = await updateInputs(payload.repoPath, summary.inputUpdates);
  logLines.push(`[${new Date().toISOString()}] inputs.properties actualizado: ${inputsPath}`);
  const logPath = await writeLog(payload.rfc, logLines);
  await appendFile(logPath, `[${new Date().toISOString()}] Borrador listo\n`, "utf8");
  return summary;
}

ipcMain.handle("check-prerequisites", async () => {
  const checks = [
    {
      name: "Git",
      command: "git",
      args: ["--version"],
      helpUrl: "https://git-scm.com/downloads",
      fix: "Instala Git y vuelve a ejecutar la verificación."
    },
    {
      name: "Node.js",
      command: "node",
      args: ["--version"],
      helpUrl: "https://nodejs.org/en/download",
      fix: "Instala Node.js LTS para ejecutar herramientas de soporte."
    },
    {
      name: "Git user.name",
      command: "git",
      args: ["config", "--global", "user.name"],
      helpUrl: "https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup",
      fix: "Configura Git con: git config --global user.name \"Tu Nombre\""
    },
    {
      name: "Git user.email",
      command: "git",
      args: ["config", "--global", "user.email"],
      helpUrl: "https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup",
      fix: "Configura Git con: git config --global user.email \"tu.correo@oracle.com\""
    }
  ];
  return Promise.all(
    checks.map(async (check) => {
      const result = await run(check.command, check.args);
      return {
        name: check.name,
        command: check.command,
        installed: result.ok && Boolean(result.stdout),
        version: result.ok && result.stdout ? result.stdout : undefined,
        helpUrl: check.helpUrl,
        fix: result.ok && result.stdout ? "Listo." : check.fix
      };
    })
  );
});

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("backup-user-data", async (_event, payload: UserDataBackupPayload) => {
  const root = payload.outputDirectory?.trim() || join(app.getPath("documents"), "RFC Assistant Backups");
  await mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(root, `rfc-assistant-user-data-${stamp}.json`);
  await writeFile(
    filePath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        app: appDisplayName,
        data: payload.data
      },
      null,
      2
    ),
    "utf8"
  );
  return filePath;
});

ipcMain.handle("clear-user-files", async () => {
  await rm(join(app.getPath("userData"), "logs"), { recursive: true, force: true });
  return true;
});

ipcMain.handle("select-files", async (_event, extensions: string[]) => {
  const filters = [{ name: "OIC artifacts", extensions: extensions.length ? extensions : ["iar", "par", "csv", "xml"] }];
  const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters });
  if (result.canceled) return [];
  return result.filePaths
    .filter(isAllowedArtifact)
    .map((path) => ({ path, name: basename(path), kind: classifyFile(path) }));
});

ipcMain.handle("select-action-document", async (): Promise<ActionSourceDocument | null> => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "IM090 / installation document", extensions: ["docx", "pdf"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const ext = extname(filePath).toLowerCase();
  if (ext === ".docx") {
    const text = extractDocxText(await readFile(filePath));
    return {
      path: filePath,
      name: basename(filePath),
      kind: "docx",
      text,
      warning: text ? undefined : "No se pudo extraer texto del documento DOCX."
    };
  }
  const text = await extractPdfTextFromFile(filePath);
  return {
    path: filePath,
    name: basename(filePath),
    kind: "pdf",
    text,
    warning: text ? undefined : "PDF cargado como referencia. No se detecto texto seleccionable; puede requerir OCR si es escaneado."
  };
});

ipcMain.handle("select-evidence-images", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Evidence images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  if (result.canceled) return [];
  return Promise.all(
    result.filePaths.map(async (path) => {
      const bytes = await readFile(path);
      const ext = extname(path).toLowerCase().replace(".", "") || "png";
      const mime = ext === "jpg" ? "jpeg" : ext;
      return {
        name: basename(path),
        path,
        dataUrl: `data:image/${mime};base64,${bytes.toString("base64")}`
      };
    })
  );
});

ipcMain.handle("capture-app-window", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("No se pudo capturar la ventana de la app.");
  const image = await window.capturePage();
  return {
    name: `captura-app-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
    dataUrl: image.toDataURL()
  };
});

ipcMain.handle("capture-screen-region", async (event) => {
  if (process.platform !== "darwin") {
    throw new Error("La captura por region esta disponible primero en macOS. Usa Agregar imagen o Pegar captura.");
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  const name = `captura-region-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  const outputPath = join(tmpdir(), name);
  try {
    if (window && !window.isDestroyed()) {
      window.minimize();
      await delay(350);
    }
    const result = await run("/usr/sbin/screencapture", ["-i", "-x", outputPath]);
    if (!result.ok) throw new Error("Captura cancelada o no permitida por el sistema.");
    const bytes = await readFile(outputPath);
    return {
      name,
      path: outputPath,
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`
    };
  } finally {
    await unlink(outputPath).catch(() => undefined);
    if (window && !window.isDestroyed()) {
      window.restore();
      window.focus();
    }
  }
});

ipcMain.handle("scan-repositories", async (_event, basePath: string) => {
  const entries = await readdir(basePath, { withFileTypes: true });
  const repos: RepositoryInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(basePath, entry.name);
    if (await pathExists(join(fullPath, ".git"))) {
      repos.push(await getRepositoryInfo(fullPath));
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle("clone-repository", async (_event, payload: { url: string; destination: string }) => {
  const destination = resolve(payload.destination);
  await mkdir(dirname(destination), { recursive: true });
  const result = await run("git", ["clone", payload.url, destination]);
  if (!result.ok) throw new Error(result.stderr);
  return getRepositoryInfo(destination);
});

ipcMain.handle("get-draft-summary", async (_event, payload: DraftPayload) => buildDraft(payload));

ipcMain.handle("prepare-rfc-draft", async (_event, payload: DraftPayload) => {
  return buildDraft(payload);
});

async function commitRfcLocal(payload: DraftPayload) {
  const branch = safeRfc(payload.rfc);
  const lines = [`[${new Date().toISOString()}] Preparando cambios locales RFC ${branch}`];
  async function fail(output: string) {
    const backToRelease = await git(["checkout", releaseBranch], payload.repoPath);
    lines.push(`failure checkout ${releaseBranch}: ${backToRelease.ok ? "OK" : backToRelease.stderr}`);
    const logPath = await writeLog(branch, lines);
    return {
      ok: false,
      branch,
      logPath,
      output: `${output}${backToRelease.ok ? `\n\nRepositorio regresado a ${releaseBranch}.` : `\n\nNo se pudo regresar a ${releaseBranch}: ${backToRelease.stderr}`}`
    };
  }
  const checkoutBase = await git(["checkout", releaseBranch], payload.repoPath);
  lines.push(`checkout ${releaseBranch}: ${checkoutBase.ok ? "OK" : checkoutBase.stderr}`);
  if (!checkoutBase.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: checkoutBase.stderr };
  }
  const pull = await git(["pull"], payload.repoPath);
  lines.push(`pull: ${pull.ok ? "OK" : pull.stderr}`);
  if (!pull.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: pull.stderr };
  }
  const branchResult = await git(["checkout", "-B", branch], payload.repoPath);
  lines.push(`checkout -B ${branch}: ${branchResult.ok ? "OK" : branchResult.stderr}`);
  if (!branchResult.ok) {
    return fail(branchResult.stderr);
  }
  await applyDraft(payload);
  const status = await git(["status", "--short"], payload.repoPath);
  lines.push(`status: ${status.ok ? status.stdout || "sin cambios" : status.stderr}`);
  const logPath = await writeLog(branch, lines);
  return {
    ok: true,
    branch,
    logPath,
    output: `Cambios preparados en la rama ${branch}.\n\nNo se ejecuto git add, commit ni push.\nRevisa los artefactos y archivos modificados. Cuando todo este correcto, ejecuta Push.`
  };
}

async function pushRfcBranch(payload: DraftPayload) {
  const branch = safeRfc(payload.rfc);
  const lines = [`[${new Date().toISOString()}] Publicando RFC ${branch}`];
  const checkoutBranch = await git(["checkout", branch], payload.repoPath);
  lines.push(`checkout ${branch}: ${checkoutBranch.ok ? "OK" : checkoutBranch.stderr}`);
  if (!checkoutBranch.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: checkoutBranch.stderr };
  }
  const add = await git(["add", "."], payload.repoPath);
  lines.push(`git add: ${add.ok ? "OK" : add.stderr}`);
  if (!add.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: add.stderr };
  }
  const commit = await git(["commit", "-m", branch], payload.repoPath);
  lines.push(`git commit: ${commit.ok ? commit.stdout : commit.stderr}`);
  if (!commit.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: commit.stderr };
  }
  const push = await git(["push", "--set-upstream", "origin", branch], payload.repoPath);
  lines.push(`git push: ${push.ok ? "OK" : push.stderr}`);
  const commitHash = await git(["rev-parse", "--short", "HEAD"], payload.repoPath);
  const checkoutReleaseEnd = await git(["checkout", releaseBranch], payload.repoPath);
  lines.push(`final checkout ${releaseBranch}: ${checkoutReleaseEnd.ok ? "OK" : checkoutReleaseEnd.stderr}`);
  if (checkoutReleaseEnd.ok) {
    const finalPull = await git(["pull"], payload.repoPath);
    lines.push(`final pull ${releaseBranch}: ${finalPull.ok ? "OK" : finalPull.stderr}`);
  }
  const logPath = await writeLog(branch, lines);
  return {
    ok: push.ok && checkoutReleaseEnd.ok,
    commit: commitHash.ok ? commitHash.stdout : undefined,
    branch,
    logPath,
    output: push.ok
      ? `${push.stdout}\n\nRepositorio regresado a ${releaseBranch}.`
      : `${push.stderr}\n\n${checkoutReleaseEnd.ok ? `Repositorio regresado a ${releaseBranch}.` : checkoutReleaseEnd.stderr}`
  };
}

async function undoRfcLocalCommit(payload: DraftPayload) {
  const branch = safeRfc(payload.rfc);
  const lines = [`[${new Date().toISOString()}] Descartando cambios locales RFC ${branch}`];
  const checkoutBranch = await git(["checkout", branch], payload.repoPath);
  lines.push(`checkout ${branch}: ${checkoutBranch.ok ? "OK" : checkoutBranch.stderr}`);
  if (!checkoutBranch.ok) {
    const logPath = await writeLog(branch, lines);
    return { ok: false, branch, logPath, output: checkoutBranch.stderr };
  }
  const reset = await git(["reset", "--hard", releaseBranch], payload.repoPath);
  lines.push(`reset --hard ${releaseBranch}: ${reset.ok ? "OK" : reset.stderr}`);
  const clean = await git(["clean", "-fd"], payload.repoPath);
  lines.push(`clean -fd: ${clean.ok ? "OK" : clean.stderr}`);
  const logPath = await writeLog(branch, lines);
  return {
    ok: reset.ok && clean.ok,
    branch,
    logPath,
    output: reset.ok && clean.ok
      ? `Cambios locales descartados en la rama ${branch}.\nLa rama no fue eliminada.`
      : `${reset.stderr}\n${clean.stderr}`.trim()
  };
}

ipcMain.handle("commit-rfc-local", async (_event, payload: DraftPayload) => commitRfcLocal(payload));

ipcMain.handle("push-rfc-branch", async (_event, payload: DraftPayload) => pushRfcBranch(payload));

ipcMain.handle("undo-rfc-local-commit", async (_event, payload: DraftPayload) => undoRfcLocalCommit(payload));

ipcMain.handle("finalize-rfc", async (_event, payload: DraftPayload) => {
  const commit = await commitRfcLocal(payload);
  if (!commit.ok) return commit;
  return pushRfcBranch(payload);
});

ipcMain.handle("inspect-artifacts", async (_event, filePaths: string[]) => {
  return Promise.all(filePaths.map((filePath) => inspectArtifact(filePath)));
});

ipcMain.handle("export-evidence-docx", async (_event, payload: EvidenceExportPayload) => {
  const fileBase = `${safeRfc(payload.rfc || "RFC")}-${payload.phase}-evidencia`;
  if (payload.outputDirectory) {
    await mkdir(payload.outputDirectory, { recursive: true });
    const outputPath = join(payload.outputDirectory, `${fileBase}.docx`);
    await writeFile(outputPath, buildEvidenceDocx(payload));
    return outputPath;
  }
  const result = await dialog.showSaveDialog({
    title: "Guardar evidencia DOCX",
    defaultPath: `${fileBase}.docx`,
    filters: [{ name: "Word document", extensions: ["docx"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, buildEvidenceDocx(payload));
  return result.filePath;
});

ipcMain.handle("export-evidence-pdf", async (_event, payload: EvidenceExportPayload) => {
  const fileBase = `${safeRfc(payload.rfc || "RFC")}-${payload.phase}-evidencia`;
  const outputPath = payload.outputDirectory ? join(payload.outputDirectory, `${fileBase}.pdf`) : null;
  const result = outputPath
    ? null
    : await dialog.showSaveDialog({
        title: "Guardar evidencia PDF",
        defaultPath: `${fileBase}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
  if (!outputPath && (result?.canceled || !result?.filePath)) return null;
  if (payload.outputDirectory) await mkdir(payload.outputDirectory, { recursive: true });
  const htmlPath = join(tmpdir(), `${fileBase}-${Date.now()}.html`);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  try {
    await writeFile(htmlPath, buildEvidenceHtml(payload), "utf8");
    await win.loadFile(htmlPath);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "default" }
    });
    const targetPath = outputPath ?? result?.filePath;
    if (!targetPath) return null;
    await writeFile(targetPath, pdf);
    return targetPath;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    await unlink(htmlPath).catch(() => undefined);
  }
});

ipcMain.handle("open-external", async (_event, url: string) => {
  await shell.openExternal(url || projectUrl);
});
