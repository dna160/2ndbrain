# Golden test fixtures

Deterministic fixtures that pin ingestion, transcription, and structuring behavior. Structuring
changes must keep golden tests green or update the golden with a justification in the phase
DONE file (CLAUDE.md QC gates).

## Required fixtures (added in the phase noted)

| Path | Phase | Purpose |
|---|---|---|
| `relay/meta-text.json` | 2 | Sample Meta relay payload — inbound text message. |
| `relay/meta-voice.json` | 2 | Sample Meta relay payload — inbound voice note (media id). |
| `audio/id-30s.<ext>` | 3 | ~30s Indonesian audio → transcription/structuring golden. |
| `audio/mixed-id-en-30s.<ext>` | 3 | ~30s code-switched ID/EN audio → structuring golden. |
| `structuring/mixed-id-en-30s.expected.json` | 3 | Expected structuring output (shape + key-fact assertions, not exact prose). |

Keep binary audio small. Assertions are on structure and extracted facts, never verbatim prose
(docs/03 Phase 3).
