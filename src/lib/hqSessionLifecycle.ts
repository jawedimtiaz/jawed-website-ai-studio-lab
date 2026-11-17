export interface HqRequestToken {
  sessionGen: number;
  sessionUid: string | null;
  requestKey: string;
  seq: number;
  isSessionValid: () => boolean;
  isLatest: () => boolean;
}

export class HqSessionLifecycle {
  uid: string | null = null;
  gen: number = 0;
  reqSeq: Record<string, number> = {};

  startSession(uid: string | null, force = false): number {
    if (force || this.uid !== uid) {
      this.uid = uid;
      this.gen += 1;
      this.reqSeq = {};
    }
    return this.gen;
  }

  endSession(): void {
    this.uid = null;
    this.gen += 1;
    this.reqSeq = {};
  }

  createRequestToken(requestKey: string): HqRequestToken {
    const sessionGen = this.gen;
    const sessionUid = this.uid;
    const seq = (this.reqSeq[requestKey] = (this.reqSeq[requestKey] || 0) + 1);

    return {
      sessionGen,
      sessionUid,
      requestKey,
      seq,
      isSessionValid: (): boolean => {
        return this.gen === sessionGen && this.uid === sessionUid && this.uid !== null;
      },
      isLatest: (): boolean => {
        return (
          this.gen === sessionGen &&
          this.uid === sessionUid &&
          this.uid !== null &&
          this.reqSeq[requestKey] === seq
        );
      }
    };
  }
}
