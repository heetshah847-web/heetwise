-- AlterTable: track which expense splits have been settled (paid off). Existing
-- rows default to false so no historical debt is silently marked as settled.
ALTER TABLE "splits" ADD COLUMN "is_settled" BOOLEAN NOT NULL DEFAULT false;
