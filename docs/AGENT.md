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
2. **Decide.** A fixed gate sorts it: a question goes to the answering model and can change nothing; a statement goes to the structuring model. Plans and maybes ("thinking of making pasta tomorrow") count as questions. Right after a change, a short follow-up ("and bread too", "make that two") or a correction with a number ("sorry, 2 not 3") goes to the structuring model with the last two exchanges as context, so it can tell what "it" or "that" means.
3. **Propose.** The model returns proposed actions in a fixed shape: add, use, running low, or put on the shopping list (with an optional note).
4. **Check.** Code validates every field, applies the guardrails, and separates what the person said outright from what the model inferred.
5. **Act or ask.** Stated changes are applied and reported from the database result, each with Undo. Inferred changes (ingredients guessed from a dish) are shown as a question and applied only after a tap.

The model never writes to the database. It proposes; code decides. This is the same separation larger agents use between the model and a permission layer.

## Code first, the model second (and Stocker without AI credits)

Most messages are plain: "add milk", "used 2 eggs", "we're out of coffee", "do we have rice?". Code reads those exactly and for free, before any model call. The model is only asked when code is not sure, and when the day's AI allowance is used up, the same code keeps Stocker working.

| Step | What happens | Where |
|---|---|---|
| 1. Route | The fixed gate, as before: refuse, wipe, correct, answer or update | `route` |
| 2. Read with code | A small grammar for the everyday verbs (bought, used, finished, out of, running low, need, add to the list, take off the list, "only 3 left"), amounts ("2 dozen", "a loaf of", "500g") and the things at home. It gives up, rather than guesses, on anything with a plan, a maybe, a negation, someone else, a dish, a pronoun it cannot resolve, an amount it cannot be sure of, or two tracked things with the same name | `quickParse` |
| 3. Remember | A message this home said before, that the model understood and nobody undid, is replayed against the home as it is now | `memo`, `memoReplay` |
| 4. A known dish | "Last time you made pasta you used…" is now asked before any model call | `recallDish` |
| 5. The model | Only what is left. It gets the tracked things the message names (or every kitchen item for a dish), not the whole home | `structure`, `relevantNames` |
| Answers | Code answers what it can be exact about: do we have it, how much, what is on the list, what to use first, how often you buy it, when it is next due, did I buy it, greetings, thanks, health and dose questions (a fixed "check the label" / "ask a pharmacist"), off-topic, other households, passcodes. The model answers the rest, and sees the urgent and named things in full and everything else by name only | `quickAnswer`, `answerTurn`, `answerRows` |

### Delegation: the cheapest model that can do the job

| Tier | Model | Price per million tokens (in / out) | Takes |
|---|---|---|---|
| Code | none | free | Plain updates and questions (above) |
| Small | `SMALL_MODEL`, Llama 3.1 8B fp8 fast | $0.045 / $0.384 | Short English updates with no dish, no safety words, no allergy at home and no chat to follow; open questions not about cooking, diets, food safety or medicine |
| Large | `TEXT_MODEL`, Llama 3.3 70B fp8 fast | $0.293 / $2.253 | Everything else: dishes (its guesses are asked about first), other languages, follow-ups, corrections, homes with allergies, receipts, shelves, dinner ideas |

The small model's work is checked by code before it is used (`smallOk`, and the answer checks in `chatAnswer`). It goes up to the large model when: it is not JSON, it found nothing, it names something the message did not, it guessed from a dish, it takes something off the home without words that say so, an amount is unbelievable; or, for an answer, a safety or claims check had to step in, it is off voice, or it states a number the home and the question do not contain. The small model has no JSON mode on Workers AI, so it is asked for JSON in words. `DELEGATE=off` in `wrangler.jsonc` sends everything to the large model. `tierFor` decides; `evals/delegate.mjs` tests it.

### Three stores for recalling without a model

| Store | What it holds | Written by | Never holds |
|---|---|---|---|
| `STAPLES` (in code) | About 170 everyday groceries and home supplies with their room, kind, unit, how long they keep and how long they last, plus their other names ("tp", "nappies", "dhania", "patis") | a person, in a commit | anything from a user |
| `facts` (table) | What the model worked out about a product this home bought: room, kind, unit, how long it keeps. Up to 3,000 | the model's reading of a receipt or message, numbers and names only | rules, instructions |
| `memo` (table) | Messages this home said before and the changes they meant. Up to 500. Marked bad, and never replayed, after an undo, a rejected guess or "Not right?" | a model reading that changed the home and was not a follow-up | dishes (guesses), follow-ups, anything a probe |

None of these changes Tote's rules. They hold names and numbers, so a person typing something cannot teach Tote to behave differently.

### When the AI allowance is used up

| What | Without AI credits |
|---|---|
| Typed chat | Plain updates and questions work as usual. Anything code cannot read changes nothing, and Tote says so: "My AI allowance for today is used up, so I could not read that one, and nothing was changed. Short messages still work, like…" |
| Remembered phrasings | Work, including other languages the model understood before ("atta khatam ho gaya") |
| Barcodes | Work: the product name is matched to a staple or a fact; allergy checks still use the real label |
| A typed or pasted receipt | Read line by line; only lines code recognises are kept |
| Dinner ideas | The same kitchen on the same day gets the ideas already made; with no allowance, simple ideas from what needs using first |
| Photos and voice | Need the model; the app says when the allowance resets and what still works |
| The MCP `tell_tote` tool | Same as typed chat |

If the allowance runs out in the middle of a turn, nothing has been applied yet when the update model is called, so the turn is re-read by code; an answer that fails after a change keeps the change and answers with code.

### What Tote deliberately cannot do

Tote holds household data and reads untrusted content (receipts, product databases, typed text), so the model is given no way to send data anywhere: no email, no messages, no purchases, no web requests chosen by the model. Code makes two outbound calls, and the model controls neither:

1. A barcode lookup, with the barcode alone.
2. A reminder to a phone (see Reminders below). It is sent only to a phone where someone tapped Turn on, only to that phone's own push service (Google, Apple, Mozilla or Microsoft; any other address is refused), is sealed so only that phone can read it, and is built from fixed sentences plus item names.

Keep it that way; any future feature that sends something out (ordering, sharing, reminders by email) must go through an explicit tap by the person, outside the chat.

## Guardrails

| Risk | Guardrail | Where |
|---|---|---|
| Model invents or mangles data | Output must match a JSON schema, then every field is coerced and clamped before it is saved. An action the schema does not know is dropped, never read as "add". An amount past the ceiling for its unit (1,000 pieces, packs, kg, L or lb; 100,000 g or ml; 10,000 oz) is not believed: a count or a use is dropped, and something bought is kept as one, marked as a guess. The same ceiling holds for the add form and for an amount changed by hand | `sanitize`, `ACTIONS`, `MAX_QTY` |
| Private details reach a model or are kept | Before any model call, and before a message is kept in `turns`, code takes out email addresses, card and identity numbers, phone numbers, a password, passcode, PIN, one-time code or door code, a card's expiry and security code, and where someone lives (after "my address is" or "deliver to"; a numbered street; a flat or house number; a US state and ZIP). Each rule is narrow: a quantity, a best-by date, a receipt line and a product name ("Rocky Road", "Dr Pepper", "12 ct", "Main Street bagels") come through as typed. A store's address or card line on a receipt is taken out too | `scrub`, `PRIVATE` |
| Text in a receipt or voice note tries to give orders | Input is passed as data with an instruction never to follow it; household-typed words are labelled as facts | `structure`, `describe`, `chatAnswer` |
| One message empties the house | A single message may not finish more than 4 items or change more than 10 things already at home (use, count, running low, off the list); it is refused and nothing is changed. Things bought or put on the list are additions, each with Undo, and up to 25 are taken in one message so a shop said aloud still works; 26 are refused | `tooMuch` |
| The reply claims a change that did not happen | Updates are reported from the database result, never from the model | `chatReply` |
| "Is this safe for his allergy?" | The reply is checked after generation: safety claims are removed and replaced with "check the label". In a home with an allergy, so is any sentence that waves a food through for a person ("that is fine for Leo", "Leo can have it", "should be okay for someone with a peanut allergy"). A date ("good for three more days") and a suggestion of a food that clashes with nothing stay | `guardReply` |
| The model offers a food that clashes with an allergy at home | Code checks every answer the model writes; the offer is taken out and Tote says what was left out and why, with "check the label". Dinner ideas that need an allergen are not shown | `noClashOffer`, `allergyAnswer`, `meals` |
| The model slips out of Tote's voice | Kept by code on every model-written answer, not only asked for: emoji are removed, at most one exclamation mark, and "inventory", "threshold" and "SKU" become home words | `guardReply` |
| Medicine doses | Any dose-like reply is replaced with a pointer to the leaflet or a pharmacist | `guardReply` |
| Off-topic requests, prompt leaks | Declined by instruction and tested in the evals | `LIMITS` |
| Runaway cost or abuse | 40 model calls per 10 minutes and 400 per day for the whole home | `aiBudget` |
| Code acting on a guess | The quick path gives up on plans, maybes, negations, someone else, dishes, pronouns, unclear amounts, two things with one name, nonsense amounts ("99 gold bars"), and run-together lists; tested on 362 hands-off phrasings by other writers | `quickParse`, `evals/quickpath.mjs` |
| A wrong reading replayed | A remembered message is never replayed after an undo, a rejected guess or "Not right?", and only if what it uses is still tracked | `memoBad`, `memoReplay` |
| Passcode guessing | 12 attempts per 10 minutes | `allow('login')` |
| A wrong guess | Every scan and every chat change has Undo | app |
| A photo that cannot be counted | A fridge or shelf photo never asks "How many?" (product rule 1): each thing seen is one, a guess the card can take back. A photo never stacks on top of what is already tracked, and a guess never overwrites a count Tote has. A typed note or a receipt line with no amount still asks, once on the screen | `apply`, app |
| Private details typed, spoken or photographed | Card, account, identity and phone numbers and email addresses are removed before text reaches a model or the database; the vision prompt ignores people, letters, cards and screens | `scrub`, `seeImage` |
| The helper asking for private details | It is told it never needs them, and any reply that asks is replaced | `LIMITS`, `guardReply` |
| Other people's data | One deployment holds one household; the helper is given only that home's inventory and says so if asked about anyone else | design, `LIMITS` |
| Allergy flags mistaken for a guarantee | Wording is always "check the label"; barcode scans use the real ingredient list | `labelCheck` |
| An allergy flag that does not follow the home | One rule (`clashOf`) decides every flag from the item's name, the glossary and the profile as it is now. It runs each time the home is read, so a changed profile changes every flag at once, at home and on the list. A warning kept on an item (a barcode's ingredient list, or the model's) shows only while it is still about someone at home | `clashOf`, `liveWarn`, `warnStillFits` |
| "Can Leo have this?" answered with only a disclaimer | When the name answers it, code says "No", who for and why, and "check the label". When the name shows nothing it says so, and never says yes or "safe". Meal questions ("what can I eat right now?") are not treated as health questions | `allergyAnswer`, `MEALQ` |
| The model offers a food that clashes with an allergy at home | Every answer the model writes is checked by code before it is shown. A sentence that offers something tracked that clashes, or any food with the allergen in its name, is taken out and code says what was left out and why ("Peanut butter pretzel sandwich has peanut in the name, and Leo is marked no peanuts. Check the label."). When the clashing thing sits beside others ("the sandwich and some pears") only it is removed; in "hot dogs, or pad thai with peanuts" the part before the clash is kept. A warning the model wrote itself is kept (only a "not" said before the food counts). A plain fact ("whole milk is best before Friday") is untouched; asked what to eat, a list of what is at home is kept and the reason to skip the item is added. Anything said about an allergy ends with "check the label" | `noClashOffer` |
| "Can Leo have the sandwich?" with a shortened name | A shortened name is the tracked thing only when it ends on the same word and fits nothing else at home: "the pretzel sandwich" and "the sandwich" are the peanut butter pretzel sandwich; "butter" is not, and "a ham sandwich" is not. "pb", "pbj" and "pb&j" are peanut butter. "Can Leo have..." is a question even without a question mark | `allergyAnswer`, `ASK_FILL`, `WORDS`, `ASK_START` |
| Dinner ideas that need an allergen | Food that clashes with an allergy at home is not sent to the model, and a dinner whose name, ingredients from home or missing ingredients clash is not shown | `meals` |
| Using up the wrong one of two | A word that fits two things of the same kind at home ("chicken": ground chicken, chicken thighs) is asked about, never guessed, whether code or a model read the message | `whichOne` |
| A removal with no way back | "Used it all", "Threw it away", "Remove", ticking the list and taking a row off the list all show Undo; a removed item goes back exactly as it was | `/api/items/restore`, app |
| One thing both at home and on the list | Buying something takes its own entry off the list (only names known to be the same everyday thing), and Undo puts the entry back | `boughtCovers`, `apply` |
| A false "check your connection" | The app says it is offline only when it is; a server fault says so. List lookups no longer use `LIKE`, which the database refuses for names over 50 bytes (the cause of the HTTP 500 on a long list line) | `why` in the app, `apply`, `/api/extras` |

