const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // 测试连接
    await prisma.$connect();
    console.log('✅ 数据库连接成功！');

    // 查询表列表
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' 
      ORDER BY table_name
    `;
    
    console.log('\n📊 已创建的表:');
    tables.forEach(t => console.log(`  • ${t.table_name}`));

    // 测试 CRUD 操作
    console.log('\n📝 测试 CRUD 操作...');
    
    // 创建测试命名空间
    const namespace = await prisma.namespace.create({
      data: { name: 'test-namespace' }
    });
    console.log(`  ✓ 创建 Namespace: ${namespace.id}`);

    // 查询
    const found = await prisma.namespace.findUnique({
      where: { id: namespace.id }
    });
    console.log(`  ✓ 查询 Namespace: ${found.name}`);

    // 删除
    await prisma.namespace.delete({
      where: { id: namespace.id }
    });
    console.log('  ✓ 删除 Namespace');

    console.log('\n✅ 所有测试通过！Prisma Client 工作正常');
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
