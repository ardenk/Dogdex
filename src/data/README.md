# Editable data files

Everything the app knows about breeds, rarity, and badges lives here, not in code.
Edit the JSON, save, and the dev server reloads. Run `npm run validate:data` to check your changes.

| File | What it controls |
|---|---|
| `groups.json` | AKC groups (plus `mixed`), their order in the Dogdex, and a one-line blurb |
| `breeds.json` | Each breed: group, origin, rarity, temperament, summary, key identifying traits, search aliases, tags |
| `rarity.json` | Rarity tiers: label, symbol, and how loudly we celebrate (`none`, `toast`, or `full`) |
| `badges.json` | Badges and their rules |

## Adding a breed

Add an object to `breeds.json`. `groupId` must match an `id` in `groups.json`, and `rarity` must match one in `rarity.json`.
`aliases` are extra search words ("lab", "frenchie"). `tags` are used by badge rules (for example `"doodle"`).

## Badge rules

| `type` | Fields | Meaning |
|---|---|---|
| `total_dogs` | `gte` | At least this many individual dogs logged |
| `tag_count` | `tag`, `gte` | At least this many dogs whose breed has the tag |
| `group_complete` | `excludeGroups` | Every breed in some group has been logged |
| `rarity_count` | `rarity`, `gte` | At least this many dogs of breeds with that rarity |
| `guess_correct_count` | `gte` | At least this many correct guesses |

Rarity tiers are subjective. They are tuned to what you'd realistically see on a walk in a US city. Change them freely.
