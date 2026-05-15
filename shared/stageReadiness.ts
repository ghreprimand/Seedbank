import type { Idea, Stage } from './types.js';

export interface StageReadinessAssessment {
  ready: boolean;
  met: string[];
  missing: string[];
  nextStage: Stage;
}

interface StageCriteria {
  nextStage: Stage;
  checks: Array<{ label: string; pass: (idea: Idea) => boolean }>;
}

const STAGE_CRITERIA: Partial<Record<Stage, StageCriteria>> = {
  seed: {
    nextStage: 'sprout',
    checks: [
      { label: 'The Spark has enough detail', pass: (idea) => idea.fullNotes.trim().length >= 40 },
    ],
  },
  sprout: {
    nextStage: 'pitch',
    checks: [
      { label: 'Concept is filled', pass: (idea) => idea.hook.trim().length > 0 },
    ],
  },
  pitch: {
    nextStage: 'prototype',
    checks: [
      { label: 'The Case is filled', pass: (idea) => idea.whyItMightWork.trim().length > 0 },
      { label: 'Elevator Pitch is filled', pass: (idea) => idea.pitch.trim().length > 0 },
    ],
  },
  prototype: {
    nextStage: 'plot',
    checks: [
      { label: 'Risks & Blockers are filled', pass: (idea) => idea.risks.trim().length > 0 },
      { label: 'Build Notes are filled', pass: (idea) => idea.techStack.trim().length > 0 },
    ],
  },
};

export function assessReadiness(idea: Idea): StageReadinessAssessment {
  const criteria = STAGE_CRITERIA[idea.stage];
  if (!criteria) {
    return {
      ready: false,
      met: [],
      missing: [],
      nextStage: idea.stage,
    };
  }

  const met: string[] = [];
  const missing: string[] = [];
  for (const check of criteria.checks) {
    if (check.pass(idea)) met.push(check.label);
    else missing.push(check.label);
  }

  return {
    ready: missing.length === 0,
    met,
    missing,
    nextStage: criteria.nextStage,
  };
}
