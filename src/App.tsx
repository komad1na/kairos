import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CheckCircleFilled, WarningFilled } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import "./App.css";
import { Toolbar } from "./components/Toolbar";
import { MediaLibrary } from "./components/MediaLibrary";
import { Preview } from "./components/Preview";
import { TransportControls } from "./components/TransportControls";
import { Timeline } from "./components/Timeline";
import { TransformDrawer } from "./components/TransformDrawer";
import { ExportModal, ExportResult } from "./components/ExportModal";
import { PreferencesModal } from "./components/PreferencesModal";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";
import { ExportOptions } from "./exportSettings";
import { clampPercent, ExportProgressPayload } from "./exportProgress";
import {
  DEFAULT_DRAWER_WIDTH,
  DEFAULT_LIBRARY_WIDTH,
  clampDrawerWidth,
  clampLibraryWidth,
} from "./appLayout";
import { usePreviewCache } from "./hooks/usePreviewCache";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { logDebug, logError, logInfo } from "./logger";
import { usePlaybackEngine } from "./playback/usePlaybackEngine";
import { buildExportProject, projectContentSignature, serializeProject } from "./projectDocument";
import { Action, createInitialState, normalizeState } from "./timelineReducer";
import { createInitialHistory, historyReducer } from "./history";
import { summarizeAction } from "./timelineActionLog";
import { timelineDuration } from "./timeline";
import { ProjectSettings, TimelineState } from "./types";
import {
  exportTimeline,
  loadProject,
  pickExportPath,
  pickOpenProjectPath,
  pickSaveProjectPath,
  requestAppExit,
  requestWindowMinimize,
  requestWindowToggleMaximize,
  saveProject,
} from "./api";