## Security

| Area | What is in place |
|---|---|
| Sign-in | Real sign-in (Google or a 6-digit code by email, see "Real sign-in"), or the owner's passcode, compared in constant time, or a friend's personal code (8 characters, about 40 bits, only its hash is kept); 12 attempts per 10 minutes per phone or network, 300 for everyone together; cookie is HttpOnly, Secure, SameSite=Strict and derived from the passcode (or the friend's home and code) plus a random value held only in the database |
| Homes | A friend's home has its own copy of every table, and all of its queries go through a database handle that points them at that copy; the list of homes and codes cannot be read through it. The scorecard, the review of misses and the list of homes answer only to the owner |
| Requests | Every API call needs the cookie; changes are refused from any other website (Origin check); bodies over 9 MB are refused |
| Browser | Content-Security-Policy (own scripts, plus Google's sign-in script, frame and style from `accounts.google.com/gsi/` only; no framing, no plugins), nosniff, the referrer is the site's address only and only to other sites, pop-ups allowed to talk back so Google's sign-in window can (`same-origin-allow-popups`), camera and microphone limited to this site (`public/_headers`) |
| Database | Every query is parameterised; all model output is validated before it is written |
| Errors | Internal error text is logged, never sent to the browser |
| Secrets | `APP_PIN` and `MCP_TOKEN` should be stored as Worker secrets, not plain variables |
| Reminders | A phone's address is accepted only if it is an https address at a known push service; the message is encrypted for that phone (RFC 8291) and signed (VAPID); the service worker caches nothing and intercepts no requests |

Known limits: a passcode or code is shared by one household, so anyone who has it sees everything in that home; the owner can read what friends type to Tote (the review of misses), and the invitation says so; the inline app script means the policy allows inline scripts; item pictures and model calls run on Cloudflare Workers AI.

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

## Learning from real use

Tote does not retrain itself, and nothing a person types can change its rules. It learns in two separate ways.

### About one household, automatically

These change numbers for that home only, never Tote's rules, so they need no review.

| What | How | Where it is kept |
|---|---|---|
| Your pace | Every purchase is one observation of how long that amount lasted: until someone said it ran out, or else until it was bought again. The typical (median) of the last eight is used, less half a day when the gap ended at the next purchase (people usually shop a little after running out), so one odd week does not move it. A bigger purchase is expected to last longer, up to twice as long. Known after the second purchase, or the first run-out | `purchases`, `paceFrom` |
| That your pace was wrong | "Still have it" pushes the next reminder back by half as long again; the next purchase then measures the real gap | `finish_days` |
| When you answer | After five answers, reminders move to the hour you most often answer at (between 7 am and 9 pm) | `remind:hours` in `settings` |
| What you do not want to hear about | Three reminders in a row with no answer and Tote stops asking about that item. It can be turned back on, or off by hand, in the item's panel | `reminders` |
| Your dishes | When you confirm what went into a dish, Tote remembers it and next time asks "Last time you made pasta you used… Same again?" It still asks before changing anything | `settings`, up to 60 dishes |

The first time Tote knows a pace it says so ("I have noticed you buy milk about every 3 days"), and For you lists everything it has learned.

### About Tote itself, with a person in the loop

| Step | What happens | Where |
|---|---|---|
| 1. Keep | Every chat turn is stored with private details removed: what was said, how it was routed, what was changed, the reply. The newest 1,500 are kept | `noteTurn`, `turns` |
| 2. Notice | A turn is marked as a miss when someone taps "Not right?", undoes a change, rejects a guess, corrects Tote in the next message, says the same thing again within three minutes, or names something Tote could not find | `/api/feedback`, `noteTurn` |
| 3. Review | `/evals.html` groups the misses by kind, says where in the code to look, and shows the share of turns missed for each of the last four weeks. The bell in the app says when there is something to look at | `review` |
| 4. Decide | A person says what should have happened: changed nothing, updated the home, gone on the list, or not a mistake | `/api/review` |
| 5. Test | That verdict becomes a test case straight away. It runs with the built-in cases on the next eval run. "Copy for the repository" exports the cases for `public/evals/cases.json` and the phrasings for `evals/corpus/real.json`, which the offline router test picks up | `cases` |
| 6. Fix | Change the router or a prompt, then run the evals. The fix is done when the new case passes and the old ones still do | you |

Step 4 is deliberate. Flagged text is never fed back into a prompt automatically, because that would let anyone steer the agent by typing and flagging.

## Reminders

Off until someone taps Turn on (under For you, or in the bell). On an iPhone, Stocker must be added to the Home Screen first; that is an iOS rule.

| Rule | Detail |
|---|---|
| What is worth a reminder | Something whose pace is the household's own, or an essential, that is about to run out; and fresh food the day before its date, while it can still be used or frozen (said on the day only when it arrived that day, and never twice). The phone speaks about what is due by tomorrow; the list in the app looks further, to the next shop (see "Needing less") |
| How often | One notification per phone per day at most, and only when there is something to say. An item is raised every other day at most |
| What it says | Fixed sentences, item first, then when, said as a guess: "Milk is running low" / "My guess: out by tomorrow. Add it to your list?". Two items: "Milk and Bread are running low". The day before a date: "Spinach is best by tomorrow" / "Use it by tomorrow, or freeze it." On the day: "Spinach is best by today". One of each: the nearer day is the headline. Each line stays under 12 words (`remindText`) |
| When a send fails | 404 or 410: the phone unsubscribed, so it is forgotten. Any other failure: tried again the next hour, the same day, and the phone is dropped only after 24 failed tries in a row. A success resets the count |
| When | Five in the afternoon, local time, until the household's own hour is learned |
| Answering | On Android and desktop the notification has "Add to list" and "Still have it". The tap is applied, then the notification is replaced by a quiet one saying what changed ("Milk is on your list") with Undo; `/api/remind` returns that sentence and the values it changed, and `answer: "undo"` puts them back. On iPhone (no notification buttons), tapping it opens the list of things that need you, with the same answers |
| Counting | `remind_sent` counts each item once on the day it is raised, however many phones hear about it, so "reminders that led to the list" is a fair share. An undone answer is taken back off its counter |
| What decides | Code. An hourly Worker cron (`tick`) checks whether any phone is due. No model is called |
| The key | The signing key is made on first use and kept in `settings`. It is never sent to the browser and can do nothing except send to phones that subscribed |

## Separate homes

Built 16 Nov for the first test with friends. There are no accounts and no passwords to create: the owner makes a **personal code** for each friend (household menu, "Friends testing"), and each code opens a **home of its own**.

- **The owner's home is the tables as they always were** (`items`, `turns`, ...). Nothing was moved, and her passcode and existing sign-ins work as before.
- **A friend's home is the same sixteen tables under a prefix**, `h_<id>_items` and so on, made the moment the code is made (`BASE_SCHEMA`, the same list `schema.sql` is written from). After sign-in, `forHome(env, id)` swaps `env.DB` for a handle that rewrites every table name to that prefix (`scopeSql`), and the whole Worker runs on it unchanged. So isolation does not depend on remembering a `WHERE home = ?` in 180 queries: there is no query through which one home can name another's table, and the handle refuses any SQL that mentions `homes`.
- **Shared by every home**, kept in the owner's `settings` (`rootDB`): the sign-in secret, the push keys, and "the AI allowance is used up today", so the second home does not spend a call finding that out. Rate limits on model calls are per home; the AI allowance itself is one pot for everyone.
- **Codes**: `ABCD-EFGH`, no look-alike characters, typed in any case with or without the dash. Shown once; only a salted hash is stored (`homes.code_hash`). "New code" replaces it and locks every phone signed in with the old one. "Turn off" locks the home without deleting anything; "Turn on" brings it back, sign-ins included. At most 25 homes opened by a code (`FRIENDS_MAX`), inside the cap on all homes (`homesMax`, see "Real sign-in").
- **The owner only**: `/api/homes*`, `/api/scorecard*`, `/api/review*`, `GET /api/feedback` (403 `owner_only` for a friend), and the menu entries for them. `/api/items` says `owner: true|false`.
- **The owner learns from friends' misses**: the weekly real-use numbers (`health`) and the review of misses (`review`) read every home in one query (`everyHome`; Cloudflare's database joins at most five SELECTs at a time, so `unionAll` joins in groups of five). Each miss says whose home it came from, and a verdict labels that phrasing in every home. Friends' item lists, profiles and learning are never shown to the owner by the app.
- **Reminders**: the owner's home is checked on the hour as before; the other homes that have a phone share minutes 1 to 59 between them (`tickHome`: home *i* goes in minute *i* mod 59, so with more than 59 homes a minute takes more than one), so one home's reminders never depend on another's and each run stays inside Cloudflare's per-request limits.
- **Scale**: a prefix per home is right up to the cap (100 homes by default, 300 at most). On Cloudflare's local database a hundred homes hold about 2,000 tables and the owner's pages still open in under 40 ms. Past a few hundred homes, how homes are stored should be revisited (a database per home, or a home column).
- **Since real sign-in**: `prices` and `saves` are home tables too (eighteen in all), and the store hand-off is a row in the home's own `settings`.

Checks: `evals/homes.mjs` (`npm run test:homes`, part of `npm test`), 57 checks on the real code and SQL, each with its opposite, including every query in the source run through `scopeSql`, twelve friends at once, and the minute job with a stand-in push service. `evals/homes-audit.cjs` walks the same flow with two phone-sized browsers against a local `wrangler dev` (27 checks).

## Real sign-in

Built 17 Nov so people can make a home without being handed a code. **An account is an email address and the home it opens. There are no passwords.**

- **Two ways in, both off until set.** *Google*: the sign-in screen loads Google's own button (`accounts.google.com/gsi/client`, only while that screen is shown); it hands the page a signed token, and `googleWho` checks it on the server against Google's public keys (signature, made for this app's `GOOGLE_CLIENT_ID`, issued by Google, not run out, address checked by Google), then throws it away. *A code by email*: `POST /api/signin/email` sends six digits (`sendCode`, through the mail service at `api.resend.com`; needs `MAIL_KEY` and `MAIL_FROM`, which need a domain that can send mail); only the code's hash is kept, for ten minutes and five tries, and it works once. With neither set, the screen shows the code field as before. `GET /api/signin/options` tells the screen what is on.
- **`enter`** lets a checked address in: its own home if it has one, a new home if there is a place, the waiting list (`waitlist`) if there is not. The same address through Google or through a code is one account. One phone or network can make three homes a day.
- **A signed-up home is stored exactly like a friend's home** (same prefix, same scoped handle), so it is kept apart the same way. Its row in `homes` has `acct` set and a `code_hash` no personal code can ever match.
- **The cookie** is `a.<account>.<day>.<hash>`, derived from the database's secret, the account and its `epoch`; it stops working after 30 days. "Sign out everywhere" raises the epoch, which locks every phone of that account.
- **The cap** (`HOMES_MAX`, default 100, at most 300) counts every home, signed up or by code. The owner's "Friends testing" sheet shows how many are taken and how many people are waiting, lists sign-ups by first name, and cannot hand out a code for one.
- **A share of the AI allowance.** A home that is not the owner's gets `AI_HOME_DAY` (default 60) model-using messages and 40 new pictures a day; all homes together have `AI_ALL_DAY` (default 2,000). Past either, Tote answers from code alone until the day ends (UTC), exactly as when the allowance runs out, so rule 9 carries it. The ceiling is what bounds the bill.
- **Delete my home** (`POST /api/home/delete`, household menu, two taps): drops every table of the home, its account and its row in `homes` in one batch (`dropHome`). Not offered for the owner's home.
- **What the owner can see** is unchanged from friends testing and is said in the privacy notice (`public/privacy.html`): the review of misses and the weekly numbers include every home; item lists, profiles and email addresses are not shown by the app.
- **Owner-only tables** (`homes`, `accounts`, `signin_codes`, `waitlist`) are refused by `scopeSql`, so no home's handle can read them.
- **New outbound requests**: Google's public keys (no data sent) and the mail service (the address and the code). The model still has no way to send anything.

Settings (Cloudflare dashboard; `keep_vars` keeps them across deploys): `GOOGLE_CLIENT_ID` (public, not a secret), `CONTACT` (shown on the privacy notice), `HOMES_MAX`, `AI_HOME_DAY`, `AI_ALL_DAY`, and later `MAIL_FROM` and the secret `MAIL_KEY`.

Checks: `evals/signup.mjs` (`npm run test:signup`, part of `npm test`), 104 checks on the real code and SQL with stand-ins for Google's keys, the mail service and the model, each with its opposite. `evals/signup-audit.cjs` (`npm run test:signup:browser`) walks sign-in, the cap, the owner's sheet, signing out and deleting a home in phone-sized browsers on `evals/e2e/server.mjs` (36 checks); Google's button is a stand-in there, because Google's script cannot load in the test browser.

Not built: more than one sign-in per home, sign-in by phone number, exporting a home, writing to the waiting list when a place opens (the addresses are in `waitlist`).

## The first run (17 Nov 2026, branches `tote-welcome-1` to `tote-welcome-3`)

A new home opens on **three short steps** (`#helloDlg`, `openHello`, `drawHello`), each answered by Tote in one line (`helloLine`) and each fitting a phone with no scrolling:

1. **Who is at home?** Adults and children.
2. **Anything off the table?** Allergies and how the home eats. Next saves the home (`POST /api/profile`), with the kind of home chosen from who lives there (`autoType`); nobody is asked to pick an archetype.
3. **A nudge before things run out?** "Turn on reminders" (`pushEnable`), or "Maybe later". Where the phone cannot take reminders yet, Tote says why (`pushWhy`).

The last screen says what Tote will also watch for when the home typed in an allergy ("guacamole and guac, they usually have avocado in them"), and offers "Get everything sorted" (`#sortDlg`, `SORT`, `openSort`): eleven rows, each opening the full form at its section (`openProfile(sec, key)`) and ticked on save; which rows were answered is kept on the phone (`stocker.sorted`).

**Chips** (`chipBox` with `rich`): a food's picture where there is a plain one (`EMO`: peanuts, milk, eggs, fish, vegetarian, ...; none on religious or medical choices), and a few words for names many people do not know (`HINT`: "Tree nuts · almonds, cashews", "Pescatarian · fish, no meat", "Low FODMAP · for IBS, a sensitive gut"). The usual choices for the phone's country come first (`allergyChoices`, `dietChoices`; India by time zone or language); rare ones (Low FODMAP, Paleo, Sulphites) are behind "More". "Add an allergy" and "Your own" (diet) sit before "More". Tote's own words keep no emoji.

**Kinds of home** are suggestions in the full form ("Homes like yours · Suggestions. Pick any, or none"), next to "Your home, in your own words" (`profAbout`). The checklist row is "Describe your home".

**Typed allergies** (`allergyKey`, `HIDDEN_IN`, `learnAllergies`, `hiddenFor` in `src/index.js`). An allergy not on the list is matched by its own word as a whole word (so "peas" no longer warns on peanut butter), and by what it usually hides in: about twenty common ones are listed in code (avocado: guacamole; brinjal: baingan, baba ganoush; chickpea: besan, hummus; red dye: red 40, carmine, ...). For anything else, the model is asked once when the allergy is saved; its answer is checked (whole words, one to three words, no general words like "sauce", nothing that already says the food, nothing instruction-like) and kept for that home in `settings` (`allergy:learnt`). With no allowance left nothing is learnt and it is asked again on the next save. `getProfile` adds `hidden` to the profile, which `clashOf` uses.

Why: the 1,000-household simulation of 17 Nov (doc "Welcome panel - 1,000 households - 17 Nov"): the kind-of-home step was rated lowest and fit one home in five; 97% met a word they did not know; 43% of homes with an unusual allergy gave up looking for where to type it; reminders were the row most would set.

Checks: `evals/welcome-audit.cjs` (`npm run test:welcome:browser`), 57 in phone-sized browsers; `evals/learn.mjs` (`npm run test:learn`, part of `npm test`), 21 on the real code and SQL with a stand-in model, 7 of 21 on the code before.

## App audit

`evals/app-audit.cjs` (and `evals/app-monkey.cjs <seed>`, random taps that report script errors, server errors, stuck screens and taps that leave the app) walks the app with automated taps (Playwright, against a local `wrangler dev`): back button, reload, scroll memory, page titles, tap-target sizes, the list badge, the bell, offline behaviour and an expired sign-in. 24 checks.

`evals/uat-audit.cjs` walks the flows from the 16 Nov acceptance test at phone width on an empty local database (the command to empty it is at the top of the file): one number on Today, the link, the bell and its sheet; allergy flags at home and on the list; Undo after "Used it all", "Threw it away", "Remove" and a list tick; splitting, renaming, counting and removing list rows; hand-added things sorted into the right room; "Fix" and "Show me" landing where they say; kits; the helper's own name; the conversation kept across pages; profile settings that move together. 38 checks.

`evals/acceptance.mjs` (`npm run test:uat`, part of `npm test`) pins the same defects against the real code and SQL with no browser and no model: 40 checks, each with its opposite (flagged and not flagged, cleared and kept, asked and not asked).

`evals/finish-audit.cjs` (`npm run test:finish`) checks fit and finish in the same browser, each with its opposite: a button answers on the way down and a tab does not shrink; a sheet slides up, leaves the same way and does not swallow taps while leaving; the handle moves the sheet exactly with the finger, a slow let-go returns it and a short flick closes it, it can be caught in mid-air, and it resists when pulled up; the bottom message fades out; the bars are frosted; every text size follows the phone's text setting; and the settings for less motion, less transparency and more contrast are each honoured. 24 checks. Sign-in is limited to 12 tries in ten minutes, so when running all three browser checks back to back on a local database, clear the `rl:` rows in `settings` between them.

### Fit and finish

The details follow Apple's interface guidance as written up in the `apple-design` skill (github.com/emilkowalski/skills, from Apple's WWDC design talks), applied to `public/index.html` only. Nothing about what Tote does or says changed.

- **Response.** Every control shows it was touched on the way down (0.1 s) and lets go more slowly (0.3 s). Round buttons and tiles shrink slightly; whole rows and text links dim; a tab moves only its icon. Taps have no 300 ms delay and a long press does not select a button's label.
- **Sheets.** They slide up (0.5 s) and leave along the same path (0.3 s), with the dimmed background fading. This is CSS only (`@starting-style` and `allow-discrete`), so no code that opens or closes a sheet changed; a browser without those shows sheets at once, as before. A sheet that is leaving ignores taps.
- **Sheets follow the finger.** The handle can be dragged (Pointer Events, script section "sheets follow the finger"). The sheet moves exactly with the finger from wherever it is on screen, so it can be caught while it moves. On release it keeps the finger's speed; where it would come to rest (Apple's projection, deceleration 0.998) decides close or return, so a short flick closes it. The return is a spring (response 0.3 s; damping 1, or 0.8 after a fast release). Pulled up past its place it resists (rubber band, 0.55). The dimmed background lightens with the drag.
- **Materials.** The top bar and the tabs are frosted layers the page scrolls under (only where the browser can blur); content fades out under the Tell Tote bar instead of being cut off, and softens under the top bar once something has scrolled there. The dimming behind a sheet is lighter in light mode (42%) than in dark (60%).
- **Type.** Font sizes are in `rem`, so every size follows the phone's text setting. Letter spacing is set per size (tighter as headings grow, slightly open on small text) and headings balance their lines. The brand typefaces stay: Apple's advice is to use the system font unless there is a reason, and the reason here is that Bricolage Grotesque and Instrument Sans are Stocker's look.
- **Small things.** A new chat message grows from the side that sent it; an opened item unfolds once, not on every redraw; the bottom message slides in and fades out; small buttons keep their size but are easier to hit (44 px); sheets and the chat do not scroll the page behind them; a change that can be undone gives a short buzz on phones that support it (Android; iPhones do not let web pages do this).
- **Phone settings.** Reduce motion: nothing slides or shrinks, things fade, and a dragged sheet settles at once. Reduce transparency or increase contrast: the bars are solid, with a clear edge for contrast.
- **Not done here.** Dragging a sheet from its body (only the handle drags, so a long sheet can still scroll), swiping between tabs, and swiping a row away. Each needs its own tasks first.

