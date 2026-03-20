import { describe, expect, it } from "vitest";
import { createPlanningPipelineBatch } from "./planningPipeline";

describe("createPlanningPipelineBatch", () => {
  it("returns 3 children with correct agents", () => {
    const result = createPlanningPipelineBatch({
      planRequest: "Build a REST API for user management",
    });

    expect(result.children).toHaveLength(3);
    expect(result.children[0]!.agentId).toBe("prometheus");
    expect(result.children[1]!.agentId).toBe("metis");
    expect(result.children[2]!.agentId).toBe("momus");
  });

  it("builds correct dependency chain: metis blocked by prometheus, momus blocked by metis", () => {
    const result = createPlanningPipelineBatch({
      planRequest: "Implement authentication flow",
    });

    const [prometheus, metis, momus] = result.children;

    expect(prometheus!.blockedBy).toEqual([]);
    expect(metis!.blockedBy).toEqual([prometheus!.taskId]);
    expect(momus!.blockedBy).toEqual([metis!.taskId]);
  });

  it("includes the plan request text in prompts", () => {
    const planRequest = "Design a microservices architecture for e-commerce";
    const result = createPlanningPipelineBatch({ planRequest });

    expect(result.children[0]!.prompt).toContain(planRequest);
  });

  it("truncates subject lines appropriately", () => {
    const longRequest = "A".repeat(200);
    const result = createPlanningPipelineBatch({ planRequest: longRequest });

    // prometheus subject uses slice(0, 80)
    expect(result.children[0]!.subject).toBe(`Plan: ${"A".repeat(80)}`);
    // metis and momus subjects use slice(0, 60)
    expect(result.children[1]!.subject).toBe(`Analysis: ${"A".repeat(60)}`);
    expect(result.children[2]!.subject).toBe(`Review: ${"A".repeat(60)}`);
  });
});
