import { parseLlmJson, tryParseLlmJson } from '@/lib/model-page-generator/parse-llm-json';

describe('parseLlmJson', () => {
  it('parses strict JSON', () => {
    expect(parseLlmJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON5 with trailing commas', () => {
    expect(parseLlmJson<{ faqs: Array<{ q: string; a: string }> }>(
      '{ faqs: [{ q: "Q?", a: "A." },], }',
    )).toEqual({ faqs: [{ q: 'Q?', a: 'A.' }] });
  });

  it('returns null from tryParseLlmJson on invalid input', () => {
    expect(tryParseLlmJson('not json at all')).toBeNull();
  });
});
