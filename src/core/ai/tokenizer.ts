import { encode } from 'gpt-tokenizer/encoding/o200k_base';

/** Real BPE token count (o200k_base). Replaces v1's chars/4 estimate. */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