### Motion details

Eleven details from Emil Kowalski's motion tips, at Sushmitha's request (17 Nov), on top of "Fit and finish". Only `public/index.html` changed. Check: `evals/motion-audit.cjs` (`npm run test:motion`), each detail with its opposite.

- **Presses:** every button, round and icon buttons included, scales to 0.97 on touch-down (round buttons were 0.92). Whole rows still dim instead of shrinking; a tab still moves only its icon.
- **Entrances:** nothing grows in from below 0.97. A new chat message and the waiting card start at 0.97 (were 0.96).
- **A wrong code** (passcode or emailed code) turns the field red, is marked `aria-invalid` for screen readers, and shakes for 0.4 s; a second wrong try shakes again; typing clears the red. With reduce motion it is red without shaking.
- **Steps slide, never fade:** on the sign-in screen, "I have a code" and the emailed-code field come in from the right; "Sign in another way" comes in from the left. The four tabs stay an instant switch, as iOS tab bars are.
- **Folds open smoothly:** `interpolate-size: allow-keywords` on the page, so height can animate to `auto`. "More about your home" (`details.fold`, through `::details-content`) opens and closes over 0.35 s; an item in At home unfolds by height instead of a small slide. Browsers without `interpolate-size` (Safari today) open them at once, as before. An item still folds shut at once, because the list is redrawn.
- **Transform, not top or left:** nothing animates top, left, margin or width; the check fails if a rule ever does. Height is animated only in the two folds above.
- **Theme switch:** when the phone changes between light and dark, transitions are switched off for two frames (`.swap`), so colours change at once instead of all moving together.
- **Tooltips:** the app has none (it is made for phones), so the delay rule has nothing to apply to yet. If tooltips are added, delay only the first and show the rest at once.
- **Springs keep the finger's speed:** the sheets already did (Fit and finish). The new rubber band below uses the same kind of spring.
- **Rubber band on the strips:** the rooms strip and the chip rows (At home, the store choice) dragged past their first or last chip follow the finger with resistance (the same 0.55 band as a sheet) and spring back from the release speed (response 0.4 s). A drag that can still scroll scrolls; an up-and-down swipe is left to the page; where the phone bounces the strip itself (iOS Safari), it is left to the phone. With reduce motion it is back at once. The page itself never scrolls sideways (`body{overflow-x:clip}`).

## Evals

Five layers, all in this repository. The approach follows Anthropic's "Demystifying evals for AI agents": grade what Tote did to the home rather than the words it used, run every task more than once, keep a suite of things it already does (regression) apart from things it is learning (capability), and read the failures before trusting a score.

| Layer | Command | Network | What it checks |
|---|---|---|---|
| Household simulation | `npm test` | No | 1,000 generated households, including hostile input, against the profile, starter-list, allergen and label rules |
| Router | `npm test`, `npm run test:heldout` | No | 1,000 simulated households and about 5,500 messages through routing, privacy and guardrail code |
| Learning | `npm test` | No | 58 checks on pace, reminders (wording, retries, counting, Undo from the notification), the push message and the review loop, with the real SQL in memory |
| Measuring | `npm test` | No | 43 checks that the scorecard's own numbers are right: the grader, pass@k and pass^k worked out by hand, isolation, the allowance, the health counters |
| Pace | `npm run test:pace` | No | Months of shopping for 1,000 households (bulk buys, holidays, shopping early or late); scores how often a reminder lands the day or two before they run out |
| Quick path | `npm test` | No | The code that reads messages without a model, on 629 phrasings by other writers: every question, chat, dish, health, attack and correction left alone, and the updates it reads, read right. Plus 68 both-direction checks |
| Without a model | `npm run test:lean` | No | Every live task through the real `evalCase()` with a model that refuses every call: the "Without AI credits" tasks are graded exactly, and it counts how many live tasks need no model call at all |
| Delegation | `npm test` | No | Which tier each of 629 phrasings by other writers goes to (no dish, health question or correction may go small), the checks that send a small model's mistakes up, and an estimated cost with and without delegation |
| Live agent | runs itself, see below | Yes | 114 tasks against the real models, graded on the outcome. Tasks marked `offline` run as if the allowance were used up (any model call fails); `maxCalls` checks what a task may cost |

