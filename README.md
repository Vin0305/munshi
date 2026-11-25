# 🪔 Munshi: the voice order desk for Diwali home businesses

**Festive Hacks × WeAreDevelopers India, built with Sarvam AI, Flagsmith and NudgeBee.**

## The problem
Hyderabad home bakers and small sweet shops take hundreds of Diwali orders as **code-mixed WhatsApp voice notes**
("Anna, rendu kilo kaju katli kavali, Saturday ko Kukatpally deliver karo"). Nobody totals them against what the
kitchen can actually make, so shops **overbook and cancel on Diwali eve**.

## What Munshi does
1. **Hears** voice notes in Telugu / Hindi / Dakhni / English, code-mixed → **Sarvam Saaras** (`codemix` mode).
2. **Understands** them into a structured order (items, kg, a date like "Saturday", area, language) → **Sarvam-105B**.
3. **Checks kitchen capacity** per sweet per day. Menu, prices, capacity and cut-off date live in **Flagsmith remote config**, so the owner changes them live with no redeploy.
4. **Replies in the customer's language**: text from **Sarvam-105B** (fallback **Sarvam Translate**), voice from **Bulbul v3**.
5. **Survives the Diwali-eve rush**: when voice replies fail (Sarvam TTS 429s), the worker in Kubernetes alerts **NudgeBee** →
   a human **approves** → NudgeBee's HTTP task flips Flagsmith's `voice_replies` off → small orders get text replies, while
   **bulk customers (≥ 5 kg) keep voice** through a Flagsmith segment override. NudgeBee's AI SRE investigates the
   crashing worker, using **Sarvam-105B** as its LLM.

## How each sponsor is used
| Sponsor | Usage |
|---|---|
| **Sarvam AI** | Saaras v3 codemix speech-to-text · Sarvam-105B order extraction and replies · Sarvam Translate fallback · Bulbul v3 voice · the LLM behind NudgeBee's investigations |
| **Flagsmith** | Remote config (`menu` with prices and capacity, `order_cutoff`, `llm_model`) · A/B test `reply_mode` voice vs text (50/50 per customer) · segment `bulk_customers` (`order_kg ≥ 5`) with overrides · kill switches `sarvam_live`, `voice_replies` · Admin API called by NudgeBee |
| **NudgeBee** | Agent in a kind cluster · Automation: Webhook → **Approval** → HTTP PATCH to Flagsmith · AI SRE root cause, with Sarvam-105B as a custom OpenAI-compatible provider |

## Architecture
```
Customer voice/text → Next.js → Sarvam Saaras → Sarvam-105B → capacity check (Neon Postgres) → reply (105B / Translate / Bulbul)
                          └──── Flagsmith: menu, capacity, A/B test, segments, kill switches

kind cluster: voice worker ──429s──▶ NudgeBee webhook → Approval → HTTP PATCH Flagsmith voice_replies = off
NudgeBee agent ──▶ AI SRE investigation (LLM: Sarvam-105B)
```
The Diwali rush is **simulated inside the worker** (`RUSH=true`) so the demo doesn't burn Sarvam credits.

## Setup
**Needs:** Node 22+, a Sarvam API key, a Flagsmith cloud project, and a Neon Postgres database. For the rush demo: kind, kubectl, helm and a NudgeBee account.

1. `git clone https://github.com/Vin0305/munshi && cd munshi && npm install`
2. `cp .env.example .env.local` and fill in `SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY` (server-side `ser.` key), `FLAGSMITH_ENV_KEY`, `FLAGSMITH_ADMIN_API_KEY` and `DATABASE_URL`.
3. Create these Flagsmith features (server-side only):
   - `sarvam_live`: off. When off, voice notes use a mock transcript.
   - `voice_replies`: on. Segment override `bulk_customers` = on.
   - `reply_mode`: `voice`, with variation `text` at 50%. Segment override `bulk_customers` = `voice`.
   - `menu`: JSON `{"items":[{"id":"kaju_katli","name":"Kaju Katli","price_per_kg":1100,"capacity_kg_per_day":25,"enabled":true}]}`
   - `order_cutoff`: `2026-11-28`
   - `llm_model`: `sarvam-105b`
   - Segment `bulk_customers`: trait `order_kg` ≥ 5.
4. `npm run dev`. Customer chat is at http://localhost:3000 and the owner desk at /owner.

### Rush demo
1. `kind create cluster --name munshi`, then connect it in NudgeBee (Kubernetes account → run the helm command it gives you).
2. NudgeBee LLM provider → custom: `https://api.sarvam.ai/v1`, model `sarvam-105b`.
3. NudgeBee automation: Webhook trigger (filter `{{ webhook_payload.alert == "VoiceReplyErrorRate" }}`) → Approval → HTTP
   `PATCH https://api.flagsmith.com/api/__future__/environments/<ENV_KEY>/features/<voice_replies_id>/`,
   headers `{"Authorization":"Api-Key <ADMIN_KEY>","Content-Type":"application/json"}`, body `{"environment_default":{"enabled":false}}`.
4. Deploy and run:
```bash
kubectl apply -f k8s/voice-worker.yml
kubectl create secret generic voice-worker-secrets -n munshi --from-literal=NB_WEBHOOK_URL="<nudgebee workflow webhook url>"
kubectl rollout restart deploy/munshi-voice-worker -n munshi
kubectl set env deploy/munshi-voice-worker -n munshi RUSH=true    # start the rush
kubectl set env deploy/munshi-voice-worker -n munshi RUSH=false   # recover
```

## AI assistance disclosure
Built with help from an AI assistant (Claude) for brainstorming, scaffolding and code generation, as the hackathon rules allow. I've reviewed and understand all the submitted code.

## Built by
Vinayasree ([@Vin0305](https://github.com/Vin0305)), solo.