export type PageEvidenceSourceKind = "RAW_DOCUMENT" | "RENDERED_DOM";

export type SafeAttributeMap = Readonly<Record<string, string>>;

export interface StructuredJsonEvidence {
  readonly sourceKind: PageEvidenceSourceKind;
  readonly scriptIndex: number;
  readonly scriptType: string | null;
  readonly scriptId: string | null;
  readonly value: unknown;
}

export interface StructuralContextEvidence {
  readonly tagName: string;
  readonly parentTagName: string | null;
  readonly parentRole: string | null;
  readonly parentClassTokens: readonly string[];
}

export interface NavigationNodeEvidence {
  readonly href: string | null;
  readonly text: string;
  readonly attributes: SafeAttributeMap;
  readonly context: StructuralContextEvidence;
}

export interface RepeatingCardContextEvidence extends StructuralContextEvidence {
  readonly structuralSignature: string;
  readonly repeatedSiblingCount: number;
}

export interface RepeatingCardCandidateEvidence {
  readonly href: string | null;
  readonly text: string;
  readonly attributes: SafeAttributeMap;
  readonly context: RepeatingCardContextEvidence;
}

export interface BreadcrumbEvidence {
  readonly href: string | null;
  readonly text: string;
  readonly position: number | null;
  readonly attributes: SafeAttributeMap;
}

export interface IdentityMetadataEvidence {
  readonly documentTitle: string | null;
  readonly h1Texts: readonly string[];
  readonly canonicalUrl: string | null;
  readonly metaTitles: readonly string[];
}

export interface PageEvidenceDiagnostics {
  readonly settleOutcome: "NETWORK_IDLE" | "BOUNDED_TIMEOUT";
  readonly malformedJsonLdCount: number;
  readonly malformedEmbeddedJsonCount: number;
  readonly rawDocumentAvailable: boolean;
  readonly renderedDocumentAvailable: boolean;
  readonly rawDocumentTruncated: boolean;
  readonly renderedDocumentTruncated: boolean;
}

/**
 * DEV1-local adapter. DEV0 owns the final public V16 contract.
 * Raw/rendered documents are in-memory evidence only and may be dropped in LEAN mode.
 */
export interface PageEvidenceBundle {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly httpStatus: number | null;
  readonly rawDocumentHtml: string | null;
  readonly renderedDocumentHtml: string | null;
  readonly jsonLd: readonly StructuredJsonEvidence[];
  readonly embeddedJson: readonly StructuredJsonEvidence[];
  readonly navigationNodes: readonly NavigationNodeEvidence[];
  readonly repeatingCardCandidates: readonly RepeatingCardCandidateEvidence[];
  readonly breadcrumbs: readonly BreadcrumbEvidence[];
  readonly identityMetadata: IdentityMetadataEvidence;
  readonly diagnostics: PageEvidenceDiagnostics;
}
