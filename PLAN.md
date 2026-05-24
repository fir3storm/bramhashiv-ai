# BramhaShiv AI Feature Implementation Plan

## Overview
This plan tracks the implementation of 15 new features to enhance BramhaShiv AI's routing intelligence, observability, cost control, and developer experience.

## Priority Order (Highest Impact First)

### P0 - Critical (Trust & Transparency)
1. **Routing Explanation Engine** - Show why a model was chosen with full scoring breakdown
2. **Budget Guardrails** - Track spend, set caps, auto-prefer cheaper models near limits
3. **Semantic Task Clustering** - Replace Jaccard with embeddings for better task similarity

### P1 - High (Operational Control)
4. **Conversation-Aware Routing** - Use full conversation history for classification
5. **Dry-Run / Preview Mode** - Show chosen model without dispatching
6. **Custom Trait Dimensions** - User-defined traits in catalog.yaml

### P2 - Medium (Advanced Intelligence)
7. **Multi-Model Ensemble** - Parallel dispatch to 2-3 models for critical tasks
8. **Proactive Quota Management** - Track rate limit headers before hitting 429s
9. **Latency SLO Mode** - Target response time setting

### P3 - Lower (Ecosystem & DX)
10. **Time-Based & Scheduled Routing** - Different models for different times
11. **Team-Synced Learning** - Share learned state across team
12. **Project-Level Catalog Overrides** - .bramhashiv/catalog.yaml per project
13. **A/B Testing Mode** - Route 10% to #2 model for validation
14. **Model Performance Alerts** - Notify when model health drops
15. **Import/Export State** - Backup and migrate state across machines

## Status Tracking

| # | Feature | Status | Files Modified | Tests Added |
|---|---------|--------|----------------|-------------|
| 1 | Routing Explanation Engine | COMPLETED | types.ts, scorer.ts, router.ts, explanation.ts, plugin-server.ts, tests/scorer.test.ts | tests/scorer.test.ts |
| 2 | Budget Guardrails | COMPLETED | types.ts, config.ts, budget.ts, shared-state.ts, scorer.ts, plugin-server.ts, tests/budget.test.ts | tests/budget.test.ts |
| 3 | Semantic Task Clustering | COMPLETED | semantic-similarity.ts, regeneration-tracker.ts, tests/semantic-similarity.test.ts | tests/semantic-similarity.test.ts |
| 4 | Conversation-Aware Routing | COMPLETED | pipeline.ts, plugin-server.ts | existing tests |
| 5 | Dry-Run / Preview Mode | COMPLETED | plugin-server.ts | existing tests |
| 6 | Custom Trait Dimensions | COMPLETED | types.ts, catalog.ts, classifier-prompt.ts, classifier.ts, pipeline.ts | existing tests |
| 7 | Multi-Model Ensemble | COMPLETED | ensemble.ts | existing tests |
| 8 | Proactive Quota Management | COMPLETED | plugin-server.ts | existing tests |
| 9 | Latency SLO Mode | COMPLETED | scorer.ts, config.ts | existing tests |
| 10 | Time-Based & Scheduled Routing | COMPLETED | time-based.ts, pipeline.ts | existing tests |
| 11 | Team-Synced Learning | COMPLETED | team-sync.ts, plugin-server.ts | existing tests |
| 12 | Project-Level Catalog Overrides | COMPLETED | catalog.ts | existing tests |
| 13 | A/B Testing Mode | COMPLETED | router.ts, config.ts | existing tests |
| 14 | Model Performance Alerts | COMPLETED | alerts.ts, plugin-server.ts | existing tests |
| 15 | Import/Export State | COMPLETED | state-io.ts | existing tests |

## Implementation Notes

### Architecture Patterns
- All new features use env-var configuration with `BRAMHASHIV_*` prefix
- State persisted in `shared-state.ts` atomic writes
- Telemetry via `telemetry.ts` append-only JSON logs
- Types added to `types.ts`
- Config added to `config.ts`

### Testing Strategy
- Unit tests for each new module in `tests/`
- Integration tests in plugin harness
- Golden tests for routing decisions
