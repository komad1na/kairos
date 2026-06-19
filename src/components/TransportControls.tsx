import { memo } from "react";
import { Button, Slider, Tooltip, Typography } from "antd";
import {
  BorderOutlined,
  CaretRightOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { formatTime } from "../timeline";

interface Props {
  playing: boolean;
  currentTime: number;
  total: number;
  disabled: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onJumpStart: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onJumpEnd: () => void;
  onSeek: (t: number) => void;
}

/** Transport controls rendered directly beneath the preview panel (FR-026). */
export const TransportControls = memo(function TransportControls({
  playing,
  currentTime,
  total,
  disabled,
  onPlayPause,
  onStop,
  onJumpStart,
  onStepBackward,
  onStepForward,
  onJumpEnd,
  onSeek,
}: Props) {
  const { t } = useTranslation();
  const max = Math.max(total, 0.001);
  return (
    <div className="transport">
      <Slider
        className="transport-seek"
        min={0}
        max={max}
        step={0.01}
        value={Math.min(currentTime, max)}
        tooltip={{ open: false }}
        onChange={(v) => onSeek(v as number)}
        disabled={disabled}
      />
      <div className="transport-row">
        <div />
        <div className="transport-controls">
          <Tooltip title={t("transport.jumpStart")}>
            <Button
              size="small"
              icon={<FastBackwardOutlined />}
              onClick={onJumpStart}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title={t("transport.stepBack")}>
            <Button
              size="small"
              icon={<StepBackwardOutlined />}
              onClick={onStepBackward}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title={playing ? t("transport.pause") : t("transport.play")}>
            <Button
              size="small"
              type="primary"
              icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
              onClick={onPlayPause}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title={t("transport.stop")}>
            <Button size="small" icon={<BorderOutlined />} onClick={onStop} disabled={disabled} />
          </Tooltip>
          <Tooltip title={t("transport.stepForward")}>
            <Button
              size="small"
              icon={<StepForwardOutlined />}
              onClick={onStepForward}
              disabled={disabled}
            />
          </Tooltip>
          <Tooltip title={t("transport.jumpEnd")}>
            <Button
              size="small"
              icon={<FastForwardOutlined />}
              onClick={onJumpEnd}
              disabled={disabled}
            />
          </Tooltip>
        </div>
        <Typography.Text type="secondary" className="transport-time">
          {formatTime(currentTime)} / {formatTime(total)}
        </Typography.Text>
      </div>
    </div>
  );
});
