import {
  AlertCircle,
  Camera,
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
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CSSProperties } from "react";
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
const defaultCustomTheme = {
  colorA: "#d9c4ff",
  colorB: "#8fe8ff",
  colorC: "#ff8fe7",
  sidebar: "#34256f",
  accent: "#4aa3ff",
  transparency: 0.94,
  blur: 18,
  gradient: "linear-gradient(135deg, #d9c4ff 0%, #8fe8ff 52%, #ff8fe7 100%)"
};
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

function avatarUrl(seed: string, style = defaultProfile.avatarStyle) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

type StepId = "actionPlan" | "package" | "review" | "pipeline";
type PipelinePhase = "TEST" | "PROD";
type ExecutionMode = "general" | "cicd";
type Lang = "es" | "en" | "pt";
type EvidenceItem = EvidenceImage & {
  id: string;
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
  at: string;
  step: StepId;
  rfc?: string;
  text: string;
};
type ExecutionHistoryItem = {
  id: string;
  rfc: string;
  phase: string;
  kind: "docx" | "pdf";
  path: string;
  exportedAt: string;
};
type ManualActionPhase = {
  id: "prerequisites" | "backup" | "installation" | "schedule" | "validation" | "returnPoint" | "evidence";
  title: string;
  content: string;
};
type PipelineExecutionStep = {
  title: string;
  detail: string;
};

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
type InstantTooltip = {
  text: string;
  x: number;
  y: number;
};
type SettingsTab = "language" | "environment" | "history" | "themes" | "user" | "about";
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
  | "custom";

const languageNames: Record<Lang, string> = {
  es: "Espanol",
  en: "English",
  pt: "Portugues"
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
    openFile: "Abrir",
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
    customGradient: "Gradiente personalizado",
    resetCustomTheme: "Restablecer personalizado",
    backgroundA: "Fondo 1",
    backgroundB: "Fondo 2",
    backgroundC: "Fondo 3",
    sidebarColor: "Sidebar",
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
      invalidFiles: "Solo se permiten artefactos .iar, .par, .xml o .csv.",
      summaryOk: "Resumen actualizado.",
      draftOk: "Borrador preparado localmente.",
      noFiles: "Agrega al menos un artefacto antes de continuar.",
      packageCleared: "Paquete limpiado. Agrega artefactos para continuar.",
      stepRequired: "Agrega comentario o evidencia antes de avanzar.",
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
      dropBody: "Acepta .iar, .par, .xml y lookups .csv. Los .csv se colocan en OIC/Lookups.",
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
      clearExecution: "Limpiar ejecucion",
      stepsLoaded: "Pasos generados desde el Action Plan.",
      planPlaceholder: "Pega aqui el Action Plan o usa el que generaste en la app.",
      cicdHint: "En modo CI/CD Tool registra pipeline, run y URL para unir evidencia de Git con capturas de ejecucion.",
      checklist: "Ejecucion guiada",
      message: "Mensaje para actualizar RFC",
      finalMessage: "Cierre del seguimiento",
      currentEvidence: "Evidencia del paso",
      comment: "Comentario del paso",
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
    openFile: "Open",
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
    customGradient: "Custom gradient",
    resetCustomTheme: "Reset custom theme",
    backgroundA: "Background 1",
    backgroundB: "Background 2",
    backgroundC: "Background 3",
    sidebarColor: "Sidebar",
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
      invalidFiles: "Only .iar, .par, .xml, or .csv artifacts are allowed.",
      summaryOk: "Summary refreshed.",
      draftOk: "Local draft prepared.",
      noFiles: "Add at least one artifact before continuing.",
      packageCleared: "Package cleared. Add artifacts to continue.",
      stepRequired: "Add a comment or evidence before continuing.",
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
      dropBody: "Accepts .iar, .par, .xml, and lookup .csv files. .csv files go into OIC/Lookups.",
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
      clearExecution: "Clear execution",
      stepsLoaded: "Steps generated from the Action Plan.",
      planPlaceholder: "Paste the Action Plan here or use the one generated in the app.",
      cicdHint: "In CI/CD Tool mode, record pipeline, run, and URL to combine Git evidence with execution screenshots.",
      checklist: "Guided execution",
      message: "RFC update message",
      finalMessage: "Tracking closeout",
      currentEvidence: "Step evidence",
      comment: "Step comment",
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
    openFile: "Abrir",
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
    customGradient: "Gradiente personalizado",
    resetCustomTheme: "Restaurar personalizado",
    backgroundA: "Fundo 1",
    backgroundB: "Fundo 2",
    backgroundC: "Fundo 3",
    sidebarColor: "Sidebar",
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
      invalidFiles: "Somente artefatos .iar, .par, .xml ou .csv sao permitidos.",
      summaryOk: "Resumo atualizado.",
      draftOk: "Rascunho local preparado.",
      noFiles: "Adicione pelo menos um artefato antes de continuar.",
      packageCleared: "Pacote limpo. Adicione artefatos para continuar.",
      stepRequired: "Adicione comentario ou evidencia antes de continuar.",
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
      dropBody: "Aceita .iar, .par, .xml e lookups .csv. Arquivos .csv vao para OIC/Lookups.",
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
      clearExecution: "Limpar execucao",
      stepsLoaded: "Passos gerados a partir do Action Plan.",
      planPlaceholder: "Cole aqui o Action Plan ou use o que foi gerado no app.",
      cicdHint: "No modo CI/CD Tool, registre pipeline, run e URL para unir evidencia Git com capturas da execucao.",
      checklist: "Execucao guiada",
      message: "Mensagem para atualizar RFC",
      finalMessage: "Fechamento do acompanhamento",
      currentEvidence: "Evidencia do passo",
      comment: "Comentario do passo",
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
    method: "Metodo",
    methodManual: "Manual",
    repository: "Repositorio",
    selectRepository: "Seleccionar repositorio",
    environment: "Ambiente",
    selectEnvironment: "Seleccionar ambiente",
    instance: "Instancia",
    activity: "Actividad / resumen RFC",
    artifacts: "Artefactos",
    artifactsHint: "Un artefacto por linea. Ejemplo: GB_AR_HCR_LKP.csv, package.par o integration.iar",
    sourceDocument: "Documento IM090 / instrucciones",
    loadDocument: "Cargar documento",
    noDocument: "Sin documento cargado",
    manualInstructions: "Instrucciones de instalacion",
    manualInstructionsHint: "Carga un IM090 .docx/.pdf o pega aqui las instrucciones manuales de instalacion.",
    reviewManual: "Revisar fases",
    manualReviewTitle: "Revisar Action Plan manual",
    manualReviewBody: "Confirma o ajusta las fases detectadas antes de generar el Action Plan.",
    acceptReview: "Generar Action Plan",
    generate: "Generar plan",
    clear: "Limpiar Action Plan",
    copy: "Copiar",
    continue: "Continuar a paquete",
    preview: "Action Plan generado",
    methodCicd: "CI/CD Tool"
  },
  en: {
    title: "Generate Action Plan",
    body: "Create the RFC plan with the CI/CD template and the captured data before preparing the package.",
    product: "Product",
    selectProduct: "Select product",
    method: "Method",
    methodManual: "Manual",
    repository: "Repository",
    selectRepository: "Select repository",
    environment: "Environment",
    selectEnvironment: "Select environment",
    instance: "Instance",
    activity: "Activity / RFC summary",
    artifacts: "Artifacts",
    artifactsHint: "One artifact per line. Example: GB_AR_HCR_LKP.csv, package.par, or integration.iar",
    sourceDocument: "IM090 / instructions document",
    loadDocument: "Load document",
    noDocument: "No document loaded",
    manualInstructions: "Installation instructions",
    manualInstructionsHint: "Load an IM090 .docx/.pdf or paste the manual installation instructions here.",
    reviewManual: "Review phases",
    manualReviewTitle: "Review manual Action Plan",
    manualReviewBody: "Confirm or adjust the detected phases before generating the Action Plan.",
    acceptReview: "Generate Action Plan",
    generate: "Generate plan",
    clear: "Clear Action Plan",
    copy: "Copy",
    continue: "Continue to package",
    preview: "Generated Action Plan",
    methodCicd: "CI/CD Tool"
  },
  pt: {
    title: "Gerar Action Plan",
    body: "Crie o plano do RFC com o template CI/CD e os dados capturados antes de preparar o pacote.",
    product: "Produto",
    selectProduct: "Selecionar produto",
    method: "Metodo",
    methodManual: "Manual",
    repository: "Repositorio",
    selectRepository: "Selecionar repositorio",
    environment: "Ambiente",
    selectEnvironment: "Selecionar ambiente",
    instance: "Instancia",
    activity: "Atividade / resumo RFC",
    artifacts: "Artefatos",
    artifactsHint: "Um artefato por linha. Exemplo: GB_AR_HCR_LKP.csv, package.par ou integration.iar",
    sourceDocument: "Documento IM090 / instrucoes",
    loadDocument: "Carregar documento",
    noDocument: "Sem documento carregado",
    manualInstructions: "Instrucoes de instalacao",
    manualInstructionsHint: "Carregue um IM090 .docx/.pdf ou cole aqui as instrucoes manuais de instalacao.",
    reviewManual: "Revisar fases",
    manualReviewTitle: "Revisar Action Plan manual",
    manualReviewBody: "Confirme ou ajuste as fases detectadas antes de gerar o Action Plan.",
    acceptReview: "Gerar Action Plan",
    generate: "Gerar plano",
    clear: "Limpar Action Plan",
    copy: "Copiar",
    continue: "Continuar para pacote",
    preview: "Action Plan gerado",
    methodCicd: "CI/CD Tool"
  }
} as const;