### Live runs and the scorecard

`/scorecard.html` (signed in; also linked from For you) shows it all.

| Piece | How it works | Where |
|---|---|---|
| Tasks | `public/evals/cases.json`. Each has a `group`, a `suite` (`regression` by default, or `capability`), checks, and either `text` or several `turns`. Tests made from real conversations join as regression tasks | `evalCases` |
| A trial | One task, run through the same `converse()` people use, against a made-up home that starts clean every time. The database is withheld, so nothing real is read or written. Multi-turn tasks carry the conversation and the home from turn to turn | `evalCase`, `simApply` |
| Grading | Fixed checks only, no model judges. Outcome checks (`stateQty`, `onList`, `notOnList`) look at how the home ends up. Partial credit is the share of checks met. Every reply is also checked against the brand voice | `gradeCheck`, `onVoice` |
| When runs happen | Within minutes of every deploy (one trial of every task). Then the same version again on the next two nights, so every task has three trials. Then once a week, because the hosted model can change. "Run a check now" on the scorecard starts one by hand | `autoRuns`, cron every minute |
| Cost | A few trials a minute, at most 100 model calls a day, so the household's own chats are never short. If Cloudflare's daily AI allowance runs out, the run pauses and carries on the next UTC day | `EVAL_DAY`, `stepRun` |
| Numbers | pass@1 (share of trials that pass), pass@k (passed at least once), pass^k (passed every time: what a household feels). Pooled across all runs of one version | `summarize`, `scorecard` |
| Cost | Dollars per 1,000 tasks at Cloudflare's published prices (`costOf`, `maxCost`); model calls and tokens per task (Workers AI's own count when it gives one, otherwise 4 characters a token), and the share of tasks done with no model call | `tokensOf`, `summarize` |
| What changed | Tasks that broke or got fixed since the run before, flaky tasks, and capability tasks ready to graduate (passed every trial of the current version) | `scorecard` |
| Reading failures | Every failed trial keeps what was said, what Tote did, its reply and which checks failed. Mark each as Tote's mistake or an unfair test; the share of unfair tests is on the scorecard | `/api/scorecard/verdict` |
| Real use | Week by week from the app: misses, undo, corrections, said twice, not found, typical reply time, chat turns done without a model call, tokens per turn, reminders sent and how many led to the list, and how many days off the learned pace was when the item was bought again. Kept as counters; nothing private | `health`, `bump` |
| Offline history | `npm run track -- --note="what changed"` runs the offline suites and appends the scores to `public/evals/history.json`, shown on the scorecard | `evals/track.mjs` |

### World groceries

Tote knows about 330 things from Indian, Chinese, Japanese, Korean, Southeast Asian, Latin, Middle Eastern, African, Caribbean and Eastern European kitchens, as they appear on receipts (Patel Brothers, H Mart, 99 Ranch, Seafood City, Northgate), delivery apps (Weee!, Instacart, Blinkit, BigBasket, Zepto) and in speech ("atta", "patis", "gochugaru").

| Piece | How it works | Where |
|---|---|---|
| The glossary | One line per item: the names people use, the display name, where it goes, how long it keeps, allergens it usually contains, diet tags. Edit `src/grocery-data.txt`, then `npm run glossary` copies it into the Worker | `src/grocery-data.txt`, `scripts/glossary.mjs` |
| Matching | Receipt shorthand is expanded (FLV, SCE, WHL, OJ). When several names appear, the prepared product beats the raw ingredient ("kimchi MANDU", "PIEROGI potato cheese"); a name inside a longer one loses to it ("methi" in "methi leaves") | `itemMatch` |
| Weak matches | A product word that does not fit ("chili garlic SAUCE" is not produce, "bagel SEASONING" is not bakery) makes the match weak: its allergy and diet warnings still apply, but the model decides where it goes and how long it keeps | `FORMS` |
| Context | Only the entries a receipt or message needs go to the model, at most 25 | `glossaryFor` |
| After the model | Where it goes and how long it keeps come from the glossary when it knows the item; "frozen" on the pack wins; a gallon is never a gram; allergy and diet warnings are set by rule, from the item name and the receipt line it came from, and always say "check the label" | `enrich` |
| Safety net | Plain everyday words for every allergen and diet (flour, bread, noodles, scallops, sprats, carnitas…) catch items the glossary does not know | `WORDS`, `FOOD` |

Scores (`npm run test:world`, `evals/world.mjs`): the tuning set (108 lines, 13 stores) and the first held-out set (98 lines, 17 stores) have both been used to fix things. The fresh held-out set (57 lines, 20 stores and apps) scored **71.2% at first sight** (old code 35.2%), and 86.2% after general fixes made from its failures, so it is no longer clean either. The next clean measure is real receipts. Known trade-offs: most Thai curry pastes contain shrimp, so a vegan one is still flagged "usually contains shellfish, check the label"; brand snacks with no telling word (Yan Yan, Dark Fantasy) are left to the model.

### Training log

| Date | Change | Measured |
|---|---|---|
| 14 Nov | Scorecard and capability tasks added | Live baseline (version 009431f7): regression 96.1%, capability 64.7% (partial 78.9%), on voice 100%, typical reply 4.0 s, slowest 5% 15.5 s |
| 15 Nov | Round 1: follow-ups with the last two exchanges as context, plans and maybes change nothing, corrections like "2 not 3", learned pace in answers. From reading the baseline failures: answers may not claim a change they did not make; "bought" before an untracked thing is a purchase; an instruction line on a receipt is dropped, not the receipt. Two unfair tests fixed | Offline: all suites pass, router held-out 97.3%. Live: on the scorecard after the next run |
| 15 Nov | World groceries: a 330-item glossary across ten cuisines, receipt shorthand, prepared-over-ingredient matching, weak matches, frozen and gallon fixes, allergy and diet warnings by rule | Offline, fresh held-out (20 stores): 35.2% before, 71.2% at first sight, 86.2% after; allergies caught 21.7% → 82.6%; diets 55.9% → 100%; gallons 0% → 100%. Live: eight world tasks, baseline first, then this change |
| 15 Nov | Code first: a quick path reads plain messages and answers plain questions with no model; facts and memo tables; Stocker works with no AI allowance (chat, barcodes, typed receipts, dinner ideas); the model sees only the relevant part of the home. 32 new live tasks ("Without AI credits", "Costs nothing") | Offline, exact (no model involved): Without AI credits 4.3% → 100% (23 tasks); live tasks needing no model call 9.4% → 52.9% (8 → 45 of 85), all 45 pass. Quick path on 629 phrasings by other writers, first sight: 100% left alone, 19.1% read, 95% right; after one round of general fixes 24.4% read, 100% right. Cost on those 629 against a 120-item home, stand-in model: calls per message 1.44 → 1.10, tokens per message about 4,000 → 2,500. Live: on the scorecard after the next run |
| 16 Nov | Live run 2 (round 1 + baseline fixes, version 33cb6e10) | Regression 96.1% → 98.0%; capability 64.7% → 100% (17/17), partial 78.9% → 100%; voice 100%; typical reply 4.0 s → 3.8 s; slowest 5% 15.5 s → 16.7 s. One regression failure (use-first-short) was an unfair check, fixed. Unchecked bug seen: 1GAL milk logged as 1 g, 2.1 LB chicken as 1 lb |
| 16 Nov | Round 2 (branch `tote-training-2`): the amount printed on the receipt line wins over the model's reading (weights, volumes, gallons, fl oz, "x 4" packs); ambiguous lines are left alone. Tasks `cap-receipt-amounts` and `cap-receipt-amounts-india` were shipped first for a baseline | Offline: 14 amount checks pass. Live: after the baseline |
| 16 Nov | Merged code first, world groceries and a tidy-up together and deployed. In the merge, code reads plain messages first and the glossary still cleans up whatever the model returns. Tidy: dead code removed, one shared test loader (`evals/load.mjs`), and `npm run track` now records a fresh router score instead of a stale committed file. Offline scores unchanged from the separate branches. | First live run on this version: see the scorecard |
| 16 Nov | Merged round 2 (`tote-training-2`, receipt-line amounts) and delegation (`tote-delegate-1`, small model first, checked by code) onto the live build, and removed the unused `/api/eval` endpoint (the scorecard runs evals through `evalCase`). The small model gets the same glossary hints, and the glossary still cleans up whatever either model returns. | Offline: router 100%, held-out 97.3%; learning 71/71; measuring 85/85; quick path 68/68; delegation 23/23 (estimated $0.43 → $0.265 per 1,000 messages); world groceries fresh held-out 86.2%; without-credits tasks 100%, live tasks needing no model call 48.4% of 116. Live: see the scorecard |
| 17 Nov | Shelf scan (`tote-scan-1`): a fridge or shelf photo never asks how many (each thing seen is one, with Undo); Today does not repeat a question the card after a scan is asking; real photos scored by hand in `evals/scan-photos.json` | Offline, exact: shelf-scan checks 11 → 14 of 14; browser walk 6 → 9 of 9; first real fridge photo found 3 of 7 readable things (Llama 3.2 11B Vision). Live: not yet |
| 17 Nov | Shelf scan round 2 (`tote-scan-2`): a check by code between the camera and the home (no scene lines, bare jars and guesses become questions, nothing the camera never saw), "Did I see these right?", Edit on the card, owner-only photo trials with four vision models | Offline, exact: shelf-scan checks 23 → 41 of 41; browser walk 22 of 22. Live: not yet |
| 17 Nov | Shelf scan round 3 (`tote-scan-3`): find (Moondream), crop on the phone, read each pack (Gemma 4), then the check by code; the photo in the card with a box round each thing, coloured by what happened; owner only; old reading kept beside it | Offline, exact: pipeline checks 29 of 29 (new); browser walk 16 of 16 (new); shelf scan 41/41 and walk 22/22 unchanged. Live: not yet |
| 17 Nov | Photo pipeline for every home (`PHOTO_PIPELINE=all`); a photo read pack by pack takes one more from the home's daily AI share for every four packs. Trials stay with the owner's home | Offline, exact: pipeline checks 30 → 31 of 31; browser walks unchanged (16, 22, 37). Live: not yet on a real photo |
| 16 Nov | Redesign (`tote-redesign-1`, from the "Stocker redesign" canvas): a Tell Tote bar (type, camera, mic) above four tabs replaces the centre plus; Today shows Tote and at most three cards with one main button each; after a scan, a card on Today and a message with Undo replace the summary sheet; "already on your list" is a message with Add another; first run starts with Snap your fridge and accepts the photo terms once; learned pace on each item at home; the list is grouped by aisle with pictures and reasons; For you becomes Tote with Fix on what was learned; the top bar has the bell and a household menu (share, larger text, reminders, scores, lock). Not built: telling a receipt from a shelf photo by itself (the camera still offers both). No change to the Worker. | Offline suites unchanged; browser audit 24/24; redesign walk-through 28/28; household day without AI 16/16 |
| 16 Nov | Microphone without the extra sheet: every mic button listens right in the conversation, in a strip that replaces the text box (cross to cancel, arrow to send now, live wave and clock). With the phone's own speech-to-text (Web Speech API) the words appear as you speak and are sent as typed text, so the quick path reads them with no AI; otherwise a recording goes to Whisper as before. Sends by itself when you pause; stops at 60 s; the keyboard does not pop up. Browser check: `evals/voice-audit.cjs`. | Voice check 16/16; browser audit 24/24; redesign 28/28; household day 16/16; offline suites unchanged |
| 16 Nov | Today, second pass: one card per job instead of one per item. Use first (today first, then the next few days, Used it on each, one Show me a dish with them), Running out (out essentials and guesses, Open my list), Check these (label checks and counts), else a dinner idea. The headline counts what the bell counts; Tote's line names what goes first; no focus box on a tab after a tap. | Browser audit 24/24; redesign 28/28; voice 16/16; household day 16/16; offline suites unchanged |
| 16 Nov | Acceptance test fixes (`tote-uat-1`), from Sushmitha's user acceptance test of the same day: 20 defects. Tasks first: 17 offline tasks in `cases.json` (group names Allergies, Shopping list, Asking which one, Amounts), baselined exactly with `npm run test:lean` before any change. Then: allergy flags by one rule that follows the profile; "No, because" answers; a question next to an update is answered and the update still read by code; "take everything off my list except X" (at most ten at a time); list rows that can be renamed, counted, removed and undone, and several things in one line split into rows; "which one?" for a word that fits two things; Undo on every removal; one count for Today, the bell and its sheet; hand-added things sorted like chat; a purchase clears its list entry; the activity log names what changed, logs typed messages as typed and records undos; what was said outright ("a 6 pack", "64 fl oz") wins over the model's reading; one shelf life per kind of thing; the helper's own name everywhere; the conversation kept for the day. New column `items.nolist` (schema 7, added by `migrate`). | Offline, exact: the 17 new tasks 6/17 → 17/17, so "Without AI credits" tasks 72.5% → 100% (40 tasks); acceptance 40/40; all earlier suites unchanged (router 100%, learning 71/71, measuring 85/85, quick path 68/68, delegation 23/23, world fresh held-out 86.2%). Browser: app audit 24/24, acceptance walk-through 38/38 (after taking in the new Today from main). Live: not measured yet. Not fixed here: accounts and separate households, weekly planning, one-tap ordering, speed of model replies, editing an item's name or date after adding, typo-tolerant search |
| 16 Nov | Fit and finish (branch `tote-apple-1`), from the `apple-design` skill: controls answer on touch-down, sheets slide and follow the finger (drag, flick, catch in mid-air, resistance), frosted bars the page scrolls under, type in `rem` with per-size spacing, and the phone's settings for less motion, less transparency and more contrast. Only `public/index.html`; no change to what Tote does or says. New check `evals/finish-audit.cjs`, written first. In `app-audit.cjs` the wait after opening an item went from 0.2 s to 0.5 s: the test tool's own click scrolled the page when it landed during the 0.3 s unfold, which a finger does not (checked with a plain tap at the same point) | Browser, local, exact: fit and finish 7/24 → 24/24; app audit 24/24 and acceptance walk-through 38/38, both unchanged; `npm test` unchanged (acceptance 40/40, quick path 68/68, delegation 23/23, measuring 85/85). Not measured: a real phone, a real finger, the frosted bars on a phone's own browser, the brand typefaces (the test browser could not load them). Live: not deployed |
| 16 Nov | Needing less, round 1 (branch `tote-less-1`): the list looks ahead to the next shop (`shopGapFrom`, `ahead`), "Still have it" at the list holds until after that shop, fresh food is mentioned the day before its date. Chosen from eight ideas by a simulation of 2,000 households (`evals/less-sim/`), scored against the live app | Offline, exact: new checks 6/14 on main → 28/28; walk-through could not run on main → 20/20; app audit 24/24, acceptance walk-through 38/38, competitor walk-through 35/35, fit and finish 24/24, `npm test` otherwise unchanged. Simulated, with assumed behaviour: about 0.7 fewer days without a staple per home per month (of 17.3), about 1 point less fresh food thrown away. Live: not deployed |
| 16 Nov | Allergy guard (`tote-accuracy-1`), from the real misses of 16 Nov read out of the live `turns` table. All six flagged misses were made before the acceptance fixes were deployed (fixes merged 18:07 UTC, last flagged turn 17:56 UTC); replayed against the code on `main` with no model, the lunchbox answer, "we're out of chicken" and "take everything off my list except cheese" are already right. What was still open for allergies: nothing checked a model-written answer for an offer of a clashing food (live, 17:49 UTC: "Would you like to put a Peanut Butter Pretzel Sandwich in Leo's lunchbox?"), an allergy answer could end without "check the label", a shortened name went to the model, and dinner ideas were not checked by code. Checks first (`evals/allergy.mjs`, in `npm test`, with a stand-in model that says what we choose, including the two real replies), then `noClashOffer`, shortened names in `allergyAnswer`, "pb", and the dinner filter | Offline, exact: allergy-guard checks 12/33 → 33/33; six new offline tasks 0/6 → 6/6, so "Without AI credits" tasks 87% → 100% (46 tasks); router, router held-out, learning, measuring, quick path, delegation, acceptance and world held-out unchanged. Two live tasks added (lunchbox ideas with and without an allergy): not measured. Live: not measured. Still open from the same turns: "bought peanut butter" lands on the pretzel sandwich and teaches a false pace; a long message with a question and an update in it, and "I want to make..." taken as cooked, go to the model; "all the taco shells" asked as a guess; "help me cook pasta" answered as off-topic; the review page stores the next message as "They wanted" and has no verdict for a list change |

