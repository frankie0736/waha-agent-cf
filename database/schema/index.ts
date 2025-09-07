// 导出所有表和关系
export * from "./users";
export * from "./auth.schema";
export * from "./knowledge-base";
export * from "./agents";
export * from "./whatsapp";

import { agentKbLinks, agents } from "./agents";
import { accounts, sessions, verifications } from "./auth.schema";
import { kbChunks, kbDocuments, kbSpaces } from "./knowledge-base";
// 重新导出所有表以便于查询
import { users } from "./users";
import { conversations, jobs, messages, waSessions } from "./whatsapp";

export const tables = {
  users,
  sessions,
  accounts,
  verifications,
  kbSpaces,
  kbDocuments,
  kbChunks,
  agents,
  agentKbLinks,
  waSessions,
  conversations,
  messages,
  jobs,
} as const;
