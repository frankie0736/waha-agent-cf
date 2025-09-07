import { agents, type createDatabase, kbSpaces, users } from "./index";

export async function seedDatabase(db: ReturnType<typeof createDatabase>) {
  console.log("🌱 开始插入种子数据...");

  // 获取当前时间 - Drizzle timestamp mode 需要 Date 对象
  const now = new Date();

  // 创建测试管理员用户 (Better Auth 格式)
  const adminUser = {
    id: "admin-user-1",
    name: "系统管理员",
    email: "admin@example.com",
    emailVerified: true, // Better Auth 使用 emailVerified
    image: null,
    kbLimit: 20,
    agentLimit: 10,
    waLimit: 5,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };

  // 创建测试普通用户 (Better Auth 格式)
  const testUser = {
    id: "test-user-1",
    name: "测试用户",
    email: "test@example.com",
    emailVerified: true, // Better Auth 使用 emailVerified
    image: null,
    aihubmixKey: "test-api-key",
    kbLimit: 5,
    agentLimit: 3,
    waLimit: 2,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };

  try {
    // 插入用户数据
    await db.insert(users).values([adminUser, testUser]);
    console.log("✅ 用户数据插入成功");

    // 为测试用户创建示例知识库
    const testKbSpace = {
      id: "kb-space-1",
      userId: testUser.id,
      name: "测试知识库",
      description: "用于测试的示例知识库",
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(kbSpaces).values([testKbSpace]);
    console.log("✅ 知识库数据插入成功");

    // 为测试用户创建示例智能体
    const testAgent = {
      id: "agent-1",
      userId: testUser.id,
      name: "客服助手",
      description: "智能客服助手，帮助回答常见问题",
      promptSystem: "你是一个专业的客服助手，请礼貌、耐心地回答用户问题。",
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      maxTokens: 1000,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agents).values([testAgent]);
    console.log("✅ 智能体数据插入成功");

    console.log("\n📊 种子数据插入汇总:");
    console.log(`👤 管理员用户: ${adminUser.email}`);
    console.log(`👤 测试用户: ${testUser.email}`);
    console.log(`📚 知识库: ${testKbSpace.name}`);
    console.log(`🤖 智能体: ${testAgent.name}`);
    console.log("\n✨ 所有种子数据插入完成");
  } catch (error) {
    console.error("❌ 种子数据插入失败:", error);
    throw error;
  }
}
