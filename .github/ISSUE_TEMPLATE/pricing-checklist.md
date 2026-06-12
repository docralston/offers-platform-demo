---
name: LLM pricing table check
about: Quarterly reminder to refresh estimated costs in openai-pricing.ts
title: "[ops] Refresh LLM pricing table"
labels: maintenance
---

## Vendor pricing pages

- [ ] [OpenAI pricing](https://platform.openai.com/docs/pricing)
- [ ] [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)

## Code updates

- [ ] Update `MODEL_PRICING_PER_1K` in `lib/openai-pricing.ts`
- [ ] Set `PRICING_AS_OF` to today's date
- [ ] `npm run test -- openai-pricing`

## Production backfill

- [ ] `npm run backfill:openai-costs -- --all` against prod DB
- [ ] Spot-check `/admin/ai-usage` totals and unpriced-model banner
