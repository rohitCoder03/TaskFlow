import { PrismaClient, Role, TaskPriority, TaskStatus } from '@prisma/client';
import { hashPassword } from '../src/shared/utils/password';

const prisma = new PrismaClient();

async function main() {
  await prisma.comment.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.orgMember.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await hashPassword('Password123!');
  for (const [index, name] of ['Acme Engineering', 'Globex Product'].entries()) {
    const organization = await prisma.organization.create({ data: { name } });
    const users = await Promise.all(
      Array.from({ length: index ? 2 : 3 }, (_, userIndex) =>
        prisma.user.create({
          data: {
            name: `${name} User ${userIndex + 1}`,
            email: `user${index}${userIndex}@taskflow.test`,
            passwordHash,
          },
        }),
      ),
    );
    await prisma.orgMember.createMany({
      data: users.map((user, userIndex) => ({
        organizationId: organization.id,
        userId: user.id,
        role: userIndex === 0 ? Role.org_admin : Role.member,
      })),
    });
    for (let projectIndex = 1; projectIndex <= 2; projectIndex++) {
      const project = await prisma.project.create({
        data: {
          organizationId: organization.id,
          name: `${name} Project ${projectIndex}`,
          description: 'Seed project',
        },
      });
      for (let taskIndex = 1; taskIndex <= 3; taskIndex++) {
        const task = await prisma.task.create({
          data: {
            projectId: project.id,
            title: `Task ${projectIndex}.${taskIndex}`,
            status: [TaskStatus.todo, TaskStatus.in_progress, TaskStatus.done][taskIndex - 1],
            priority: [TaskPriority.low, TaskPriority.high, TaskPriority.medium][taskIndex - 1],
          },
        });
        await prisma.taskAssignment.create({
          data: { taskId: task.id, userId: users[taskIndex % users.length].id },
        });
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
