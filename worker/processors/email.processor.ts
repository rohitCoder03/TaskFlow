import type { Job } from 'bullmq';
import { sendAssignmentEmail } from '../services/email.service';

export async function processEmailJob(job: Job) {
  const data = job.data as { to: string; title: string };
  await sendAssignmentEmail(data.to, data.title);
}
