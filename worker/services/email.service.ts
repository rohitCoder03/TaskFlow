import { logger } from '../../src/config/logger';

export async function sendAssignmentEmail(to: string, taskTitle: string) {
  logger.info(`Mock email sent to ${to}: Task assigned - ${taskTitle}`);
}
