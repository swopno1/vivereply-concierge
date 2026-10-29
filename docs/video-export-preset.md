# Video export preset (1080p, portal-safe)

Record the screen at 1920×1080. Export with ffmpeg (install once:
`brew install ffmpeg`):

```bash
ffmpeg -i raw-demo.mov -c:v libx264 -preset slow -crf 20 \
  -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k vivereply-demo-1080p.mp4
```

Why these flags: yuv420p plays everywhere (QuickTime-safe),
faststart lets the portal stream before full download, CRF 20 keeps
chat text readable at 1080p. If the portal caps size below the
result, re-export with `-crf 24` (then 26) before cutting content —
readability of prices/codes beats length.

Verify before upload:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate,duration \
  -of default=noprint_wrappers=1 vivereply-demo-1080p.mp4
ls -lh vivereply-demo-1080p.mp4
```

Expect 1920×1080, duration under the portal cap, size under the
portal cap. Watch the export once end to end: every price, code, and
card must be legible at full screen.
