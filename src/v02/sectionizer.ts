import * as cheerio from "cheerio";

export type SectionKey =
  | "SPECS"
  | "CONDITION"
  | "RENTAL_CONDITIONS"
  | "RENTAL_TIME"
  | "PAYMENT"
  | "DOCUMENTS"
  | "DELIVERY"
  | "ACCESSORIES"
  | "COMBO"
  | "OTHER";

export interface ProductSection {
  key: SectionKey;
  heading: string;
  normalizedHeading: string;
  content: string;
}

function clean(
  value: unknown
): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(
  value: unknown
): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function classifySectionHeading(
  heading: string
): SectionKey | null {

  const text = norm(heading);

  if (
    /^(thong so(?: ky thuat| noi bat)?|tom tat san pham|specifications?|technical specifications?)$/
      .test(text)
  ) {
    return "SPECS";
  }

  if (
    /^(tinh trang|tinh trang san pham|condition|item condition)$/
      .test(text)
  ) {
    return "CONDITION";
  }

  if (
    /^(dieu kien thue|chinh sach thue|quy dinh thue|rental conditions?|rental policy)$/
      .test(text)
  ) {
    return "RENTAL_CONDITIONS";
  }

  if (
    /^(thoi gian thue|rental duration|rental time)$/
      .test(text)
  ) {
    return "RENTAL_TIME";
  }

  if (
    /^(thanh toan|payment|payment policy)$/
      .test(text)
  ) {
    return "PAYMENT";
  }

  if (
    /^(giay to can thiet|giay to|documents?|required documents?)$/
      .test(text)
  ) {
    return "DOCUMENTS";
  }

  if (
    /^(giao nhan|giao hang va nhan hang|nhan tra|delivery|pickup|return)$/
      .test(text)
  ) {
    return "DELIVERY";
  }

  if (
    /^(phu kien|phu kien di kem|accessories|included accessories)$/
      .test(text)
  ) {
    return "ACCESSORIES";
  }

  if (
    /^(combo|combo di kem|goi di kem|package|bundle|bundles)$/
      .test(text)
  ) {
    return "COMBO";
  }

  /*
   * Generic product-description headings are useful as a bounded
   * primary-detail evidence region. They remain OTHER so downstream
   * consumers must opt in explicitly instead of treating arbitrary
   * description text as a specialized field.
   */
  if (
    /^(mo ta|mo ta san pham|chi tiet san pham|description|product description|product details?)$/
      .test(text)
  ) {
    return "OTHER";
  }

  return null;
}

export function sectionizeHtml(
  html: string
): ProductSection[] {

  const $ =
    cheerio.load(html);

  const output:
    ProductSection[] = [];

  const candidates =
    $(
      "h1,h2,h3,h4,h5,h6,dt,strong,b"
    ).toArray();

  const isBoundary = (
    node: any
  ): boolean => {

    const tag =
      String(
        node?.tagName ?? ""
      ).toLowerCase();

    if (
      /^h[1-6]$/.test(tag) ||
      tag === "dt"
    ) {
      return true;
    }

    if (
      tag === "strong" ||
      tag === "b"
    ) {
      const text =
        clean($(node).text());

      return (
        classifySectionHeading(
          text
        ) !== null
      );
    }

    return false;
  };

  for (
    const node
    of candidates
  ) {

    const heading =
      clean($(node).text());

    if (!heading) {
      continue;
    }

    const key =
      classifySectionHeading(
        heading
      );

    if (!key) {
      continue;
    }

    const parts: string[] = [];

    let cursor =
      $(node).next();

    while (
      cursor.length > 0
    ) {

      const current =
        cursor.get(0);

      if (
        current &&
        isBoundary(current)
      ) {
        break;
      }

      const text =
        clean(cursor.text());

      if (text) {
        parts.push(text);
      }

      cursor =
        cursor.next();
    }

    /*
     * Conservative fallback.
     *
     * Only inspect the parent if direct siblings
     * produced nothing. Avoid consuming a whole
     * product page/container.
     */
    if (
      parts.length === 0
    ) {

      const parent =
        $(node).parent();

      const parentText =
        clean(
          parent.text()
        );

      const withoutHeading =
        clean(
          parentText
            .replace(
              heading,
              ""
            )
        );

      if (
        withoutHeading &&
        withoutHeading.length <=
          1500
      ) {
        parts.push(
          withoutHeading
        );
      }
    }

    const content =
      clean(
        parts.join(" ")
      );

    /*
     * Keep empty sections too:
     * heading existence itself can be evidence,
     * but no random neighbour number is invented.
     */
    const normalizedHeading =
      norm(heading);

    const duplicate =
      output.some(
        section =>
          section.key === key &&
          section.heading ===
            heading &&
          section.content ===
            content
      );

    if (
      !duplicate
    ) {
      output.push({
        key,
        heading,
        normalizedHeading,
        content
      });
    }
  }

  return output;
}

export function getSectionContent(
  sections: ProductSection[],
  key: SectionKey
): string {

  const values =
    sections
      .filter(
        section =>
          section.key === key
      )
      .map(
        section =>
          section.content
      )
      .filter(Boolean);

  return Array.from(
    new Set(values)
  ).join(" ");
}

export function getSectionEvidenceText(
  sections: ProductSection[],
  keys: SectionKey[]
): string {

  return sections
    .filter(
      section =>
        keys.includes(
          section.key
        )
    )
    .map(
      section =>
        `${section.heading}: ${section.content}`
    )
    .join(" ")
    .trim();
}