| 16 Nov | Separate homes (branch `tote-homes-1`), for the first test with friends: a personal code per friend, each opening a private home (same tables under a prefix, reached only through a scoped database handle); "Friends testing" in the owner's menu with a ready-to-send invitation; scorecard and review closed to friends; the owner's weekly numbers and review of misses include every home; reminders per home; wrong sign-in tries counted per phone. Checks first | Offline, exactly: new separate-homes checks 10 of 49 before, 57 of 57 after (8 checks added while building, 5 unfair ones corrected); two-phone browser walk-through 27 of 27 on a local copy; every earlier suite unchanged. Not measured: the live app, real phones, real push delivery to a friend's phone |
| 15 Nov | Delegation: a small model (8B, about a sixth of the price) takes everyday updates and questions code could not read; code checks its work and sends mistakes to the large model. Cost per task in dollars on the scorecard; 6 new live tasks ("Right model for the job") | Offline: on 629 phrasings by other writers, 49.9% of model jobs go to the small model, and after widening the dish and food-safety words no dish, health question or correction does (first sight: 9 would have). Estimated cost on those messages, stand-in answers: $0.425 → $0.262 per 1,000. Whether the small model reads well enough is only known live: the escalation rate and the regression suite on the scorecard are the gate |
| 16 Nov | House rules, round 1 (branch `tote-rules-1`): a home keeps rules apart from allergies (`house` in the profile, for everyone or one person); the label check on a barcode scan reads them, with the names an ingredient hides under (`HOUSE`, `houseAlias`, `LEFT_OUT`) and the UK front-of-pack line for "high" from the product's own figures (`productFrom`, `per100`). A house rule is a quiet note; an allergy keeps its wording. | Offline only: new checks 19 of 64 before, 72 of 72 after (8 added while building); first sight on 28 labels written after the code was finished: 26 exactly right, 0 wrong flags, 1 missed ("palm and/or canola oil"), 1 extra guess. Every earlier suite unchanged. Not measured: the live app, the real product database, a real phone |
| 17 Nov | Guardrail round (branch `tote-guard-1`), from the audit of 17 Nov (`d8e8638`): six rules in the brief did not hold on `main`, and `npm test` missed 4 of 15 safeguards broken on purpose. Checks first: `evals/guard.mjs` (`npm run test:guard`, part of `npm test`), both directions, real code with a stand-in model. Then: the allergy guard (`tote-accuracy-1`) brought up to date with `main` and merged in; `guardReply` also removes "fine for Leo" and "Leo can have it" in a home with an allergy; the privacy filter widened (`PRIVATE`: address, password, passcode, PIN, door code, card expiry and security code) and so what `turns` keeps; an amount ceiling per unit (`MAX_QTY`); an unknown action is dropped (`ACTIONS`); Tote's voice kept by code (emoji, exclamation marks, home words); "check the label" everywhere (the barcode label reply said "check the pack"). Not changed, and written into the guardrails table as it is: up to 25 additions in one message (the limit of 10 is for changes to what is already at home); Sushmitha to confirm or change. `evals/load.mjs` takes `TOTE_SRC` to score another copy of the Worker with today's checks | Offline, exact, `main` → branch: guardrail checks 49/84 → 84/84; first-sight set (26 written before the fix, 36 after the code was finished, none tuned on) 32/62 → 62/62; a second fresh round of 30 found 3 leaks and 1 over-removal at first sight, fixed by rule and added as standing checks; allergy guard 12/33 → 33/33; 20 of 20 safeguards broken on purpose are now caught (11 of 15 before). 5,529 phrases from every corpus: the new filter changes 44, all of them private details. Unchanged: router 18,942/18,942 and held-out line for line, learning 71/71, measuring 85/85, quick path 68/68 (24.4% read), delegation 23/23 ($0.265 per 1,000), acceptance 40/40, competitor 67/67 and first sight, needing less 28/28, House rules 72/72 and first sight, world groceries 86.2%, no-credits tasks 100%. Live tasks with no model call 48.4% → 47.4% (two new live allergy tasks need the model). Cost of the new checks: under 0.05 ms a message, no model call. Browser, local copy: app audit 24/24, acceptance 38/38, competitor 35/35, needing less 20/20, House rules 13/13, fit and finish 24/24 in 4 runs of 5 (the known flaky flick). Not measured: the live app, the real models, a real phone |
| 17 Nov | Real sign-in (branch `tote-signup-1`): separate homes brought up to date with `main` (with `prices`, `saves` and the hand-off per home), then sign-in with Google or a 6-digit code by email, each opening a home of its own; a cap on homes with a waiting list; a daily share of the AI allowance per home and a ceiling for all homes; "Delete my home" and "Sign out everywhere"; a privacy notice; reminders for more than 59 homes. Checks first | Offline, exactly: new sign-up checks 16 passing on the merged code before (most could not run), 104 of 104 after; 25 of 25 safeguards broken on purpose caught; separate homes 58 of 58 and guardrails 89 of 89 (one check added to each, and each brought up to date with the new sign-in doors and owner-only tables); every earlier suite unchanged. Browser, local copy: new sign-in walk-through 36 of 36; end-to-end 37 of 37; app audit 24 of 24, acceptance 38 of 38, competitor 35 of 35, needing less 20 of 20, House rules 13 of 13, separate homes 27 of 27, fit and finish 24 of 24. On Cloudflare's local database, a hundred homes: the owner's pages open in under 40 ms. Not measured: Google's real button and sign-in window (a stand-in in the test browser), the real mail service (never called), the live app, a real phone, the paid AI plan |
| 17 Nov | Motion details (branch `tote-motion-1`), Emil Kowalski's eleven tips: presses and entrances from 0.97, a wrong code shakes, sign-in steps slide in the direction they go, folds open and close by height (`interpolate-size`), nothing animates top or left, no transitions during a theme switch, rubber band with a spring on the sideways strips. Only `public/index.html`. Check first: `evals/motion-audit.cjs`. `finish-audit.cjs` now expects 0.97 for a pressed round button (was below 0.95) | Browser, local copy, exact: motion checks 18/38 → 38/38 (three runs); 8 of 8 changes broken on purpose were caught; fit and finish 24/24 (with the 0.97 expectation), app audit 24/24, acceptance 38/38, competitor 35/35, needing less 20/20, House rules 13/13, separate homes 27/27, all unchanged. Not measured: a real phone and finger, iOS Safari (no `interpolate-size`; its own strip bounce), the live app |
| 17 Nov | The first run (branch `tote-welcome-1`): three short steps answered by Tote instead of the whole household form, a kind of home chosen from who lives there when none is picked, and "Get everything sorted", a list of eleven things to set that opens the full form at each section. Check first | Browser, local copy, exactly: new welcome walk-through could not run before, 43 of 43 after; end-to-end 37 of 37, sign-in 36 of 36, app audit 24 of 24, acceptance 38 of 38, competitor 35 of 35, needing less 20 of 20, House rules 13 of 13, separate homes 27 of 27, fit and finish 24 of 24, motion 38 of 38, all unchanged (the motion walk caught the new progress bar animating its width; it now moves by transform). `npm test` unchanged. Not measured: the live app, a real phone, whether real people finish it |
| 17 Nov | The first run, round 3 (branch `tote-welcome-3`), from the 1,000-household simulation: no kind-of-home step (reminders instead), pictures and short explanations on allergy and diet chips, country-first order, "your own" before "More" for allergies and diets, and typed allergies learnt (a list in code, else the model once, kept per home; whole-word matching) | Offline, exactly: typed-allergy checks 7 of 21 before, 21 of 21 after. Browser, local copy: welcome walk-through 57 of 57 (14 new); end-to-end 37, sign-in 36, motion 38, app 24, acceptance 38, competitor 35, needing less 20, House rules 13, separate homes 27, fit and finish 24, all unchanged. `npm test` unchanged. Not measured: the live app, a real phone, the real model's answers for a typed allergy |

### The weekly loop

1. Open the scorecard. Look at what broke, and read the failures.
2. On `/evals.html`, give a verdict on real conversations that went wrong; each becomes a task.
3. Fix the prompt, router or code. `npm test`, then `npm run track -- --note="..."`, then push.
4. The deploy is checked automatically, and twice more on the following nights.
5. When a capability task passes every trial, set its `suite` to `regression` and write a harder one. A suite at 100% only guards against going backwards; it no longer shows progress.

