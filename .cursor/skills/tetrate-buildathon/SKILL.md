---
name: tetrate-buildathon
description: Guides development for Tetrate AI Buildathon projects using TARS. Use when building AI features, integrating with Tetrate Agent Router Service, implementing MCP, or working on ProofLoad AI or similar buildathon submissions.
---

# Tetrate AI Buildathon

## Overview

Tetrate AI Buildathon (v1.0 Feb 16–17, 2026) is an async-friendly event where builders create AI-powered projects using **Tetrate Agent Router Service (TARS)** — an OpenAI-compatible AI router providing one API for GPT, Claude, Gemini, and more.

- **TARS**: https://router.tetrate.ai (sign-in, API keys)
- **Base URL**: https://api.router.tetrate.ai/v1
- **Learn**: https://tetrate.ai/buildathon/learn
- **Community**: [Discord](https://discord.gg/rjQ8pEwtzh)

## Core Architecture Principle

**AI providers must never be called directly from the browser.**

Required pattern: Frontend → Server Runtime → TARS → Response

Server runtime may be: Express/Fastify, Supabase Edge Functions, Cloud Functions, Fly.io, etc.

## TARS Endpoints

| Endpoint | Use Case |
|----------|----------|
| POST /chat/completions | Text generation, extraction, reasoning, vision, structured outputs |
| POST /embeddings | Semantic search, RAG, similarity matching |

All requests use standard OpenAI request format. API key in `Authorization: Bearer <key>`.

## Security Requirements

- Store API key in server-only env (e.g. `TETRATE_API_KEY`)
- Never expose keys in frontend; never commit to source control
- Validate all payloads server-side; enforce token limits; add timeouts/retries
- Rate-limit public endpoints

## Streaming (for chat UIs)

- Set `stream: true` in request
- Server: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Forward chunks immediately; avoid buffering full response

## MCP (Model Context Protocol)

TARS supports MCP catalog and custom MCP endpoints. For MCP architecture and integration patterns, see [Tetrate Learning Center](https://tetrate.io/learn/ai/mcp/architecture) and related MCP guides.

## Project: ProofLoad AI

This project (ProofLoad AI) uses TARS for visual load verification:

- **Role**: Compare expected vs. actual load images; flag missing/extra items
- **Model**: GPT-4o Vision via TARS
- **Endpoint**: POST /api/verify with multipart form (expectedImage, actualImage)
- **Output**: JSON with status, missing_items, extra_items, summary, confidence

See project root `AGENT.md` for full integration standards and `docs/AI_VERIFICATION_AGENT.md` for agent spec.

## Cost & Reliability

- Default to smaller models for POC; escalate only when needed
- Limit max_tokens; monitor usage
- Apply temperature conservatively for deterministic behavior
- Prefer structured JSON outputs; validate responses
