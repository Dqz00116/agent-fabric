import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Namespace 元数据
 */
export interface NamespaceMetadata {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Namespace 详情（包含统计信息）
 */
export interface NamespaceDetail extends NamespaceMetadata {
  _count?: {
    agents: number;
    apiKeys: number;
    requests: number;
  };
  agents?: Array<{
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
  }>;
}

/**
 * 创建 Namespace 参数
 */
export interface CreateNamespaceInput {
  name: string;
  description?: string;
}

/**
 * 更新 Namespace 参数
 */
export interface UpdateNamespaceInput {
  name?: string;
  description?: string;
}

/**
 * 分页列表参数
 */
export interface ListNamespacesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

/**
 * 分页列表结果
 */
export interface ListNamespacesResult {
  items: NamespaceMetadata[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 验证 namespace 名称格式
 * 规则：只允许字母、数字、下划线、连字符，长度 3-50
 */
export function validateNamespaceName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length < 3 || name.length > 50) {
    return { valid: false, error: 'Namespace name must be between 3 and 50 characters' };
  }

  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!nameRegex.test(name)) {
    return { valid: false, error: 'Namespace name can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true };
}

/**
 * 检查 namespace 名称是否已存在
 */
export async function isNamespaceNameExists(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.namespace.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  return !!existing;
}

/**
 * 创建 Namespace
 */
export async function createNamespace(
  input: CreateNamespaceInput
): Promise<NamespaceMetadata> {
  const namespace = await prisma.namespace.create({
    data: {
      name: input.name,
    },
  });

  logger.info({ namespaceId: namespace.id, name: namespace.name }, 'Namespace created');

  return {
    id: namespace.id,
    name: namespace.name,
    createdAt: namespace.createdAt,
    updatedAt: namespace.updatedAt,
  };
}

/**
 * 获取 Namespace 列表（分页）
 */
export async function listNamespaces(
  params: ListNamespacesParams = {}
): Promise<ListNamespacesResult> {
  const { page = 1, pageSize = 10, search } = params;
  const skip = (page - 1) * pageSize;

  const where = search
    ? {
        name: {
          contains: search,
          mode: 'insensitive' as const,
        },
      }
    : {};

  const [namespaces, total] = await Promise.all([
    prisma.namespace.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.namespace.count({ where }),
  ]);

  return {
    items: namespaces.map(n => ({
      id: n.id,
      name: n.name,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取单个 Namespace
 */
export async function getNamespace(id: string): Promise<NamespaceMetadata | null> {
  const namespace = await prisma.namespace.findUnique({
    where: { id },
  });

  if (!namespace) return null;

  return {
    id: namespace.id,
    name: namespace.name,
    createdAt: namespace.createdAt,
    updatedAt: namespace.updatedAt,
  };
}

/**
 * 获取 Namespace 详情（包含统计信息和 agents）
 */
export async function getNamespaceDetail(id: string): Promise<NamespaceDetail | null> {
  const namespace = await prisma.namespace.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          agents: true,
          apiKeys: true,
          requests: true,
        },
      },
      agents: {
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!namespace) return null;

  return {
    id: namespace.id,
    name: namespace.name,
    createdAt: namespace.createdAt,
    updatedAt: namespace.updatedAt,
    _count: namespace._count,
    agents: namespace.agents,
  };
}

/**
 * 通过名称获取 Namespace
 */
export async function getNamespaceByName(name: string): Promise<NamespaceMetadata | null> {
  const namespace = await prisma.namespace.findUnique({
    where: { name },
  });

  if (!namespace) return null;

  return {
    id: namespace.id,
    name: namespace.name,
    createdAt: namespace.createdAt,
    updatedAt: namespace.updatedAt,
  };
}

/**
 * 更新 Namespace
 */
export async function updateNamespace(
  id: string,
  input: UpdateNamespaceInput
): Promise<NamespaceMetadata | null> {
  const existing = await prisma.namespace.findUnique({
    where: { id },
  });

  if (!existing) return null;

  const namespace = await prisma.namespace.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name }),
    },
  });

  logger.info({ namespaceId: id, updates: input }, 'Namespace updated');

  return {
    id: namespace.id,
    name: namespace.name,
    createdAt: namespace.createdAt,
    updatedAt: namespace.updatedAt,
  };
}

/**
 * 删除 Namespace
 * 注意：由于设置了 onDelete: Cascade，关联的 agents、apiKeys、requests 会自动删除
 */
export async function deleteNamespace(id: string): Promise<boolean> {
  const existing = await prisma.namespace.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          agents: true,
        },
      },
    },
  });

  if (!existing) return false;

  // 记录日志，显示级联删除的信息
  logger.warn(
    {
      namespaceId: id,
      name: existing.name,
      cascadeDelete: {
        agents: existing._count.agents,
      },
    },
    'Deleting namespace with cascade'
  );

  await prisma.namespace.delete({
    where: { id },
  });

  logger.info({ namespaceId: id }, 'Namespace deleted');

  return true;
}

/**
 * 检查 Namespace 是否存在
 */
export async function namespaceExists(id: string): Promise<boolean> {
  const count = await prisma.namespace.count({
    where: { id },
  });
  return count > 0;
}