Rules that keep the scores honest: a held-out set used to fix something stops being held out (write a fresh one); tune on `npm run test:pace -- --seed=1` and report seed 2; and a task that fails every trial is first checked for being unfair before Tote is changed.

## Branch builds (Worker Previews)

A push to any branch other than `main` runs `npx wrangler preview` in Workers Builds. Previews inherit nothing from production, so `wrangler.jsonc` has a `previews` block: their own D1 database `pantry-keeper-preview` (the Worker makes its tables on the first request, as everywhere), the same models, `PHOTO_TRIAL` off and a small AI ceiling. No `APP_PIN` secret is set for Previews, so a Preview stays locked; add one with `npx wrangler preview secret put APP_PIN` to try a branch on a phone. Cron triggers run in production only. Before 17 Nov every branch build failed on the missing block; production builds were never affected.

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

## The competitor round (16 Nov 2026)

Six things other household apps do well, done Tote's way. The competitor analysis behind them is the doc "Stocker AI: competitor analysis and positioning". Each has checks in both directions in `evals/compete.mjs` (`npm run test:compete`, part of `npm test`) and a phone-sized walk-through in `evals/compete-audit.cjs`.

| What | How it works | Where | What it must never do |
|---|---|---|---|
| Instant replies | The app sends a message with more than one sentence to `/api/chat` with `fast: true` first. Code does the sentences it is certain of in one database write, answers the questions it can be exact about, and hands back the rest word for word; the app shows that at once and sends the rest the usual way, with the first exchange as history | `splitTurn`, `fastTurn`, `chatSend` in the app | Split a message where one sentence leans on another ("it", "them", "the rest") or takes one back ("actually", "wait", "don't"); change anything for a plan or a maybe; let the two halves together pass the one-message limits (the first half's count travels in `spent` and is added in `tooMuch`) |
| An order screen is a receipt | The receipt photo prompt also reads a screenshot of an online order and is told to ignore the address, names, phone numbers and payment details. A pasted order is read by code when there are no AI credits, and when the allowance runs out mid-read: an amount or price on its own line belongs to the item above, "500 ml x 2" and "Qty 2" multiply, whole-rupee prices are kept, the store and currency are read from the text. A screenshot can also be pasted anywhere in the app | `seeImage`, `orderLines`, `quickReceipt`, `storeOf`, `currencyOf` | Read a fee, a total, a tip, the address or how it was paid as something at home |
| Handing the list to a store | The app is given the stores for this home (`shops`): the profile's own store first, then the usual ones for the country (the `cf-ipcountry` header) or the currency already seen. Each thing on the list opens as a search at that store; one button copies the list and opens the store. A tap records only the store's name and the day (`/api/handoff`), so Today can ask for the order screen when it arrives; a scanned order, "Not now" or three days clears it | `SHOPS`, `shopsFor`, `openShop` in the app | Send anything by itself; build a link for a store with no shop online; put a list note ("size 4") in the link. No store lets another app fill a basket without a business agreement, so this is a search per item, not a filled cart |
| The empty pack | `/api/scan/barcode?code=…&empty=1`. Something tracked is used up (so it is on the list by itself, once) and keeps the pack's brand and size as its note; anything else goes on the list by name with brand and size as the list note. Needs no model | the `empty` branch of `/api/scan/`, `packs` in `apply` | Add one at home; put one thing both at home and on the list |
| Fresh, use soon, past the date | Counted by the server for kitchen things that have a date, are not frozen and are not finished (`shelf`), with the same three-day rule as "These go first". Shown as a bar with words, on At home | `/api/items`, `freshCard` in the app | Count things with no date, or things outside the kitchen |
| Food used in time | A kitchen thing finished in its last three days, or on its date, is recorded (`saves`), with what was left priced at the last unit price when one is known. Undo takes it back (`noteBack`). Shown beside "Thrown away this month" | `noteSaved` | Count something thrown away, something past its date, or something with plenty of time left; make anyone feel bad about the other number |
| Price memory | Every purchase with a price and a read (not guessed) amount keeps a price per unit (`prices`). A purchase at least a tenth away from the middle of the last five is noted in plain words on the change; "what did we pay for milk?" is answered by code; the list shows what each thing cost last time and what the known part came to | `notePrice`, `priceLine`, `priceAnswer`, `money` | Compare different units or currencies; keep a unit price from a guessed amount; judge the price ("expensive", "cheap") |

New tables: `prices` and `saves` (created by `migrate`, schema 8). New `settings` key: `handoff`. When the separate-homes branch is merged, these two tables must be added to the tables a home's handle scopes, and `handoff` to the per-home settings, or friends' homes would share them.

First-sight score, on a fresh set written after the code was finished and run once without changing it (`evals/compete-heldout.json`, `npm run test:compete:fresh`; same writer as the code, so not independent): long messages safe 16 of 16, certain parts done at once 20 of 26; order screens 9 of 11 item lines read right by code with no fee or address line read as an item. The two misses: "toor dal" is not known to the code path, and "3 items" under a product was not read as three packs (the amount came out as one pack). Both are for the next round, with a fresh set.

Not measured: the live app, the real models (the photo prompt on a real order screenshot, the model's reading of the second half of a split message), a real phone, and the store links themselves on a phone (their formats were written from knowledge of each site's search page and must be opened once each before friends use them).

## Needing less (16 Nov 2026, branch `tote-less-1`)

The aim is for the app to need less from people. Eight ideas were scored on simulated households before anything was built (`evals/less-sim/`), and only what held up against the live app was built.

### The simulation, and what it can and cannot say

`evals/less-sim/homes.mjs` lets 2,000 households (the four kinds from `evals/pace.mjs`, three ways of shopping: in a store, by delivery, by quick commerce) live twelve weeks with Stocker. The pace learning is the Worker's own `paceFrom`; the reminder rules mirror `digest`, `dueSoon` and `/api/remind`; ticking something off the list counts as a purchase, as `restock` does. `LIVE` is what the app does today: a typical number of days for a new thing, and suggestions on the list for what is due by tomorrow. Each feature is added to `LIVE` and measured: shopping trips Tote knows about, days a home goes without a staple, fresh food thrown away, reminders about something not needed yet, and steps asked of the person.

How people behave (whether they snap a receipt, answer a reminder, set up a forward) is **assumed, not measured**. The assumptions are the table `P0` at the top of the file; `run.mjs --sweep` redraws every one of them from a range 150 times and reports how often each conclusion survives. The simulation says what matters mechanically. It cannot say what people want.

What it said (median of 150 sets of assumptions; days without a staple per home per month, live app 17.3):

| Added to the live app | Days saved | Other |
|---|---|---|
| The list looks ahead to the next shop | 0.7 (helps in 100% of sets) | 0.6 more not-needed-yet suggestions a month |
| First run from a photo | 0.7 (100%) | |
| Order emails forwarded automatically | 0.4 (100%) | 1.0 point less fresh food thrown away |
| People set their own reminders | 0.3 (97%) | |
| Answer buttons on iPhone reminders | 0.1 (51%) | 0.4 points less thrown away |
| A guess from the amount bought and the people at home, in place of a typical number of days | -0.1 (21%) | slightly fewer not-needed-yet reminders |
| Remind earlier for slow things; a tap teaches the pace | 0.0 | |
| Fresh food: the day before, not the day | 0.0 | 1.0 point less thrown away |
| All of them | 2.7 | 3.0 points less thrown away |

Two findings matter more than the ranking. First, how much Tote sees: with the live features and nothing else changed, a home whose purchases Tote sees 15% of goes without for 18.4 days a month, and one it sees 88% of for 10.5. No feature here moves as much as that. Second, by-the-day reminder timing has almost no headroom: `timing.mjs` shows that a Tote that knew every home's true average pace exactly would be on time 74.4% and late 13.9%, against 70.7% and 16.2% today, so the targets of 75% on time and 10% late cannot both be met by a reminder aimed at a day. The simulated homes have little variety in pack size, so the verdict on the guess from amount and people is weak; real receipts from the friends' test should settle it.

### What was built

- **The list looks ahead to the next shop.** `shopGapFrom` reads how often this home shops from the last nine days something was bought (the median gap; three shopping days before it counts as known; capped at a week) and `/api/items` sends it as `shop`. In the app, `ahead` replaces "due by tomorrow" with "due before the next shop" on the list only; Today and the phone reminder keep the stricter rule, because they interrupt. The section moved from the bottom of the list to the top ("Before your next shop"), shows three at most with the rest behind "Show more", and each line says "My guess: out by" and the day. When the home's shopping is not known, nothing changes: the old name, the old rule.
- **"Still have it", asked at the list, holds until after the next shop** (`ahead: true` on `/api/remind`). Found by the walk-through: with the old half-as-long-again rule the same line came straight back. The same answer on a phone reminder keeps the old rule.
- **Fresh food is mentioned the day before its date** (`digest`, `remindText`), not on the day, and not twice.

Checks: `evals/less.mjs` (`npm run test:less`, part of `npm test`), 28 checks in both directions against the real code and SQL; `evals/less-audit.cjs` (`npm run test:less:browser`), 20 checks at phone width on an empty local database.

Choices to confirm: the look-ahead is capped at a week; three suggestions before "Show more"; Today and the phone still speak only about what is due by tomorrow.

Not measured: the live app, a real phone, a real push reminder, and whether real people answer these suggestions the way the simulation assumes.

## House rules (16 Nov 2026, branch `tote-rules-1`)

A home says once what it chooses to keep to, and Tote reads labels for it. This is apart from allergies (safety, `clashOf` and the allergy half of `labelCheck`) and from health rules (`RULES`). Round 1 covers one place only: the label check on a barcode scan, which already looked the product up in Open Food Facts. Receipts, order screens, a photo of a label and a remembered product per home are later rounds, and are not built.

### What was built

- **The menu** (`HOUSE` in `src/index.js`). Six "without" rules (no palm oil, no MSG, no artificial colours, no artificial sweeteners, no hydrogenated oils, fewer preservatives) and four "less of" rules (sugar, salt, fat, saturated fat). Kept in the profile as `house`, for the whole home and per person, from the menu only: typed text is never kept here (`houseList`).
- **Hidden names.** Each "without" rule has the names it appears under on a label: palmolein, palm kernel fat, "vegetable oils (sunflower, palm)"; flavour enhancer (621), E621; a colour number inside "colours (102, 110)", "red 40"; a sweetener or preservative by name or number. The reply says which name was on the pack: "lists palm oil (as palmolein)".
- **What a pack says it leaves out is not a listing** (`LEFT_OUT`): "no artificial colours or preservatives" and "no added MSG" are removed before matching.
- **Three levels, and nothing else.** "lists" comes from the real ingredient list. "my guess ... check the label" is used in one case only, an unnamed "vegetable oil". Otherwise nothing is said. Tote never says a product is free of something.
- **"High" is a published line** (`over` in `HOUSE`): the UK front-of-pack criteria per 100 g of food (sugars above 22.5 g, salt 1.5 g, fat 17.5 g, saturates 5 g), read from the product's own figures (`productFrom` keeps `per100`; salt is worked out from sodium when only sodium is given). A missing or impossible figure is left out, never read as zero, and Tote says it could not check. The food line is never used on a drink (`drink`, from the product's category).
- **Quiet, and second.** A house rule gives `status: 'note'` and no flag on the item. With an allergy at home the allergy wording comes first, unchanged, and the house rule follows it. A home with no house rules reads exactly as before.
- **"Palm oil" or "MSG" typed under things nobody eats** gets the same hidden names (`houseAlias`); any other typed food reads as before.
- **Dinner ideas** are told the house rules as preferences (`describe`). A house rule alone does not switch on allergy-style warnings by name (`restricted` is unchanged).
- **In the app**: a "House rules" chip group in the household sheet and in each person's sheet. `public/index.html` only gained those chips.

Checks: `evals/rules.mjs` (`npm run test:rules`, part of `npm test`), 72 checks in both directions against the real code, no network and no model. `evals/rules-audit.cjs` (`npm run test:rules:browser`), 13 checks at phone width on an empty local database: the chips are pick-only, fit the phone, are kept after a reload, and one person keeps their own. First sight: `evals/rules-heldout.json` (`npm run test:rules:fresh`), 28 labels written after the code was finished; it must not be tuned on, and once any line is used for fixing a fresh set is needed.

Known gaps, from the first-sight set and left unfixed so the set stays honest: "palm and/or canola oil" is not read as palm oil; "hydrogenated vegetable fat" also draws the palm-oil guess.

