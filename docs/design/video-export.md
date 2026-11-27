# Hand video export (MP4 / WebM, GIF)

Status: design note, no code. Decision needed on the two open points at the end.

## Goal

Export one replayed hand as a video (MP4 or WebM) or an animated GIF, in 16:9 (desktop) or 9:16
(vertical, for social posts), with the table, the cards, the stacks and the action log.

## Why this is not a small change

The replayer draws the table with HTML and CSS (`components/replayer/*.tsx`, `replayer.css`), not on
a canvas. A recorder records a canvas or a video element, so the table has to be drawn somewhere a
recorder can read. Two routes exist:

1. **Render the table to a canvas ourselves.** A second renderer for the table (felt, seats, cards,
   chips, action log), kept in step with the HTML one. Most work, no dependency, fully controlled.
2. **Capture the DOM** (for example with an HTML-to-image library) frame by frame. Less code, but a
   new dependency, slow capture, and results that depend on the webview.

Route 1 is the one that does not depend on the webview's DOM capture. Route 2 is not chosen here,
because a dependency needs a justification and an audit of its licence before it is added.

## Recording

- **WebM** through `MediaRecorder` on the canvas `captureStream()`. Supported by Chromium-based
  webviews (WebView2 on Windows).
- **MP4** through `MediaRecorder` only where the webview reports support for it
  (`MediaRecorder.isTypeSupported('video/mp4')`). Not verified on WebView2 here: to check on a real
  install before promising it.
- **No ffmpeg** is embedded. If MP4 is not supported, WebM is the output and the UI says so.
- **GIF** needs an encoder. Either a small LZW encoder written in-house (about 200 lines, no
  dependency) or a MIT-licensed library after a licence check. Frame count is kept low (a few frames
  per second) to keep the file small.

## Algorithm

1. Build the list of frames from the replay: one frame per action, plus a short hold at the end.
2. For each frame, draw the state the replayer already computes (`replayerStore` snapshot) on the
   canvas at the chosen aspect ratio.
3. Feed the frames to the recorder in real time (WebM/MP4) or encode them (GIF).
4. Save the result through the existing save-file path (the same one as the data export).

## Data

Nothing new: the replayer already holds the hand, the actions and the seat layout. Equities (block 12)
and the stats at the hand (block 14) are optional overlays, off by default.

## UI

A menu next to the hand copy in the replayer header: format (MP4 / WebM / GIF), aspect ratio
(16:9 / 9:16), and a progress bar while frames are produced. Cancelling is possible at any frame.

## Limits

- Recording runs in the webview: a long hand takes its real duration in WebM/MP4. GIF is faster.
- The output quality depends on the webview's encoder; no guarantee of the same result on every
  machine.
- Video is not a substitute for the hand history: it shows one hand, without the other hands.

## Open points (decision needed)

1. **Renderer**: route 1 (a second canvas renderer, more work, no dependency) or route 2 (a DOM
   capture library, less work, one dependency to justify and audit).
2. **MP4**: keep it only if WebView2 supports it on a real install; otherwise ship WebM only.
