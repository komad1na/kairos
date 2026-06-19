import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Select, Slider, Tooltip } from "antd";
import {
  CloseOutlined,
  DisconnectOutlined,
  EditOutlined,
  FullscreenOutlined,
  LinkOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  Asset,
  CLIP_TRANSITION_STYLES,
  Clip,
  ClipEffects,
  ClipTransitions,
  ClipTransitionStyle,
  ClipTransform,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_CLIP_TRANSFORM,
  Track,
  TimelineState,
  clipLength,
} from "../types";
import { Action } from "../timelineReducer";
import { clamp, formatTime } from "../timeline";

interface Props {
  state: TimelineState;
  dispatch: React.Dispatch<Action>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onResizeStart: (e: React.PointerEvent) => void;
}

type DrawerTab = "transform" | "effects" | "transitions" | "link";

interface WheelNumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  addonAfter?: string;
  onChange: (value: number) => void;
}

export const TransformDrawer = memo(function TransformDrawer({
  state,
  dispatch,
  open,
  onOpenChange,
  width,
  onResizeStart,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DrawerTab>("transform");
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const lastSelectedClipId = useRef<string | null>(null);
  const selectedClip = state.clips.find((c) => c.id === state.selectedClipId) ?? null;
  const selectedClipId = selectedClip?.id ?? null;
  const selectedTrack = selectedClip
    ? state.tracks.find((track) => track.id === selectedClip.trackId)
    : null;
  const selectedAsset = selectedClip
    ? state.assets.find((item) => item.id === selectedClip.assetId)
    : null;
  const selectedVideoClip =
    selectedClip && selectedTrack?.kind === "video"
      ? selectedClip
      : null;
  const asset = selectedVideoClip
    ? state.assets.find((item) => item.id === selectedVideoClip.assetId)
    : undefined;
  const transform = selectedVideoClip?.transform ?? DEFAULT_CLIP_TRANSFORM;
  const effects = { ...DEFAULT_CLIP_EFFECTS, ...(selectedVideoClip?.effects ?? {}) };
  const transitions = { ...DEFAULT_CLIP_TRANSITIONS, ...(selectedClip?.transitions ?? {}) };
  const linkCandidates = useMemo(() => {
    if (!selectedClip || selectedClip.linkId || !selectedTrack) return [];
    return state.clips
      .filter((clip) => clip.id !== selectedClip.id && !clip.linkId)
      .map((clip) => ({
        clip,
        track: state.tracks.find((track) => track.id === clip.trackId) ?? null,
        asset: state.assets.find((asset) => asset.id === clip.assetId) ?? null,
      }))
      .filter((item) => item.track && item.track.kind !== selectedTrack.kind)
      .sort((a, b) => linkCandidateScore(selectedClip, a.clip) - linkCandidateScore(selectedClip, b.clip));
  }, [selectedClip, selectedTrack, state.assets, state.clips, state.tracks]);
  const linkCandidateIds = linkCandidates.map((item) => item.clip.id).join("|");
  const linkedPartner = useMemo(() => {
    if (!selectedClip?.linkId) return null;
    const link = state.links.find((item) => item.id === selectedClip.linkId);
    const partnerId = link?.clipIds.find((id) => id !== selectedClip.id);
    if (!partnerId) return null;
    return clipInfo(state, partnerId);
  }, [selectedClip, state]);
  const linkTarget = linkCandidates.find((item) => item.clip.id === linkTargetId) ?? null;

  useEffect(() => {
    setLinkTargetId(linkCandidates[0]?.clip.id ?? null);
  }, [linkCandidateIds, selectedClip?.id]);

  useEffect(() => {
    if (selectedClipId === lastSelectedClipId.current) return;
    lastSelectedClipId.current = selectedClipId;
    if (!selectedClipId) return;
    setActiveTab(selectedTrack?.kind === "video" ? "transform" : "link");
  }, [selectedClipId, selectedTrack?.kind]);

  useEffect(() => {
    if ((activeTab === "transform" || activeTab === "effects") && !selectedVideoClip) {
      setActiveTab("link");
    }
  }, [activeTab, selectedVideoClip]);

  function setTransform(patch: Partial<ClipTransform>) {
    if (!selectedVideoClip) return;
    dispatch({ type: "setClipTransform", id: selectedVideoClip.id, transform: patch });
  }

  function fillClip() {
    if (!selectedVideoClip || !asset) return;
    dispatch({
      type: "setClipTransform",
      id: selectedVideoClip.id,
      transform: { scale: fillScaleForAsset(asset, state.settings), x: 0, y: 0 },
    });
  }

  function setEffects(patch: Partial<ClipEffects>) {
    if (!selectedVideoClip) return;
    dispatch({ type: "setClipEffects", id: selectedVideoClip.id, effects: patch });
  }

  function setTransitions(patch: Partial<ClipTransitions>) {
    if (!selectedClip) return;
    dispatch({ type: "setClipTransitions", id: selectedClip.id, transitions: patch });
  }

  function linkSelectedClip() {
    if (!selectedClip || !linkTargetId) return;
    dispatch({ type: "linkClips", firstId: selectedClip.id, secondId: linkTargetId });
  }

  return (
    <aside
      className={`transform-drawer${open ? " open" : " closed"}`}
      style={open ? { width, flexBasis: width } : undefined}
    >
      {open && (
        <div
          className="transform-drawer-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={260}
          aria-valuemax={520}
          aria-valuenow={width}
          onPointerDown={onResizeStart}
        />
      )}
      <div className="transform-drawer-rail">
        <Tooltip title={open ? t("timeline.closeEdit") : t("timeline.openEdit")} placement="left">
          <Button
            size="small"
            icon={open ? <CloseOutlined /> : <EditOutlined />}
            onClick={() => onOpenChange(!open)}
          />
        </Tooltip>
      </div>
      {open && (
        <div className="transform-drawer-content">
          <div className="drawer-tabs" role="tablist" aria-label={t("timeline.drawerTools")}>
            <button
              className={activeTab === "transform" ? "active" : ""}
              type="button"
              disabled={!selectedVideoClip}
              onClick={() => setActiveTab("transform")}
            >
              {t("timeline.transform")}
            </button>
            <button
              className={activeTab === "effects" ? "active" : ""}
              type="button"
              disabled={!selectedVideoClip}
              onClick={() => setActiveTab("effects")}
            >
              {t("timeline.effects")}
            </button>
            <button
              className={activeTab === "transitions" ? "active" : ""}
              type="button"
              disabled={!selectedClip}
              onClick={() => setActiveTab("transitions")}
            >
              {t("timeline.transitions")}
            </button>
            <button
              className={activeTab === "link" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("link")}
            >
              {t("timeline.linkTab")}
            </button>
          </div>

          {activeTab === "transform" && (
            <div>
            <div className="transform-drawer-header">
              <span>{t("timeline.transform")}</span>
            </div>
            {selectedVideoClip ? (
              <>
              <div className="transform-grid two">
                <WheelNumber
                  label="X"
                  value={transform.x}
                  min={-10000}
                  max={10000}
                  step={1}
                  precision={0}
                  onChange={(x) => setTransform({ x })}
                />
                <WheelNumber
                  label="Y"
                  value={transform.y}
                  min={-10000}
                  max={10000}
                  step={1}
                  precision={0}
                  onChange={(y) => setTransform({ y })}
                />
              </div>
              <div className="transform-control">
                <WheelNumber
                  label={t("timeline.scale")}
                  value={transform.scale}
                  min={0.05}
                  max={20}
                  step={0.05}
                  precision={2}
                  addonAfter="x"
                  onChange={(scale) => setTransform({ scale })}
                />
                <Slider
                  min={0.05}
                  max={4}
                  step={0.01}
                  value={clamp(transform.scale, 0.05, 4)}
                  onChange={(scale) => setTransform({ scale: scale as number })}
                  tooltip={{ formatter: (value) => `${(value ?? 0).toFixed(2)}x` }}
                />
              </div>
              <div className="transform-control">
                <WheelNumber
                  label={t("timeline.rotation")}
                  value={transform.rotation}
                  min={-360}
                  max={360}
                  step={1}
                  precision={0}
                  addonAfter="deg"
                  onChange={(rotation) => setTransform({ rotation })}
                />
                <Slider
                  min={-180}
                  max={180}
                  step={1}
                  value={clamp(transform.rotation, -180, 180)}
                  onChange={(rotation) => setTransform({ rotation: rotation as number })}
                  tooltip={{ formatter: (value) => `${value ?? 0}deg` }}
                />
              </div>
              <div className="transform-actions">
                <Button icon={<FullscreenOutlined />} onClick={fillClip}>
                  {t("timeline.fill")}
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() =>
                    dispatch({ type: "resetClipTransform", id: selectedVideoClip.id })
                  }
                >
                  {t("timeline.reset")}
                </Button>
              </div>
              </>
            ) : (
              <div className="transform-empty compact">{t("timeline.noTransformClip")}</div>
            )}
            </div>
          )}
          {activeTab === "effects" && (
            <div>
              <div className="transform-drawer-header">
                <span>{t("timeline.effects")}</span>
              </div>
              {selectedVideoClip ? (
                <>
                  <EffectControl
                    label={t("timeline.opacity")}
                    value={effects.opacity}
                    min={0}
                    max={1}
                    step={0.05}
                    precision={2}
                    onChange={(opacity) => setEffects({ opacity })}
                  />
                  <EffectControl
                    label={t("timeline.blur")}
                    value={effects.blur}
                    min={0}
                    max={40}
                    step={1}
                    precision={0}
                    addonAfter="px"
                    onChange={(blur) => setEffects({ blur })}
                  />
                  <EffectControl
                    label={t("timeline.brightness")}
                    value={effects.brightness}
                    min={0}
                    max={2}
                    step={0.05}
                    precision={2}
                    addonAfter="x"
                    onChange={(brightness) => setEffects({ brightness })}
                  />
                  <EffectControl
                    label={t("timeline.contrast")}
                    value={effects.contrast}
                    min={0}
                    max={2}
                    step={0.05}
                    precision={2}
                    addonAfter="x"
                    onChange={(contrast) => setEffects({ contrast })}
                  />
                  <EffectControl
                    label={t("timeline.saturation")}
                    value={effects.saturation}
                    min={0}
                    max={2}
                    step={0.05}
                    precision={2}
                    addonAfter="x"
                    onChange={(saturation) => setEffects({ saturation })}
                  />
                  <EffectControl
                    label={t("timeline.hue")}
                    value={effects.hue}
                    min={-180}
                    max={180}
                    step={1}
                    precision={0}
                    addonAfter="deg"
                    onChange={(hue) => setEffects({ hue })}
                  />
                  <EffectControl
                    label={t("timeline.grayscale")}
                    value={effects.grayscale}
                    min={0}
                    max={1}
                    step={0.05}
                    precision={2}
                    onChange={(grayscale) => setEffects({ grayscale })}
                  />
                  <EffectControl
                    label={t("timeline.sepia")}
                    value={effects.sepia}
                    min={0}
                    max={1}
                    step={0.05}
                    precision={2}
                    onChange={(sepia) => setEffects({ sepia })}
                  />
                  <EffectControl
                    label={t("timeline.invert")}
                    value={effects.invert}
                    min={0}
                    max={1}
                    step={0.05}
                    precision={2}
                    onChange={(invert) => setEffects({ invert })}
                  />
                  <Button
                    block
                    icon={<ReloadOutlined />}
                    onClick={() => dispatch({ type: "resetClipEffects", id: selectedVideoClip.id })}
                  >
                    {t("timeline.resetEffects")}
                  </Button>
                </>
              ) : (
                <div className="transform-empty compact">{t("timeline.noTransformClip")}</div>
              )}
            </div>
          )}
          {activeTab === "transitions" && (
            <div>
              <div className="transform-drawer-header">
                <span>{t("timeline.transitions")}</span>
              </div>
              {selectedClip ? (
                <>
                  <EffectControl
                    label={t("timeline.fadeIn")}
                    value={transitions.fadeIn}
                    min={0}
                    max={10}
                    step={0.05}
                    precision={2}
                    addonAfter="s"
                    onChange={(fadeIn) => setTransitions({ fadeIn })}
                  />
                  <TransitionStyleControl
                    label={t("timeline.transitionInStyle")}
                    value={transitions.inStyle}
                    onChange={(inStyle) => setTransitions({ inStyle })}
                  />
                  <EffectControl
                    label={t("timeline.fadeOut")}
                    value={transitions.fadeOut}
                    min={0}
                    max={10}
                    step={0.05}
                    precision={2}
                    addonAfter="s"
                    onChange={(fadeOut) => setTransitions({ fadeOut })}
                  />
                  <TransitionStyleControl
                    label={t("timeline.transitionOutStyle")}
                    value={transitions.outStyle}
                    onChange={(outStyle) => setTransitions({ outStyle })}
                  />
                  <Button
                    block
                    icon={<ReloadOutlined />}
                    onClick={() =>
                      dispatch({ type: "resetClipTransitions", id: selectedClip.id })
                    }
                  >
                    {t("timeline.resetTransitions")}
                  </Button>
                </>
              ) : (
                <div className="transform-empty compact">{t("timeline.noClipSelected")}</div>
              )}
            </div>
          )}
          {activeTab === "link" && (
            <div>
              <div className="transform-drawer-header">
                <span>{t("timeline.linkTab")}</span>
              </div>
              {selectedClip ? (
                <div className="clip-panel">
                  {selectedClip.linkId ? (
                    <>
                      <LinkSummary
                        title={t("timeline.unlinkPreview")}
                        note={t("timeline.unlinkPreviewHint")}
                        connector={<DisconnectOutlined />}
                        first={{
                          label: t("timeline.selectedClip"),
                          name: selectedAsset?.name ?? t("timeline.selectedClip"),
                          clip: selectedClip,
                          track: selectedTrack,
                        }}
                        second={
                          linkedPartner
                            ? {
                                label: t("timeline.linkedPartner"),
                                name: linkedPartner.asset?.name ?? t("timeline.selectedClip"),
                                clip: linkedPartner.clip,
                                track: linkedPartner.track,
                              }
                            : null
                        }
                      />
                      <Button
                        block
                        icon={<DisconnectOutlined />}
                        onClick={() => dispatch({ type: "unlink", linkId: selectedClip.linkId! })}
                      >
                        {t("timeline.unlink")}
                      </Button>
                    </>
                  ) : linkCandidates.length > 0 ? (
                    <>
                      <div className="clip-link-picker">
                        <Select
                          size="small"
                          value={linkTargetId ?? undefined}
                          options={linkCandidates.map(({ clip, track, asset }) => ({
                            value: clip.id,
                            label: `${track?.name ?? ""} · ${asset?.name ?? t("timeline.selectedClip")} · ${formatTime(clip.start)}`,
                          }))}
                          popupMatchSelectWidth={false}
                          onChange={setLinkTargetId}
                        />
                      </div>
                      <LinkSummary
                        title={t("timeline.linkPreview")}
                        note={t("timeline.linkPreviewHint")}
                        connector={<LinkOutlined />}
                        first={{
                          label: t("timeline.selectedClip"),
                          name: selectedAsset?.name ?? t("timeline.selectedClip"),
                          clip: selectedClip,
                          track: selectedTrack,
                        }}
                        second={
                          linkTarget
                            ? {
                                label: t("timeline.linkTarget"),
                                name: linkTarget.asset?.name ?? t("timeline.selectedClip"),
                                clip: linkTarget.clip,
                                track: linkTarget.track,
                              }
                            : null
                        }
                      />
                      <Button
                        block
                        icon={<LinkOutlined />}
                        disabled={!linkTargetId}
                        onClick={linkSelectedClip}
                      >
                        {t("timeline.linkClips")}
                      </Button>
                    </>
                  ) : (
                    <div className="transform-empty compact">{t("timeline.noLinkCandidates")}</div>
                  )}
                </div>
              ) : (
                <div className="transform-empty compact">{t("timeline.noClipSelected")}</div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
});

function LinkSummary({
  title,
  note,
  connector,
  first,
  second,
}: {
  title: string;
  note: string;
  connector: React.ReactNode;
  first: LinkSummaryItem;
  second: LinkSummaryItem | null;
}) {
  return (
    <div className="link-summary">
      <div className="link-summary-head">
        <div className="link-summary-title">{title}</div>
        <div className="link-summary-note">{note}</div>
      </div>
      <LinkSummaryCard item={first} />
      <div className="link-summary-connector">{connector}</div>
      {second ? (
        <LinkSummaryCard item={second} />
      ) : (
        <div className="link-summary-item muted">?</div>
      )}
    </div>
  );
}

interface LinkSummaryItem {
  label: string;
  name: string;
  clip: Clip;
  track: Track | null | undefined;
}

function LinkSummaryCard({ item }: { item: LinkSummaryItem }) {
  const { t } = useTranslation();
  return (
    <div className="link-summary-item">
      <div className="link-summary-item-head">
        <span className="link-summary-badge">{item.label}</span>
        <span className="link-summary-track">{formatTrackLabel(item.track, t)}</span>
      </div>
      <div className="link-summary-name">{item.name}</div>
      <div className="link-summary-times">
        <span>{formatTime(item.clip.start)}</span>
        <span>{formatTime(item.clip.start + clipLength(item.clip))}</span>
        <span>{formatTime(clipLength(item.clip))}</span>
      </div>
    </div>
  );
}

function EffectControl({
  label,
  value,
  min,
  max,
  step,
  precision,
  addonAfter,
  onChange,
}: WheelNumberProps) {
  return (
    <div className="effect-control">
      <WheelNumber
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        precision={precision}
        addonAfter={addonAfter}
        onChange={onChange}
      />
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(next) => onChange(next as number)}
        tooltip={{ formatter: (next) => String(next ?? value) }}
      />
    </div>
  );
}

function formatTrackLabel(track: Track | null | undefined, t: (key: string) => string): string {
  if (!track) return "";
  const kind = track.kind === "video" ? t("timeline.videoTrack") : t("timeline.audioTrack");
  return `${kind} ${track.name}`;
}

function WheelNumber({
  label,
  value,
  min,
  max,
  step,
  precision,
  addonAfter,
  onChange,
}: WheelNumberProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);

  function commit(next: number) {
    const factor = precision == null ? 1 : 10 ** precision;
    onChange(Math.round(clamp(next, min, max) * factor) / factor);
  }

  function commitWheel(deltaY: number, shiftKey: boolean, altKey: boolean) {
    const direction = deltaY < 0 ? 1 : -1;
    const multiplier = shiftKey ? 10 : altKey ? 0.2 : 1;
    commit(value + direction * step * multiplier);
  }

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      commitWheel(event.deltaY, event.shiftKey, event.altKey);
    }

    node.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => node.removeEventListener("wheel", onWheel, { capture: true });
  });

  return (
    <div className="wheel-number">
      <span className="wheel-number-label">{label}</span>
      <div className="wheel-number-input" ref={inputRef}>
        <InputNumber
          size="small"
          min={min}
          max={max}
          step={step}
          precision={precision}
          value={value}
          addonAfter={addonAfter}
          onChange={(next) => commit(inputNumber(next, value))}
        />
      </div>
    </div>
  );
}

function TransitionStyleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ClipTransitionStyle;
  onChange: (value: ClipTransitionStyle) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="transition-style-control">
      <span>{label}</span>
      <Select
        size="small"
        value={value}
        options={CLIP_TRANSITION_STYLES.map((style) => ({
          value: style,
          label: t(`timeline.transitionStyle.${style}`),
        }))}
        onChange={onChange}
      />
    </label>
  );
}

function fillScaleForAsset(asset: Asset, settings: TimelineState["settings"]): number {
  if (!asset.width || !asset.height || !settings.width || !settings.height) return 1;
  const fit = Math.min(settings.width / asset.width, settings.height / asset.height);
  const fill = Math.max(settings.width / asset.width, settings.height / asset.height);
  return fit > 0 ? clamp(fill / fit, 0.05, 20) : 1;
}

function clipInfo(state: TimelineState, clipId: string) {
  const clip = state.clips.find((item) => item.id === clipId);
  if (!clip) return null;
  return {
    clip,
    track: state.tracks.find((track) => track.id === clip.trackId) ?? null,
    asset: state.assets.find((asset) => asset.id === clip.assetId) ?? null,
  };
}

function linkCandidateScore(selected: Clip, candidate: Clip): number {
  let score = 0;
  if (candidate.assetId !== selected.assetId) score += 1000;
  score += Math.abs(candidate.start - selected.start) * 10;
  score += Math.abs(candidate.in - selected.in) * 5;
  score += Math.abs(candidate.out - selected.out) * 5;
  return score;
}

function inputNumber(value: number | string | null, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}
