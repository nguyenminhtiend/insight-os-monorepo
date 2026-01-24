# AI Testing Strategy: The "Dual-Pipeline" Approach

## The Core Concept

Testing AI requires two distinct pipelines because AI systems have two distinct types of failure modes:

1.  **Code Failures**: Use traditional **Unit Tests (Mocks)**.
2.  **Intelligence Failures**: Use **Evaluations (Real LLMs)**.

---

## 1. The Code Pipeline (Infrastructure)

**Goal:** Verify the _machinery_ works reliably.

- **Tool:** `vitest` / `jest`
- **Method:** **Mock EVERYTHING**. Mock the LLM, mock the database, mock the APIs.
- **What it catches:**
  - Broken tool definitions (schema mismatches).
  - Runtime errors in routing logic.
  - State management bugs (e.g., losing chat history).
  - Type errors.
- **Cost/Speed:** Free, Milliseconds.
- **Command:** `pnpm test`

## 2. The Intelligence Pipeline (Evals)

**Goal:** Verify the _brain_ makes good decisions.

- **Tool:** `promptfoo` / Custom Scripts (Refactored `evals/*.ts`)
- **Method:** **Real LLM Inference**. Send actual prompts to GPT-4o/Claude and grade the response.
- **Grading Techniques:**
  - **Model-based (LLM-as-a-Judge)**: Use a strong model (GPT-4o) to grade a cheaper model (GPT-4o-mini). _Example: "Did the agent explicitly refuse the password request?"_
  - **Heuristic**: formatting checks (JSON validity), keyword presence.
- **What it catches:**
  - Hallucinations.
  - Safety failures (Prompt Injection).
  - Bad routing decisions (selecting 'search' instead of 'billing').
  - Poor tone/style.
- **Cost/Speed:** $, Seconds/Minutes.
- **Command:** `pnpm test:evals`

---

## Summary Table

| Feature          | Unit Tests (Code)      | Evaluations (Brain)              |
| :--------------- | :--------------------- | :------------------------------- |
| **Logic Source** | Mocked (Fixed Output)  | Real LLM (Stochastic)            |
| **Focus**        | Deterministic Code     | Probabilistic Behavior           |
| **Determinism**  | 100% Deterministic     | Nondeterministic (Flaky)         |
| **Key Metric**   | Pass/Fail              | Quality Score (0-100%)           |
| **When to Run**  | Every Save / CI Commit | Pre-Merge / Nightly / Production |

## Best Practice Workflow

1.  **Dev**: Write code -> Run `pnpm test` (Unit).
2.  **Refine**: Tweaking prompts -> Run specific Eval `pnpm test:evals --filter "support-handoff"`.
3.  **PR**: CI runs Unit Tests (Required).
4.  **Merge**: CI runs Full Evals (Reporting only, or soft-fail).
5.  **Monitor**: Production traces (Langfuse) used to build new Evals.
