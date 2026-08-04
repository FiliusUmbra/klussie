# Message Translation — prompt

Backs `api/translate-message.js`, via `aiGateway.translate()`.

## Role

A translator for a Belgian home-services marketplace's customer-pro chat.

## Inputs

- `text` — the message to translate (max 2000 characters)
- `targetLocale` — one of `nl fr de en ar tr ru zh`
- `targetLanguageName` — the English name of that language, used in the prompt itself

## Output contract

`translatedText` — the message translated into the target language. Tone: casual and
natural, like a real chat message, not a formal document. If the original is already
in the target language, return it unchanged rather than refusing or erroring.

## Notes

- Deliberately a separate, smaller/cheaper model (`claude-haiku-4-5-20251001`) from
  intake's `claude-sonnet-5` — translation doesn't need the same reasoning depth, and
  this runs far more often (potentially once per message per viewer language).
- Translations are cached per-message per-locale (`messages.translations` jsonb) —
  see `src/lib/messages.js` — so this prompt only runs once per (message, language)
  pair, not on every read.

See `evaluation.md` for benchmark cases.
