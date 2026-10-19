# WaFine launch post (LinkedIn), draft v3

Not published, not scheduled. Three language versions: launch-post-fr.txt, launch-post-en.txt, launch-post-ar.txt.

## Before publishing (blocking)
1. Waitlist link: wafine.zawia.tech returned 502 from the build environment on 2026-10-18, and no wafine.* DNS record was confirmed. Replace the placeholder only with a URL that answers 2xx/3xx.
2. Confirm auto-replies are live for launch users. docs/08 describes them as a proof of concept (two rules, off by default, allowlisted contacts). The post says "your auto-replies go through one sender".
3. Author and byline: which account posts it (personal profile or ZawIA.Tech page), and which names appear.

## Owner decisions
4. The site copy overclaims in three places. Fix it in app/web/messages/{fr,en,ar}.json before a launch that repeats the claim:
   - connector.consentNote: "revoke the key and access ends immediately" is wrong for Claude. Disconnecting Claude on the WhatsApp page ends its access; revoking a WaFine API key does not.
   - features.items[0] (and the FAQ): "every outbound message goes through one sender with a configurable gap". Only auto-replies are gap-paced; API and MCP sends count against the daily cap.
   - features.items[1]: "a key per WhatsApp session". Users can hold up to 5 active keys.
5. The consent screen (app/web/src/app/oauth/consent/page.tsx) is hard-coded English. French and Arabic readers will see English on it. Localise it, or keep the note.
6. The disclaimer and credit lines are the site copy, word for word. The Arabic credit uses بنية (structure) for "built by"; the French disclaimer has a grammatically awkward "ni ... ou" construction. Both are the owner's approved wording: change them only in the site copy.
7. "Dedicated number" rule: the repo's ops rule says dedicated, warmed-up numbers only, but the public FAQ says the opposite. The post no longer states it. Decide the user-facing rule, then align the FAQ.
8. Length: FR is about 1530 characters and EN about 1310, against a 600 to 1300 guideline. The credit and disclaimer lines are mandatory and take about 350 characters together. Shorter options: drop the hashtags, or cut the mechanism paragraph.

## Checked
- Each claim was checked against the repo source it cites (docs/08, docs/09, docs/10, the consent page, the site messages). Claims that did not hold were removed or corrected.
- lint_copy.py: 0 errors, 0 warnings on all three.
- Not checked: the Arabic and French wording by a native reader. Darija is not used.
