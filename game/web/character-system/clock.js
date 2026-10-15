/** One distance clock for the layered controller and legacy movement bridge. */
export function advanceDistancePhase(previous, travelled, cycleDistance) {
 if (![previous, travelled, cycleDistance].every(Number.isFinite) || previous < 0 || travelled < 0 || cycleDistance <= 0)
  throw new TypeError('Distance phase requires finite nonnegative travel and positive cycle');
 const base=previous%cycleDistance, step=travelled%cycleDistance;
 // Avoid overflowing even when an imported model uses very large units.
 return base>=cycleDistance-step?base-(cycleDistance-step):base+step;
}
