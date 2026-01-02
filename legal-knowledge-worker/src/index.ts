import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  AI: Ai;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for Orchestrator access
app.use('*', cors());

/**
 * INGEST ENDPOINT
 * Receives text, splits it, embeds it, and stores it.
 * Payload: { filename: string, content: string }
 */
app.post('/ingest', async (c) => {
  const { filename, content } = await c.req.json();
  const docId = crypto.randomUUID();

  // 1. Chunk the text (Naive splitting for now, ~500 chars)
  // In production, use a smarter splitter that respects sentences/paragraphs
  const chunkSize = 1000;
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  // 2. Insert Document Record
  await c.env.DB.prepare(
    'INSERT INTO documents (id, filename, uploaded_at, total_tokens) VALUES (?, ?, ?, ?)'
  ).bind(docId, filename, Date.now(), chunks.length * 200).run(); // Rough token est

  // 3. Process Chunks (Embed + Store)
  const vectors: VectorizeVector[] = [];
  const dbStmts = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const chunkId = crypto.randomUUID();

    // Generate Embedding
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [chunkText]
    });
    const embedding = data[0]; // Output is array of arrays

    // Prepare Vector Record
    vectors.push({
      id: chunkId,
      values: embedding,
      metadata: { docId, filename, chunkIndex: i }
    });

    // Prepare DB Record (Content)
    dbStmts.push(
      c.env.DB.prepare(
        'INSERT INTO chunks (id, document_id, content, chunk_index) VALUES (?, ?, ?, ?)'
      ).bind(chunkId, docId, chunkText, i)
    );
  }

  // Batch Insert into Vectorize and D1
  await c.env.VECTORIZE.upsert(vectors);
  await c.env.DB.batch(dbStmts);

  return c.json({ 
    success: true, 
    docId, 
    chunksProcessed: chunks.length,
    message: `Indexed ${filename} successfully` 
  });
});

/**
 * QUERY ENDPOINT
 * Council Members call this to find relevant text.
 * Payload: { query: string, topK: number }
 */
app.post('/search', async (c) => {
  const { query, topK = 5 } = await c.req.json();

  // 1. Embed the Question
  const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query]
  });
  const queryVector = data[0];

  // 2. Search Vector Database
  const matches = await c.env.VECTORIZE.query(queryVector, {
    topK: topK,
    returnMetadata: true
  });

  if (!matches.matches || matches.matches.length === 0) {
    return c.json({ results: [] });
  }

  // 3. Retrieve Text Content from D1
  // We have the chunk IDs from Vectorize, now get the text from SQL
  const chunkIds = matches.matches.map(m => m.id);
  const placeholders = chunkIds.map(() => '?').join(',');
  
  const { results } = await c.env.DB.prepare(
    `SELECT c.content, d.filename, c.chunk_index, c.page_number 
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     WHERE c.id IN (${placeholders})`
  ).bind(...chunkIds).all();

  // 4. Format for the Council
  const formattedResults = results.map((row: any) => ({
    text: row.content,
    source: row.filename,
    relevance: matches.matches.find(m => m.id === row.id)?.score || 0
  }));

  return c.json({ 
    query, 
    results: formattedResults 
  });
});

export default app;
