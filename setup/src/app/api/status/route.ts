import { NextResponse } from "next/server";
import {
  readState,
  PHASE_ORDER,
  PHASE_META,
  isPhaseUnlocked,
} from "@/lib/setup-state";

/** 現在のセットアップ進捗を setup-state.json から読み取って返す */
export async function GET() {
  const state = readState();

  const phases = PHASE_ORDER.map((id) => ({
    id,
    label: PHASE_META[id].label,
    description: PHASE_META[id].description,
    tool: PHASE_META[id].tool,
    status: state.phases[id].status,
    isCurrent: state.currentPhase === id,
    isUnlocked: isPhaseUnlocked(id),
    comment: state.phases[id].comment || null,
    errors: state.phases[id].errors || [],
  }));

  return NextResponse.json({
    currentPhase: state.currentPhase,
    phases,
  });
}
