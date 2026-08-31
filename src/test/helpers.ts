import { signToken } from '../middleware/auth.js';

export function authHeader(userId: number): { Authorization: string } {
  return { Authorization: `Bearer ${signToken(userId)}` };
}
