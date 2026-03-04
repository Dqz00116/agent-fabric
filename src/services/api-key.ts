import { prisma } from '../lib/prisma.js';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';

// API Key 前缀
const API_KEY_PREFIX = 'af_';
// bcrypt 哈希轮数
const BCRYPT_ROUNDS = 10;

/**
 * API Key 元数据（不含敏感信息）
 */
export interface ApiKeyMetadata {
  id: string;
  name: string | null;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  namespaceId: string;
}

/**
 * 创建 API Key 的结果（仅创建时返回原始 key）
 */
export interface CreateApiKeyResult {
  apiKey: ApiKeyMetadata;
  plainKey: string;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  valid: boolean;
  namespaceId?: string;
  scopes?: string[];
  error?: 'MISSING' | 'INVALID' | 'DISABLED' | 'EXPIRED';
}

/**
 * 生成原始 API Key
 * 格式: af_<随机字符串>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(32).toString('base64url');
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * 计算 API Key 的哈希值（用于数据库查找）
 * 使用 SHA-256 进行快速查找
 */
export function hashApiKeyForLookup(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * 使用 bcrypt 哈希 API Key（用于安全存储）
 */
export async function hashApiKeyForStorage(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

/**
 * 验证 API Key 是否匹配存储的哈希
 */
export async function verifyApiKeyHash(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

/**
 * 创建新的 API Key
 */
export async function createApiKey(
  namespaceId: string,
  options: {
    name?: string;
    scopes?: string[];
    expiresAt?: Date;
  } = {}
): Promise<CreateApiKeyResult> {
  const plainKey = generateApiKey();
  const keyHash = await hashApiKeyForStorage(plainKey);
  const lookupHash = hashApiKeyForLookup(plainKey);

  const apiKey = await prisma.apiKey.create({
    data: {
      namespaceId,
      keyHash: lookupHash, // 使用 SHA-256 哈希作为查找键
      name: options.name || null,
      scopes: options.scopes || ['read'],
      isActive: true,
      expiresAt: options.expiresAt || null,
    },
  });

  // 将 bcrypt 哈希存储到安全位置（这里我们使用 lookupHash 作为标识）
  // 在实际生产环境中，你可能需要将 bcrypt 哈希存储到单独的表中
  // 为了简化，我们将 bcrypt 哈希存储在内存中或单独的安全存储
  await storeBcryptHash(lookupHash, keyHash);

  return {
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      isActive: apiKey.isActive,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
      namespaceId: apiKey.namespaceId,
    },
    plainKey,
  };
}

// 内存中存储 bcrypt 哈希（生产环境应使用 Redis 或数据库）
const bcryptHashStore = new Map<string, string>();

async function storeBcryptHash(lookupHash: string, bcryptHash: string): Promise<void> {
  bcryptHashStore.set(lookupHash, bcryptHash);
}

async function getBcryptHash(lookupHash: string): Promise<string | null> {
  return bcryptHashStore.get(lookupHash) || null;
}

/**
 * 验证 API Key
 */
export async function verifyApiKey(key: string | undefined): Promise<VerifyResult> {
  // 检查 Key 是否存在
  if (!key) {
    return { valid: false, error: 'MISSING' };
  }

  // 验证格式
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { valid: false, error: 'INVALID' };
  }

  // 计算查找哈希
  const lookupHash = hashApiKeyForLookup(key);

  // 查找数据库
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash: lookupHash },
  });

  // 不存在
  if (!apiKeyRecord) {
    return { valid: false, error: 'INVALID' };
  }

  // 检查是否禁用
  if (!apiKeyRecord.isActive) {
    return { valid: false, error: 'DISABLED' };
  }

  // 检查是否过期
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    return { valid: false, error: 'EXPIRED' };
  }

  // 获取 bcrypt 哈希并验证
  const bcryptHash = await getBcryptHash(lookupHash);
  if (!bcryptHash || !(await verifyApiKeyHash(key, bcryptHash))) {
    return { valid: false, error: 'INVALID' };
  }

  // 更新最后使用时间
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    valid: true,
    namespaceId: apiKeyRecord.namespaceId,
    scopes: apiKeyRecord.scopes,
  };
}

/**
 * 获取 Namespace 的所有 API Keys
 */
export async function listApiKeys(namespaceId: string): Promise<ApiKeyMetadata[]> {
  const apiKeys = await prisma.apiKey.findMany({
    where: { namespaceId },
    orderBy: { createdAt: 'desc' },
  });

  return apiKeys.map(key => ({
    id: key.id,
    name: key.name,
    scopes: key.scopes,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    namespaceId: key.namespaceId,
  }));
}

/**
 * 获取单个 API Key
 */
export async function getApiKey(
  namespaceId: string,
  keyId: string
): Promise<ApiKeyMetadata | null> {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, namespaceId },
  });

  if (!apiKey) return null;

  return {
    id: apiKey.id,
    name: apiKey.name,
    scopes: apiKey.scopes,
    isActive: apiKey.isActive,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
    namespaceId: apiKey.namespaceId,
  };
}

/**
 * 更新 API Key
 */
export async function updateApiKey(
  namespaceId: string,
  keyId: string,
  updates: {
    name?: string;
    scopes?: string[];
    isActive?: boolean;
    expiresAt?: Date | null;
  }
): Promise<ApiKeyMetadata | null> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, namespaceId },
  });

  if (!existing) return null;

  const apiKey = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.scopes !== undefined && { scopes: updates.scopes }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      ...(updates.expiresAt !== undefined && { expiresAt: updates.expiresAt }),
    },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    scopes: apiKey.scopes,
    isActive: apiKey.isActive,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
    namespaceId: apiKey.namespaceId,
  };
}

/**
 * 删除 API Key
 */
export async function deleteApiKey(namespaceId: string, keyId: string): Promise<boolean> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, namespaceId },
  });

  if (!existing) return false;

  // 删除 bcrypt 哈希
  const bcryptHash = await getBcryptHash(existing.keyHash);
  if (bcryptHash) {
    bcryptHashStore.delete(existing.keyHash);
  }

  await prisma.apiKey.delete({
    where: { id: keyId },
  });

  return true;
}

/**
 * 检查作用域权限
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope) || scopes.includes('admin');
}

/**
 * 检查多个作用域权限（满足其一即可）
 */
export function hasAnyScope(scopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some(scope => hasScope(scopes, scope));
}

/**
 * 检查多个作用域权限（全部满足）
 */
export function hasAllScopes(scopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every(scope => hasScope(scopes, scope));
}
