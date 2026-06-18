import { useTranslation } from "react-i18next";
import { formatTime } from "../timeline";
import { LANGUAGES } from "../i18n";

interface Props {
  playing: boolean;
  exporting: boolean;
  hasClips: boolean;
  hasSelection: boolean;
  currentTime: number;
  total: number;
  onImport: () => void;
  onTogglePlay: () => void;
  onDeleteSelected: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
}

export function Toolbar({
  playing,
  exporting,
  hasClips,
  hasSelection,
  currentTime,
  total,
  onImport,
  onTogglePlay,
  onDeleteSelected,
  onZoomIn,
  onZoomOut,
  onExport,
}: Props) {
  const { t, i18n } = useTranslation();

  return (
    <div className="toolbar">
      <button onClick={onImport}>{t("toolbar.import")}</button>

      <button onClick={onTogglePlay} disabled={!hasClips}>
        {playing ? t("toolbar.pause") : t("toolbar.play")}
      </button>

      <button onClick={onDeleteSelected} disabled={!hasSelection}>
        {t("toolbar.delete")}
      </button>

      <div className="time-display">
        {formatTime(currentTime)} / {formatTime(total)}
      </div>

      <div className="spacer" />

      <div className="zoom-group">
        <button onClick={onZoomOut} title={t("toolbar.zoomOut")}>
          −
        </button>
        <span>{t("toolbar.zoom")}</span>
        <button onClick={onZoomIn} title={t("toolbar.zoomIn")}>
          +
        </button>
      </div>

      <select
        className="lang-select"
        title={t("toolbar.language")}
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>

      <button
        className="export"
        onClick={onExport}
        disabled={!hasClips || exporting}
      >
        {exporting ? t("toolbar.exporting") : t("toolbar.export")}
      </button>
    </div>
  );
}
