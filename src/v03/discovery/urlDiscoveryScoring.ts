import type {
  DiscoveryChannel
} from "./multiSourceDiscoveryTypes.js";


const CAMERA_TERMS = [
  "camera",
  "may-anh",
  "mayanh",
  "máy-ảnh",
  "mirrorless",
  "dslr",
  "compact",
  "canon",
  "nikon",
  "sony",
  "fujifilm",
  "fuji",
  "lumix",
  "panasonic",
  "olympus",
  "leica",
  "pentax",
  "ricoh",
  "instax",
  "gopro",
  "action-cam"
];


const COMMERCE_TERMS = [
  "product",
  "products",
  "san-pham",
  "sanpham",
  "shop",
  "store",
  "collection",
  "collections",
  "category",
  "danh-muc",
  "danhmuc"
];


const CONTENT_PAGE_TERMS = [
  "workshop",
  "event",
  "su-kien",
  "su kien",
  "tin-tuc",
  "tin tuc",
  "news",
  "blog",
  "blogs",
  "article",
  "bai-viet",
  "bai viet",
  "gioi-thieu",
  "gioi thieu",
  "tuyen-dung",
  "tuyen dung",
  "huong-dan",
  "huong dan",
  "kinh-nghiem",
  "kinh nghiem",
  "thu-thuat",
  "thu thuat",
  "showroom",
  "chi-nhanh",
  "chi nhanh"
];


const PRODUCT_DETAIL_HINT_TERMS = [
  "body-only",
  "body only",
  "chinh-hang",
  "chinh hang",
  "likenew",
  "hang-moi",
  "hang moi",
  "hang-cu",
  "hang cu"
];


const EXCLUDE_TERMS = [
  "cart",
  "checkout",
  "gio-hang",
  "account",
  "tai-khoan",
  "login",
  "register",
  "dang-nhap",
  "search",
  "tim-kiem",
  "contact",
  "lien-he",
  "about",
  "gioi-thieu",
  "policy",
  "chinh-sach",
  "privacy",
  "bao-mat",
  "warranty",
  "bao-hanh",
  "news",
  "blog",
  "tin-tuc",
  "article",
  "tag",
  "author",
  "feed",
  "wp-json",
  "wp-admin"
];


function normalized(
  value:
    string
): string {

  return value
    .toLocaleLowerCase(
      "vi"
    )
    .normalize(
      "NFD"
    )
    .replace(
      /\p{Diacritic}/gu,
      ""
    );
}


function containsAny(
  haystack:
    string,
  needles:
    readonly string[]
): boolean {

  return needles.some(
    needle =>
      haystack.includes(
        normalized(
          needle
        )
      )
  );
}


function pathDepth(
  url:
    URL
): number {

  return url.pathname
    .split(
      "/"
    )
    .filter(
      Boolean
    ).length;
}


export function isLikelyNonProductContentUrl(
  rawUrl:
    string,
  anchorText:
    string |
    null = null
): boolean {

  let url:
    URL;


  try {
    url =
      new URL(
        rawUrl
      );
  }
  catch {
    return true;
  }


  const text =
    normalized(
      url.pathname +
      " " +
      (
        anchorText ??
        ""
      )
    );


  return containsAny(
    text,
    CONTENT_PAGE_TERMS
  );
}


export function scoreDiscoveredUrl(
  rawUrl:
    string,
  channel:
    DiscoveryChannel,
  anchorText:
    string |
    null = null
): number {

  let url:
    URL;


  try {
    url =
      new URL(
        rawUrl
      );
  }
  catch {
    return -1000;
  }


  const text =
    normalized(
      url.pathname +
      " " +
      (
        anchorText ??
        ""
      )
    );


  let score =
    0;


  if (
    containsAny(
      text,
      CONTENT_PAGE_TERMS
    )
  ) {
    score -=
      220;
  }


  if (
    containsAny(
      text,
      PRODUCT_DETAIL_HINT_TERMS
    )
  ) {
    score +=
      25;
  }


  if (
    containsAny(
      text,
      EXCLUDE_TERMS
    )
  ) {
    score -=
      120;
  }


  if (
    containsAny(
      text,
      CAMERA_TERMS
    )
  ) {
    score +=
      55;
  }


  if (
    containsAny(
      text,
      COMMERCE_TERMS
    )
  ) {
    score +=
      25;
  }


  const depth =
    pathDepth(
      url
    );


  if (
    depth >=
      2
  ) {
    score +=
      12;
  }
  else if (
    depth ===
      1
  ) {
    score +=
      4;
  }


  const leaf =
    url.pathname
      .split(
        "/"
      )
      .filter(
        Boolean
      )
      .at(
        -1
      ) ??
    "";


  if (
    (
      leaf.match(
        /-/g
      ) ??
      []
    ).length >=
      2
  ) {
    score +=
      8;
  }


  if (
    /(?:^|[?&])(?:page|p)=\d+/i.test(
      url.search
    )
  ) {
    score -=
      8;
  }


  if (
    channel ===
      "ENDPOINT_REPLAY"
  ) {
    score +=
      30;
  }
  else if (
    channel ===
      "RENDERED_DOM"
  ) {
    score +=
      18;
  }
  else if (
    channel ===
      "SITEMAP"
  ) {
    score +=
      12;
  }
  else {
    score +=
      8;
  }


  return score;
}


export function shouldTraverseAsCatalog(
  rawUrl:
    string,
  anchorText:
    string |
    null = null
): boolean {

  let url:
    URL;


  try {
    url =
      new URL(
        rawUrl
      );
  }
  catch {
    return false;
  }


  const text =
    normalized(
      url.pathname +
      " " +
      (
        anchorText ??
        ""
      )
    );


  if (
    containsAny(
      text,
      CONTENT_PAGE_TERMS
    )
  ) {
    return false;
  }


  if (
    containsAny(
      text,
      EXCLUDE_TERMS
    )
  ) {
    return false;
  }


  return (
    containsAny(
      text,
      CAMERA_TERMS
    ) ||
    containsAny(
      text,
      COMMERCE_TERMS
    )
  );
}
