import type { FillPlan } from "../domain/rules";

const STEP_META: Record<string, { cls: string; icon: string }> = {
  vent: { cls: "vent", icon: "↓" },
  o2: { cls: "o2", icon: "O₂" },
  he: { cls: "he", icon: "He" },
  air: { cls: "air", icon: "空" },
  n2: { cls: "n2", icon: "N₂" },
};

export function PlanSteps({ plan }: { plan: FillPlan }) {
  return (
    <div className="plan">
      <div className="plan-assumption">计算依据：{plan.assumption}</div>
      <ol className="plan-steps">
        {plan.steps.map((s) => {
          const meta = STEP_META[s.type] ?? { cls: "", icon: "•" };
          return (
            <li key={s.seq} className={`plan-step ${meta.cls}`}>
              <div className="step-badge">{meta.icon}</div>
              <div className="step-body">
                <strong>
                  {s.seq}. {s.title}
                  <em>→ {s.pressureAfter} bar</em>
                </strong>
                <p>{s.detail}</p>
                <small>折合气量约 {s.gasVolume} L（按水容积计）</small>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="plan-summary">
        <span>可保留余压 ≤ <b>{plan.residualKeep}</b> bar</span>
        <span>纯氧 +{plan.o2Add} bar</span>
        <span>纯氦 +{plan.heAdd} bar</span>
        <span>{plan.mode === "air" ? "空气补压" : "纯氮补压"} +{plan.topUp} bar</span>
      </div>
      {plan.warnings.length > 0 && (
        <ul className="plan-warnings">
          {plan.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
