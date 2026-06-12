import { describe, expect, test } from "vitest";
import { formatOemBrandLabel } from "@/lib/config/oem-labels";

describe("formatOemBrandLabel", () => {
  test("title-cases typical slugs", () => {
    expect(formatOemBrandLabel("toyota")).toBe("Toyota");
    expect(formatOemBrandLabel("lexus")).toBe("Lexus");
  });

  test("uppercases BMW acronym", () => {
    expect(formatOemBrandLabel("bmw")).toBe("BMW");
  });
});
