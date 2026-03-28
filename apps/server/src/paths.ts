import path from "node:path";

export const repoRoot = path.resolve(process.cwd(), "..", "..");
export const topicsDir = path.join(repoRoot, "topics");
export const templatesDir = path.join(repoRoot, "templates");
export const historyDir = path.join(repoRoot, "history");
export const trackerPath = path.join(historyDir, "tracker.json");
