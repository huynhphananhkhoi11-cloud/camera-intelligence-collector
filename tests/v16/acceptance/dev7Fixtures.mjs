import fs from 'node:fs';

const manifest = JSON.parse(
  fs.readFileSync(new URL('./frozen-v15-manifest.json', import.meta.url), 'utf8')
);

export const DEV7_FIXTURES = Object.freeze({
  DEV1: {
    rawSource: {
      kind: 'RAW_HTML',
      html: '<script type="application/ld+json">{"@type":"Product","name":"Camera A"}</script>'
    },
    renderedDom: {
      productCards: [
        { href: '/camera-a', text: 'Camera A' },
        { href: '/camera-b', text: 'Camera B' }
      ]
    },
    jsonLd: { '@type': 'Product', name: 'Camera A' },
    embeddedState: { products: [{ id: 'camera-a', name: 'Camera A' }] },
    malformedJsonLd: '{not-json'
  },
  DEV2: {
    network: {
      reloadCount: 1,
      responses: [
        { url: '/api/cameras?page=1', status: 200, contentType: 'application/json', bodyBytes: 1800 },
        { url: '/api/cameras?page=1', status: 200, contentType: 'application/json', bodyBytes: 1800 }
      ],
      hiddenSecrets: {
        authorization: 'DEV7_DUMMY_AUTH_BEARER_51cc88',
        cookie: 'DEV7_DUMMY_COOKIE_7720d1',
        csrf: 'DEV7_DUMMY_CSRF_432bc9'
      },
      maxBodyBytes: 1048576
    },
    expected: { dedupedResponses: 1, secretsPersisted: 0, oversizedBodiesAccepted: 0 }
  },
  DEV3: {
    positiveScope: {
      collections: ['Máy ảnh', 'Ống kính', 'Tin tức'],
      expectedApproved: ['Máy ảnh']
    },
    ambiguous: { label: 'Imaging', expected: 'NEEDS_LEGACY_SCOPE_FALLBACK' },
    productCardOnly: {
      cards: ['/camera-a', '/camera-b'],
      footerLinks: ['/policy', '/news', '/contact'],
      expectedQueue: ['/camera-a', '/camera-b']
    },
    canonicalDedupe: {
      urls: ['/camera-a?view=grid', '/camera-a?view=list'],
      expectedUnique: 1
    },
    pagination: { maxPages: 3, stopOnNoNewProducts: true }
  },
  DEV4: {
    expectedFields: [
      'website','productName','condition','specs','rentalPricePerDay','rentalTerms',
      'accessoriesIncluded','bundleIncluded','rating','reviewCount','stock','salePrice','url'
    ],
    precedence: ['EXPLICIT_PRODUCT_JSON_OR_JSONLD','EMBEDDED_STATE','RENDERED_DOM','LEGACY_FALLBACK'],
    optionalNulls: {
      rentalPricePerDay: null,
      rentalTerms: null,
      accessoriesIncluded: null,
      bundleIncluded: null,
      rating: null,
      reviewCount: null
    },
    noInvention: true
  },
  DEV5: {
    fallback: { directOutcome: 'DIRECT_UNUSABLE', expected: 'LEGACY_FALLBACK' },
    keyLoop: { sequence: ['A_EXHAUSTED','B_INVALID','C_VALID'], expectedResumeSameItem: true },
    invalidKey: { expectedAction: 'ASK_Y_N_AGAIN' },
    rpd: { expectedAction: 'CHECKPOINT_THEN_PROMPT' },
    rpm: { expectedAction: 'BOUNDED_BACKOFF_THEN_PROMPT_IF_STILL_UNAVAILABLE' },
    userN: { expected: 'USER_DECLINED_NEW_KEY' },
    secretNeedles: ['DEV7_DUMMY_GEMINI_KEY_A_9f4c7d2e','DEV7_DUMMY_GEMINI_KEY_B_4e1f95']
  },
  DEV6: {
    checkpoint: { completedProductIds: ['A','B'], pendingProductIds: ['C'] },
    partialExport: { status: 'PARTIAL_QUOTA_STOP', rows: ['A','B'] },
    ctrlC: { checkpointUsable: true },
    resume: { skips: ['A','B'], duplicateRows: 0 }
  },
  frozenV15Manifest: manifest,
  benchmark: {
    v15Reference: {
      version: 'v15', site: 'FixtureShop', rootUrl: 'https://fixture.invalid/',
      wallClockMs: 100000, pagesOpened: 100, screenshotCount: 80, geminiCalls: 50,
      totalUrlCandidates: 525, irrelevantUrlCandidates: 400, finalUniqueCameraProducts: 40,
      directCompletedProducts: 0, geminiCallsForDirectProducts: 0,
      fieldCompleteness: {
        website:1,productName:1,condition:0.9,specs:0.8,rentalPricePerDay:0.1,rentalTerms:0.1,
        accessoriesIncluded:0.4,bundleIncluded:0.3,rating:0.6,reviewCount:0.6,stock:0.7,salePrice:0.95,url:1
      }
    },
    v16DirectSuccess: {
      version: 'v16', site: 'FixtureShop', rootUrl: 'https://fixture.invalid/',
      wallClockMs: 60000, pagesOpened: 45, screenshotCount: 0, geminiCalls: 0,
      totalUrlCandidates: 45, irrelevantUrlCandidates: 0, finalUniqueCameraProducts: 40,
      directCompletedProducts: 40, geminiCallsForDirectProducts: 0,
      fieldCompleteness: {
        website:1,productName:1,condition:0.9,specs:0.8,rentalPricePerDay:0.1,rentalTerms:0.1,
        accessoriesIncluded:0.4,bundleIncluded:0.3,rating:0.6,reviewCount:0.6,stock:0.7,salePrice:0.95,url:1
      }
    }
  }
});
