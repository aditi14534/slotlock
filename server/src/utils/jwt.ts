import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  organizationId: string;
  role: Role;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  return secret;
}

/**
 * Sign a JWT carrying the user's identity, organization tenant ID, and role.
 */
export function signToken(
  payload: TokenPayload,
  expiresIn: SignOptions['expiresIn'] = '7d'
): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

/**
 * Verify a JWT and return its typed multi-tenant payload.
 */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    typeof decoded === 'string' ||
    !decoded.userId ||
    !decoded.organizationId ||
    !decoded.role
  ) {
    throw new Error('Invalid token payload');
  }

  return {
    userId: decoded.userId as string,
    organizationId: decoded.organizationId as string,
    role: decoded.role as Role,
  };
}
