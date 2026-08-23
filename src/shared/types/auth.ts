import type { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId: string;
    }
  }
}

export {};
