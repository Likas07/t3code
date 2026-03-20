export interface OrchestrationSyncTracker {
  observeDomainEvent: (sequence: number) => boolean;
  beginSync: () => boolean;
  finishSync: (snapshotSequence: number) => boolean;
  failSync: () => void;
  getAppliedSequence: () => number;
  getObservedSequence: () => number;
}

export function createOrchestrationSyncTracker(): OrchestrationSyncTracker {
  let appliedSequence = 0;
  let observedSequence = 0;
  let syncing = false;
  let pending = false;

  return {
    observeDomainEvent(sequence) {
      if (sequence <= observedSequence) {
        return false;
      }
      observedSequence = sequence;
      if (syncing) {
        pending = true;
        return false;
      }
      return true;
    },

    beginSync() {
      if (syncing) {
        pending = true;
        return false;
      }
      syncing = true;
      pending = false;
      return true;
    },

    finishSync(snapshotSequence) {
      appliedSequence = Math.max(appliedSequence, snapshotSequence);
      const shouldContinue = pending || appliedSequence < observedSequence;
      pending = false;
      syncing = shouldContinue;
      return shouldContinue;
    },

    failSync() {
      syncing = false;
    },

    getAppliedSequence() {
      return appliedSequence;
    },

    getObservedSequence() {
      return observedSequence;
    },
  };
}
