#!/usr/bin/env python3
"""Check WaFine marketing copy against the brand and legal guardrails.

Usage: lint_copy.py FILE [--channel linkedin|x|email-subject|meta] [--strict]
Reads FILE (or stdin with "-"). Prints ERROR and WARN lines. Exit 1 if any ERROR
(or any WARN with --strict). Stdlib only. Rules mirror references/voice.md and
references/facts.md; extend the lists there and here together.
"""
import re
import sys
import argparse

# (regex, message). ERROR = never publish; WARN = decide on purpose.
ERRORS = [
    (r"\bno[- ]ban\b|\bban[- ]proof\b|\bban[- ]free\b|\bwon'?t (?:get )?ban(?:ned)?\b|\bnever (?:get )?banned?\b|\bcannot be banned\b|\b(?:zero|no) risk\b",
     "ban or risk promise: say 'reduces the risk', no gateway can promise it"),
    (r"sans (?:risque de )?bannissement|zéro risque|aucun risque|jamais banni",
     "promesse anti-bannissement : dire 'réduit le risque'"),
    (r"بدون حظر|لا خطر|مضمون ضد الحظر|لن يتم حظر",
     "وعد بعدم الحظر: قل 'يقلّل الخطر' فقط"),
    (r"\bcndp[- ]compliant\b|\b09-08[- ]compliant\b|\bgdpr[- ]compliant\b|\bcompliant with (?:the )?(?:cndp|law 09-08|gdpr)\b|conforme (?:à la )?(?:cndp|loi 09-08|rgpd)",
     "compliance claim: residency is an open owner decision, describe where data lives instead"),
    (r"\bend[- ]to[- ]end encrypt|\bE2E(?:E)?\b|chiffr\w* de bout en bout|تشفير من طرف إلى طرف",
     "end-to-end claim: the BFF can read content transiently; use the site FAQ wording"),
    (r"whatsapp business api|works with whatsapp|powered by whatsapp|official whatsapp|officiel whatsapp|partenaire (?:de )?(?:meta|whatsapp)|partner of (?:meta|whatsapp)",
     "WhatsApp brand misuse: WaFine is unofficial and unaffiliated"),
    (r"powered by claude|claude partner|certified by anthropic|partenaire (?:de )?anthropic|anthropic partner|(?<!not )(?<!n't )(?<!never )endorsed by (?:anthropic|claude)",
     "Anthropic/Claude endorsement implied: plain factual text only"),
    (r"#25d366",
     "WhatsApp green is never used"),
    (r"\bfree\b|\bgratuit\w*|\bcheap\b|\bpricing\b|\bprice\b|\btarif\w*|\bprix\b|\bper month\b|\bMAD\s?\d|\d\s?(?:MAD|DH|dhs|USD|EUR|€|\$)|مجاني|سعر|تسعير",
     "pricing language: no pricing exists, the CTA is 'Join the waitlist' (ignore if quoting a legal phrase)"),
    (r"\bunlimited\b|\billimité\w*|\bscales? to (?:thousands|millions)\b|غير محدود",
     "capacity claim: one VM carries about 12 sessions, invite in small batches"),
    (r"\bmass (?:message|messaging)\b|\bbulk (?:send|message|messaging|sms)\b|\bblast\b|\bcold (?:outreach|messag)\w*|envoi (?:de )?masse|rafale|رسائل جماعية|إرسال جماعي",
     "bulk or cold outreach framing: not a supported use, hurts the brand's one promise"),
    (r"\btrusted by\b|ils nous font confiance|\btestimonial\b|يثق بنا",
     "no testimonials or customer logos exist yet"),
    (r"\bsk-[A-Za-z0-9_-]{16,}|\bwafine_[A-Za-z0-9]{10,}|\bBearer [A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.",
     "looks like a secret or token: remove it"),
    (r"(?<![\w+])\+?212[\s.-]?[5-7]\d{8}\b|(?<![\w+])0[5-7](?:[\s.-]?\d{2}){4}\b",
     "looks like a real Moroccan phone number: use +212 6XX XX XX XX"),
]
WARNS = [
    (r"\bseamless(?:ly)?\b|\brevolution\w*|\bgame[- ]?changer\b|\bsupercharge\w*|\bunlock\b|\bempower\w*|\bnext[- ]level\b|\bcutting[- ]edge\b|r[ée]volutionnaire|disruptif|incroyable|\bsecret\b|ثوري",
     "banned hype word (design system and Ai4x charter lists)"),
    (r"\bAI[- ]powered\b|\bpropulsé par l'IA\b",
     "headline cliché: say what it does"),
    (r"\bsign up now\b|\bavailable to everyone\b|\bopen to all\b|inscrivez-vous maintenant|ouvert à tous",
     "WaFine is invite-only: CTA is 'Join the waitlist'"),
    (r"\bsafe\b|\bsecure\b|\bsécuris\w*|\bsûr\b",
     "vague safety word: name the mechanism (scoped keys, shown once, pacing)"),
    (r"\bwhatsapp api\b",
     "'WhatsApp API' reads as the official API: say 'REST API and MCP endpoint on your WhatsApp number'"),
    (r"\bAI writes and sends\b|\bfully automated\b|\bentièrement automatis\w*",
     "the pitch is paced and under your control, not hands-off"),
]
LIMITS = {"linkedin": 3000, "x": 280, "email-subject": 60, "meta": 155}
EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF\U0000FE0F]")
NAME_BAD = re.compile(r"\bWAFINE\b|\bWafine\b|\bwafine\b(?![./\-_])|\bWa Fine\b|\bWa-Fine\b")


