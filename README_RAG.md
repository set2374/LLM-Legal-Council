# RAG & Tools Implementation Guide

This document explains how to deploy and use the new "Legal Librarian" (RAG) and Agent Tools.

## 1. Architecture Overview

- **Module A (The Library)**: A Cloudflare Worker (`legal-knowledge-worker`) that stores your documents.
- **Module B (The Tools)**: Client-side code that allows the Council Members to search the library and the web.

## 2. Deployment Instructions (REQUIRED)

You must deploy the Cloudflare Worker for file reading to work.

### Step 1: Configure Cloudflare
Open a terminal in the sandbox and run:

```bash
cd legal-knowledge-worker

# 1. Create the Database
npx wrangler d1 create legal-knowledge-db

# 2. Create the Search Index
npx wrangler vectorize create legal-index --dimensions=768 --metric=cosine
```

**CRITICAL:** Copy the `database_id` and `index_id` output by these commands.
Edit `legal-knowledge-worker/wrangler.jsonc` and replace the placeholder values.

### Step 2: Deploy
```bash
npm run db:init
npm run deploy
```

Copy the URL of your deployed worker (e.g., `https://legal-knowledge-worker.your-subdomain.workers.dev`).

### Step 3: Configure the Client
Set the environment variable in your main project's `.env` file:
```
LEGAL_KNOWLEDGE_WORKER_URL=https://your-worker-url
```

## 3. How to Ingest Documents

To add files to the library, you must POST them to your worker.
We have not built a UI for this yet, but you can use this curl command:

```bash
curl -X POST https://your-worker-url/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "Complaint.pdf",
    "content": "PASTE_EXTRACTED_TEXT_HERE..."
  }'
```

*(Note: In a future update, we can add a script to automatically read PDFs from a folder and upload them.)*

## 4. How It Works

When you run a query like:
> "Evaluate the statute of limitations defense."

1. The Council Member (e.g., Claude) will pause.
2. It will call the `read_project_file` tool.
3. Your Cloudflare Worker will find the relevant paragraphs.
4. The Council Member will read them and incorporate the facts into its answer.
