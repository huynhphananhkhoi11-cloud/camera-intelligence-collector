export interface NavigationCandidate {
  readonly candidateId: string;
  readonly label: string;
  readonly url: string;
}

export interface NavigationVisualShot {
  readonly shotId: string;
  readonly role: "landing" | "navigation-reveal";
  readonly bytes: Buffer;
  readonly imageHash: string;
  readonly visibleCandidateIds: readonly string[];
}

export interface SiteReconnaissancePacket {
  readonly website: string;
  readonly rootUrl: string;
  readonly finalUrl: string;
  readonly candidates: readonly NavigationCandidate[];
  readonly shots: readonly NavigationVisualShot[];
}

export interface ApprovedCameraRoute {
  readonly candidateId: string;
  readonly label: string;
  readonly url: string;
}

export interface CameraRouteDecision {
  readonly approvedCandidateIds: readonly string[];
}

export type ProductPageZone =
  | "HERO"
  | "UPPER"
  | "MIDDLE"
  | "LOWER"
  | "TAIL"
  | "FOOTER";

export interface ProductImageDimensions {
  readonly width: number;
  readonly height: number;
}

export interface NumberedProductVisualShotMetadata {
  readonly sequence: number;
  readonly shotId: string;
  readonly pageZone: ProductPageZone;
  readonly scrollY: number;
  readonly documentHeight: number;
  readonly dimensions: ProductImageDimensions;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly path: string | null;
  readonly isAuthoritativeHero: boolean;
}

export type NumberedProductScreenshot =
  import("../vision/adaptiveCapture.js").AdaptiveScreenshot &
  NumberedProductVisualShotMetadata;

export type NumberedCaptureManifestShot =
  import("../vision/adaptiveCapture.js").CaptureManifestShot &
  NumberedProductVisualShotMetadata;

export interface NumberedCaptureManifest
extends Omit<
  import("../vision/adaptiveCapture.js").CaptureManifest,
  "shots"
> {
  readonly shots: readonly NumberedCaptureManifestShot[];
}

export type ProductEvidenceRetentionPolicy =
  | "AUDIT_KEEP_ALL"
  | "LEAN_DELETE_SUCCESS";

export interface FrozenProductVisualPacket {
  readonly itemId: string;
  readonly sequence: number;
  readonly website: string;
  readonly pageUrl: string;
  readonly finalUrl: string;
  readonly screenshots: readonly NumberedProductScreenshot[];
  readonly manifest: NumberedCaptureManifest;
  readonly manifestPath: string | null;
  readonly imagePaths: readonly string[];
}

export interface CapturedProductWorkItem {
  readonly itemId: string;
  readonly sequence: number;
  readonly packet: FrozenProductVisualPacket;
}