# A ban or endorsement phrase inside an explicit negation is the honest limit, not a promise:
# "no gateway can promise a number is never banned". Such sentences are not flagged.
NEGATED = re.compile(
    r"ne peut (?:promettre|garantir)|aucune? (?:passerelle|gateway)|no gateway|cannot (?:promise|guarantee)|"
    r"can(?:not|'t) promise|not (?:affiliated|endorsed|authori[sz]ed)|لا توجد بوابة|لا يمكن (?:ضمان|وعد)",
    re.I,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--channel", choices=sorted(LIMITS))
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    text = sys.stdin.read() if a.file == "-" else open(a.file, encoding="utf-8").read()
    # ignore a trailing claims-check or notes section if the file includes our package layout
    body = re.split(r"\n#{1,3} (?:Claims check|Needs the owner)\b", text)[0]
    out = []

    def scan(rules, level):
        for rx, msg in rules:
            for m in re.finditer(rx, body, re.I):
                ln = body.count("\n", 0, m.start()) + 1
                sentence = re.split(r"(?<=[.!?؟])\s|\n", body[max(0, body.rfind("\n", 0, m.start())): m.end() + 120])
                if ("ban" in msg or "endorsement" in msg) and any(NEGATED.search(x) and m.group(0).lower() in x.lower() for x in sentence):
                    continue
                snip = body[max(0, m.start() - 20): m.end() + 20].replace("\n", " ")
                out.append((level, ln, msg, snip))

    scan(ERRORS, "ERROR")
    scan(WARNS, "WARN")

    for m in NAME_BAD.finditer(body):
        ln = body.count("\n", 0, m.start()) + 1
        out.append(("WARN", ln, f"product name is 'WaFine', found '{m.group(0)}' (ignore in URLs and code)", body[max(0, m.start()-15): m.end()+15].replace("\n", " ")))

    emojis = EMOJI.findall(body)
    if emojis:
        lim = 2 if a.channel in ("linkedin", "x") else 0
        if len(emojis) > lim:
            out.append(("WARN", 0, f"{len(emojis)} emoji: allowed {lim} here (none on site, email, docs, carousels)", "".join(emojis[:6])))

    for i, line in enumerate(body.splitlines(), 1):
        if line.count("!") >= 2:
            out.append(("WARN", i, "multiple exclamation marks", line.strip()[:60]))
    if a.channel:
        # a thread file holds several posts numbered "1/", "2/"...: check each one
        parts = re.split(r"(?m)^\s*\d+/\s", body) if a.channel == "x" else [body]
        parts = [p for p in parts if p.strip()] or [body]
        for idx, part in enumerate(parts, 1):
            n = len(part.strip())
            if n > LIMITS[a.channel]:
                which = f"post {idx}" if len(parts) > 1 else "text"
                out.append(("ERROR", 0, f"{which}: {n} characters, limit for {a.channel} is {LIMITS[a.channel]}", ""))
        if a.channel == "linkedin" and body.strip():
            first = body.strip().splitlines()[0]
            if len(first) > 210:
                out.append(("WARN", 1, f"hook line is {len(first)} characters, LinkedIn cuts at about 210", first[:60]))
    if re.search(r"[؀-ۿ]", body) and re.search(r"dar(?:ija)?|دارجة|ديالك|ديال|كيخدم", body, re.I) and "validate" not in text.lower() and "تحقق" not in text:
        out.append(("WARN", 0, "Darija wording present: flag it '[to validate by a native reader]'", ""))

    for level, ln, msg, snip in out:
        loc = f"line {ln}" if ln else "text"
        print(f"{level}: {loc}: {msg}" + (f"  «{snip.strip()}»" if snip else ""))
    errs = sum(1 for o in out if o[0] == "ERROR")
    warns = sum(1 for o in out if o[0] == "WARN")
    print(f"-- {errs} error(s), {warns} warning(s)")
    sys.exit(1 if errs or (a.strict and warns) else 0)


if __name__ == "__main__":
    main()
