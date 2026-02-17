# AGENTS.md

## Purpose

This document defines secure, production-ready patterns for integrating with the Tetrate Agent Router Service (TARS) — an OpenAI-compatible AI router.

Base URL: https://api.router.tetrate.ai/v1
API Key generation: https://router.tetrate.ai/api-keys

It applies to deployments on:
- Supabase
- Fly.io
- AWS / GCP / Azure
- Vercel / Netlify server functions
- Self-hosted infrastructure

The goal is to ensure:

- Secure API key handling
- Server-side AI access only
- Reliable streaming support
- IPv6/IPv4 compatibility
- Scalable retrieval (RAG) architecture
- Cost-aware model usage

---

# 1. Core Architecture Principle

AI providers must never be called directly from the browser.

Required pattern:

Frontend → Server Runtime → AI Provider → Response

Never:

Frontend → AI Provider directly

The server runtime may be:

- Supabase Edge Functions
- Cloud Functions (AWS Lambda, GCP Functions, Azure Functions)
- Fly.io service
- Express / Fastify server
- Any secure backend runtime

All AI calls must originate from trusted server infrastructure.

---

# 2. Security Requirements

## API Keys

- Store API keys in server-only environment variables.
- Never expose API keys in frontend code.
- Never commit keys to source control.
- Never log Authorization headers.
- Never return secrets in API responses.

## Input Validation

- Validate all incoming payloads server-side.
- Enforce maximum token limits.
- Apply request size limits.
- Add timeouts and retries.
- Rate-limit public endpoints.

## Observability

- Log metadata only (model, latency, token usage).
- Do not log full prompts in production unless required and encrypted.

---

# 3. Required AI Endpoints

TARS exposes two OpenAI-compatible endpoints:

## 1. Chat Completions
Used for:
- Text generation
- Extraction
- Reasoning
- Structured outputs

Endpoint:
POST /chat/completions

## 2. Embeddings
Used for:
- Semantic search
- Retrieval-Augmented Generation (RAG)
- Similarity matching

Endpoint:
POST /embeddings

All requests use standard OpenAI request formats.

---

# 4. Streaming Architecture

## When to Use Streaming

Use streaming when:

- Building chat interfaces
- Generating long responses
- Providing live token updates

## Standard Streaming Pattern

Browser
→ Server Endpoint
→ TARS (stream=true)
→ Pipe response stream
→ Return SSE to browser

Server must:

- Set Content-Type: text/event-stream
- Set Cache-Control: no-cache
- Set Connection: keep-alive
- Avoid buffering entire response
- Forward streaming chunks immediately

Browser must:

- Read ReadableStream
- Parse SSE lines
- Extract delta tokens

---

# 5. IPv6 / IPv4 Compatibility (Relay Pattern)

## Problem

Some edge runtimes use IPv6 egress.
Some upstream providers behind TARS may require IPv4.
Direct calls from edge runtimes may fail.

## Solution: Relay Service

Browser
→ Edge Function
→ IPv4 Relay Service
→ TARS
→ Stream back
→ Browser

Relay responsibilities:

- Inject API key
- Validate shared secret
- Forward streaming body
- Pipe chunks without buffering
- Never log secrets

Relay can be hosted on:

- Fly.io
- Cloud VM
- Container service
- Any IPv4-capable host

Remove relay if end-to-end IPv6 compatibility is confirmed.

---

# 6. Embeddings & Vector Database Standards

Use embeddings when:

- Implementing RAG
- Searching user documents
- Similarity comparison
- Recommendation systems

Do NOT use embeddings for:

- Exact ID lookups
- Small datasets easily filtered in SQL

## Postgres + pgvector Example

Enable extension:

create extension if not exists vector;

Example table:

create table documents (
  id bigserial primary key,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

Index:

create index documents_embedding_idx
on documents
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

Ensure vector dimension matches embedding model.

---

# 7. Prompting & Reliability Standards

- Use clear system instructions.
- Keep prompts concise but specific.
- Retrieve only relevant context.
- Chunk long documents (300–800 tokens).
- Prefer structured JSON outputs for automation.
- Validate structured outputs.
- Apply temperature conservatively for deterministic behavior.

---

# 8. Cost Controls

- Default to smaller models for POC.
- Escalate to larger models only when necessary.
- Limit max tokens.
- Monitor token usage.
- Cache deterministic responses when possible.

---

# 9. Centralization Requirement

All AI communication must be centralized in a dedicated server module.

Example endpoints:

- POST /chat
- POST /embeddings
- POST /stream

Benefits:

- Easier auditing
- Easier cost monitoring
- Consistent retry logic
- Easier provider migration

---

# 10. Removal Conditions

You may simplify architecture if:

- Runtime supports required IP egress
- Streaming works without relay
- Provider offers full IPv6 compatibility

Security requirements remain unchanged.

---

# Summary

This AGENTS.md enforces:

- Server-only AI access
- Secure secret handling
- Reliable streaming
- IPv4/IPv6 compatibility options
- Scalable retrieval architecture
- Cost-aware model governance

These standards apply across all infrastructure providers and hosting platforms.