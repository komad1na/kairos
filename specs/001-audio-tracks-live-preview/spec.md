# Feature Specification: Audio, Multi-Track Timeline, Live Preview & Media Library

**Feature Branch**: `001-audio-tracks-live-preview`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "trebamo da dodamo zvuk i da timeline podelimo na video i audio sa opcijom dodavanja jos traka, takodje trebamo dodati livepreview nativno u editor i dodati sekciju levo koja ce biti za importovane fajlove da vidimo da mozemo da prevlacimo na timeline, takodje treba dodati sve kontrole ispod preview panela koji je sa desne strane"

> Summary (EN): Add audio support and split the timeline into separate video and audio
> tracks with the ability to add more tracks; add a native real-time preview inside the
> editor; add a left-hand panel listing imported files that can be dragged onto the
> timeline; and place all playback controls directly below the preview panel on the right.

## Clarifications

### Session 2026-06-18

- Q: How should clips appear on the timeline (visual depth)? → A: Light — video clips show a single representative thumbnail; audio clips show a waveform.
- Q: What format should export produce? → A: Fixed .mp4 (H.264 video + AAC audio); user picks only the destination filename.
- Q: What range should clip/track volume allow? → A: 0%–200% (100% = original level; up to ~+6 dB boost).
- Q: How should clips snap when moved/trimmed? → A: Snap to anchors (playhead, adjacent clip edges, timeline start) by default; hold a modifier key for free placement.
- Q: With multiple video tracks, what shows when video clips overlap in time? → A: Top wins — the highest video track with a clip is shown full-frame, occluding lower tracks (no blending).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch and hear the edit in real time (Priority: P1)

The editor user opens the app with clips on the timeline, presses Play, and sees the
video play back smoothly inside the editor while hearing the synchronized audio. They use
the transport controls located directly beneath the preview panel (right side) to pause,
stop, scrub, and seek to any point, and the playhead on the timeline follows along.

**Why this priority**: Being able to actually watch and listen to the edit — with sound,
in real time, without exporting first — is the single highest-value capability and the
core of what makes this an "editor" rather than a clip arranger. Everything else exists to
feed this experience.

**Independent Test**: Import a video that has an audio track, place it on the timeline,
press Play, and confirm the picture plays at normal speed with audible, in-sync sound, and
that pause/stop/seek behave correctly. Delivers a usable previewable editor on its own.

**Acceptance Scenarios**:

1. **Given** a clip with audio on the timeline and the playhead at 0, **When** the user presses Play, **Then** the preview plays the picture at real-time speed with audible sound, and the playhead advances in step with what is shown.
2. **Given** the preview is playing, **When** the user presses Pause, **Then** picture and sound stop immediately at the current position and resume from that exact point on the next Play.
3. **Given** the preview is playing or paused, **When** the user presses Stop, **Then** playback halts and the playhead returns to the start.
4. **Given** a clip on the timeline, **When** the user clicks or drags on the timeline ruler/playhead, **Then** the preview seeks to that time and shows the corresponding frame (and audio resumes from there on Play).
5. **Given** the playhead is positioned over a gap with no clip, **When** the preview reaches or is moved to that gap, **Then** the preview shows black with silence rather than an error or frozen frame.
6. **Given** the preview is focused, **When** the user presses the Spacebar, **Then** playback toggles between play and pause.

---

### User Story 2 - Organize media on separate video and audio tracks (Priority: P2)

The user works with a timeline split into distinct video and audio lanes. They can add more
tracks (video and/or audio), place clips onto the appropriate track, move and trim clips,
and control volume and mute per clip and per track so that multiple audio sources mix
together on playback.

**Why this priority**: Separating video from audio and supporting multiple tracks is what
enables real editing (background music under narration, B-roll over a base layer). It
builds directly on the preview from US1 by giving it richer material to play.

**Independent Test**: Starting from one video and one audio track, add a second audio
track, place an audio clip on it, set that clip's volume and a track-level mute, and
confirm during preview that the mix reflects the volume/mute settings.

**Acceptance Scenarios**:

