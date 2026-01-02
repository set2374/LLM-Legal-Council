import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  AI: Ai;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  API_TOKEN: string;  // Cloudflare secret for authentication
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for Orchestrator access
app.use('*', cors());

/**
 * Authentication middleware
 * Requires Bearer token matching API_TOKEN secret
 */
function requireAuth(c: any): Response | null {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }
  
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Invalid Authorization format. Use: Bearer <token>' }, 401);
  }
  
  if (!c.env.API_TOKEN) {
    // If no API_TOKEN configured, reject all requests (fail closed)
    console.error('API_TOKEN secret not configured');
    return c.json({ error: 'Server authentication not configured' }, 500);
  }
  
  if (token !== c.env.API_TOKEN) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  
  return null;  // Auth passed
}

/**
 * Health check endpoint (unauthenticated)
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * INGEST ENDPOINT
 * Receives text, splits it, embeds it, and stores it.
 * Payload: { filename: string, content: string, projectId?: string }
 */
app.post('/ingest', async (c) => {
  // Require authentication
  const authError = requireAuth(c);
  if (authError) return authError;

  try {
    const { filename, content, projectId } = await c.req.json();
    
    if (!filename || !content) {
      return c.json({ error: 'Missing required fields: filename, content' }, 400);
    }
    
    const docId = crypto.randomUUID();

    // 1. Chunk the text (Naive splitting for now, ~1000 chars)
    // In production, use a smarter splitter that respects sentences/paragraphs
    const chunkSize = 1000;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // 2. Insert Document Record
    await c.env.DB.prepare(
      'INSERT INTO documents (id, filename, uploaded_at, total_tokens, project_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(docId, filename, Date.now(), chunks.length * 200, projectId || null).run();

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
      const embedding = data[0];

      // Prepare Vector Record
      vectors.push({
        id: chunkId,
        values: embedding,
        metadata: { docId, filename, chunkIndex: i, projectId: projectId || '' }
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
  } catch (error) {
    console.error('Ingest error:', error);
    return c.json({ 
      error: 'Failed to ingest document',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * SEARCH ENDPOINT
 * Council Members call this to find relevant text.
 * Payload: { query: string, topK?: number, projectId?: string }
 */
app.post('/search', async (c) => {
  // Require authentication
  const authError = requireAuth(c);
  if (authError) return authError;

  try {
    const { query, topK = 5, projectId } = await c.req.json();
    
    if (!query) {
      return c.json({ error: 'Missing required field: query' }, 400);
    }

    // 1. Embed the Question
    const { data } = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    });
    const queryVector = data[0];

    // 2. Search Vector Database
    const vectorQuery: any = {
      topK: topK,
      returnMetadata: true
    };
    
    // Filter by project if specified
    if (projectId) {
      vectorQuery.filter = { projectId };
    }
    
    const matches = await c.env.VECTORIZE.query(queryVector, vectorQuery);

    if (!matches.matches || matches.matches.length === 0) {
      return c.json({ query, results: [] });
    }

    // 3. Build score map from vector search results (P0.1 fix)
    const scoreById = new Map<string, number>(
      matches.matches.map(m => [m.id, m.score ?? 0])
    );

    // 4. Retrieve Text Content from D1
    const chunkIds = matches.matches.map(m => m.id);
    const placeholders = chunkIds.map(() => '?').join(',');
    
    // Include c.id in SELECT (P0.1 fix)
    const { results } = await c.env.DB.prepare(
      `SELECT c.id, c.content, d.filename, c.chunk_index, c.page_number 
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.id IN (${placeholders})`
    ).bind(...chunkIds).all();

    // 5. Format for the Council with correct relevance scores (P0.1 fix)
    const formattedResults = results.map((row: any) => ({
      id: row.id,
      text: row.content,
      source: row.filename,
      chunkIndex: row.chunk_index,
      pageNumber: row.page_number,
      relevance: scoreById.get(row.id) ?? 0
    })).sort((a, b) => b.relevance - a.relevance);  // Sort by relevance descending

    return c.json({ 
      query, 
      results: formattedResults 
    });
  } catch (error) {
    console.error('Search error:', error);
    return c.json({ 
      error: 'Failed to search documents',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * DELETE DOCUMENT ENDPOINT
 * Remove a document and its chunks
 */
app.delete('/document/:docId', async (c) => {
  // Require authentication
  const authError = requireAuth(c);
  if (authError) return authError;

  try {
    const docId = c.req.param('docId');
    
    if (!docId) {
      return c.json({ error: 'Missing document ID' }, 400);
    }

    // Get chunk IDs for vector deletion
    const { results: chunks } = await c.env.DB.prepare(
      'SELECT id FROM chunks WHERE document_id = ?'
    ).bind(docId).all();

    // Delete from Vectorize
    if (chunks.length > 0) {
      const chunkIds = chunks.map((c: any) => c.id);
      await c.env.VECTORIZE.deleteByIds(chunkIds);
    }

    // Delete from D1 (chunks first due to foreign key)
    await c.env.DB.prepare('DELETE FROM chunks WHERE document_id = ?').bind(docId).run();
    await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run();

    return c.json({ 
      success: true, 
      message: `Deleted document ${docId} and ${chunks.length} chunks` 
    });
  } catch (error) {
    console.error('Delete error:', error);
    return c.json({ 
      error: 'Failed to delete document',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * LIST DOCUMENTS ENDPOINT
 * Get all indexed documents
 */
app.get('/documents', async (c) => {
  // Require authentication
  const authError = requireAuth(c);
  if (authError) return authError;

  try {
    const projectId = c.req.query('projectId');
    
    let query = 'SELECT id, filename, uploaded_at, total_tokens, project_id FROM documents';
    const params: string[] = [];
    
    if (projectId) {
      query += ' WHERE project_id = ?';
      params.push(projectId);
    }
    
    query += ' ORDER BY uploaded_at DESC';
    
    const stmt = c.env.DB.prepare(query);
    const { results } = params.length > 0 
      ? await stmt.bind(...params).all()
      : await stmt.all();

    return c.json({ documents: results });
  } catch (error) {
    console.error('List documents error:', error);
    return c.json({ 
      error: 'Failed to list documents',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
