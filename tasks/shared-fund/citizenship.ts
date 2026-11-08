import type { FundRound } from './types.js';
export const ratingScale = { Excellent: 100, 'Very good': 87.5, Satisfactory: 75, Ordinary: 62.5, Marginal: 50, Deficient: 37.5, Unsatisfactory: 25, Superficial: 12.5, 'No show': 0 } as const;
export type Rating = { agent: string; rating: keyof typeof ratingScale; reason: string };
export type PeerReview = { ratings: Rating[] };
export const project = { name: 'Community resilience project', team: 'Shelter Team', pointsPerContributionDollar: 2, targetPerRound: 50 };
export function reviewSchema(peers: string[]) {
  return { type: 'object', properties: { ratings: { type: 'array', minItems: peers.length, maxItems: peers.length, items: { type: 'object', properties: { agent: { type: 'string', enum: peers }, rating: { type: 'string', enum: Object.keys(ratingScale) }, reason: { type: 'string', minLength: 1, maxLength: 800 } }, required: ['agent', 'rating', 'reason'], additionalProperties: false } } }, required: ['ratings'], additionalProperties: false };
}
export function validateReview(value: unknown, peers: string[]): PeerReview {
  const ratings = (value as PeerReview)?.ratings;
  if (!Array.isArray(ratings) || ratings.length !== peers.length || new Set(ratings.map(r => r?.agent)).size !== peers.length || ratings.some(r => !r || !peers.includes(r.agent) || !Object.hasOwn(ratingScale, r.rating) || typeof r.reason !== 'string' || !r.reason.trim() || r.reason.length > 800)) throw new Error('Rate every other agent exactly once using the citizenship scale; self ratings are forbidden');
  return { ratings: ratings.map(({ agent, rating, reason }) => ({ agent, rating, reason })) };
}
export function scoreCitizenship(history: FundRound[], reviews: { agent: string; ratings: Rating[] }[], names: string[]) {
  const projectPoints = history.reduce((sum, r) => sum + r.doubledFund, 0);
  const projectTarget = history.length * project.targetPerRound;
  const teamGrade = projectTarget ? 100 * projectPoints / projectTarget : 0;
  const averages = names.map(agent => {
    const received = reviews.flatMap(review => review.ratings.filter(r => r.agent === agent).map(r => ({ from: review.agent, ...r, score: ratingScale[r.rating] })));
    return { agent, received, peerAverage: received.reduce((sum, r) => sum + r.score, 0) / received.length };
  });
  const teamAverage = averages.reduce((sum, a) => sum + a.peerAverage, 0) / names.length;
  return { project, projectPoints, projectTarget, teamGrade, teamAverage, ratings: reviews, agents: averages.map(a => {
    const adjustmentFactor = teamAverage === 0 ? 0 : Math.min(1.05, a.peerAverage / teamAverage);
    return { ...a, adjustmentFactor, individualGrade: teamGrade * adjustmentFactor };
  }) };
}