1. **Given** a new/empty project, **When** the user opens the timeline, **Then** it shows at least one video track and one separate audio track as distinct lanes.
2. **Given** the timeline, **When** the user adds a track, **Then** a new empty track of the chosen kind (video or audio) appears and can hold clips.
3. **Given** a video clip and an audio clip, **When** the user places them, **Then** video clips can only be placed on video tracks and audio clips only on audio tracks.
4. **Given** two audio tracks each with a clip playing at the same time, **When** the preview plays, **Then** both audio sources are mixed and audible together.
5. **Given** a clip with a volume setting and a track with its own volume/mute, **When** the preview plays, **Then** the audible level reflects the combination, and muting either the clip or its track silences that clip.
6. **Given** a track that contains clips, **When** the user removes the track, **Then** the user is warned before its clips are removed with it.
7. **Given** a clip on a track, **When** the user drags it to a new position or to another compatible track, **Then** the clip moves there and the change is reflected in the next preview and in export.

---

### User Story 3 - Import once, reuse by dragging from a media library (Priority: P3)

The user imports media files into a panel on the left side of the editor. Each imported
file is listed with an identifying name, a representative thumbnail (or audio indicator),
and its duration. The user drags a file from this library onto a timeline track to create a
clip, and can reuse the same library item multiple times.

**Why this priority**: A media library with drag-to-place turns importing into a reusable,
discoverable workflow and is the natural on-ramp for filling the multi-track timeline. It is
valuable but depends on having tracks and preview to drag into, hence P3.

**Independent Test**: Import two files, confirm both appear in the left library panel with
name/thumbnail/duration, drag one onto a video track and the same one again to a second
position, and confirm two independent clips are created without altering the source files.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** the user imports one or more files, **Then** each appears as an item in the left-hand library panel with a name, a thumbnail/indicator, and its duration, without being placed on the timeline.
2. **Given** an audio-only file in the library, **When** the user drags it onto an audio track and drops it, **Then** a single clip is created on that track at the drop position.
3. **Given** a file containing both video and audio, **When** the user drags it onto a video track and drops it, **Then** a linked pair is created — a video clip on that track and an audio clip on a compatible audio track, time-aligned — and they move and trim together until unlinked.
4. **Given** a library item, **When** the user drags it to the timeline more than once, **Then** each drop creates an independent clip (or linked pair) referencing the same source.
5. **Given** an audio-only file in the library, **When** it is dragged over a video track (or a video-only source over an audio track), **Then** the drop is not allowed (or is routed to a compatible track) and no invalid clip is created.
6. **Given** any import or placement, **When** it completes, **Then** the original source file on disk is never modified.

---

### Edge Cases

- **Gap on the timeline**: playhead over empty space shows black + silence, not an error.
- **Empty timeline**: pressing Play does nothing harmful; transport controls are inert or disabled.
- **Unsupported / corrupt file on import**: the user gets a clear message and the file is not added to the library.
- **Source the preview cannot decode**: the user gets a clear message (or a fallback); the preview never shows a silent black frame as if it were correct content.
- **Incompatible drop target**: dragging video onto an audio track (or vice versa) is rejected or routed; no invalid clip results.
- **Overlapping drop on the same track**: the dropped clip snaps to the nearest free space (clips on one track do not overlap in this feature).
- **Removing a non-empty track**: the user is warned that contained clips will be removed.
- **Dragging a clip past the current end of the timeline**: the timeline length extends to accommodate it.
- **Many tracks / many clips / long timeline**: preview and scrubbing remain responsive (see Success Criteria).
- **Seeking while playing**: audio and video both jump to the new position and stay in sync after the seek.

## Requirements *(mandatory)*

### Functional Requirements

**Editor layout**

- **FR-001**: The editor layout MUST place the media library panel on the left, the preview panel on the right, the transport controls directly beneath the preview panel, and the timeline spanning the lower area.

**Media library & import**

- **FR-002**: Users MUST be able to import one or more media files into a media library; an imported file appears in the library without being automatically placed on the timeline.
- **FR-003**: The library MUST display, for each item, an identifying name, a representative thumbnail (video) or an audio indicator (audio-only), and the item's duration.
- **FR-004**: The library MUST indicate whether each item contains video, audio, or both.
- **FR-005**: Users MUST be able to drag a library item onto a timeline track to create a clip at the drop position.
- **FR-006**: A single library item MUST be reusable — each drag-and-drop onto the timeline creates an independent clip that references the same source.
- **FR-007**: Importing a file, and any subsequent editing, MUST never modify the original source file on disk.
- **FR-008**: When a file cannot be imported (unsupported or corrupt), the system MUST inform the user with a clear message and MUST NOT add a broken item to the library.

