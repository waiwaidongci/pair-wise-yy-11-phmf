import { createPersistentStore, type PersistentStore } from "../store";
import { DEFAULT_RULES, type RuleSettings } from "./filling";

// 规则模块自己的设置存储，与台账、档案的存储键分开
export const rulesStore: PersistentStore<RuleSettings> = createPersistentStore(
  "fill.rules.v1",
  DEFAULT_RULES
);

export function updateRules(patch: Partial<RuleSettings>) {
  rulesStore.setState((prev) => ({ ...prev, ...patch }));
}
