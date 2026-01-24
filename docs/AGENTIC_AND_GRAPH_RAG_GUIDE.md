# Agentic RAG & Graph RAG Learning Guide

A comprehensive guide to understanding and implementing advanced RAG patterns for production AI systems.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Agentic RAG](#agentic-rag)
3. [Graph RAG](#graph-rag)
4. [Comparison & When to Use](#comparison--when-to-use)
5. [Learning Roadmap](#learning-roadmap)
6. [Resources](#resources)

---

## Prerequisites

Before diving into advanced RAG patterns, ensure you understand:

- [ ] Basic RAG (Retrieval-Augmented Generation) concepts
- [ ] Vector embeddings and similarity search
- [ ] LLM fundamentals (prompting, context windows, tokens)
- [ ] Basic understanding of agents and tool use

---

## Agentic RAG

### What is Agentic RAG?

Agentic RAG gives the LLM **control over the retrieval process**. Instead of a fixed "retrieve then generate" pipeline, an agent decides:

- **When** to retrieve (maybe it already knows the answer)
- **What** to retrieve (reformulate queries, decompose into sub-queries)
- **How much** to retrieve (iterate until sufficient context is gathered)

### Core Concepts

| Concept                    | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| **Query Analysis**         | Agent analyzes the user query to understand intent and complexity |
| **Query Decomposition**    | Breaking complex queries into simpler sub-queries                 |
| **Adaptive Retrieval**     | Retrieving more context only when needed                          |
| **Self-Reflection**        | Agent evaluates if retrieved context is sufficient                |
| **Multi-Source Retrieval** | Querying multiple knowledge bases or tools                        |

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                      USER QUERY                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 AGENT (Router/Planner)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Analyze query → Decide action → Execute → Evaluate  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Vector   │  │ Web      │  │ SQL      │  │ Direct   │
    │ Store    │  │ Search   │  │ Database │  │ Answer   │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
          │              │              │              │
          └──────────────┴──────────────┴──────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Synthesize &   │
                    │  Generate Answer│
                    └─────────────────┘
```

### Example Scenarios

#### Scenario 1: Simple Query (No Retrieval Needed)

```
User: "What is the capital of France?"
Agent: [Decides] No retrieval needed, I know this.
Agent: [Responds] "Paris"
```

#### Scenario 2: Query Decomposition

```
User: "Compare our Q3 and Q4 sales performance and explain the difference"
Agent: [Analyzes] This needs two separate retrievals
Agent: [Query 1] Retrieve Q3 sales data
Agent: [Query 2] Retrieve Q4 sales data
Agent: [Synthesize] Compare and explain differences
```

#### Scenario 3: Iterative Retrieval

```
User: "What caused the outage last week?"
Agent: [Retrieve] Search for "outage last week"
Agent: [Evaluate] Found incident, but need root cause
Agent: [Retrieve] Search for specific incident ID + post-mortem
Agent: [Evaluate] Now have enough context
Agent: [Respond] Explain root cause with details
```

#### Scenario 4: Multi-Source Query

```
User: "How does our pricing compare to competitors?"
Agent: [Analyze] Need internal docs + external data
Agent: [Retrieve] Internal pricing from vector store
Agent: [Tool] Web search for competitor pricing
Agent: [Synthesize] Generate comparison table
```

### Key Patterns in Agentic RAG

1. **Routing Pattern**: Route queries to appropriate retrieval tools
2. **Query Transformation**: Rewrite queries for better retrieval
3. **Self-Correction**: Detect and fix retrieval failures
4. **Iterative Refinement**: Keep retrieving until answer is complete

### When to Use Agentic RAG

✅ **Good Fit:**

- Complex queries requiring multiple information sources
- Queries that need decomposition into sub-queries
- When retrieval quality varies and needs self-correction
- Multi-modal retrieval (documents, databases, APIs)

❌ **Not Ideal:**

- Simple factual lookups
- Latency-critical applications (multiple iterations = slower)
- When you need deterministic, reproducible results

---

## Graph RAG

### What is Graph RAG?

Graph RAG uses a **knowledge graph** as the retrieval mechanism instead of (or alongside) vector search. It:

- Extracts entities and relationships from documents
- Builds a graph structure representing knowledge
- Uses graph traversal for contextually richer retrieval

### Core Concepts

| Concept                     | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| **Entity Extraction**       | Identify key entities (people, places, concepts) from documents  |
| **Relationship Extraction** | Identify connections between entities                            |
| **Knowledge Graph**         | Graph database storing entities as nodes, relationships as edges |
| **Community Detection**     | Grouping related entities into clusters                          |
| **Graph Traversal**         | Following relationships to find connected context                |
| **Subgraph Retrieval**      | Extracting relevant portions of the graph for context            |

### Architecture Pattern

```
┌────────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION                           │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                 ENTITY & RELATION EXTRACTION                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ "John Smith" │────│ "works_at"   │────│ "Acme Corp"  │      │
│  │   (Person)   │    │ (Relation)   │    │  (Company)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE GRAPH                             │
│                                                                 │
│      [John Smith]──works_at──▶[Acme Corp]                      │
│           │                        │                            │
│       manages                   located_in                      │
│           ▼                        ▼                            │
│      [Project X]              [New York]                        │
│           │                        │                            │
│       uses_tech                 has_office                      │
│           ▼                        ▼                            │
│      [Python]                 [Building A]                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      QUERY PROCESSING                           │
│                                                                 │
│  User: "Who manages Python projects at NYC offices?"           │
│                              │                                  │
│                              ▼                                  │
│  Graph Traversal: NYC offices → Companies → People →           │
│                   Projects → Tech: Python                       │
│                              │                                  │
│                              ▼                                  │
│  Retrieved Subgraph: John Smith + Project X context            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Example Scenarios

#### Scenario 1: Relationship Query

```
User: "What products does our biggest customer use?"

Traditional RAG: Might miss connection between customer and products

Graph RAG:
  1. Find "biggest customer" entity → "Enterprise Corp"
  2. Traverse "uses" relationships
  3. Return: [Product A, Product B, Service X]
  4. Include context from each product node
```

#### Scenario 2: Multi-Hop Reasoning

```
User: "Who should I contact about the AWS infrastructure
       for the payment processing system?"

Graph Traversal:
  Payment System → uses → AWS Infrastructure
  AWS Infrastructure → owned_by → Platform Team
  Platform Team → lead_by → Sarah Chen
  Sarah Chen → contact → sarah@company.com

Answer: "Contact Sarah Chen (sarah@company.com),
        Platform Team Lead who owns AWS infrastructure"
```

#### Scenario 3: Global Summarization

```
User: "Give me an overview of our AI initiatives"

Graph RAG:
  1. Find all entities tagged "AI" or related to AI
  2. Detect communities (clusters of related AI projects)
  3. Generate summary for each community
  4. Synthesize into cohesive overview

Result: Structured summary organized by AI initiative clusters
```

#### Scenario 4: Entity Disambiguation

```
User: "What did Mercury do last quarter?"

Graph RAG:
  1. Find "Mercury" entities
  2. Disambiguate: Mercury (Planet)? Mercury (Product)? Mercury (Team)?
  3. Use context: "last quarter" → business context → Mercury Team
  4. Retrieve team's activities from connected nodes
```

### Key Patterns in Graph RAG

1. **Entity Extraction**: Use LLMs to extract entities and relationships
2. **Graph Construction**: Build and maintain knowledge graph
3. **Community Summarization**: Pre-compute summaries for entity clusters
4. **Hybrid Retrieval**: Combine graph traversal with vector search
5. **Query-to-Graph**: Transform natural language to graph queries

### When to Use Graph RAG

✅ **Good Fit:**

- Domains with rich entity relationships (legal, medical, org charts)
- "How is X related to Y?" type queries
- Need for multi-hop reasoning
- Global summarization across many documents
- Entity disambiguation is important

❌ **Not Ideal:**

- Simple keyword-based retrieval
- Documents without clear entity structures
- Real-time streaming data (graph updates are expensive)
- Small document collections

---

## Comparison & When to Use

### Feature Comparison

| Feature                 | Standard RAG      | Agentic RAG          | Graph RAG              |
| ----------------------- | ----------------- | -------------------- | ---------------------- |
| **Retrieval Method**    | Vector similarity | Agent-controlled     | Graph traversal        |
| **Query Handling**      | Direct lookup     | Iterative refinement | Relationship-aware     |
| **Multi-hop Reasoning** | Limited           | Via iteration        | Native support         |
| **Latency**             | Low               | Higher               | Medium                 |
| **Setup Complexity**    | Simple            | Medium               | High                   |
| **Best Query Type**     | Factual Q&A       | Complex research     | Relationship queries   |
| **Maintenance**         | Low               | Low                  | Higher (graph updates) |

### Decision Matrix

```
                        Query Complexity
                    Low ◀───────────────▶ High

    Simple        ┌──────────────────────────┐
    Entities      │                          │
        ▲         │  Standard RAG            │  Agentic RAG
        │         │                          │
        │         ├──────────────────────────┤
        │         │                          │
        ▼         │  Graph RAG               │  Hybrid
    Complex       │  (or Hybrid)             │  (Graph + Agentic)
    Relationships │                          │
                  └──────────────────────────┘
```

### Hybrid Approaches

In production, you often combine approaches:

**Agentic + Standard RAG:**

- Agent decides when to retrieve
- Uses vector search as the retrieval tool

**Graph + Standard RAG:**

- Use graph for entity-rich queries
- Fall back to vector search for general queries

**Graph + Agentic RAG:**

- Agent orchestrates retrieval
- Can choose between graph traversal and vector search
- Best for complex, enterprise knowledge bases

---

## Learning Roadmap

### Phase 1: Foundations (Week 1-2)

- [ ] **Standard RAG Deep Dive**
  - Implement basic RAG from scratch
  - Understand chunking strategies
  - Learn embedding models and their trade-offs
  - Practice prompt engineering for RAG

- [ ] **Vector Databases**
  - Set up Pinecone, Weaviate, or Qdrant
  - Understand indexing strategies
  - Learn about hybrid search (dense + sparse)

### Phase 2: Agentic RAG (Week 3-4)

- [ ] **Agent Fundamentals**
  - Study ReAct pattern (Reasoning + Acting)
  - Understand tool use and function calling
  - Learn about agent loops and termination

- [ ] **Agentic RAG Patterns**
  - Implement query routing
  - Build query decomposition agent
  - Add self-reflection and correction
  - Create multi-tool retrieval agent

- [ ] **Frameworks**
  - LangGraph for complex agent workflows
  - LlamaIndex for retrieval orchestration
  - Build custom agent from scratch

### Phase 3: Graph RAG (Week 5-6)

- [ ] **Knowledge Graph Fundamentals**
  - Learn graph data models (nodes, edges, properties)
  - Understand graph databases (Neo4j, Neptune)
  - Study entity extraction with LLMs

- [ ] **Graph RAG Implementation**
  - Extract entities and relationships from documents
  - Build knowledge graph from extracted data
  - Implement graph-based retrieval
  - Add community detection and summarization

- [ ] **Microsoft GraphRAG**
  - Study the reference implementation
  - Understand the indexing pipeline
  - Learn query modes (local vs global)

### Phase 4: Production Patterns (Week 7-8)

- [ ] **Evaluation**
  - Learn RAG evaluation metrics (faithfulness, relevance)
  - Build evaluation pipelines
  - A/B test different approaches

- [ ] **Optimization**
  - Reduce latency
  - Optimize retrieval quality
  - Handle edge cases and failures

- [ ] **Hybrid Systems**
  - Combine approaches based on query type
  - Build routing logic for hybrid retrieval
  - Deploy and monitor in production

---

## Resources

### Agentic RAG

| Resource                             | Type     | Link                                       |
| ------------------------------------ | -------- | ------------------------------------------ |
| LangGraph Documentation              | Docs     | https://langchain-ai.github.io/langgraph/  |
| Building Agentic RAG with LlamaIndex | Tutorial | https://www.llamaindex.ai/blog/agentic-rag |
| ReAct Paper                          | Paper    | https://arxiv.org/abs/2210.03629           |
| Corrective RAG Paper                 | Paper    | https://arxiv.org/abs/2401.15884           |
| Self-RAG Paper                       | Paper    | https://arxiv.org/abs/2310.11511           |

### Graph RAG

| Resource                     | Type     | Link                                                                         |
| ---------------------------- | -------- | ---------------------------------------------------------------------------- |
| Microsoft GraphRAG           | GitHub   | https://github.com/microsoft/graphrag                                        |
| GraphRAG Paper               | Paper    | https://arxiv.org/abs/2404.16130                                             |
| Neo4j + LLM Guide            | Tutorial | https://neo4j.com/developer/genai/                                           |
| Knowledge Graph Construction | Course   | Stanford CS520                                                               |
| LlamaIndex Knowledge Graph   | Docs     | https://docs.llamaindex.ai/en/stable/module_guides/indexing/lpg_index_guide/ |

### General

| Resource                | Type   | Link                                                   |
| ----------------------- | ------ | ------------------------------------------------------ |
| RAG Survey Paper        | Paper  | https://arxiv.org/abs/2312.10997                       |
| Advanced RAG Techniques | Blog   | https://www.pinecone.io/learn/advanced-rag-techniques/ |
| Chunking Strategies     | Blog   | https://www.pinecone.io/learn/chunking-strategies/     |
| RAGAS Evaluation        | GitHub | https://github.com/explodinggradients/ragas            |

---

## Summary

| Approach        | Key Insight                                           | Start Here                |
| --------------- | ----------------------------------------------------- | ------------------------- |
| **Agentic RAG** | Give LLM control over retrieval decisions             | LangGraph + ReAct pattern |
| **Graph RAG**   | Use knowledge graphs for relationship-aware retrieval | Microsoft GraphRAG        |

Both approaches solve limitations of standard RAG. Choose based on your:

- Query complexity
- Domain structure (entity-rich vs document-rich)
- Latency requirements
- Maintenance capacity

Start with standard RAG, add agentic capabilities for complex queries, and consider Graph RAG when relationships matter more than individual facts.
