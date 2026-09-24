import type {
  DurableBatchProgressEvent
} from "../runtime/durableBatchRuntime.js";

export interface LiveBatchProgressOptions {
  readonly total: number;
  readonly write?: (line: string) => void;
  readonly now?: () => number;
}

type ActiveStage =
  | "START"
  | "CAPTURE"
  | "CAPTURED"
  | "GEMINI";

export class LiveBatchProgress {
  private readonly total: number;
  private readonly write: (line: string) => void;
  private readonly now: () => number;

  private activeIndex: number | null = null;
  private activeStage: ActiveStage | null = null;
  private activeStartedAt = 0;

  public constructor(
    options: LiveBatchProgressOptions
  ) {
    this.total = options.total;
    this.write =
      options.write ??
      (line => console.log(line));
    this.now =
      options.now ??
      (() => Date.now());
  }

  public onEvent(
    event: DurableBatchProgressEvent
  ): void {
    const prefix =
      `[${event.index + 1}/${event.total}]`;

    switch (event.type) {
      case "ITEM_START": {
        this.activeIndex = event.index;
        this.activeStage = "START";
        this.activeStartedAt = this.now();

        this.write(
          `${prefix} START   ${event.url}`
        );
        return;
      }

      case "CAPTURE_START": {
        this.activeIndex = event.index;
        this.activeStage = "CAPTURE";

        this.write(
          `${prefix} CAPTURE browser exploring...`
        );
        return;
      }

      case "CAPTURED": {
        this.activeIndex = event.index;
        this.activeStage = "CAPTURED";

        this.write(
          `${prefix} CAPTURED screenshots/checkpoint ready`
        );
        return;
      }

      case "GEMINI_ATTEMPT": {
        this.activeIndex = event.index;
        this.activeStage = "GEMINI";

        this.write(
          `${prefix} GEMINI  attempt ${event.attempt} via ${event.providerProfileId}`
        );
        return;
      }

      case "ITEM_DONE": {
        const elapsed =
          this.elapsedSeconds();

        this.write(
          `${prefix} DONE    ${event.status} attempts=${event.attempts} elapsed=${elapsed}s`
        );

        this.clearActive(
          event.index
        );
        return;
      }

      case "ITEM_ERROR": {
        const elapsed =
          this.elapsedSeconds();

        this.write(
          `${prefix} ERROR   ${event.errorClass} elapsed=${elapsed}s ${event.message}`
        );

        this.clearActive(
          event.index
        );
        return;
      }
    }
  }

  public heartbeat(): void {
    if (
      this.activeIndex === null ||
      this.activeStage === null
    ) {
      return;
    }

    this.write(
      `[${this.activeIndex + 1}/${this.total}] ... still ${this.activeStage} after ${this.elapsedSeconds()}s`
    );
  }

  private elapsedSeconds(): number {
    return Math.max(
      0,
      Math.floor(
        (
          this.now() -
          this.activeStartedAt
        ) /
        1000
      )
    );
  }

  private clearActive(
    index: number
  ): void {
    if (
      this.activeIndex !== index
    ) {
      return;
    }

    this.activeIndex = null;
    this.activeStage = null;
    this.activeStartedAt = 0;
  }
}