**Timeline & tracks**

- **FR-009**: The timeline MUST present video and audio on visually separate tracks (lanes).
- **FR-010**: A new/empty project MUST start with at least one video track and one audio track.
- **FR-011**: Users MUST be able to add additional tracks of either kind (video or audio); there is no fixed two-track ceiling.
- **FR-012**: Users MUST be able to remove a track; when the track contains clips, the system MUST warn the user before removing it and its clips.
- **FR-013**: Video clips MUST be placeable only on video tracks and audio clips only on audio tracks.
- **FR-014**: Users MUST be able to reposition a clip by dragging it within a track and onto other compatible tracks, and to trim a clip by dragging its edges (existing trim behavior preserved).
- **FR-015**: Clips on the same track MUST NOT overlap; a placement that would overlap snaps to the nearest free space.
- **FR-015a**: While moving or trimming a clip, the system MUST snap its edges to natural anchors — the playhead, adjacent clip edges, and the timeline start — and MUST let the user hold a modifier key to temporarily disable snapping for free placement.
- **FR-016**: The timeline MUST be a non-destructive description of edits: each clip records its source, source in/out points, timeline position, volume, and mute state, and editing changes only this description.
- **FR-016a**: On the timeline, a video clip MUST display a single representative thumbnail and an audio clip MUST display a waveform; both MUST also show an identifying label. Full per-clip filmstrips are out of scope for this feature.

**Audio**

