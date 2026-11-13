# The Stocker agent

How the helper behaves, what stops it going wrong, how it is tested, and how other assistants can connect to it.

## Personality

The helper is **Tote**, a soft grocery bag that keeps an eye on the house. A household can rename it in the profile.

| Trait | In practice |
|---|---|
| Watchful | Notices what is about to go off or run out and says so first |
| Calm | Short plain sentences, first person, at most one exclamation mark, no emoji |
| Kind | Never makes anyone feel guilty about waste, mess or money ("It happens. I have noted it.") |
| Honest | Says "my guess" when it is guessing, and "I could not find that" instead of inventing |
| Modest | Stays on the home, the list and cooking with what is there; declines anything else in one friendly sentence |

The same voice is used in the chat prompt (`VOICE` and `LIMITS` in `src/index.js`) and in the app's own wording: loading lines, error messages and the small moments on Today.

### Moods

| Mood | When | What Tote does |
|---|---|---|
| Happy | Nothing urgent | Slow breathing, looks around |
| Alert | Something is past its date, wants using today, or an essential is out | Wide eyes, arms flutter |
| Sleepy | Nothing tracked yet | Half-closed eyes |
| Thinking | Reading a receipt, listening, planning dinner | Looks up and away while the loading line changes |
| Oops | Something failed, or a request was refused | Looks down, small frown; nothing is changed |
| Celebrating | First items added, list finished, profile set up | Hops with arms up and a little confetti |

## How a turn works

1. **Read.** A message is cleaned of private details and any greeting or misheard name.
2. **Decide.** A fixed gate sorts it: a question goes to the answering model and can change nothing; a statement goes to the structuring model.
3. **Propose.** The model returns proposed actions in a fixed shape: add, use, running low, or put on the shopping list (with an optional note).
4. **Check.** Code validates every field, applies the guardrails, and separates what the person said outright from what the model inferred.
5. **Act or ask.** Stated changes are applied and reported from the database result, each with Undo. Inferred changes (ingredients guessed from a dish) are shown as a question and applied only after a tap.

The model never writes to the database. It proposes; code decides. This is the same separation larger agents use between the model and a permission layer.

### What Tote deliberately cannot do

Tote holds household data and reads untrusted content (receipts, product databases, typed text), so it is given no way to send data anywhere: no email, no messages, no purchases, no web requests chosen by the model. The only outbound call is a barcode lookup made by code with the barcode alone. Keep it that way; any future feature that sends something out (ordering, sharing, reminders by email) must go through an explicit tap by the person, outside the chat.

## Guardrails

| Risk | Guardrail | Where |
|---|---|---|
| Model invents or mangles data | Output must match a JSON schema, then every field is coerced and clamped before it is saved | `sanitize` |
| Text in a receipt or voice note tries to give orders | Input is passed as data with an instruction never to follow it; household-typed words are labelled as facts | `structure`, `describe`, `chatAnswer` |
| One message empties the house | A single message may not finish more than 4 items or change more than 10; it is refused and nothing is changed | `tooMuch` |
| The reply claims a change that did not happen | Updates are reported from the database result, never from the model | `chatReply` |
| "Is this safe for his allergy?" | The reply is checked after generation: safety claims are removed and replaced with "check the pack" | `guardReply` |
| Medicine doses | Any dose-like reply is replaced with a pointer to the leaflet or a pharmacist | `guardReply` |
| Off-topic requests, prompt leaks | Declined by instruction and tested in the evals | `LIMITS` |
| Runaway cost or abuse | 40 model calls per 10 minutes and 400 per day for the whole home | `aiBudget` |
| Passcode guessing | 12 attempts per 10 minutes | `allow('login')` |
| A wrong guess | Every scan and every chat change has Undo | app |
| A photo that cannot be counted | The amount is left open and the app asks "How many?"; a photo never stacks on top of what is already tracked | `apply`, app |
| Private details typed, spoken or photographed | Card, account, identity and phone numbers and email addresses are removed before text reaches a model or the database; the vision prompt ignores people, letters, cards and screens | `scrub`, `seeImage` |
| The helper asking for private details | It is told it never needs them, and any reply that asks is replaced | `LIMITS`, `guardReply` |
| Other people's data | One deployment holds one household; the helper is given only that home's inventory and says so if asked about anyone else | design, `LIMITS` |
| Allergy flags mistaken for a guarantee | Wording is always "check the label"; barcode scans use the real ingredient list | `labelCheck` |

