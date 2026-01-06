# Phase 14: GraphRAG - Neo4j Integration

> **Goal:** Add knowledge graph capabilities with Neo4j for entity extraction, relationship mapping, and graph-enhanced retrieval.

---

## Prerequisites

- Phase 13 completed (observability)
- Neo4j installed locally or via Docker

---

## Implementation Steps

### Step 1: Install Neo4j Driver

**1.1 Add dependencies:**

```bash
pnpm add neo4j-driver
```

**1.2 Add environment variables:**

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

### Step 2: Create Graph Package

**2.1 Create `packages/graph/package.json`:**

```json
{
  "name": "@insight-os/graph",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "neo4j-driver": "^5.27.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "zod": "^3.24.1"
  }
}
```

**2.2 Create `packages/graph/src/client.ts`:**

```typescript
import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password'),
    );
  }
  return driver;
}

export function getSession(): Session {
  return getDriver().session();
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    const session = getSession();
    await session.run('RETURN 1');
    await session.close();
    return true;
  } catch {
    return false;
  }
}
```

**2.3 Create `packages/graph/src/extraction.ts`:**

```typescript
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getSession } from './client.js';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EntitySchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['Company', 'Person', 'Product', 'Technology', 'Market', 'Location', 'Event']),
      properties: z.record(z.string()).optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      type: z.string(),
      properties: z.record(z.string()).optional(),
    }),
  ),
});

export type ExtractedGraph = z.infer<typeof EntitySchema>;

/**
 * Extract entities and relationships from text
 */
export async function extractEntities(text: string): Promise<ExtractedGraph> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: EntitySchema,
    prompt: `Extract entities and relationships from this text.

Entity types: Company, Person, Product, Technology, Market, Location, Event
Relationship types: WORKS_FOR, COMPETES_WITH, PRODUCES, USES, LOCATED_IN, FOUNDED, INVESTED_IN, PARTNERS_WITH

Text:
${text.slice(0, 4000)}

Extract all relevant entities and their relationships.`,
    temperature: 0.1,
  });

  return object;
}

/**
 * Store extracted graph in Neo4j
 */
export async function storeGraph(
  graph: ExtractedGraph,
  sourceId: string,
): Promise<{ nodesCreated: number; relationshipsCreated: number }> {
  const session = getSession();

  try {
    let nodesCreated = 0;
    let relationshipsCreated = 0;

    // Create entities
    for (const entity of graph.entities) {
      const result = await session.run(
        `MERGE (e:${entity.type} {name: $name})
         ON CREATE SET e += $properties, e.sourceId = $sourceId, e.createdAt = datetime()
         ON MATCH SET e += $properties
         RETURN e`,
        {
          name: entity.name,
          properties: entity.properties || {},
          sourceId,
        },
      );
      if (result.summary.counters.updates().nodesCreated > 0) {
        nodesCreated++;
      }
    }

    // Create relationships
    for (const rel of graph.relationships) {
      const result = await session.run(
        `MATCH (s {name: $source}), (t {name: $target})
         MERGE (s)-[r:${rel.type}]->(t)
         ON CREATE SET r += $properties, r.sourceId = $sourceId
         RETURN r`,
        {
          source: rel.source,
          target: rel.target,
          properties: rel.properties || {},
          sourceId,
        },
      );
      if (result.summary.counters.updates().relationshipsCreated > 0) {
        relationshipsCreated++;
      }
    }

    return { nodesCreated, relationshipsCreated };
  } finally {
    await session.close();
  }
}
```

**2.4 Create `packages/graph/src/retrieval.ts`:**