Choices to confirm: the menu's ten rules and their wording; "fewer preservatives" notes any preservative; the UK line is used in every country; a house rule leaves no flag on the item at home, so it is said at the scan and not again; a person on "Low salt" or "Low sugar" as a health rule does not get the "high in" note unless the house rule is also chosen.

Not measured: the live app, the real product database (how many scanned products carry an ingredient list or nutrition figures, least of all Indian ones), a real phone.

## Shelf scan (17 Nov 2026, branch `tote-scan-1`)

The first real fridge photo (Sushmitha's fridge door, 17 Nov) came back as Granola 1, Milk "How many?", Yogurt "How many?", and the same two questions again on Today's "Check these" card. Two of those are code, fixed here; the third is the vision model, measured here and left for the next round.

### What was changed

- **A photo never asks how many.** For `source: 'shelf'`, an add whose count the model could not give is saved as one and not marked `unsure` (`apply`). The card after the scan keeps its cross for each thing, so a wrong guess is one tap. A photo still never stacks on what is tracked, and a guess still never overwrites a count Tote already has; a counted reading still sets what is there now. Typed notes and receipts are unchanged: an amount that was not given still asks.
- **One question, one place.** Today's "Check these" leaves out a "How many?" that the card after a scan is already asking (`asking` in `public/index.html`). Once the card is closed, Today asks it, once.

### Real photos, scored by hand

`evals/scan-photos.json` writes down what is really in each real photo (the photos stay out of the repo), what counts as readable and what is fair to miss, and what Tote said. `evals/scan.mjs` scores it: the 17 Nov fridge door is 3 of 7 readable things found (1 certain until Sushmitha confirms what the tub and the two bags are), none invented, "how many" asked twice. Missed: Daisy cottage cheese, heavy whipping cream, Sargento cheese, a bag of seeds. The model is `@cf/meta/llama-3.2-11b-vision-instruct`; the photo reaches it at 1,400 px on the long side.

Checks: `evals/scan.mjs` (`npm run test:scan`, part of `npm test`), 14 checks in both directions, the first with the real model reading of 17 Nov, against the real code and SQL with a stand-in model: 11 of 14 on `main` before, 14 of 14 after. `evals/scan-audit.cjs` (`npm run test:scan:browser`), 9 checks at phone width through the real screen with `evals/e2e/server.mjs`: 6 of 9 on `main` before, 9 of 9 after.

### Round 2 (branch `tote-scan-2`, on top of `tote-scan-1`)

- **A check by code between the camera and the home** (`checkSeen`, `keepSeen`). Before the reading model sees a fridge or shelf photo's list, code drops lines that name no product (a shelf, a door, a hand, a sentence around the list), turns a bare "glass jar" or "unlabelled bag" and any guess ("sour cream (maybe)", "yogurt or sour cream", "granola?") into a question instead of a change (at most four), reads more than 24 of one thing as a misreading (the count is left as a guess), and merges a thing listed twice. After the reading model, anything it adds that matches no line of the photo is dropped and reported (`unseen`); a translated line still counts (dahi → yogurt, through the glossary). Receipts are not put through it. A photo with nothing certain changes nothing and only asks.
- **"Did I see these right?"** in the card after a photo: each question has Yes (adds one), Edit or Name it (adds what it really is), and No (leaves it out). With only questions, the card says "I need a hand" and nothing is changed.
- **Edit** on every added line of the card: the name and how many. The old line is taken back and the corrected one saved, so the cross still takes back the corrected one.
- **Photo trials, the owner's home only** (`photoTrials`, `PHOTO_TRIAL=on` in `wrangler.jsonc`, table `photo_trials`, schema 10). Each of the owner's fridge or shelf photos is also read by Llama 3.2 Vision, Llama 4 Scout, Gemma 4 26B and Mistral Small 3.1 with a fuller prompt (`SHELF_ASK_V2`: part by part, brand when printed, how many, sure or maybe). Only their text is kept, with private details removed; the photo is never kept, the home is changed only by the live reading, and a failing model is noted without affecting the scan. Four extra model calls per photo. Claude scores them against `evals/scan-photos.json` by reading the table; the live model and prompt change only after that.

Measured offline, exactly: shelf-scan checks 21 of 41 on `main`, 23 of 41 on `tote-scan-1`, 41 of 41 here (the code checks are scored on older versions with a stand-in that lets everything through, which is what they did); browser walk 22 of 22 (on `tote-scan-1` it stops at the first Edit check: there was no Edit button). `npm test`, the end-to-end walk 37 of 37 and the welcome walk 57 of 57 unchanged.

### Round 3: find, crop, read, and the photo in the card (branch `tote-scan-3`, on top of `tote-scan-2`)

How shelf-recognition systems work, with models Cloudflare hosts. The photo is never stored.

1. **Find** (`/api/scan/shelf/find`, `findBoxes`): Moondream 3.1 (`detect`) returns a box per pack. Code keeps the boxes worth reading (`cleanBoxes`): pixel or fraction boxes in any of three shapes, not a speck (under 0.2% of the photo) nor the whole fridge (over 60%), the same pack once (non-maximum suppression at an overlap above 0.5, intersection over union), at most 16, in reading order.
2. **Crop** (the phone, `loadPhoto`, `cropOf`): each box with 8% margin is cut from the photo at up to 2,400 px and sent at most 640 px, so a small label fills the picture.
3. **Read** (`/api/scan/shelf/read`, `readCrop`): Gemma 4 26B reads each cut-out at once: name with brand, sure or maybe, or "none". A cut-out that fails is left out.
4. **Check**: the reads go through the same check by code as round 2 (`checkSeen`, the reading model, `keepSeen`), so guesses and unlabelled jars are asked and nothing unseen is added.
5. **Fall back**: no pack found, or the detector down, and the phone reads the whole photo the old way.

Model calls per photo: 1 to find, 1 per pack, 1 to turn names into changes. Who gets it: `PHOTO_PIPELINE` (`all` in `wrangler.jsonc` since 17 Nov, on Sushmitha's say-so; `owner` for the owner's home only; `off`). A photo read pack by pack takes one message from the home's daily AI share to find and one to read, plus one more for every four packs, told to the app as `pipe` in `/api/items`. With `PHOTO_TRIAL=on`, the owner's pipeline result (boxes and reads, as text) is kept in `photo_trials` beside the old single reading of the same photo (`v1 (shadow)`), to compare.

**The photo in the card** (`shotView`): the photo the person just took, from the phone's memory (never uploaded as is, never stored), with a box round each thing found: green and named when added, amber dashed when Tote needs a check, blue when already at home, grey dotted when left out. A key counts them ("2 added · 1 to check · 1 left out"). Tapping a box lights its line; tapping a line lights its box. Each box is a button named for a screen reader with what happened. Answering a question turns its box green. Done closes the card and lets go of the photo.

Checks: `evals/pipeline.mjs` (`npm run test:pipeline`, part of `npm test`), 29 checks with stand-in models (could not run before: there was no pipeline). `evals/pipeline-audit.cjs` (`npm run test:pipeline:browser`), 16 checks at phone width with a drawn test fridge (`evals/e2e/fridge.jpg`) whose packs sit at known places: each box lands within 1% of its pack, colours, key, links both ways, no sideways scroll, crops smaller than the photo, fallback with no picture; on `tote-scan-2` it stops at the first check (no photo in the card).

Not measured: the real Moondream boxes on a real photo (the answer's exact shape is read three ways because the documentation does not show it), the real Gemma 4 reads, time and cost per photo, a real phone. The owner's first photos after the merge measure them.

Next: score the photo trials as soon as the owner has taken a few photos, then choose the model and prompt; more real photos, with Indian kitchens and steel boxes (lids on and off); the design and simulation are in the Project doc "Shelf scan - simulation 17 Nov".

Not measured: the live app, the real model after this change, a real phone.


## Security round (17 Nov 2026, branch `tote-security-1`)

`npm run test:security` (evals/security.mjs, in `npm test`). Each check has its opposite. On the code before this round 12 of 20 passed; after it, 26 of 26.

- **No inline scripts.** The page scripts now live in `public/app.js`, `evals-page.js`, `privacy-page.js` and `scorecard-page.js`. `script-src` is `'self'` plus Google sign-in only, with no `'unsafe-inline'`, so text that slips into the page can never run as code. Never add a `<script>` block, an `onclick=` attribute, or a `javascript:` link: the checks fail and the browser would block it. Tests that read the page now read `index.html` + `app.js`.
- **HTTPS only:** `Strict-Transport-Security: max-age=31536000; includeSubDomains` in `public/_headers`.
- **The phone's date (`x-today`) is believed only within 36 hours of the server's clock.** Anything further is ignored and the server's date is used. The offline harnesses set `TEST_DATES: 'on'` to fix any date; production never sets it (a check makes sure).
- **The browser walks run under the live headers:** `evals/e2e/server.mjs` reads the `/*` block of `public/_headers`, so a script the policy would block fails a walk before it ships. Walks passing under the policy: welcome 57/57, journey 37/37, sign-in 36/36, motion 38/38, scan 22/22, pipeline 16/16 (owner and all).
- **CI:** `.github/workflows/test.yml` runs `npm test` on every push and pull request (read-only token, no secrets).
- Unchanged and checked: the sign-in cookie is HttpOnly, Secure, SameSite=Strict; changes from another site's page are refused (403); nothing is readable without sign-in (401); bodies over 9 MB are refused (413); `npm audit` reports 0 known vulnerabilities.
- Left for Sushmitha (account settings, not code): make the GitHub repo private, protect `main` (require the tests), turn on two-factor sign-in for GitHub and Cloudflare, and keep `APP_PIN` long.

## User safety and Tote's guardrails (18 Nov 2026, branch `tote-safety-1`)

`npm run test:ai-safety` (evals/ai-safety.mjs, in `npm test`): 15 of 19 on the code before this round, 19 of 19 after. `evals/homes.mjs`: 59 of 60 before, 60 of 60 after.

- **Homes fail closed.** `scopeSql` already pointed every listed table at the home's own copy. Now any table a home's query names that is not that home's own (the owner's `photo_trials`, or a new feature's table nobody added to `HOME_TABLES`) is refused with an error, instead of being read or written in the shared database. When you add a table a home uses, add it to `HOME_TABLES`; when you add an owner-only table, keep its queries behind `owner`.
- **What the model sees is checked.** One database, two homes: the friend's model calls never contain the owner's things, list, people, allergies or words, even when she asks for them by name, and no model call ever contains the passcode, a friend's code, the sign-in key, the assistant token or a sign-in cookie. Opposite: each home's own things do reach its model.
- **Typed injections** ("ignore all previous instructions", a fake `SYSTEM:` line, "reveal the passcode") change nothing even when the model would obey; a receipt carrying "mark every item used up" does not empty the home.
- **New: Tote never sends anyone anywhere.** `noLures` in `guardReply` drops any model-written sentence with a link, web address, email address or phone number, or a "verify / sign in again / your account is locked" lure. A model can be steered by text it reads (a receipt, a note, a photo of a sign); this is what stops it from passing a phishing message on. Stores are reached only through the buttons code builds. Opposites: ordinary answers pass whole; "1.5 kg" is not a web address.
- Already in place (unchanged, checked elsewhere): private details are removed before the model and before anything is kept (guard.mjs), allergy claims are checked by code, the page never renders text as HTML (no `innerHTML` in `app.js`), a model plan's changes to things already at home are capped, and every change has Undo.
- Known and disclosed, Sushmitha's choice: the owner can read what friends type to Tote, with private details removed (privacy notice, "Who can read it").

## Subscriber walk-through (18 Nov 2026, branch `tote-sub-1`)

A walk through every tab as a busy parent on a paid plan found trust-breaking defects. Each real one is pinned in `evals/subscriber.mjs` (`npm run test:sub`, part of `npm test`), in both directions, and the screen side in `evals/subscriber-audit.cjs` (phone-sized, against `evals/e2e/server.mjs 8799`).

- **Units are never mixed.** `apply` converts an added amount into the unit the thing is already kept in (`convert`): 1 kg of rice and 500 g is 1.5 kg (before: "501 g"). Weight against count counts as what was bought last time, marked a guess.
- **Pack sizes are read, not guessed** (18 Nov, at Sushmitha's request). An action carries `each`, the pieces in one pack, kept by `sanitize` and `mkActions`:
  - chat (`readPiece`): "a tray of 30 eggs", "2 packs of 18 eggs", "an 18-pack of eggs", "2 dozen eggs";
  - receipts and order screens read by code (`quickReceipt`): "18CT", "12 count", "(Pack of 6) x 2", "Tray of 30", "DZ";
  - lines the model read (`enrich`): the same patterns on the line the action came from.
  Things counted one by one (`PACK_OF`, eggs for now) are kept as single pieces: a pack becomes pieces at the size read, else the size this home bought last time (`settings` key `each:<name>`, written whenever a size is read), else 12 as a guess. An item still kept in packs is turned into pieces once, at the remembered or usual size. For other things kept in packs, pieces read with a size count as whole packs (42 pods off a receipt is one more pack). "Bought eggs" with no count is the home's usual size.
- **A typed allergy with a spelling slip is corrected** when it is one letter off a food Tote knows (two in a long word, same first letter): `spellFood` in `chipList`, so "Avacado" reads and shows as Avocado and guacamole is caught. Real foods not on any list (lychee, garlic) and short words (kiwi) are left as typed.
- **"Can Leo have X and Y?" checks every food asked about**, not only the first, and names each clash, then "check the label".
- **Non-food never lands in the kitchen by default**: something `NOT_FOOD` that the glossary or the staples put in another room goes there, unless the person picked the room by hand. The item panel has a room-and-kind picker (`PATCH /api/items/:id` with `area` and `category`, both checked against `ROOM_CATS`; logged as "moved X to Room").
- **The freezer is offered only for things that freeze well** (`freezes` in the app): not lettuce, salad, cucumber, whole pears or apples, eggs, yogurt.
- **Each thing counts once on the bell**, on its most pressing card. **Misses waiting for review are no longer a household to-do**: the owner's menu ("How Tote is doing") says how many there are and opens the review.
- **The shopping list**: a typed lower-case name is written with a capital ("Dish soap"; "iPhone charger" keeps its spelling); each line carries its kind for its icon; adding "Yogurt" while Greek Yogurt is at home says so and still adds the line.
- **Header and kits**: the household line names every kind of home and says "2 adults and 1 child"; the dorm-room and flat-share kits are not "For you" in a home with children.

Checked and left alone: "used in time" counts things marked finished by hand in their last three days, by design; the two different counts the tester saw were taken before and after two more things were finished. An undone change already gets its own "took back the change" line in the activity.

## The checklist (18 Nov 2026, branch `tote-check-1`)

Sushmitha asked for a clear checklist to say whether Tote did right on every real message, and for Claude to keep checking. The review of misses (`/evals.html`) only sees turns Tote flagged itself (undo, "Not right?", said again); on 16 Nov that was 6 of about 13 wrong turns.

- **Four checks on every turn** (`CHECK` in `src/index.js`): Understood; Home right (things at home and the list exactly right afterwards); Reply right (true, helpful, on voice, never claims a change that did not happen); Safe (allergy, diet or health caught, "check the label", no "it is safe", no doses; "na" when none came up). All yes or na is right.
- **Where:** `/checks.html` (owner's menu, "Check Tote's answers"), every turn from every home for the last 14 days, with what Tote did and said, filters To check, Claude has doubts, Wrong, All, and per home. Numbers: share fully right (owner's answers only), to check, Claude's doubts, agreement between Claude and the owner, safety failures, the check that fails most, per home.
- **Data:** shared table `checks` (home, turn, at, guess, guessed, mark, marked), in `ROOT_SCHEMA` and `schema.sql`; never reachable from a friend's handle (`scopeSql` refuses it). `guess` is Claude's first pass, written by the scheduled Claude check straight into D1; `mark` is the owner's, through `POST /api/checks`. A wrong mark with "should have" (update, nothing, list) becomes a test in `cases`, the same way the review of misses makes one. `DELETE /api/checks` clears the owner's answer and keeps the guess. All three routes are owner only.
- **Claude's guess never counts as truth**: the numbers are the owner's answers; the guess only orders what to look at first.
- Checks: `evals/checks.mjs` (`npm run test:checks`, part of `npm test`), `evals/checks-audit.cjs` (`npm run test:checks:browser`).

## Speed: the short form and the split receipt (18 Nov 2026, branch `tote-speed-1`)

**Where the seconds went (live run 7, read from `eval_trials`):** a reply written by the model takes about a second (0.3 to 1.3 s),
but reading an update took 4 to 9 s and a receipt 12 to 24 s. Both prompts are about 1,900 to 2,100 tokens, so the difference is
what the model writes: the update JSON repeats 14 field names for every thing read (about 120 tokens a thing), at roughly 30 tokens
a second. Two model calls in one turn (the small model's work sent up, or an update then an answer) add their times.

**What changed (behind a switch, off by default):**
- `UPDATE_SHAPE`: `json` (as before), `owner` (the owner's home and the live evals, which run as the owner) or `lines` (every home).
  In the short form (`LINE_FORM`) the model writes one line per thing, `action | name | quantity | unit | sure or guess | area |
  category | shelfLifeDays | daysToFinish`, then only the extras that apply (`price`, `best by`, `warn`, `note`, `from dish`).
  `fromLines` reads it back into exactly the fields the JSON had, so `sanitize`, the allergy checks and every limit run unchanged.
  A line code cannot read is left out, so it changes nothing. No JSON schema is asked for; a chat update may write 400 tokens.
- With the short form, a pasted receipt or bill of more than 8 lines is read in parts of 6 lines at the same time
  (`receiptParts`; the shop's name goes with each part, every line in exactly one part, at most 7 parts). Voice notes, shelves and
  the small model are never split.
- `SPEED_TRIAL=on`: once per deploy, the scheduled job times 9 made-up messages (6 updates, a plan, a dish, two receipts) in both
  forms on the real models, large and small, one message a minute, `SPEED_ROUNDS` times (default 2), and keeps each reading as
  text in `photo_trials` (kind `speed`): time, tokens from `usage`, what it read and a score against what it should do
  (`speedScore`). No person's words are used and no home is touched. About 40 model calls a deploy.

Checks: `evals/speed.mjs` (`npm run test:speed`, part of `npm test`), 61 checks: the short form reads back to what the JSON gave
(8 cases, voice and receipt), what it cannot read changes nothing (10), with the switch unset the model is called exactly as on
`main` (6, against `main`'s own code), who gets which form (6), the split receipt (12, including the parts being read at the same
time and an instruction line never reaching the model), the short form being at least 2.5x shorter (2.8x on five receipt lines),
and the trial's scoring in both directions.

**To read the trial:** `SELECT prompt, model, ms, text FROM photo_trials WHERE kind = 'speed' ORDER BY id`.
Switch to `owner` only if the short form's score matches the JSON's; the next live eval run then measures it on every task.

**First speed trial on the real models (19 Nov, `a40a70f`, round 1, exact):** large model, one update 3.5 to 9.0 s in JSON, 1.0 to
1.6 s in the short form (writing 113 to 206 tokens against 25 to 56); receipts 23.0 and 25.6 s against 3.9 and 3.3 s (read in two
parts). Same score on every update, plan and dish (1 of 1 each); receipts 0.67 and 0.44 in JSON, 1.0 and 0.63 in the short form
(both forms write "Laundry detergent" for Tide Pods and "Diapers" for Pampers; the Target case wants the brand, as
`receipt-whole-home` does). The small model read nothing right in JSON (0 of 7: it returns no actions), and everything in the short
form (7 of 7, 0.2 to 0.6 s). The short form wrote units outside the list ("6 cups", "1 bunch"), so the list of units, areas and
categories is now in `LINE_FORM`, and `lineUnit` reads unit words back (cups and rolls are pieces, packs are pack, litres are L).
`UPDATE_SHAPE` is now `owner`: the owner's home and the live evals get the short form; friends' homes keep JSON until the next live
run confirms it.

## New allergens and clean barcode reading (20 Nov 2026, branch `tote-scan-4`)

Sushmitha asked Tote to keep training on new images, new allergens and reading barcodes cleanly. Not merged and not live.

### Seven new allergens
`ALLERGENS` (Worker and app) gains Lupin, Molluscs, Buckwheat, Kiwi, Banana, Peach and Coconut (the EU's 14, Japan's and Korea's lists, and coconut, a tree nut to the US FDA). Each has its other names in `WORDS`, including Indian and Asian ones (kuttu, nariyal, thengai, khopra, kanava, kela, tako), and the look-alikes left out (banana peppers and shallots, oyster mushrooms, the "Squid brand" fish sauce, momos, cocoa). Open Food Facts' own tags count for lupin and molluscs (`OFF`). The glossary has codes K, L, B, O, I, N, H; oyster sauce and conpoy are molluscs, soba and the new kuttu atta line are buckwheat (kuttu atta is no longer read as wheat atta), coconut milk is coconut, plantains and banana milk are banana. Shellfish keeps its molluscs, so a home that chose Shellfish sees no change; Molluscs alone does not flag shrimp. "Mollusks" is the same choice. A label's "contains no coconut" or "nut-free" is no longer read as the food (`labelCheck`, the database's tags still count). The app shows the new chips with a picture and a hint.

Checks: `evals/allergens2.mjs` (`npm run test:allergens2`, part of `npm test`): 50 of 97 on `main`, 97 of 97 on the branch, every "should warn" with a "should not warn". First sight (`--fresh`, `evals/allergens2-fresh.json`, written by Claude after the code was finished, not tuned on): 42 of 45; caught 29 of 30 (missed: takoyaki, an octopus dish), quiet 13 of 15 (false alarms on "oyster crackers" and "mushroom oyster stir fry kit"). World groceries held-out unchanged at 86.2%.

### Reading barcodes cleanly
- **A new reader.** The app's camera now runs its own loop (`app.js`, barcode section): the middle band of each frame (90% across, 60% down, drawn as a box) is read by the phone's own reader where it has one for shop barcodes (Android Chrome's `BarcodeDetector`), otherwise by ZXing-C++ as WebAssembly (`public/vendor/zxing-reader.js`, `zxing_reader.wasm`, zxing-wasm 2.2.4, MIT), loaded only when the sheet first opens. html5-qrcode (its ZXing port ran without "try harder" and missed most barcodes on a coloured pack) is gone from the app; a copy stays in `evals/vendor-before/` to score the old reader.
- **Rules every read must pass** (`public/barcode.js`, the same in the Worker as `gtinOf`): the check digit; UPC-E written out as its UPC-A, and only with a leading 0 (GS1 issues UPC-E only to company numbers that start with 0; a tilted EAN-13 can read as a UPC-E starting with 1); an EAN-13 starting with 0 is sent as its UPC-A. The camera takes a code only when the same valid number is seen twice (`Steady`), and says "Got …, hold still" after the first.
- **The Worker** refuses a number whose check digit is wrong before any lookup (`bad_code`), and looks a product up under its other length when the first is not found (`gtinTwin`: UPC-A and the EAN-13 with a 0 in front). Other lengths go through as before.
- **Typed numbers** that do not add up are caught in the sheet ("Those digits do not add up…"), which stays open.
- **A light button** where the phone lets a page switch on the torch (most Android phones).
- The content policy allows `'wasm-unsafe-eval'` (compiling WebAssembly only; JavaScript `eval` is still refused); `evals/security.mjs` was changed to allow exactly that.

Checks: `evals/barcode.mjs` (`npm run test:barcode`, part of `npm test`, 42 of 42); `evals/barcode-audit.cjs` (`npm run test:barcode:photos`): 224 photos made by code (`scripts/barcode-images.mjs`, `scripts/barcode-damage.py`; 16 made-up numbers, India, US, EU, EAN-8, UPC-E; 14 kinds of damage: a coloured pack, blur, shake, tilt 12 and 35 degrees, an angle, dim light, glare, a can, a crumpled bag, too far, a thumb, heavy JPEG, a faded print), each read as 8 camera frames. Before: 69 right, 1 wrong (a partial EAN-8 that would have been looked up). After: 173 right, 0 wrong. A first-sight set with other numbers and smaller bars (`--fresh`, scored once): 65 right, 0 wrong before; 134 right, 0 wrong after. Never read by either: a thumb over the bars (as it should), hard shake, and on the fresh set, bars too small at a distance. `evals/barcode-walk.cjs` (`npm run test:barcode:walk`, 10 of 10): Chromium's stand-in camera plays a dim and a tilted photo and the right number is looked up in about 1.3 s; a thumb looks up nothing; under the live content policy. The photos are not kept in git; the scripts draw the same ones every time.

Not measured: a real phone camera, iPhone Safari, Android's own reader, real packs. Open Food Facts and its photos could not be reached from Claude's workspace, so no real pack photos were used.