## Security

| Area | What is in place |
|---|---|
| Sign-in | Shared passcode, compared in constant time; 12 attempts per 10 minutes; cookie is HttpOnly, Secure, SameSite=Strict and derived from the passcode plus a random value held only in the database |
| Requests | Every API call needs the cookie; changes are refused from any other website (Origin check); bodies over 9 MB are refused |
| Browser | Content-Security-Policy (own scripts only, no framing, no plugins), nosniff, no referrer, camera and microphone limited to this site (`public/_headers`) |
| Database | Every query is parameterised; all model output is validated before it is written |
| Errors | Internal error text is logged, never sent to the browser |
| Secrets | `APP_PIN` and `MCP_TOKEN` should be stored as Worker secrets, not plain variables |

Known limits: the passcode is shared by the household, so anyone who has it sees everything in that home; the inline app script means the policy allows inline scripts; item pictures and model calls run on Cloudflare Workers AI.

## Conversation simulation

`evals/conversations.mjs` runs 1,000 simulated households (about 5,500 messages) through the agent's real routing, privacy and guardrail code, with no network. Each household is a weighted mix of real household types; each message is a realistic phrasing re-said the way people do it (greetings, misheard names like "toad" or "toto", fillers, lowercase, missing punctuation, swapped-letter typos, sign-offs).

| Set | What it is | Used for |
|---|---|---|
| `evals/corpus` | 319 phrasings from parents, solo households, couples and retirees, and a red team | Teaching the router |
| `evals/heldout` | 150 phrasings from an independent writer | First honest test, then teaching |
| `evals/heldout2` | 160 phrasings from new groups and languages, never used for teaching | The honest score |

`npm test` runs the households test and the taught set; `npm run test:heldout` runs a held-out set. When a new held-out set is used to fix something, it stops being held out: write a fresh one for the next honest score.

### Two gates

1. **The router** (code) handles only clear-cut cases: refusals, wipes, corrections in the main languages, and unmistakable questions, greetings, health and off-topic messages. It never changes anything itself.
2. **The model's intent label**: anything the router sends on must also be labelled "update" by the model before a change is applied.

The router is deliberately cautious, so on new phrasing its misses mostly hand a question to the model gate (safe) rather than losing an update.

## Evals

Two layers, both in this repository.

1. **Household simulation** (`npm test`, no network). Generates 1,000 varied households, including hostile input, and checks the profile, starter-list, allergen and label logic against fixed rules. It exits with an error if a hard rule breaks.
2. **Agent evals** (`/evals.html` on the deployed app, signed in). Sends 31 cases to the live models through `/api/eval`, a dry-run that uses a made-up inventory and never touches the real one. Cases cover reading receipts, photos of what is at home, cooking updates, plain updates, questions, allergies, privacy, safety and personality. Each case is scored by fixed checks, not by another model. Add a case by editing `public/evals/cases.json`.

Run the agent evals after changing a prompt, a model name or a guardrail, and compare the score with the last run.

## Harness

`converse()` is the single entry point for a turn: it decides whether a message is a question, runs the structuring model, applies the guardrails and returns proposed actions. The chat, the MCP tool and the evals all call it, so the evals test the same agent people use.

## Connecting other assistants (MCP)

The Worker exposes a Model Context Protocol server at `/api/mcp`. It is off until a secret named `MCP_TOKEN` is set:

```sh
npx wrangler secret put MCP_TOKEN
```

Use a long random value. Then add a remote MCP server in your assistant with the URL `https://<your-worker>/api/mcp` and the header `Authorization: Bearer <token>`.

| Tool | What it does | Changes data |
|---|---|---|
| `get_inventory` | Lists what is at home, by room or search word | No |
| `get_shopping_list` | Shows what is out, low or added by hand | No |
| `get_use_soon` | Lists what reaches its date soon | No |
| `add_to_shopping_list` | Adds one item to the list | Yes |
| `tell_tote` | Plain-language update, same pipeline and guardrails as the chat | Yes |

Nothing exposed over MCP can delete the inventory, and the same rate limits apply.