function App() {
  const { t } = useTranslation();
  const [history, dispatch] = useReducer(historyReducer, undefined, createInitialHistory);
  const state = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const appDispatch = useCallback((action: Action) => {
    logDebug("timeline_action", summarizeAction(action));
    dispatch(action);
  }, []);
  const undo = useCallback(() => {
    logInfo("timeline:undo");
    dispatch({ type: "undo" });
  }, []);
  const redo = useCallback(() => {
    logInfo("timeline:redo");
    dispatch({ type: "redo" });
  }, []);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [hasProject, setHasProject] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [savedProjectSignature, setSavedProjectSignature] = useState<string | null>(null);
  const [transformOpen, setTransformOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportEtaSec, setExportEtaSec] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [libraryWidth, startLibraryResize] = useResizableWidth({
    storageKey: "mediaLibraryWidth",
    defaultWidth: DEFAULT_LIBRARY_WIDTH,
    clamp: clampLibraryWidth,
    bodyClass: "resizing-library",
    logEvent: "ui:media_library:resize",
    direction: "right",
  });
  const [drawerWidth, startDrawerResize] = useResizableWidth({
    storageKey: "transformDrawerWidth",
    defaultWidth: DEFAULT_DRAWER_WIDTH,
    clamp: clampDrawerWidth,
    bodyClass: "resizing-drawer",
    logEvent: "ui:transform_drawer:resize",
    direction: "left",
  });
  const [showCanvasGuide, setShowCanvasGuide] = useState(
    () => localStorage.getItem("showCanvasGuide") !== "false",
  );
  const exportStartedAt = useRef<number | null>(null);
  const allowWindowClose = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const playheadRef = useRef(0);

  const setLoggedStatus = useCallback((message: string) => {
    logInfo("status:update", { message });
    setStatus(message);
  }, []);

  const { regenerateThumbnails, clearPreviewPaths } = usePreviewCache(
    state,
    appDispatch,
    setLoggedStatus,
  );

  const { playhead, playing, attach, stop, toggle, seek } = usePlaybackEngine(
    state,
    setLoggedStatus,
  );
  playheadRef.current = playhead;

  const total = timelineDuration(state.clips);
  const hasClips = state.clips.length > 0;
  const selectedClip = state.clips.find((clip) => clip.id === state.selectedClipId) ?? null;
  const projectSignature = useMemo(() => projectContentSignature(state), [state]);
  const hasUnsavedChanges = hasProject && savedProjectSignature !== projectSignature;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const requestNativeExit = useCallback(async () => {
    try {
      allowWindowClose.current = true;
      await requestAppExit();
    } catch (e) {
      allowWindowClose.current = false;
      setLoggedStatus(t("status.closeError", { error: String(e) }));
      logError("ui:close:error", e);
    }
  }, [setLoggedStatus, t]);

  useEffect(() => {
    logInfo("app:mounted");
    function onError(event: ErrorEvent) {
      logError("frontend:error", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error instanceof Error ? event.error.stack ?? event.error.message : event.error,
      });
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      logError("frontend:unhandled_rejection", {
        reason:
          event.reason instanceof Error
            ? event.reason.stack ?? event.reason.message
            : event.reason,
      });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      logInfo("app:unmounted");
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen<ExportProgressPayload>("export-progress", (event) => {
      const percent = clampPercent(event.payload.percent);
      setExportProgress(percent);
      if (exportStartedAt.current && percent > 0.5 && percent < 100) {
        const elapsed = (Date.now() - exportStartedAt.current) / 1000;
        setExportEtaSec(Math.max(0, elapsed * (100 - percent) / percent));
      } else if (percent >= 100) {
        setExportEtaSec(0);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    void appWindow.onCloseRequested((event) => {
      event.preventDefault();
      if (allowWindowClose.current || !hasUnsavedChangesRef.current) {
        void requestNativeExit();
        return;
      }
      logInfo("ui:close:unsaved_prompt");
      setClosePromptOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [requestNativeExit]);

  const handleNew = useCallback(() => {
    logInfo("ui:new_project:open_settings");
    setCreatingProject(true);
    setSettingsOpen(true);
  }, []);

  const persistProject = useCallback(
    async (path: string, nextState: TimelineState) => {
      logInfo("project:save:start", {
        path,
        assets: nextState.assets.length,
        clips: nextState.clips.length,
        tracks: nextState.tracks.length,
      });
      await saveProject(path, serializeProject(nextState));
      setProjectPath(path);
      setSavedProjectSignature(projectContentSignature(nextState));
      setLoggedStatus(t("status.saved", { path }));
      logInfo("project:save:ok", { path });
    },
    [setLoggedStatus, t],
  );

  const saveCurrentProject = useCallback(async (): Promise<boolean> => {
    if (!hasProject) return true;
    try {
      logInfo("ui:save_project");
      const path = projectPath ?? (await pickSaveProjectPath());
      if (!path) {
        logInfo("project:save:cancelled");
        return false;
      }
      await persistProject(path, state);
      return true;
    } catch (e) {
      setLoggedStatus(t("status.saveError", { error: String(e) }));
      logError("project:save:error", e);
      return false;
    }
  }, [hasProject, persistProject, projectPath, setLoggedStatus, state, t]);

  const handleSave = useCallback(() => {
    void saveCurrentProject();
  }, [saveCurrentProject]);

  const closeApp = useCallback(async () => {
    await requestNativeExit();
  }, [requestNativeExit]);

  const handleClosePromptCancel = useCallback(() => {
    logInfo("ui:close:cancel");
    setClosePromptOpen(false);
  }, []);

  const handleExitWithoutSaving = useCallback(() => {
    logInfo("ui:close:discard_changes");
    setClosePromptOpen(false);
    void closeApp();
  }, [closeApp]);

  const handleSaveAndExit = useCallback(async () => {
    setCloseSaving(true);
    try {
      const saved = await saveCurrentProject();
      if (!saved) return;
      setClosePromptOpen(false);
      await closeApp();
    } finally {
      setCloseSaving(false);
    }
  }, [closeApp, saveCurrentProject]);

  const handleWindowCloseRequest = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      logInfo("ui:close:unsaved_prompt");
      setClosePromptOpen(true);
      return;
    }
    void closeApp();
  }, [closeApp]);

  const handleWindowMinimize = useCallback(() => {
    logInfo("ui:window:minimize");
    void requestWindowMinimize().catch((e) => {
      setLoggedStatus(t("status.windowError", { error: String(e) }));
      logError("ui:window:minimize:error", e);
    });
  }, [setLoggedStatus, t]);

  const handleWindowToggleMaximize = useCallback(() => {
    logInfo("ui:window:toggle_maximize");
    void requestWindowToggleMaximize().catch((e) => {
      setLoggedStatus(t("status.windowError", { error: String(e) }));
      logError("ui:window:toggle_maximize:error", e);
    });
  }, [setLoggedStatus, t]);

  const handleProjectSettingsSave = useCallback(
    async (settings: ProjectSettings) => {
      logInfo("project_settings:save", { mode: creatingProject ? "create" : "edit", settings });
      if (creatingProject) {
        const next = createInitialState();
        next.settings = settings;
        appDispatch({ type: "loadState", state: next });
        setHasProject(true);
        setCreatingProject(false);
        setProjectPath(null);
        setSavedProjectSignature(null);
        setSettingsOpen(false);
        setLoggedStatus(t("status.newProject"));
        return;
      }

      const next = { ...state, settings };
      appDispatch({ type: "setProjectSettings", settings });
      setSettingsOpen(false);

      if (!projectPath) {
        setLoggedStatus(t("status.projectSettingsSaved"));
        return;
      }

      try {
        await persistProject(projectPath, next);
      } catch (e) {
        setLoggedStatus(t("status.saveError", { error: String(e) }));
        logError("project_settings:persist:error", e);
      }
    },
    [appDispatch, creatingProject, persistProject, projectPath, setLoggedStatus, state, t],
  );

  const handleOpen = useCallback(async () => {
    try {
      logInfo("ui:open_project");
      const path = await pickOpenProjectPath();
      if (!path) {
        logInfo("project:open:cancelled");
        return;
      }
      logInfo("project:open:start", { path });
      const json = await loadProject(path);
      const doc = JSON.parse(json) as { version?: number; state?: TimelineState };
      if (!doc.state || !doc.state.tracks || !doc.state.settings) {
        throw new Error("Invalid project file");
      }
      const loaded = normalizeState({ ...doc.state, selectedClipId: null });
      appDispatch({ type: "loadState", state: loaded });
      setHasProject(true);
      setCreatingProject(false);
      setProjectPath(path);
      setSavedProjectSignature(projectContentSignature(loaded));
      setLoggedStatus(t("status.opened", { path }));
      logInfo("project:open:ok", {
        path,
        assets: loaded.assets.length,
        clips: loaded.clips.length,
        tracks: loaded.tracks.length,
      });
      void regenerateThumbnails(loaded);
    } catch (e) {
      setLoggedStatus(t("status.openError", { error: String(e) }));
      logError("project:open:error", e);
    }
  }, [appDispatch, regenerateThumbnails, setLoggedStatus, t]);

  const doExport = useCallback(
    async (opts: ExportOptions) => {
      if (!hasProject || state.clips.length === 0) return;
      try {
        logInfo("ui:export:pick_output");
        const out = await pickExportPath();
        if (!out) {
          logInfo("export:cancelled");
          return;
        }
        setExporting(true);
        setExportDone(false);
        setExportResult(null);
        exportStartedAt.current = Date.now();
        setExportProgress(0);
        setExportEtaSec(null);
        setLoggedStatus(t("status.exporting"));
        logInfo("export:start", { output: out, options: opts, clips: state.clips.length });
        await exportTimeline(buildExportProject(state, out, opts));
        setExportProgress(100);
        setExportEtaSec(0);
        setExportDone(true);
        setExportResult({
          type: "success",
          message: t("export.successTitle"),
          description: t("export.successMessage", { path: out }),
        });
        setLoggedStatus(t("status.exportDone", { path: out }));
        logInfo("export:ok", { output: out });
      } catch (e) {
        const error = String(e);
        setExportDone(false);
        setExportResult({
          type: "error",
          message: t("export.errorTitle"),
          description: error,
        });
        setExportProgress(null);
        setExportEtaSec(null);
        setLoggedStatus(t("status.exportError", { error }));
        logError("export:error", { error });
      } finally {
        exportStartedAt.current = null;
        setExporting(false);
      }
    },
    [hasProject, setLoggedStatus, state, t],
  );

  const handleExportOpen = useCallback(() => {
    logInfo("ui:export_modal:open");
    setExportDone(false);
    setExportResult(null);
    setExportProgress(null);
    setExportEtaSec(null);
    setExportOpen(true);
  }, []);

  const handleExportClose = useCallback(() => {
    if (exporting) return;
    logInfo("ui:export_modal:close");
    setExportOpen(false);
  }, [exporting]);

  const handleCanvasGuideChange = useCallback((visible: boolean) => {
    logInfo("ui:canvas_guide:toggle", { visible });
    setShowCanvasGuide(visible);
    localStorage.setItem("showCanvasGuide", String(visible));
  }, []);
  const handleToggleCanvasGuide = useCallback(() => {
    handleCanvasGuideChange(!showCanvasGuide);
  }, [handleCanvasGuideChange, showCanvasGuide]);
  const handleOpenEditPanel = useCallback(() => {
    logInfo("ui:transform_drawer:open_from_menu");
    setTransformOpen(true);
  }, []);
  const handleCloseEditPanel = useCallback(() => {
    logInfo("ui:transform_drawer:close_from_menu");
    setTransformOpen(false);
  }, []);
  const handleDeleteSelectedClip = useCallback(() => {
    if (!state.selectedClipId) return;
    appDispatch({ type: "deleteClip", id: state.selectedClipId });
  }, [appDispatch, state.selectedClipId]);
  const handleSplitClip = useCallback(() => {
    if (!state.selectedClipId) return;
    appDispatch({ type: "splitClip", id: state.selectedClipId, time: playheadRef.current });
  }, [appDispatch, state.selectedClipId]);
  const handleTimelineZoomIn = useCallback(() => {
    appDispatch({ type: "setPxPerSec", value: state.pxPerSec * 1.15 });
  }, [appDispatch, state.pxPerSec]);
  const handleTimelineZoomOut = useCallback(() => {
    appDispatch({ type: "setPxPerSec", value: state.pxPerSec / 1.15 });
  }, [appDispatch, state.pxPerSec]);

  const handleSettingsOpen = useCallback(() => {
    logInfo("ui:project_settings:open");
    setSettingsOpen(true);
  }, []);
  const handlePreferencesOpen = useCallback(() => {
    logInfo("ui:preferences:open");
    setPreferencesOpen(true);
  }, []);
  const handlePreferencesClose = useCallback(() => {
    logInfo("ui:preferences:close");
    setPreferencesOpen(false);
  }, []);
  const handleProjectSettingsCancel = useCallback(() => {
    logInfo("ui:project_settings:cancel");
    setSettingsOpen(false);
    setCreatingProject(false);
  }, []);
  const handleProjectSettingsCommit = useCallback(
    (settings: ProjectSettings) => {
      void handleProjectSettingsSave(settings);
    },
    [handleProjectSettingsSave],
  );
  const handleCacheCleared = useCallback(() => {
    clearPreviewPaths();
  }, [clearPreviewPaths]);
  const handleJumpStart = useCallback(() => seek(0), [seek]);
  const handleStepBackward = useCallback(() => {
    seek(Math.max(0, playhead - 1 / state.settings.fps));
  }, [playhead, seek, state.settings.fps]);
  const handleStepForward = useCallback(() => {
    seek(Math.min(total, playhead + 1 / state.settings.fps));
  }, [playhead, seek, state.settings.fps, total]);
  const handleJumpEnd = useCallback(() => seek(total), [seek, total]);

  useEffect(() => {
    if (selectedClip) setTransformOpen(true);
  }, [selectedClip?.id]);

  // Keyboard: Ctrl+Z/Ctrl+Shift+Z = undo/redo, Space = play/pause,
  // S = split selected clip at playhead, Delete = remove selected clip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const mod = e.ctrlKey || e.metaKey;
      const typing = el.closest("input, textarea, [contenteditable], .ant-modal");

      if (mod && (e.code === "KeyZ" || e.code === "KeyY")) {
        if (typing) return; // let text fields handle their own undo
        e.preventDefault();
        if (e.code === "KeyY" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod) return; // don't let other Ctrl combos trigger transport/edit keys

      if (
        el.closest(
          "input, textarea, button, a, [role=\"button\"], [contenteditable], .ant-slider, .ant-select, .ant-switch, .ant-modal",
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        if (state.selectedClipId) {
          e.preventDefault();
          appDispatch({ type: "deleteClip", id: state.selectedClipId });
        }
      } else if (e.code === "KeyS") {
        if (state.selectedClipId) {
          e.preventDefault();
          appDispatch({ type: "splitClip", id: state.selectedClipId, time: playheadRef.current });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appDispatch, toggle, undo, redo, state.selectedClipId]);

  return (
    <div className="app">
      <Toolbar
        exporting={exporting}
        hasProject={hasProject}
        hasClips={hasClips}
        hasSelectedClip={Boolean(state.selectedClipId)}
        canUndo={canUndo}
        canRedo={canRedo}
        editOpen={transformOpen}
        showCanvasGuide={showCanvasGuide}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSettings={handleSettingsOpen}
        onPreferences={handlePreferencesOpen}
        onExport={handleExportOpen}
        onUndo={undo}
        onRedo={redo}
        onOpenEdit={handleOpenEditPanel}
        onCloseEdit={handleCloseEditPanel}
        onSplitClip={handleSplitClip}
        onDeleteSelected={handleDeleteSelectedClip}
        onToggleCanvasGuide={handleToggleCanvasGuide}
        onTimelineZoomIn={handleTimelineZoomIn}
        onTimelineZoomOut={handleTimelineZoomOut}
        onMinimize={handleWindowMinimize}
        onToggleMaximize={handleWindowToggleMaximize}
        onCloseWindow={handleWindowCloseRequest}
      />

      <div className="workspace">
        <MediaLibrary
          assets={state.assets}
          dispatch={appDispatch}
          onStatus={setLoggedStatus}
          width={libraryWidth}
          onResizeStart={startLibraryResize}
          disabled={!hasProject}
        />
        <div className="stage-shell">
          <div className="stage">
            <Preview
              tracks={state.tracks}
              settings={state.settings}
              attach={attach}
              hasClips={hasClips}
              showCanvasGuide={showCanvasGuide}
            />
            <TransportControls
              playing={playing}
              currentTime={playhead}
              total={total}
              disabled={!hasClips}
              onPlayPause={toggle}
              onStop={stop}
              onJumpStart={handleJumpStart}
              onStepBackward={handleStepBackward}
              onStepForward={handleStepForward}
              onJumpEnd={handleJumpEnd}
              onSeek={seek}
            />
          </div>
          <TransformDrawer
            state={state}
            dispatch={appDispatch}
            open={transformOpen}
            onOpenChange={setTransformOpen}
            width={drawerWidth}
            onResizeStart={startDrawerResize}
          />
        </div>
      </div>

      <Timeline state={state} playhead={playhead} dispatch={appDispatch} onSeek={seek} />

      <div className="statusbar">
        <span className="statusbar-text">{status || t("status.ready")}</span>
        {hasProject && (
          <span
            className={`project-save-indicator ${hasUnsavedChanges ? "dirty" : "saved"}`}
            title={hasUnsavedChanges ? t("status.unsavedChanges") : t("status.savedChanges")}
            aria-label={hasUnsavedChanges ? t("status.unsavedChanges") : t("status.savedChanges")}
          >
            {hasUnsavedChanges ? <WarningFilled /> : <CheckCircleFilled />}
            <span>{hasUnsavedChanges ? t("status.unsavedChanges") : t("status.savedChanges")}</span>
          </span>
        )}
      </div>

      <ExportModal
        open={exportOpen}
        exporting={exporting}
        exportDone={exportDone}
        exportResult={exportResult}
        settings={state.settings}
        progressPercent={exportProgress}
        progressEtaSec={exportEtaSec}
        onCancel={handleExportClose}
        onExport={doExport}
      />
      <ProjectSettingsModal
        open={settingsOpen}
        settings={state.settings}
        mode={creatingProject ? "create" : "edit"}
        onCancel={handleProjectSettingsCancel}
        onSave={handleProjectSettingsCommit}
      />
      <PreferencesModal
        open={preferencesOpen}
        settings={state.settings}
        onCancel={handlePreferencesClose}
        onStatus={setLoggedStatus}
        onCacheCleared={handleCacheCleared}
      />
      <Modal
        open={closePromptOpen}
        title={t("project.unsavedExitTitle")}
        onCancel={handleClosePromptCancel}
        closable={!closeSaving}
        maskClosable={!closeSaving}
        footer={[
          <Button key="cancel" onClick={handleClosePromptCancel} disabled={closeSaving}>
            {t("common.cancel")}
          </Button>,
          <Button key="discard" danger onClick={handleExitWithoutSaving} disabled={closeSaving}>
            {t("project.exitWithoutSaving")}
          </Button>,
          <Button key="save" type="primary" loading={closeSaving} onClick={handleSaveAndExit}>
            {t("project.saveAndExit")}
          </Button>,
        ]}
      >
        <p>{t("project.unsavedExitMessage")}</p>
      </Modal>
    </div>
  );
}

export default App;