const allowedArtifactExtensions = [".iar", ".par", ".xml", ".csv"];

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
    .slice(0, 12000);
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
    const dictionary = binary.slice(Math.max(0, streamIndex - 1000), streamIndex);
    const raw = bytes.subarray(dataStart, endIndex);
    try {
      const data = /\/FlateDecode\b/.test(dictionary) ? await inflatePdfBytes(raw) : raw;
      const text = extractPdfTextOperators(decoder.decode(data));
      if (text) chunks.push(text);
    } catch {
      // Ignore non-text streams.
    }
    offset = endIndex + "endstream".length;
  }
  return Array.from(new Set(chunks))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 12000);
}

async function buildBrowserActionDocument(file: File): Promise<ActionSourceDocument> {
  const lowerName = file.name.toLowerCase();
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

function cleanIm090Text(text: string) {
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
      if (/^Open and Closed Issues\. \d+ of \d+$/i.test(line)) return false;
      if (/^\d+(?:\.\d+)*\s+(?:Environment Information|Installation artifacts|Pre installation steps|Installation Steps|Schedule activation|Verification Checklist|Return Point|Open and Closed Issues|Open Issues|Closed Issues)\s+\d+$/i.test(line)) return false;
      if (/^[A-Za-z]+ \d{1,2}, \d{4}$/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function operationalIm090Text(text: string) {
  const cleaned = cleanIm090Text(text);
  const marker = cleaned.match(/2\s+Installation Instructions for Grupo Bimbo\s*\n2\.1\s+Environment Information/i);
  if (marker?.index !== undefined) return cleaned.slice(marker.index).trim();
  const looseMarker =
    looseIndexOf(cleaned, "2 Installation Instructions for Grupo Bimbo 2.1 Environment Information") ??
    looseIndexOf(cleaned, "Environment Information Environment Name");
  return looseMarker !== null ? cleaned.slice(looseMarker).trim() : cleaned;
}

function actionPlanLinesFromIm090(text: string) {
  const cleaned = cleanIm090Text(text);
  const lines = cleaned.split("\n").filter(Boolean);
  const start = lines.findIndex((line) => /^2\s+Installation Instructions for Grupo Bimbo\b/i.test(line) && !line.includes("..."));
  return start >= 0 ? lines.slice(start) : lines;
}

function findHeadingLine(lines: string[], pattern: RegExp, from = 0) {
  return lines.findIndex((line, index) => index >= from && pattern.test(line) && !line.includes("..."));
}

function findNextMajorHeading(lines: string[], from: number) {
  const index = lines.findIndex((line, lineIndex) => lineIndex > from && (
    (/^2\.\d+\s+\S/i.test(line) && !line.includes("...")) ||
    /^(Environment Information|Installation artifacts|Pre installation steps|Installation Steps|Schedule activation|Verification Checklist|Return Point|Open and Closed Issues|Open Issues|Closed Issues)\b/i.test(line)
  ));
  return index >= 0 ? index : lines.length;
}

function normalizeManualSection(lines: string[]) {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !line.includes("................................................................"))
    .filter((line, index, list) => list.indexOf(line) === index)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionByHeading(lines: string[], pattern: RegExp, from = 0) {
  const start = findHeadingLine(lines, pattern, from);
  if (start < 0) return "";
  return normalizeManualSection(lines.slice(start, findNextMajorHeading(lines, start)));
}

function sectionByAnyHeading(lines: string[], patterns: RegExp[], from = 0) {
  const starts = patterns
    .map((pattern) => findHeadingLine(lines, pattern, from))
    .filter((index) => index >= 0);
  if (!starts.length) return "";
  const start = Math.min(...starts);
  return normalizeManualSection(lines.slice(start, findNextMajorHeading(lines, start)));
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

function looseSectionByHeadings(text: string, starts: string[], ends: string[]) {
  const startIndexes = starts
    .map((heading) => looseIndexOf(text, heading))
    .filter((index): index is number => index !== null);
  if (!startIndexes.length) return "";
  const start = Math.min(...startIndexes);
  const endIndexes = ends
    .map((heading) => looseIndexOf(text, heading, start + 1))
    .filter((index): index is number => index !== null && index > start);
  const end = endIndexes.length ? Math.min(...endIndexes) : text.length;
  return normalizeManualSection(text.slice(start, end).split("\n"));
}

function extractArtifactNames(text: string) {
  const normalMatches = text.match(/[A-Z0-9][A-Z0-9_.-]+\.(?:iar|par|xml|csv)\b/gi) ?? [];
  const compactText = text.replace(/\s+/g, "");
  const compactMatches = compactText.match(/(?:[A-Z0-9]+[_.-])+[A-Z0-9_.-]+\.(?:iar|par|xml|csv)\b/gi) ?? [];
  return Array.from(new Set([...normalMatches, ...compactMatches].map((item) => item.replace(/\s+/g, ""))));
}

function asBullets(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- Confirm artifacts listed in the IM090.";
}

function environmentAliases(environment: string) {
  const value = normalizeEnvironmentName(environment);
  if (!value) return [];
  if (value === "DEV" || value === "DEVELOPMENT") return ["DEV", "DEVELOPMENT"];
  if (value === "TEST" || value === "REGRESSION") return ["TEST", "REGRESSION", "PREPROD", "TE"];
  if (value === "PREPROD" || value === "TE") return ["PREPROD", "TE"];
  if (value === "PROD" || value === "PRODUCTION" || value === "PR") return ["PROD", "PRODUCTION", "PR"];
  return [value];
}

function normalizeEnvironmentName(value: string) {
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

function findEnvironmentBlock(section: string, environment: string) {
  const aliases = environmentAliases(environment);
  const { heading, blocks } = environmentBlocks(section);
  if (!section || !aliases.length || !blocks.length) return { heading, block: null, hasBlocks: blocks.length > 0 };
  const selected = blocks.find((block) => aliases.includes(normalizeEnvironmentName(environmentNameFromLine(block[0] ?? ""))));
  return { heading, block: selected ?? null, hasBlocks: true };
}

function filterEnvironmentSection(section: string, environment: string) {
  const result = findEnvironmentBlock(section, environment);
  if (!section || !environmentAliases(environment).length || !result.hasBlocks) return section;
  return result.block ? [result.heading, ...result.block].join("\n") : section;
}

function environmentIsMissingInDocument(section: string, environment: string) {
  if (!section || !environmentAliases(environment).length) return false;
  const result = findEnvironmentBlock(section, environment);
  return result.hasBlocks && !result.block;
}

function environmentSectionFromDocument(text: string) {
  const operational = operationalIm090Text(text);
  const lines = actionPlanLinesFromIm090(text);
  return sectionByAnyHeading(lines, [/^2\.\d+\s+Environment Information\b/i, /^Environment Information\b/i], 0) ||
    looseSectionByHeadings(operational, ["2.1 Environment Information", "Environment Information"], [
      "Installation artifacts",
      "Pre installation steps",
      "Installation Steps"
    ]);
}

function selectedEnvironmentMissingFromDocument(text: string, environment: string) {
  return environmentIsMissingInDocument(environmentSectionFromDocument(text), environment);
}

function buildManualPhasesFromDocument(text: string, selectedEnvironment = ""): ManualActionPhase[] {
  const operational = operationalIm090Text(text);
  const lines = actionPlanLinesFromIm090(text);
  const startAt = 0;
  const artifacts = extractArtifactNames(operational);
  const artifactSection = sectionByAnyHeading(lines, [/^2\.\d+\s+Installation artifacts\b/i, /^Installation artifacts\b/i], startAt);
  const preInstall = sectionByAnyHeading(lines, [/^2\.\d+\s+Pre installation steps\b/i, /^Pre installation steps\b/i], startAt);
  const installation = sectionByAnyHeading(lines, [/^2\.\d+\s+Installation Steps\b/i, /^Installation Steps\b/i], startAt);
  const schedule = sectionByAnyHeading(lines, [/^2\.\d+\s+Schedule activation\b/i, /^Schedule activation\b/i], startAt);
  const validation = sectionByAnyHeading(lines, [/^2\.\d+\s+Verification Checklist\b/i, /^Verification Checklist\b/i], startAt);
  const returnPoint = sectionByAnyHeading(lines, [/^2\.\d+\s+Return Point\b/i, /^Return Point\b/i], startAt);
  const environmentContentRaw = environmentSectionFromDocument(text);
  const environmentContent = filterEnvironmentSection(environmentContentRaw, selectedEnvironment);
  const artifactContent = artifactSection || looseSectionByHeadings(operational, ["Installation artifacts"], [
    "Pre installation steps",
    "Installation Steps"
  ]);
  const preInstallContent = preInstall || looseSectionByHeadings(operational, ["Pre installation steps"], ["Installation Steps"]);
  const installationContent = installation || looseSectionByHeadings(operational, ["Installation Steps"], [
    "Schedule activation",
    "Verification Checklist",
    "Return Point"
  ]);
  const scheduleContent = schedule || looseSectionByHeadings(operational, ["Schedule activation"], [
    "Verification Checklist",
    "Return Point"
  ]);
  const validationContent = validation || looseSectionByHeadings(operational, ["Verification Checklist"], ["Return Point"]);
  const returnPointContent = returnPoint || looseSectionByHeadings(operational, ["Return Point"], ["Open and Closed Issues"]);

  return [
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: [
        "Validate target environment, access, and artifacts before starting the manual installation.",
        environmentContent,
        artifactContent,
        "Artifacts detected:",
        asBullets(artifacts),
        preInstallContent
      ].filter(Boolean).join("\n\n")
    },
    {
      id: "backup",
      title: "Backup",
      content: [
        "Before installing, validate whether each component already exists in the target environment.",
        "If it exists, export or download the current version as backup.",
        "Attach backup files or backup evidence to the RFC.",
        "If backup is not applicable, document the reason in the RFC evidence."
      ].join("\n")
    },
    {
      id: "installation",
      title: "Installation Steps",
      content: installationContent || "Execute the manual installation steps described in the IM090."
    },
    {
      id: "schedule",
      title: "Schedule Activation",
      content: scheduleContent || "Validate whether schedule activation applies. If applicable, start schedules and capture evidence."
    },
    {
      id: "validation",
      title: "Validation",
      content: validationContent || "Validate deployed artifacts/components and confirm there are no deployment errors."
    },
    {
      id: "returnPoint",
      title: "Return Point / Contingency",
      content: returnPointContent || "If the installation or validation fails, review configuration and consult the technical team."
    },
    {
      id: "evidence",
      title: "Evidence",
      content: [
        "Capture evidence for each relevant installation step.",
        "Attach the IM090 PDF to the RFC.",
        "Attach backup evidence to the RFC.",
        "Attach final validation evidence and share the execution result."
      ].join("\n")
    }
  ];
}

function regionFromRepo(name: string) {
  const match = name.match(/BIMBO-(R\d)-REPOSITORY/i);
  return match?.[1] ?? "R?";
}

function classifyDroppedFile(path: string): SelectedFile["kind"] {
  const clean = path.toLowerCase();
  if (clean.endsWith(".iar")) return "integration";
  if (clean.endsWith(".par")) return "package";
  if (clean.endsWith(".csv")) return "lookup";
  if (clean.endsWith(".xml")) return "xml";
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
    if (heading && !line.includes("://")) {
      current = { title: trimExecutionStepTitle(heading[2]), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}

function parseActionPlanExecutionSteps(text: string, fallbackSteps: readonly string[]): PipelineExecutionStep[] {
  const sections = splitActionPlanSections(text);
  const steps: PipelineExecutionStep[] = [];

  for (const section of sections) {
    const substeps: PipelineExecutionStep[] = [];
    let current: PipelineExecutionStep | null = null;
    for (const line of section.lines) {
      const substep = line.match(/^(\d+\.\d+|[a-z])\s*[-.)]\s*(.+)$/i);
      if (substep && !line.includes("://")) {
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
  return source
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
}

export function App() {
  const actionDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const executionPlanInputRef = useRef<HTMLInputElement | null>(null);
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
  const [customGradient, setCustomGradient] = useState(
    () => localStorage.getItem("customGradient") || defaultCustomTheme.gradient
  );
  const [customColorA, setCustomColorA] = useState(() => localStorage.getItem("customColorA") || defaultCustomTheme.colorA);
  const [customColorB, setCustomColorB] = useState(() => localStorage.getItem("customColorB") || defaultCustomTheme.colorB);
  const [customColorC, setCustomColorC] = useState(() => localStorage.getItem("customColorC") || defaultCustomTheme.colorC);
  const [customSidebar, setCustomSidebar] = useState(() => localStorage.getItem("customSidebar") || defaultCustomTheme.sidebar);
  const [customAccent, setCustomAccent] = useState(() => localStorage.getItem("customAccent") || defaultCustomTheme.accent);
  const [themeTransparency, setThemeTransparency] = useState(() =>
    Number(localStorage.getItem("themeTransparency") || String(defaultCustomTheme.transparency))
  );
  const [themeBlur, setThemeBlur] = useState(() => Number(localStorage.getItem("themeBlur") || String(defaultCustomTheme.blur)));
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("executionHistory") || "[]");
    } catch {
      return [];
    }
  });
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [basePath, setBasePath] = useState(() => localStorage.getItem("basePath") || defaultBasePath);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneName, setCloneName] = useState("BIMBO-R2-REPOSITORY");
  const [repos, setRepos] = useState<RepositoryInfo[]>([]);
  const [repoPath, setRepoPath] = useState("");
  const [rfc, setRfc] = useState("");
  const [actionProduct, setActionProduct] = useState("");
  const [actionMethod, setActionMethod] = useState<"cicd" | "manual">("cicd");
  const [actionEnvironment, setActionEnvironment] = useState("");
  const [actionInstance, setActionInstance] = useState("");
  const [actionActivity, setActionActivity] = useState("");
  const [artifactText, setArtifactText] = useState("");
  const [actionSourceDocument, setActionSourceDocument] = useState<ActionSourceDocument | null>(null);
  const [manualInstructions, setManualInstructions] = useState("");
  const [manualReviewOpen, setManualReviewOpen] = useState(false);
  const [manualPhaseIndex, setManualPhaseIndex] = useState(0);
  const [manualPhases, setManualPhases] = useState<ManualActionPhase[]>([]);
  const [actionPlan, setActionPlan] = useState("");
  const [riceFolderPath, setRiceFolderPath] = useState("");
  const [mode, setMode] = useState<"ADHOC" | "FULL">("ADHOC");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<string[]>([]);
  const [artifactInspections, setArtifactInspections] = useState<ArtifactInspection[]>([]);
  const [summary, setSummary] = useState<DraftSummary | null>(null);
  const [finalOutput, setFinalOutput] = useState("");
  const [localCommitResult, setLocalCommitResult] = useState<FinalizeResult | null>(null);
  const [testTargetEnvironment, setTestTargetEnvironment] = useState("");
  const [prodTargetEnvironment, setProdTargetEnvironment] = useState("");
  const [testPipelineName, setTestPipelineName] = useState("");
  const [prodPipelineName, setProdPipelineName] = useState("");
  const [testPipelineRun, setTestPipelineRun] = useState("");
  const [prodPipelineRun, setProdPipelineRun] = useState("");
  const [testPipelineRunUrl, setTestPipelineRunUrl] = useState("");
  const [prodPipelineRunUrl, setProdPipelineRunUrl] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("general");
  const [pipelineExecutionPhase, setPipelineExecutionPhase] = useState<PipelinePhase>("TEST");
  const [pipelineActionPlan, setPipelineActionPlan] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [evidenceLog, setEvidenceLog] = useState<EvidenceLog[]>([]);
  const [lastExportPath, setLastExportPath] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [prodMessageOpen, setProdMessageOpen] = useState(false);
  const [pipelineStepIndex, setPipelineStepIndex] = useState(0);
  const [pipelineStepComments, setPipelineStepComments] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<EvidenceItem | null>(null);
  const [instantTooltip, setInstantTooltip] = useState<InstantTooltip | null>(null);

  const t = copy[lang];
  const e = envCopy[lang];
  const a = actionCopy[lang];
  const generatedCustomGradient = `linear-gradient(135deg, ${customColorA} 0%, ${customColorB} 52%, ${customColorC} 100%)`;
  const activateCustomTheme = () => {
    setThemeId("custom");
  };
  const resetCustomTheme = () => {
    setThemeId("custom");
    setCustomColorA(defaultCustomTheme.colorA);
    setCustomColorB(defaultCustomTheme.colorB);
    setCustomColorC(defaultCustomTheme.colorC);
    setCustomSidebar(defaultCustomTheme.sidebar);
    setCustomAccent(defaultCustomTheme.accent);
    setThemeTransparency(defaultCustomTheme.transparency);
    setThemeBlur(defaultCustomTheme.blur);
    setCustomGradient(defaultCustomTheme.gradient);
  };
  const customThemeStyle =
    themeId === "custom"
      ? ({
          "--custom-gradient": customGradient || generatedCustomGradient,
          "--custom-bg-a": customColorA,
          "--custom-bg-b": customColorB,
          "--custom-bg-c": customColorC,
          "--custom-sidebar": customSidebar,
          "--oracle-red": customAccent,
          "--oracle-red-dark": customAccent,
          "--custom-panel-alpha": String(themeTransparency),
          "--custom-blur": `${themeBlur}px`
        } as CSSProperties)
      : undefined;
  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.path === repoPath) ?? null,
    [repos, repoPath]
  );
  const readyForDraft = Boolean(repoPath && rfc.trim() && riceFolderPath.trim() && files.length);
  const canCommit = Boolean(summary && readyForDraft && summary.filesToCopy.length > 0);
  const canPushBranch = Boolean(localCommitResult?.ok && localCommitResult.branch === rfc.trim());
  const isProdPipelineStep = pipelineExecutionPhase === "PROD";
  const trackingEnvironment = pipelineExecutionPhase;
  const pipelineBody = isProdPipelineStep ? t.pipeline.bodyProd : t.pipeline.bodyTest;
  const executionActionPlan = executionMode === "cicd" ? "" : pipelineActionPlan.trim();
  const hasExecutionActionPlan = executionMode === "cicd" || Boolean(executionActionPlan.trim());
  const currentPipelineSteps = useMemo(
    () => {
      if (executionMode === "cicd") return cicdExecutionSteps;
      return executionActionPlan.trim() ? parseActionPlanExecutionSteps(executionActionPlan, t.pipeline.steps) : [];
    },
    [executionActionPlan, executionMode, t.pipeline.steps]
  );
  const defaultPipelineName = `${(selectedRepo?.name ?? "BIMBO-R2-REPOSITORY").replace("BIMBO-", "").replace("-REPOSITORY", "")}-${pipelineInstanceFrom(actionInstance)}-OIC-DEPLOYMENT_PIPELINE`;
  const targetEnvironment = isProdPipelineStep ? prodTargetEnvironment : testTargetEnvironment;
  const pipelineNameValue = isProdPipelineStep ? prodPipelineName : testPipelineName;
  const pipelineRunValue = isProdPipelineStep ? prodPipelineRun : testPipelineRun;
  const pipelineRunUrlValue = isProdPipelineStep ? prodPipelineRunUrl : testPipelineRunUrl;
  const pipelineDisplayName = pipelineNameValue.trim() || defaultPipelineName;
  const pipelineDisplayUrl =
    pipelineRunUrlValue.trim() ||
    (pipelineRunValue.trim()
      ? `${projectUrl}/cibuild/pipelines/${pipelineDisplayName}/runs/${pipelineRunValue.trim()}`
      : "");
  const caseEnvironment = isProdPipelineStep
    ? prodTargetEnvironment
    : activeStep === "actionPlan"
      ? actionInstance
      : testTargetEnvironment;
  const artifactCount = files.length || artifactText.split(/\r?\n/).filter((line) => line.trim()).length;
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
  const currentRfc = rfc.trim();
  const matchesCurrentRfc = (recordRfc?: string, text = "") => {
    if (!currentRfc) return !recordRfc;
    if (recordRfc) return recordRfc === currentRfc;
    return text.includes(currentRfc);
  };
  const currentStepEvidence = evidenceItems.filter(
    (item) =>
      item.step === activeStep &&
      matchesCurrentRfc(item.rfc) &&
      item.pipelineStep === pipelineStepIndex &&
      (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
  );
  const currentStepComment = pipelineStepComments[pipelineStepKey]?.trim() ?? "";
  const currentStepComplete = Boolean(currentStepComment || currentStepEvidence.length);
  const inspectionByPath = useMemo(
    () => new Map(artifactInspections.map((inspection) => [inspection.filePath, inspection])),
    [artifactInspections]
  );
  const activeStepLog = evidenceLog.filter(
    (entry) => entry.step === activeStep && matchesCurrentRfc(entry.rfc, entry.text)
  );

  function fileBadge(kind: SelectedFile["kind"]) {
    if (kind === "integration") return ".iar";
    if (kind === "package") return ".par";
    if (kind === "lookup") return "lookup";
    if (kind === "xml") return ".xml";
    return t.badgeOther;
  }

  function isInspectableArtifact(file: SelectedFile) {
    return file.kind === "integration" || file.kind === "package";
  }

  function componentBadge(kind: ArtifactInspection["components"][number]["kind"]) {
    if (kind === "connection") return "Conexion";
    if (kind === "schedule") return "Scheduler";
    return "DVM";
  }

  function stepTitle(step: StepId) {
    return t.steps[step]?.[0] ?? t.pipeline.title;
  }

  function addLog(text: string, step = activeStep) {
    setEvidenceLog((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      step: activeStep,
      rfc: rfc.trim() || undefined,
      pipelineStep: isPipelineTrackingStep ? pipelineStepIndex : undefined,
      pipelinePhase: isPipelineTrackingStep ? trackingEnvironment : undefined,
      createdAt: new Date().toISOString(),
      note,
      source
    };
    setEvidenceItems((current) => [item, ...current]);
    addLog(`Evidencia agregada: ${image.name}`, activeStep);
    setMessage(t.evidence.copied);
  }

  function updateEvidenceNote(id: string, note: string) {
    setEvidenceItems((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
  }

  function removeEvidence(id: string) {
    setEvidenceItems((current) => current.filter((item) => item.id !== id));
    addLog("Evidencia eliminada");
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function captureAppEvidence() {
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    const image = await runTask(() => desktopApi.captureAppWindow());
    addEvidence(image, "capture", stepTitle(activeStep));
  }

  async function captureRegionEvidence() {
    if (!desktopApi) {
      setMessage(t.messages.webMode);
      return;
    }
    const image = await runTask(() => desktopApi.captureScreenRegion());
    addEvidence(image, "region", String(currentPipelineStep?.title ?? stepTitle(activeStep)));
  }

  async function addEvidenceImages() {
    if (!desktopApi) {
      setMessage(t.messages.filesElectron);
      return;
    }
    const images = await runTask(() => desktopApi.selectEvidenceImages());
    for (const image of images ?? []) addEvidence(image, "file");
  }

  async function pasteEvidenceImage() {
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

  function updatePipelineStepComment(value: string) {
    setPipelineStepComments((current) => ({ ...current, [pipelineStepKey]: value }));
  }

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
      : executionActionPlan.trim()
        ? parseActionPlanExecutionSteps(executionActionPlan, documentCopy.pipeline.steps)
        : documentCopy.pipeline.steps.map((title) => ({ title, detail: "" }));
    return {
      rfc,
      phase: trackingEnvironment,
      documentLanguage: documentLang,
      outputDirectory: outputFolder.trim() || undefined,
      environment: targetEnvironment,
      pipeline: executionMode === "cicd" ? pipelineDisplayName : "",
      run: executionMode === "cicd" ? pipelineRunValue.trim() : "",
      runUrl: executionMode === "cicd" ? pipelineDisplayUrl : "",
      message: executionMode === "cicd" ? documentPipelineRfcMessage : "",
      steps: documentSteps.map((step, index) => ({
        index: index + 1,
        title: step.title,
        comment: [step.detail, pipelineStepComments[`${activeStep}-${trackingEnvironment}-${index}`]]
          .filter((value) => value?.trim())
          .join("\n\n"),
        images: evidenceItems
          .filter(
            (item) =>
              item.step === activeStep &&
              matchesCurrentRfc(item.rfc) &&
              item.pipelineStep === index &&
              (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
          )
          .map((item) => ({ name: item.name, dataUrl: item.dataUrl, createdAt: item.createdAt }))
      })),
      logs: evidenceLog
        .filter(
          (entry) =>
            matchesCurrentRfc(entry.rfc, entry.text) &&
            (entry.step === activeStep || (executionMode === "cicd" && Boolean(currentRfc)))
        )
        .map((entry) => ({
          at: entry.at,
          step: stepTitle(entry.step),
          text: entry.text
        }))
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
        customSidebar,
        customAccent,
        themeTransparency,
        themeBlur,
        executionHistory,
        rfc,
        repoPath,
        actionProduct,
        actionMethod,
        actionEnvironment,
        actionInstance,
        actionActivity,
        artifactText,
        actionSourceDocument,
        manualInstructions,
        riceFolderPath,
        testTargetEnvironment,
        prodTargetEnvironment,
        testPipelineName,
        prodPipelineName,
        executionMode,
        pipelineExecutionPhase,
        pipelineActionPlan,
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
    setTestTargetEnvironment("");
    setProdTargetEnvironment("");
    setTestPipelineName("");
    setProdPipelineName("");
    setTestPipelineRun("");
    setProdPipelineRun("");
    setTestPipelineRunUrl("");
    setProdPipelineRunUrl("");
    setExecutionMode("general");
    setPipelineExecutionPhase("TEST");
    setPipelineActionPlan("");
    setEvidenceItems([]);
    setEvidenceLog([]);
    setExecutionHistory([]);
    setThemeId("oracle");
    setCustomColorA(defaultCustomTheme.colorA);
    setCustomColorB(defaultCustomTheme.colorB);
    setCustomColorC(defaultCustomTheme.colorC);
    setCustomSidebar(defaultCustomTheme.sidebar);
    setCustomAccent(defaultCustomTheme.accent);
    setThemeTransparency(defaultCustomTheme.transparency);
    setThemeBlur(defaultCustomTheme.blur);
    setCustomGradient(defaultCustomTheme.gradient);
    setPipelineStepIndex(0);
    setPipelineStepComments({});
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
      setMessage(t.pipeline.planPlaceholder);
      return false;
    }
    const missingStepIndex = currentPipelineSteps.findIndex((_, index) => {
      const comment = pipelineStepComments[`${activeStep}-${trackingEnvironment}-${index}`]?.trim();
      const images = evidenceItems.filter(
        (item) =>
          item.step === activeStep &&
          item.pipelineStep === index &&
          (item.pipelinePhase === trackingEnvironment || (!item.pipelinePhase && trackingEnvironment === "TEST"))
      );
      return !comment && images.length === 0;
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
      setMessage(t.messages.exportOk);
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
    const result = await desktopApi.selectFiles(["iar", "par", "csv", "xml"]);
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

  async function selectActionDocument() {
    if (!actionEnvironment.trim()) {
      setMessage("Selecciona el ambiente antes de cargar o revisar el IM090.");
      return;
    }
    if (!desktopApi?.selectActionDocument) {
      actionDocumentInputRef.current?.click();
      return;
    }
    const document = await runTask(() => desktopApi.selectActionDocument());
    if (!document) return;
    prepareManualDocumentReview(document);
  }

  async function handleActionDocumentInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const document = await buildBrowserActionDocument(file);
      prepareManualDocumentReview(document);
    } catch (error) {
      setMessage((error as Error).message || "No pude leer el documento seleccionado.");
    }
  }

  function prepareManualDocumentReview(document: ActionSourceDocument) {
    const text = document.text.trim();
    setActionSourceDocument(document);
    setManualInstructions(text);
    if (text) {
      setManualPhases(buildManualPhasesFromDocument(text, actionEnvironment));
      setManualPhaseIndex(0);
      const detectedArtifacts = extractArtifactNames(text);
      if (detectedArtifacts.length && !artifactText.trim()) setArtifactText(detectedArtifacts.join("\n"));
      setManualReviewOpen(true);
      if (selectedEnvironmentMissingFromDocument(text, actionEnvironment)) {
        setMessage(`El ambiente ${actionEnvironment} no se encontro en el IM090. Se conserva el bloque completo de ambientes para revision.`);
      }
    } else {
      setManualPhases([]);
    }
    if (document.warning) setMessage(document.warning);
    addLog(`Documento cargado para Action Plan: ${document.name}`, "actionPlan");
  }

  function updateManualPhaseContent(content: string) {
    setManualPhases((current) => current.map((phase, index) => index === manualPhaseIndex ? { ...phase, content } : phase));
  }

  function reviewManualPhases() {
    if (!manualInstructions.trim()) {
      setManualReviewOpen(true);
      return;
    }
    if (!actionEnvironment.trim()) {
      setMessage("Selecciona el ambiente antes de revisar las fases del IM090.");
      return;
    }
    const phases = buildManualPhasesFromDocument(manualInstructions, actionEnvironment);
    setManualPhases(phases);
    setManualPhaseIndex(0);
    setManualReviewOpen(true);
    if (selectedEnvironmentMissingFromDocument(manualInstructions, actionEnvironment)) {
      setMessage(`El ambiente ${actionEnvironment} no se encontro en el IM090. Se conserva el bloque completo de ambientes para revision.`);
    }
  }

  function buildManualActionPlan(phases: ManualActionPhase[]) {
    const artifacts = artifactText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const artifactLines = artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : "- Confirm artifacts listed in the IM090.";
    const productName = actionProduct.trim() || "Oracle Integration Cloud";
    const environmentName = actionEnvironment.trim() || "<Environment>";
    const instanceName = actionInstance.trim() || "<Instance>";
    const activityName = actionActivity.trim() || "Manual installation";
    const sourceDocumentName = actionSourceDocument?.name ?? "<IM090 / instructions document>";
    const phaseBlocks = phases.map((phase, index) => {
      const letter = String.fromCharCode(65 + index);
      return `${letter}) ${phase.title}\n\n${phase.content.trim() || "<Add execution details>"}`;
    }).join("\n\n");

    return `======================= Action Plan =============================\n\nActivity: ${activityName} (${environmentName} - ${instanceName})\nProduct: ${productName}\nSource document: ${sourceDocumentName}\nArtifact(s) / component(s):\n${artifactLines}\n\n${phaseBlocks}\n\n===============================================================`;
  }

  function acceptManualReview() {
    const reviewedPhases = manualPhases.length
      ? manualPhases
      : buildManualPhasesFromDocument(manualInstructions, actionEnvironment);
    setManualPhases(reviewedPhases);
    setManualInstructions(reviewedPhases.map((phase) => `${phase.title}\n${phase.content}`).join("\n\n"));
    setActionPlan(buildManualActionPlan(reviewedPhases));
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

  function removeFile(path: string) {
    setFiles((current) => current.filter((file) => file.path !== path));
    setArtifactInspections((current) => current.filter((inspection) => inspection.filePath !== path));
    setExpandedFiles((current) => current.filter((item) => item !== path));
    addLog(`Artefacto eliminado: ${path.split("/").pop() ?? path}`);
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
    setActionMethod("cicd");
    setActionEnvironment("");
    setActionInstance("");
    setActionActivity("");
    setArtifactText("");
    setActionSourceDocument(null);
    setManualInstructions("");
    setManualPhases([]);
    setManualPhaseIndex(0);
    setManualReviewOpen(false);
    setActionPlan("");
    setPipelineActionPlan("");
    setMessage(a.clear);
    setLocalCommitResult(null);
  }

  function resetExecutionFields() {
    setRfc("");
    setPipelineExecutionPhase("TEST");
    setTestTargetEnvironment("");
    setProdTargetEnvironment("");
    setTestPipelineName("");
    setProdPipelineName("");
    setTestPipelineRun("");
    setProdPipelineRun("");
    setTestPipelineRunUrl("");
    setProdPipelineRunUrl("");
    setExecutionMode("general");
    setPipelineActionPlan("");
    setPipelineStepIndex(0);
    setPipelineStepComments({});
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
    const artifacts = artifactText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
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
    const manualInstructionText = manualInstructions.trim() || "<Installation instructions>";

    if (actionMethod === "manual") {
      if (manualPhases.length) {
        setActionPlan(buildManualActionPlan(manualPhases));
        addLog("Action Plan manual generado", "actionPlan");
        return;
      }
      const sourceDocumentName = actionSourceDocument?.name ?? "<IM090 / instructions document>";
      const manualPlan = `==========================================================\n\nActivity: ${activityName} (${environmentName} - ${instanceName})\nMethod: Manual\nProduct: ${productName}\nSource document: ${sourceDocumentName}\nArtifact(s) / component(s):\n${artifactLines}\n\n1- Review installation instructions:\n1.1- Open the source document and validate the scope for RFC ${branchName}.\n1.2- Confirm the target environment and instance:\n- Environment: ${environmentName}\n- Instance: ${instanceName}\n1.3- Confirm the artifact(s) or component(s) listed for this change:\n${artifactLines}\n\n2- Execute manual installation:\n${manualInstructionText}\n\n3- Post-deployment validation (${environmentName} - ${instanceName}):\n3.1- Validate the deployed artifact/component(s):\n${componentLines}\n3.2- Confirm the latest values/configuration are reflected.\n\n4- Share the evidence.\n\n==========================================================`;

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

  async function copyActiveStepLog() {
    if (!activeStepLog.length) return;
    const text = activeStepLog
      .slice()
      .reverse()
      .map((entry) => `[${new Date(entry.at).toLocaleString()}] ${stepTitle(entry.step)}: ${entry.text}`)
      .join("\n");
    await navigator.clipboard?.writeText(text);
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
    setPipelineStepIndex(0);
    setMessage(t.pipeline.stepsLoaded);
    event.target.value = "";
  }

  function useGeneratedActionPlanForExecution() {
    if (!actionPlan.trim()) return;
    setPipelineActionPlan(actionPlan);
    setPipelineStepIndex(0);
    setMessage(t.pipeline.stepsLoaded);
  }

  function refreshExecutionSteps() {
    setPipelineStepIndex(0);
    setMessage(t.pipeline.stepsLoaded);
  }

  useEffect(() => {
    if (desktopApi) checkPrerequisites(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (pipelineStepIndex >= currentPipelineSteps.length) {
      setPipelineStepIndex(Math.max(0, currentPipelineSteps.length - 1));
    }
  }, [currentPipelineSteps.length, pipelineStepIndex]);

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
    localStorage.setItem("executionHistory", JSON.stringify(executionHistory.slice(0, 50)));
  }, [executionHistory]);

  useEffect(() => {
    localStorage.setItem("themeId", themeId);
  }, [themeId]);

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
    localStorage.setItem("customSidebar", customSidebar);
  }, [customSidebar]);

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
    if (actionEnvironment === "TEST") {
      setTestTargetEnvironment(actionInstance);
    }
  }, [actionEnvironment, actionInstance]);

  return (
    <div className={`app-shell theme-${themeId}`} style={customThemeStyle}>
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

        {rfc.trim() && activeStep === "review" && (
          <section className="case-strip" aria-label={t.caseFile.title}>
            <div className="case-title">
              <span>{t.caseFile.title}</span>
              <strong>{rfc.trim()}</strong>
            </div>
            <div>
              <span>{t.caseFile.repo}</span>
              <strong>{selectedRepo?.name ?? t.caseFile.pending}</strong>
            </div>
            <div>
              <span>{t.caseFile.environment}</span>
              <strong>{caseEnvironment || t.caseFile.pending}</strong>
            </div>
            <div>
              <span>{t.caseFile.artifacts}</span>
              <strong>{artifactCount || t.caseFile.pending}</strong>
            </div>
          </section>
        )}

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

        {activeStep === "actionPlan" && (
          <section className="panel action-plan-panel">
            <div className="panel-heading">
              <div>
                <h2>{a.title}</h2>
                <p>{a.body}</p>
              </div>
              <button className="secondary" onClick={resetActionPlanFields} title={a.clear}>
                <Trash2 size={16} />
                {a.clear}
              </button>
            </div>

            <div className="action-plan-grid">
              <label>
                {a.method}
                <select value={actionMethod} onChange={(event) => setActionMethod(event.target.value as "cicd" | "manual")}>
                  <option value="cicd">{a.methodCicd}</option>
                  <option value="manual">{a.methodManual}</option>
                </select>
              </label>
              <label>
                RFC
                <input placeholder="4-B002S34" value={rfc} onChange={(event) => setRfc(event.target.value)} />
              </label>
              <label>
                {a.product}
                <select value={actionProduct} onChange={(event) => setActionProduct(event.target.value)}>
                  <option value="" disabled>
                    {a.selectProduct}
                  </option>
                  <option value="OIC">OIC</option>
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
              <label>
                {a.environment}
                <select value={actionEnvironment} onChange={(event) => setActionEnvironment(event.target.value)}>
                  <option value="" disabled>
                    {a.selectEnvironment}
                  </option>
                  <option value="DEVELOPMENT">DEVELOPMENT</option>
                  <option value="TEST">TEST</option>
                  <option value="REGRESSION">REGRESSION</option>
                  <option value="PRE-PROD">PRE-PROD</option>
                  <option value="PROD">PROD</option>
                  <option value="DEV">DEV</option>
                </select>
              </label>
              <label>
                {a.instance}
                <input value={actionInstance} onChange={(event) => setActionInstance(event.target.value)} />
              </label>
              {actionMethod === "manual" && (
                <label className="action-document-field">
                  {a.sourceDocument}
                  <div className="action-document-picker">
                    <button type="button" className="secondary" onClick={selectActionDocument} title={a.loadDocument}>
                      <UploadCloud size={16} />
                      {a.loadDocument}
                    </button>
                    <span>{actionSourceDocument?.name ?? a.noDocument}</span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!manualPhases.length}
                      onClick={reviewManualPhases}
                      title={a.reviewManual}
                    >
                      {a.reviewManual}
                    </button>
                  </div>
                </label>
              )}
              <label className="action-activity-field">
                {a.activity}
                <input
                  placeholder="Deploy Lookup / Install Integration"
                  value={actionActivity}
                  onChange={(event) => setActionActivity(event.target.value)}
                />
              </label>
              <div className="action-plan-generate-field">
                <button className="action-plan-generate" onClick={generateActionPlan} title={a.generate}>
                  <FileText size={16} />
                  {a.generate}
                </button>
              </div>
            </div>

            {actionMethod === "manual" && (
              <label className="artifact-input">
                {a.manualInstructions}
                <textarea
                  value={manualInstructions}
                  onChange={(event) => setManualInstructions(event.target.value)}
                  placeholder={a.manualInstructionsHint}
                />
              </label>
            )}
            {actionMethod === "manual" && (
              <input
                ref={actionDocumentInputRef}
                className="hidden-file-input"
                type="file"
                accept=".docx,.pdf"
                onChange={handleActionDocumentInput}
              />
            )}

            <label className="artifact-input">
              {a.artifacts}
              <textarea
                value={artifactText}
                onChange={(event) => setArtifactText(event.target.value)}
                placeholder={a.artifactsHint}
              />
            </label>

            <div className="action-plan-output">
              <div className="output-head">
                <strong>{a.preview}</strong>
                <div>
                  <button className="secondary" disabled={!actionPlan} onClick={copyActionPlan} title={a.copy}>
                    <Copy size={16} />
                    {a.copy}
                  </button>
                  <button disabled={!actionPlan} onClick={() => setActiveStep("package")} title={a.continue}>
                    <Plus size={16} />
                    {a.continue}
                  </button>
                </div>
              </div>
              <textarea
                className="action-plan-text"
                value={actionPlan}
                onChange={(event) => setActionPlan(event.target.value)}
                placeholder="=========================================================="
              />
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
                const isExpanded = expandedFiles.includes(file.path);
                return (
                  <div className="file-card" key={file.path}>
                    <div className="file-row">
                      <span className="badge">{fileBadge(file.kind)}</span>
                      <div>
                        <strong>{file.name}</strong>
                        <small>{file.path}</small>
                      </div>
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

                        {!inspection ? (
                          <div className="empty-inline">Inspeccionando o pendiente de leer este {fileBadge(file.kind)}.</div>
                        ) : inspection.kind === "error" ? (
                          <p>{inspection.error}</p>
                        ) : inspection.projects.length > 0 ? (
                          <>
                            <div className="project-list">
                              <div className="project-row project-header">
                                <span>Codigo</span>
                                <span>Integracion</span>
                                <span>Version / estado</span>
                              </div>
                              {inspection.projects.map((project, index) => (
                                <div className="project-row" key={`${inspection.filePath}-${index}`}>
                                  <span data-label="Codigo">{project.code ?? "N/A"}</span>
                                  <strong data-label="Integracion">{project.name ?? "Unnamed"}</strong>
                                  <small data-label="Version / estado">v{project.version ?? "N/A"} · {project.type ?? "N/A"} · {project.state ?? "N/A"}</small>
                                </div>
                              ))}
                            </div>
                            {inspection.components.length > 0 && (
                              <div className="component-list">
                                <strong>Componentes incluidos</strong>
                                {inspection.components.map((component) => (
                                  <div className="component-row" key={`${inspection.filePath}-${component.path}`}>
                                    <span>{componentBadge(component.kind)}</span>
                                    <div>
                                      <strong>{component.name}</strong>
                                      <small>{component.path}</small>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : inspection.entries.length > 0 ? (
                          <div className="package-entry-list">
                            {inspection.entries.slice(0, 40).map((entry) => (
                              <span key={`${inspection.filePath}-${entry}`}>{entry}</span>
                            ))}
                            {inspection.entries.length > 40 && <small>+{inspection.entries.length - 40} elementos adicionales</small>}
                          </div>
                        ) : (
                          <p>No se detecto contenido legible dentro del {fileBadge(file.kind)}.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="actions">
              <button className="secondary" disabled={!files.length} onClick={clearPackage}>
                <Trash2 size={16} />
                {t.pkg.clearPackage}
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
                <button className="secondary" onClick={resetExecutionFields} title={t.pipeline.clearExecution}>
                  <Trash2 size={16} />
                  {t.pipeline.clearExecution}
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
                      setPipelineStepIndex(0);
                      setPipelineStepComments({});
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
                  <option value="TEST">TEST</option>
                  <option value="PROD">PROD</option>
                </select>
              </label>
              <label>
                {t.pipeline.environment}
                <input
                  value={targetEnvironment}
                  onChange={(event) =>
                    isProdPipelineStep
                      ? setProdTargetEnvironment(event.target.value)
                      : setTestTargetEnvironment(event.target.value)
                  }
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
                  setPipelineActionPlan(event.target.value);
                  setPipelineStepIndex(0);
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

            {hasExecutionActionPlan && (
              <>
            <div className="pipeline-layout guided-card">
              <div className="guided-rail" aria-label={t.pipeline.checklist}>
                {currentPipelineSteps.map((step, index) => (
                  <button
                    key={`${step.title}-${index}`}
                    className={`rail-step ${pipelineStepIndex === index ? "active" : ""}`}
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
                    <button className="icon-action" onClick={captureRegionEvidence} title={t.evidence.captureRegion}>
                      <Camera size={18} />
                    </button>
                    <button className="icon-action" onClick={addEvidenceImages} title={t.evidence.addImage}>
                      <ImagePlus size={18} />
                    </button>
                    <button className="icon-action" onClick={pasteEvidenceImage} title={t.evidence.paste}>
                      <ClipboardPaste size={18} />
                    </button>
                    {pipelineStepIndex === 0 && (
                      <button className="icon-action" onClick={() => desktopApi?.openExternal(projectUrl)} title={t.review.openVbs}>
                        <ExternalLink size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="guided-body">
                  <div className="guided-comment">
                    <label className="step-comment-label">{t.pipeline.comment}</label>
                    <textarea
                      value={pipelineStepComments[pipelineStepKey] ?? ""}
                      onChange={(event) => updatePipelineStepComment(event.target.value)}
                      placeholder={t.pipeline.comment}
                    />
                  </div>
                  <div className="guided-preview">
                    <strong>{t.pipeline.currentEvidence}</strong>
                    {currentStepEvidence.length ? (
                      currentStepEvidence.slice(0, 1).map((item) => (
                        <article className="step-evidence-card preview-card" key={item.id}>
                          <button className="image-preview-button" onClick={() => setImagePreview(item)}>
                            <img src={item.dataUrl} alt={item.name} />
                          </button>
                          <div>
                            <strong>{item.name}</strong>
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                            {item.note && <span>{item.note}</span>}
                          </div>
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

                {isFinalPipelineStep && (
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

                <div className="pipeline-nav-actions">
                  <button className="secondary" disabled={pipelineStepIndex === 0} onClick={() => movePipelineStep(-1)}>
                    {t.pipeline.previous}
                  </button>
                  <button disabled={isFinalPipelineStep} onClick={() => movePipelineStep(1)}>
                    {t.pipeline.next}
                  </button>
                </div>
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
                {manualPhases.map((phase, index) => (
                  <button
                    key={phase.id}
                    className={manualPhaseIndex === index ? "active" : ""}
                    onClick={() => setManualPhaseIndex(index)}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {phase.title}
                  </button>
                ))}
              </nav>
              <label className="manual-phase-editor">
                {manualPhases[manualPhaseIndex]?.title}
                <textarea
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

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="workspace-modal settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{t.settings}</h2>
                <p>
                  {settingsTab === "history" && outputFolder
                    ? `${t.outputFolder}: ${outputFolder}`
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
                      <button className="secondary" onClick={chooseOutputFolder}>
                        <Folder size={16} />
                        {outputFolder || t.chooseFolder}
                      </button>
                    </div>
                    <div className="history-list">
                      {executionHistory.length === 0 && <div className="empty-inline">{t.noHistory}</div>}
                      {executionHistory.map((item) => (
                        <article className="history-row" key={item.id}>
                          <div>
                            <strong>{item.rfc} · {item.phase} · {item.kind.toUpperCase()}</strong>
                            <span>{new Date(item.exportedAt).toLocaleString()}</span>
                            <small>{item.path}</small>
                          </div>
                          <button className="secondary" onClick={() => openLocalPath(item.path)}>
                            <ExternalLink size={16} />
                            {t.openFile}
                          </button>
                        </article>
                      ))}
                    </div>
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
                            onClick={() => setThemeId(theme)}
                          >
                            <span />
                            <strong>{themeNames[lang][theme]}</strong>
                          </button>
                        ))}
                      </div>
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
                              activateCustomTheme();
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
                              activateCustomTheme();
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
                              activateCustomTheme();
                              setCustomColorC(next);
                              setCustomGradient(`linear-gradient(135deg, ${customColorA} 0%, ${customColorB} 52%, ${next} 100%)`);
                            }}
                          />
                        </label>
                        <label>
                          {t.sidebarColor}
                          <input
                            type="color"
                            value={customSidebar}
                            onChange={(event) => {
                              activateCustomTheme();
                              setCustomSidebar(event.target.value);
                            }}
                          />
                        </label>
                        <label>
                          {t.accentColor}
                          <input
                            type="color"
                            value={customAccent}
                            onChange={(event) => {
                              activateCustomTheme();
                              setCustomAccent(event.target.value);
                            }}
                          />
                        </label>
                      </div>
                      <label>
                        {t.transparency}
                        <input
                          type="range"
                          min="0.62"
                          max="1"
                          step="0.02"
                          value={themeTransparency}
                          onChange={(event) => {
                            activateCustomTheme();
                            setThemeTransparency(Number(event.target.value));
                          }}
                        />
                      </label>
                      <label>
                        {t.blur}
                        <input
                          type="range"
                          min="0"
                          max="28"
                          step="1"
                          value={themeBlur}
                          onChange={(event) => {
                            activateCustomTheme();
                            setThemeBlur(Number(event.target.value));
                          }}
                        />
                      </label>
                    </section>
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
              <button className="icon-button" onClick={() => setImagePreview(null)}>
                <X size={18} />
              </button>
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
