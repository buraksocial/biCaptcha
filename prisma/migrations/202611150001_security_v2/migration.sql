-- Review/backup before applying. Old secretKey is deliberately NOT reused as a credential.
ALTER TABLE "Site" ADD COLUMN "verificationSecretHash" TEXT;
ALTER TABLE "ValidationLog" ADD COLUMN "latencyMs" INTEGER;
CREATE UNIQUE INDEX "Site_userId_domain_key" ON "Site"("userId", "domain");
CREATE INDEX "ValidationLog_siteId_createdAt_idx" ON "ValidationLog"("siteId", "createdAt");
