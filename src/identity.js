export const MAX_AGENTS = 100;
export function agentCode(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_AGENTS) throw new Error('Invalid agent index');
  let label = '', value = index + 1;
  while (value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}
export const agentName = index => `Agent ${agentCode(index)}`;
