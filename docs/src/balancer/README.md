# Provider Router

This directory contains the provider routing and quota management system.

## Components

- `index.ts` - Main provider router with selection strategies
- `tracker.ts` - Usage tracking per provider
- `fallback.ts` - Circuit breaker and retry logic

## Strategies

1. **priority** - Try providers in priority order
2. **weighted_random** - Random selection weighted by remaining quota
3. **round_robin** - Even distribution
4. **fastest** - Use provider with best response time

## Implementation Status

Not implemented yet. See PLAN.md Phase 3.