- **FR-017**: Audio MUST be audible during real-time preview.
- **FR-018**: Each clip MUST have an adjustable volume (range 0%–200%, where 100% = the source's original level) and a mute toggle.
- **FR-019**: Each track MUST have an adjustable volume (range 0%–200%, where 100% = unchanged) and a mute toggle.
- **FR-020**: The audible level of a clip during preview and export MUST reflect the combination of its clip volume and its track volume; muting either the clip or its track MUST silence that clip.
- **FR-021**: When multiple audio sources play at the same time, they MUST be mixed together.
- **FR-022**: Audio MUST remain synchronized with video throughout preview (see Success Criteria for the tolerance).

**Real-time preview**

- **FR-023**: The editor MUST provide a real-time preview that plays the timeline at normal (1×) speed with synchronized audio and video.
- **FR-024**: The preview MUST reflect the current timeline state — clips, trims, positions, ordering, and per-clip/per-track volume and mute.
- **FR-024a**: When clips on more than one video track occupy the same instant, the topmost video track that has a clip MUST be shown full-frame, hiding the video tracks below it (simple occlusion — no blending, opacity, or picture-in-picture). This precedence MUST be identical in preview and export.
- **FR-025**: What the user sees and hears in the preview MUST match the exported result (preview/export parity); the two MUST be derived from the same timeline description.
- **FR-026**: The transport controls beneath the preview MUST include at least: play, pause, stop, seek/scrub to an arbitrary position, jump to start, and a readout of the current time and total duration.
- **FR-027**: Seeking (via the controls or by clicking/dragging the timeline ruler or playhead) MUST move the preview to that time; during playback the timeline playhead MUST track the preview position.
- **FR-028**: The Spacebar MUST toggle play/pause when the preview is active (existing behavior preserved).
- **FR-029**: When the playhead is over a gap, the preview MUST present black and silence rather than an error or a frozen frame.

**Export**

- **FR-030**: Export MUST render all tracks and clips — honoring trims, positions, ordering, per-clip and per-track volume, and mute — into a single `.mp4` file (H.264 video + AAC audio), compositing video and mixing audio according to the timeline. The user chooses only the destination filename; format/container selection is out of scope for this feature.

**Source-of-both handling (linked clips)**

- **FR-031**: When a source file that contains both video and audio is added to the timeline, the system MUST create two clips — a video clip on a video track and an audio clip on an audio track — that reference the same source and are linked together as a pair.
- **FR-032**: Linked clips MUST move and trim together by default: moving the pair keeps them time-aligned, and trimming one edge trims the corresponding edge of its partner so they stay in sync.
- **FR-033**: Users MUST be able to unlink a linked pair so the video and audio clips can be moved, trimmed, and deleted independently; once unlinked they behave as ordinary independent clips.
- **FR-034**: When a video+audio source is dropped onto a video track, the video clip MUST be placed on that track and its linked audio clip on a compatible audio track at the same start time; if no audio track exists, one MUST be made available so the audio is not dropped. (The symmetric rule applies when dropping onto an audio track.)

### Key Entities *(include if feature involves data)*

- **Media Library Item (Asset)**: A reference to an imported source file. Attributes: display name, source location, kind (video / audio / both), total duration, representative thumbnail or waveform/indicator, and technical metadata (resolution, frame rate, sample rate). Never modified by editing.
- **Track**: A horizontal lane of a single kind (video or audio). Attributes: kind, order/index, volume, mute. Holds clips and never overlaps them within itself.
- **Clip**: An instance of an Asset placed on a Track. Attributes: reference to its source Asset, source in/out points, timeline start position, duration, volume, mute, and an optional link to a partner clip. Multiple clips may reference the same Asset.
- **Link (Linked Pair)**: An association between a video clip and an audio clip created from the same both-kind source. While linked, the pair moves and trims as one; unlinking dissolves the association and leaves two independent clips.
- **Timeline (Project)**: The single source of truth for the edit — the ordered set of tracks and their clips plus the playhead. Both the preview and the export are derived from it.
- **Transport / Playback State**: The current playhead time and play/pause state driving the preview.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from importing a file to having it placed on the timeline in 3 actions or fewer (import → see in library → drag to track).
- **SC-002**: During preview playback, audio stays synchronized with video within a not-perceptible margin (≤ 50 ms drift) for the full length of a clip.
- **SC-003**: Preview of typical HD footage plays at real-time (1×) speed without the playhead stalling or the picture freezing on otherwise-supported content.
- **SC-004**: For any timeline, the exported file matches the preview — same clips, trims, ordering, and audible volume/mute — with no "preview looked different from export" discrepancies.
- **SC-005**: A user can build a project with multiple video and multiple audio tracks and place clips on each, with simultaneous audio tracks audibly mixed.
- **SC-006**: Every transport action (play, pause, stop, seek) takes visible effect effectively instantly (within ~200 ms of the input).
- **SC-007**: A change to a clip's or track's volume or mute is reflected in what the user hears within ~200 ms (on the next playback for paused state).
- **SC-008**: A user can complete the end-to-end flow — import → place clips on at least one video and one audio track → preview with sound → export — entirely within the editor, without external tools.
- **SC-009**: A first-time user can locate and operate the core controls (play, pause, seek, add track, drag from library) without instructions, completing a basic edit on the first attempt.

## Assumptions

- **Single-user desktop app**: no collaboration, accounts, or networking are involved.
- **Session-scoped state**: the media library and timeline live for the editing session; saving and re-opening project files (project persistence) is out of scope for this feature.
- **No overlap / no ripple**: clips on a single track do not overlap (overlap, blending, and crossfades are deferred per the project constitution); removing or moving a clip leaves a gap rather than auto-shifting other clips.
- **Linked A/V clips**: a both-kind source becomes a linked video+audio pair that edits together by default and can be unlinked for independent editing (FR-031–FR-034).
- **No effects in this feature**: transitions, video effects/filters, color grading, keyframing, and title/text layers are out of scope (deferred).
- **Track count**: there is no fixed maximum number of tracks beyond practical UI limits; the default new project has one video and one audio track.
- **Transport control set**: play, pause, stop, seek/scrub, jump to start, and a current-time/total-duration readout; the Spacebar shortcut is preserved. A separate master/output volume control is out of scope (volume is per-clip and per-track).
- **Reuse of existing capabilities**: this feature builds on the existing import, single-track timeline, trimming, and export functionality rather than replacing them.
- **Media tooling**: media metadata, thumbnails, waveforms/indicators, and export are produced by the system media tooling already required by the project; the real-time preview uses the application's built-in playback (not per-frame fetching).

## Dependencies

- The system media tooling already required by the project (for metadata, thumbnails/waveforms, and export) must be available.
- Builds upon the existing timeline, import, trimming, and export features.
