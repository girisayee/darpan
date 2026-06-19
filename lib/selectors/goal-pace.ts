export interface GoalPaceInput {
  annualGoal: number;
  monthlyRealized: number[];
  monthIndex: number;
}

export interface GoalPaceResult {
  cumulative: number[];
  actual: number;
  target: number;
  aheadBy: number;
  pct: number;
}

export function goalPace(input: GoalPaceInput): GoalPaceResult {
  const { annualGoal, monthlyRealized, monthIndex } = input;

  // Running sum of monthlyRealized
  const cumulative: number[] = [];
  let running = 0;
  for (const v of monthlyRealized) {
    running += v;
    cumulative.push(running);
  }

  const actual = cumulative[monthIndex] ?? 0;
  const target = annualGoal * (monthIndex + 1) / 12;
  const aheadBy = actual - target;
  const pct = annualGoal > 0 ? (actual / annualGoal) * 100 : 0;

  return { cumulative, actual, target, aheadBy, pct };
}
