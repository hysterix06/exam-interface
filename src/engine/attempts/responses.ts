/** Autosave rule: a save wins only if its client sequence number is newer. */
export function shouldApply(storedSeq: number | null, incomingSeq: number) {
  return storedSeq === null || incomingSeq > storedSeq;
}