```typescript
import { getSession } from './client.js';

export interface GraphNode {
  name: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphRelationship {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphContext {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

/**
 * Get related entities for a query
 */
export async function getRelatedEntities(
  entityName: string,
  depth: number = 2,
): Promise<GraphContext> {
  const session = getSession();

  try {
    const result = await session.run(
      `MATCH path = (e {name: $name})-[*1..${depth}]-(related)
       RETURN e, relationships(path) as rels, nodes(path) as nodes
       LIMIT 50`,
      { name: entityName },
    );

    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];
    const seenNodes = new Set<string>();
    const seenRels = new Set<string>();

    for (const record of result.records) {
      const pathNodes = record.get('nodes');
      const pathRels = record.get('rels');

      for (const node of pathNodes) {
        const name = node.properties.name;
        if (!seenNodes.has(name)) {
          seenNodes.add(name);
          nodes.push({
            name,
            type: node.labels[0],
            properties: node.properties,
          });
        }
      }

      for (const rel of pathRels) {
        const relId = `${rel.start}-${rel.type}-${rel.end}`;
        if (!seenRels.has(relId)) {
          seenRels.add(relId);
          relationships.push({
            source: rel.startNodeElementId,
            target: rel.endNodeElementId,
            type: rel.type,
            properties: rel.properties,
          });
        }
      }
    }

    return { nodes, relationships };
  } finally {
    await session.close();
  }
}

/**
 * Search graph with natural language
 */
export async function searchGraph(query: string): Promise<GraphContext> {
  const session = getSession();

  try {
    // Full-text search on node names
    const result = await session.run(
      `CALL db.index.fulltext.queryNodes("entityNames", $query)
       YIELD node, score
       WHERE score > 0.5
       WITH node
       MATCH (node)-[r]-(related)
       RETURN node, collect(distinct r) as rels, collect(distinct related) as related
       LIMIT 20`,
      { query },
    );

    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];

    for (const record of result.records) {
      const node = record.get('node');
      nodes.push({
        name: node.properties.name,
        type: node.labels[0],
        properties: node.properties,
      });

      for (const rel of record.get('rels')) {
        relationships.push({
          source: rel.startNodeElementId,
          target: rel.endNodeElementId,
          type: rel.type,
          properties: rel.properties,
        });
      }

      for (const related of record.get('related')) {
        nodes.push({
          name: related.properties.name,
          type: related.labels[0],
          properties: related.properties,
        });
      }
    }

    return { nodes, relationships };
  } finally {
    await session.close();
  }
}

/**
 * GraphRAG retrieval - combine vector search with graph context
 */
export async function graphRAGRetrieve(
  query: string,
  vectorResults: Array<{ content: string; entities?: string[] }>,
): Promise<{
  vectorContext: string;
  graphContext: string;
  combined: string;
}> {
  // Extract entities from vector results
  const entities = new Set<string>();
  for (const result of vectorResults) {
    if (result.entities) {
      result.entities.forEach((e) => entities.add(e));
    }
  }

  // Get graph context for mentioned entities
  let graphContext = '';
  for (const entity of Array.from(entities).slice(0, 5)) {
    const related = await getRelatedEntities(entity, 1);
    if (related.nodes.length > 0) {
      graphContext += `\n${entity} relationships:\n`;
      for (const rel of related.relationships) {
        graphContext += `- ${rel.type}: connected to other entities\n`;
      }
    }
  }

  const vectorContext = vectorResults.map((r) => r.content).join('\n\n');

  return {
    vectorContext,
    graphContext,
    combined: `Document Context:\n${vectorContext}\n\nKnowledge Graph:\n${graphContext}`,
  };
}
```

**2.5 Create `packages/graph/src/index.ts`:**

```typescript
export * from './client.js';
export * from './extraction.js';
export * from './retrieval.js';
```

### Step 3: Add Graph API Routes

**3.1 Create `apps/api/src/routes/graph.ts`:**

```typescript
import { Hono } from 'hono';
import {
  checkConnection,
  extractEntities,
  storeGraph,
  getRelatedEntities,
  searchGraph,
} from '@insight-os/graph';
import { createResponse, createErrorResponse } from '@insight-os/shared';

export const graphRoutes = new Hono();

graphRoutes.get('/health', async (c) => {
  const connected = await checkConnection();
  return c.json(createResponse({ connected }));
});

graphRoutes.post('/extract', async (c) => {
  try {
    const { text, sourceId } = await c.req.json<{
      text: string;
      sourceId?: string;
    }>();

    const graph = await extractEntities(text);

    if (sourceId) {
      const stats = await storeGraph(graph, sourceId);
      return c.json(createResponse({ ...graph, stored: stats }));
    }

    return c.json(createResponse(graph));
  } catch (error) {
    return c.json(createErrorResponse('Extraction failed'), 500);
  }
});

graphRoutes.get('/entity/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const depth = parseInt(c.req.query('depth') || '2');

    const context = await getRelatedEntities(name, depth);
    return c.json(createResponse(context));
  } catch (error) {
    return c.json(createErrorResponse('Query failed'), 500);
  }
});

graphRoutes.post('/search', async (c) => {
  try {
    const { query } = await c.req.json<{ query: string }>();
    const results = await searchGraph(query);
    return c.json(createResponse(results));
  } catch (error) {
    return c.json(createErrorResponse('Search failed'), 500);
  }
});
```

---

## Neo4j Setup

```cypher
// Create indexes
CREATE INDEX entity_name IF NOT EXISTS FOR (n:Company) ON (n.name);
CREATE INDEX entity_name IF NOT EXISTS FOR (n:Person) ON (n.name);
CREATE INDEX entity_name IF NOT EXISTS FOR (n:Product) ON (n.name);

// Create full-text search index
CREATE FULLTEXT INDEX entityNames IF NOT EXISTS
FOR (n:Company|Person|Product|Technology) ON EACH [n.name];
```

---

## Demo Checklist

- [ ] Extract entities from text
- [ ] Store graph in Neo4j
- [ ] Query related entities
- [ ] Search graph with natural language
- [ ] GraphRAG combines vector + graph

---

## What's Next

**Phase 15: Multi-Agent Swarm** will add:

- Agent handoffs
- Swarm orchestration
- Multi-agent collaboration
