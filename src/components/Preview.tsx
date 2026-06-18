import { useTranslation } from "react-i18next";

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  hasClips: boolean;
}

/** Video display area — Rust draws decoded frames onto this canvas. */
export function Preview({ canvasRef, hasClips }: Props) {
  const { t } = useTranslation();
  return (
    <div className="preview">
      <canvas ref={canvasRef} className="preview-canvas" />
      {!hasClips && (
        <div className="preview-placeholder">
          <p>{t("preview.noVideo")}</p>
          <small>{t("preview.hint")}</small>
        </div>
      )}
    </div>
  );
}
