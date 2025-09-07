import { drizzle } from "drizzle-orm/d1";
import { eq, and, desc, sql } from "drizzle-orm";
import type { Env } from "../../index";
import * as schema from "../../../database/schema";
import { generateId } from "../../utils/id";
import { DialogTestingService } from "./dialog-testing-service";
import type {
  TestCaseInput,
  TestCaseSummary,
  TestRunResult,
  TestResponseMetrics
} from "./types";

export class TestCaseManager {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly dialogService: DialogTestingService;

  constructor(private readonly env: Env) {
    this.db = drizzle(env.DB, { schema });
    this.dialogService = new DialogTestingService(env);
  }

  /**
   * Create a new test case
   */
  async createTestCase(
    userId: string,
    testCase: TestCaseInput
  ): Promise<TestCaseSummary> {
    const testCaseId = generateId("test_case");
    const now = new Date();

    const [created] = await this.db
      .insert(schema.testCases)
      .values({
        id: testCaseId,
        userId,
        agentId: testCase.agentId,
        name: testCase.name,
        description: testCase.description || null,
        inputMessages: JSON.stringify(testCase.inputMessages),
        expectedOutputs: testCase.expectedOutputs ? JSON.stringify(testCase.expectedOutputs) : null,
        tags: testCase.tags ? JSON.stringify(testCase.tags) : null,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      description: created.description || undefined,
      agentId: created.agentId,
      inputMessages: JSON.parse(created.inputMessages),
      expectedOutputs: created.expectedOutputs ? JSON.parse(created.expectedOutputs) : undefined,
      tags: created.tags ? JSON.parse(created.tags) : undefined,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt || undefined
    };
  }

  /**
   * List test cases for a user
   */
  async listTestCases(
    userId: string,
    agentId?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    testCases: TestCaseSummary[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const offset = (page - 1) * limit;

    const whereCondition = agentId 
      ? and(eq(schema.testCases.userId, userId), eq(schema.testCases.agentId, agentId))
      : eq(schema.testCases.userId, userId);

    const testCases = await this.db.query.testCases.findMany({
      where: whereCondition,
      orderBy: [desc(schema.testCases.updatedAt)],
      limit,
      offset
    });

    const totalResult = await this.db
      .select({ count: sql`count(*)` })
      .from(schema.testCases)
      .where(whereCondition);

    const total = Number(totalResult[0]?.count || 0);

    const testCaseSummaries: TestCaseSummary[] = testCases.map(tc => ({
      id: tc.id,
      name: tc.name,
      description: tc.description || undefined,
      agentId: tc.agentId,
      inputMessages: JSON.parse(tc.inputMessages),
      expectedOutputs: tc.expectedOutputs ? JSON.parse(tc.expectedOutputs) : undefined,
      tags: tc.tags ? JSON.parse(tc.tags) : undefined,
      createdAt: tc.createdAt,
      updatedAt: tc.updatedAt || undefined
    }));

    return {
      testCases: testCaseSummaries,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get a specific test case
   */
  async getTestCase(
    userId: string,
    testCaseId: string
  ): Promise<TestCaseSummary | null> {
    const testCase = await this.db.query.testCases.findFirst({
      where: and(
        eq(schema.testCases.id, testCaseId),
        eq(schema.testCases.userId, userId)
      )
    });

    if (!testCase) {
      return null;
    }

    return {
      id: testCase.id,
      name: testCase.name,
      description: testCase.description || undefined,
      agentId: testCase.agentId,
      inputMessages: JSON.parse(testCase.inputMessages),
      expectedOutputs: testCase.expectedOutputs ? JSON.parse(testCase.expectedOutputs) : undefined,
      tags: testCase.tags ? JSON.parse(testCase.tags) : undefined,
      createdAt: testCase.createdAt,
      updatedAt: testCase.updatedAt || undefined
    };
  }

  /**
   * Update a test case
   */
  async updateTestCase(
    userId: string,
    testCaseId: string,
    updates: Partial<TestCaseInput>
  ): Promise<TestCaseSummary> {
    const existingTestCase = await this.getTestCase(userId, testCaseId);
    if (!existingTestCase) {
      throw new Error("Test case not found");
    }

    const updateData: any = { updatedAt: new Date() };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.inputMessages !== undefined) updateData.inputMessages = JSON.stringify(updates.inputMessages);
    if (updates.expectedOutputs !== undefined) {
      updateData.expectedOutputs = updates.expectedOutputs ? JSON.stringify(updates.expectedOutputs) : null;
    }
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags ? JSON.stringify(updates.tags) : null;
    }

    const [updated] = await this.db
      .update(schema.testCases)
      .set(updateData)
      .where(eq(schema.testCases.id, testCaseId))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description || undefined,
      agentId: updated.agentId,
      inputMessages: JSON.parse(updated.inputMessages),
      expectedOutputs: updated.expectedOutputs ? JSON.parse(updated.expectedOutputs) : undefined,
      tags: updated.tags ? JSON.parse(updated.tags) : undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt || undefined
    };
  }

  /**
   * Delete a test case
   */
  async deleteTestCase(
    userId: string,
    testCaseId: string
  ): Promise<void> {
    const existingTestCase = await this.getTestCase(userId, testCaseId);
    if (!existingTestCase) {
      throw new Error("Test case not found");
    }

    // Delete associated test runs first
    await this.db
      .delete(schema.testRuns)
      .where(eq(schema.testRuns.testCaseId, testCaseId));

    // Delete the test case
    await this.db
      .delete(schema.testCases)
      .where(eq(schema.testCases.id, testCaseId));
  }

  /**
   * Run a test case
   */
  async runTestCase(
    userId: string,
    testCaseId: string,
    testSessionId?: string
  ): Promise<TestRunResult> {
    const testCase = await this.getTestCase(userId, testCaseId);
    if (!testCase) {
      throw new Error("Test case not found");
    }

    // Create or find test session
    if (!testSessionId) {
      const session = await this.dialogService.createTestSession(
        userId,
        testCase.agentId,
        `Test Run for ${testCase.name}`,
        `Automated test run for test case: ${testCase.name}`
      );
      testSessionId = session.id;
    }

    const testRunId = generateId("test_run");
    const startTime = new Date();

    // Create test run record
    await this.db
      .insert(schema.testRuns)
      .values({
        id: testRunId,
        testCaseId,
        testSessionId,
        status: "running",
        startTime,
        createdAt: startTime
      });

    const actualOutputs: string[] = [];
    const metrics: TestResponseMetrics[] = [];
    let errorMessage: string | undefined;

    try {
      // Execute each message in the test case
      let conversationId: string | undefined;

      for (const inputMessage of testCase.inputMessages) {
        if (inputMessage.role === "user") {
          const response = await this.dialogService.sendTestMessage(userId, {
            agentId: testCase.agentId,
            message: inputMessage.content,
            conversationId,
            useKnowledgeBase: true
          });

          conversationId = response.conversationId;
          actualOutputs.push(response.response);
          metrics.push(response.metrics);
        }
      }

      const endTime = new Date();
      const totalTime = endTime.getTime() - startTime.getTime();
      const averageResponseTime = metrics.length > 0 
        ? metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length
        : 0;
      const successRate = metrics.length > 0 
        ? metrics.filter(m => m.success).length / metrics.length
        : 0;
      const errorCount = metrics.filter(m => !m.success).length;

      // Update test run with results
      await this.db
        .update(schema.testRuns)
        .set({
          status: "completed",
          actualOutputs: JSON.stringify(actualOutputs),
          metrics: JSON.stringify({
            totalTime,
            averageResponseTime,
            successRate,
            errorCount
          }),
          endTime,
          errorMessage: null
        })
        .where(eq(schema.testRuns.id, testRunId));

      return {
        id: testRunId,
        testCaseId,
        testSessionId,
        status: "completed",
        actualOutputs,
        metrics: {
          totalTime,
          averageResponseTime,
          successRate,
          errorCount
        },
        startTime,
        endTime,
        createdAt: startTime
      };

    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      const endTime = new Date();

      // Update test run with error
      await this.db
        .update(schema.testRuns)
        .set({
          status: "failed",
          errorMessage,
          endTime
        })
        .where(eq(schema.testRuns.id, testRunId));

      return {
        id: testRunId,
        testCaseId,
        testSessionId,
        status: "failed",
        errorMessage,
        startTime,
        endTime,
        createdAt: startTime
      };
    }
  }

  /**
   * Get test run results
   */
  async getTestRun(
    userId: string,
    testRunId: string
  ): Promise<TestRunResult | null> {
    const testRun = await this.db.query.testRuns.findFirst({
      where: eq(schema.testRuns.id, testRunId),
      with: {
        testCase: true
      }
    });

    if (!testRun || testRun.testCase.userId !== userId) {
      return null;
    }

    return {
      id: testRun.id,
      testCaseId: testRun.testCaseId,
      testSessionId: testRun.testSessionId,
      status: testRun.status as any,
      actualOutputs: testRun.actualOutputs ? JSON.parse(testRun.actualOutputs) : undefined,
      metrics: testRun.metrics ? JSON.parse(testRun.metrics) : undefined,
      errorMessage: testRun.errorMessage || undefined,
      startTime: testRun.startTime || undefined,
      endTime: testRun.endTime || undefined,
      createdAt: testRun.createdAt
    };
  }

  /**
   * List test runs for a test case
   */
  async listTestRuns(
    userId: string,
    testCaseId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    testRuns: TestRunResult[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const offset = (page - 1) * limit;

    // Verify test case ownership
    const testCase = await this.getTestCase(userId, testCaseId);
    if (!testCase) {
      throw new Error("Test case not found");
    }

    const testRuns = await this.db.query.testRuns.findMany({
      where: eq(schema.testRuns.testCaseId, testCaseId),
      orderBy: [desc(schema.testRuns.createdAt)],
      limit,
      offset
    });

    const totalResult = await this.db
      .select({ count: sql`count(*)` })
      .from(schema.testRuns)
      .where(eq(schema.testRuns.testCaseId, testCaseId));

    const total = Number(totalResult[0]?.count || 0);

    const testRunResults: TestRunResult[] = testRuns.map(run => ({
      id: run.id,
      testCaseId: run.testCaseId,
      testSessionId: run.testSessionId,
      status: run.status as any,
      actualOutputs: run.actualOutputs ? JSON.parse(run.actualOutputs) : undefined,
      metrics: run.metrics ? JSON.parse(run.metrics) : undefined,
      errorMessage: run.errorMessage || undefined,
      startTime: run.startTime || undefined,
      endTime: run.endTime || undefined,
      createdAt: run.createdAt
    }));

    return {
      testRuns: testRunResults,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}