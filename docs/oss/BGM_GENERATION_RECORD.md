# BGM Generation Record

Compute Tycoon uses five independently generated instrumental tracks. Each gameplay stage has its own complete audio file; the runtime does not seek into or reuse sections of one shared track.

## Generation

- Date: 2026-08-11
- Tool: TapTap Maker `text_to_music`
- Model: V4.5 custom mode
- Shared direction: progressive sci-fi electronica
- Instrumental: yes
- External reference audio: none

| Stage | Title | Generation ID | Source duration | Public file |
|---|---|---|---:|---|
| 1 | Solo Spark | `6ed41953-06f9-4d00-b84c-b7e4c6810914` | 270.52s | `compute-tycoon-stage1-solo-spark-v1.mp3` |
| 2 | Cluster Pulse | `8aff6c9e-5498-4c5b-a725-42049ec718da` | 241.72s | `compute-tycoon-stage2-cluster-pulse-v1.mp3` |
| 3 | Compute Citadel | `f7732742-d5ff-4533-8071-f76aac3319f0` | 219.76s | `compute-tycoon-stage3-compute-citadel-v1.mp3` |
| 4 | Earth Moon Relay | `592382b2-bb17-459e-89ef-062d1703bb41` | 361.80s | `compute-tycoon-stage4-earth-moon-relay-v1.mp3` |
| 5 | Dyson Ascension | `e1f3565c-6563-4161-9df3-5c0431d1d048` | 298.80s | `compute-tycoon-stage5-dyson-ascension-v1.mp3` |

## H5 Processing

The generated songs retain their full duration. Public copies are transcoded to stereo MP3 at 44.1kHz / 80kbps, with metadata removed, to reduce web delivery size. No track is assembled from another track, and the former shared BGM file is excluded.

An isolated owner-review player is available at `public/bgm-review.html`. It is not linked from the production game menu and does not modify game or save state.

## License Boundary

These music files are project-owned media assets and are not covered by the repository's MIT code license. See `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md`.
