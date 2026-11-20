-- Original schema baseline. Existing databases must mark ONLY this migration applied.
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Site" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "siteKey" TEXT NOT NULL,
  "secretKey" TEXT NOT NULL,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "userId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ValidationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteId" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "country" TEXT DEFAULT 'Unknown',
  "type" TEXT NOT NULL,
  "riskScore" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Site_siteKey_key" ON "Site"("siteKey");
