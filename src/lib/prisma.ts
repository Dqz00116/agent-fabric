import { PrismaClient } from '@prisma/client';

// PrismaClient 单例模式，防止开发时热重载创建多个实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 连接重试配置
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/**
 * 创建 PrismaClient 实例，带连接重试机制
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  return client;
}

/**
 * 带重试机制的数据库连接
 */
export async function connectWithRetry(
  client: PrismaClient,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY_MS
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await client.$connect();
      console.log('✅ Database connected successfully');
      return;
    } catch (error) {
      console.warn(`⚠️ Database connection attempt ${attempt}/${retries} failed`);

      if (attempt === retries) {
        throw new Error(`Failed to connect to database after ${retries} attempts: ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// 导出单例实例
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// 开发环境将实例挂载到 global，避免热重载时创建多个实例
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 优雅关闭连接
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
