-- CreateEnum
CREATE TYPE "Role" AS ENUM ('org_admin', 'member');
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'review', 'done');
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE "Organization" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"));
CREATE TABLE "User" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "organization_id" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "OrgMember" ("id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'member', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id"));
CREATE TABLE "RefreshToken" ("id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "revoked" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Project" ("id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Project_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Task" ("id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "status" "TaskStatus" NOT NULL DEFAULT 'todo', "priority" "TaskPriority" NOT NULL DEFAULT 'medium', "due_date" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Task_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TaskAssignment" ("id" TEXT NOT NULL, "task_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Comment" ("id" TEXT NOT NULL, "task_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "OutboxEvent" ("id" TEXT NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "published_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "OrgMember_organization_id_user_id_key" ON "OrgMember"("organization_id", "user_id");
CREATE UNIQUE INDEX "TaskAssignment_task_id_user_id_key" ON "TaskAssignment"("task_id", "user_id");
CREATE INDEX "OrgMember_organization_id_role_idx" ON "OrgMember"("organization_id", "role");
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");
CREATE INDEX "Project_organization_id_idx" ON "Project"("organization_id");
CREATE INDEX "Task_project_id_status_idx" ON "Task"("project_id", "status");
CREATE INDEX "Task_project_id_priority_idx" ON "Task"("project_id", "priority");
CREATE INDEX "Task_project_id_due_date_idx" ON "Task"("project_id", "due_date");
CREATE INDEX "TaskAssignment_task_id_idx" ON "TaskAssignment"("task_id");
CREATE INDEX "TaskAssignment_user_id_idx" ON "TaskAssignment"("user_id");
CREATE INDEX "Comment_task_id_idx" ON "Comment"("task_id");
CREATE INDEX "Comment_user_id_idx" ON "Comment"("user_id");
CREATE INDEX "OutboxEvent_published_at_created_at_idx" ON "OutboxEvent"("published_at", "created_at");

ALTER TABLE "User" ADD CONSTRAINT "User_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
