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
| Model invents or mangles data | Output must match a JSON schema, then every field is coerced and clamped before it is saved | `sanitize` |
| Text in a receipt or voice note tries to give orders | Input is passed as data with an instruction never to follow it; household-typed words are labelled as facts | `structure`, `describe`, `chatAnswer` |
| One message empties the house | A single message may not finish more than 4 items or change more than 10; it is refused and nothing is changed | `tooMuch` |
| The reply claims a change that did not happen | Updates are reported from the database result, never from the model | `chatReply` |
| "Is this safe for his allergy?" | The reply is checked after generation: safety claims are removed and replaced with "check the pack" | `guardReply` |
| Medicine doses | Any dose-like reply is replaced with a pointer to the leaflet or a pharmacist | `guardReply` |
| Off-topic requests, prompt leaks | Declined by instruction and tested in the evals | `LIMITS` |
| Runaway cost or abuse | 40 model calls per 10 minutes and 400 per day for the whole home | `aiBudget` |
| Code acting on a guess | The quick path gives up on plans, maybes, negations, someone else, dishes, pronouns, unclear amounts, two things with one name, nonsense amounts ("99 gold bars"), and run-together lists; tested on 362 hands-off phrasings by other writers | `quickParse`, `evals/quickpath.mjs` |
| A wrong reading replayed | A remembered message is never replayed after an undo, a rejected guess or "Not right?", and only if what it uses is still tracked | `memoBad`, `memoReplay` |
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
| Reminders | A phone's address is accepted only if it is an https address at a known push service; the message is encrypted for that phone (RFC 8291) and signed (VAPID); the service worker caches nothing and intercepts no requests |

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
| What is worth a reminder | Something whose pace is the household's own, or an essential, that is about to run out; and anything that wants using today. The same rules as the app's "Might be running low", so the phone and the screen agree |
| How often | One notification per phone per day at most, and only when there is something to say. An item is raised every other day at most |
| What it says | Fixed sentences, item first, then when, said as a guess: "Milk is running low" / "My guess: out by tomorrow. Add it to your list?". Two items: "Milk and Bread are running low". Best by today: "Spinach is best by today" / "Use it today, or freeze it." Each line stays under 12 words (`remindText`) |
| When a send fails | 404 or 410: the phone unsubscribed, so it is forgotten. Any other failure: tried again the next hour, the same day, and the phone is dropped only after 24 failed tries in a row. A success resets the count |
| When | Five in the afternoon, local time, until the household's own hour is learned |
| Answering | On Android and desktop the notification has "Add to list" and "Still have it". The tap is applied, then the notification is replaced by a quiet one saying what changed ("Milk is on your list") with Undo; `/api/remind` returns that sentence and the values it changed, and `answer: "undo"` puts them back. On iPhone (no notification buttons), tapping it opens the list of things that need you, with the same answers |
| Counting | `remind_sent` counts each item once on the day it is raised, however many phones hear about it, so "reminders that led to the list" is a fair share. An undone answer is taken back off its counter |
| What decides | Code. An hourly Worker cron (`tick`) checks whether any phone is due. No model is called |
| The key | The signing key is made on first use and kept in `settings`. It is never sent to the browser and can do nothing except send to phones that subscribed |

## App audit

`evals/app-audit.cjs` (and `evals/app-monkey.cjs <seed>`, random taps that report script errors, server errors, stuck screens and taps that leave the app) walks the app with automated taps (Playwright, against a local `wrangler dev`): back button, reload, scroll memory, page titles, tap-target sizes, the list badge, the bell, offline behaviour and an expired sign-in. 24 checks.

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

### Training log

| Date | Change | Measured |
|---|---|---|
| 14 Nov | Scorecard and capability tasks added | Live baseline (version 009431f7): regression 96.1%, capability 64.7% (partial 78.9%), on voice 100%, typical reply 4.0 s, slowest 5% 15.5 s |
| 15 Nov | Round 1: follow-ups with the last two exchanges as context, plans and maybes change nothing, corrections like "2 not 3", learned pace in answers. From reading the baseline failures: answers may not claim a change they did not make; "bought" before an untracked thing is a purchase; an instruction line on a receipt is dropped, not the receipt. Two unfair tests fixed | Offline: all suites pass, router held-out 97.3%. Live: on the scorecard after the next run |

| 15 Nov | Code first: a quick path reads plain messages and answers plain questions with no model; facts and memo tables; Stocker works with no AI allowance (chat, barcodes, typed receipts, dinner ideas); the model sees only the relevant part of the home. 32 new live tasks ("Without AI credits", "Costs nothing") | Offline, exact (no model involved): Without AI credits 4.3% → 100% (23 tasks); live tasks needing no model call 9.4% → 52.9% (8 → 45 of 85), all 45 pass. Quick path on 629 phrasings by other writers, first sight: 100% left alone, 19.1% read, 95% right; after one round of general fixes 24.4% read, 100% right. Cost on those 629 against a 120-item home, stand-in model: calls per message 1.44 → 1.10, tokens per message about 4,000 → 2,500. Live: on the scorecard after the next run |

| 15 Nov | Delegation: a small model (8B, about a sixth of the price) takes everyday updates and questions code could not read; code checks its work and sends mistakes to the large model. Cost per task in dollars on the scorecard; 6 new live tasks ("Right model for the job") | Offline: on 629 phrasings by other writers, 49.9% of model jobs go to the small model, and after widening the dish and food-safety words no dish, health question or correction does (first sight: 9 would have). Estimated cost on those messages, stand-in answers: $0.425 → $0.262 per 1,000. Whether the small model reads well enough is only known live: the escalation rate and the regression suite on the scorecard are the gate |

### The weekly loop

1. Open the scorecard. Look at what broke, and read the failures.
2. On `/evals.html`, give a verdict on real conversations that went wrong; each becomes a task.
3. Fix the prompt, router or code. `npm test`, then `npm run track -- --note="..."`, then push.
4. The deploy is checked automatically, and twice more on the following nights.
5. When a capability task passes every trial, set its `suite` to `regression` and write a harder one. A suite at 100% only guards against going backwards; it no longer shows progress.

Rules that keep the scores honest: a held-out set used to fix something stops being held out (write a fresh one); tune on `npm run test:pace -- --seed=1` and report seed 2; and a task that fails every trial is first checked for being unfair before Tote is changed.

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
