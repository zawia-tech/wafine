#!/usr/bin/env bash
# dns-verify.sh — check-only DNS verification for the WAFINE launch (docs/go-live-2026-10-20.md).
# Uses `dig +short` only; nothing here changes a record. Prints one `PASS|FAIL <check> <actual>`
# line per check and exits 1 if any check failed.
#
#   scripts/dns-verify.sh                       # defaults: zawia.tech, wafine / docs.wafine / api.wafine
#   ZONE=example.com scripts/dns-verify.sh      # another zone, same host names
#
# Expected targets (override to re-point a check):
#   WEB_TARGET, DOCS_TARGET, API_TARGET   substring the CNAME must contain (default cname.vercel-dns.com;
#                                         the API host is the Vercel api-edge proxy, see app/api-edge/README.md)
#   MX_TARGET                             substring every MX must contain (default privateemail.com)
#   SPF_INCLUDE                           include: the SPF record must carry (default spf.privateemail.com)
#   EXTRA_TXT                             extra apex TXT prefix that must still exist (default brevo-code:)
set -euo pipefail

command -v dig >/dev/null 2>&1 || { echo "dns-verify: dig not found" >&2; exit 2; }

ZONE="${ZONE:-zawia.tech}"
WEB_HOST="${WEB_HOST:-wafine.$ZONE}"
DOCS_HOST="${DOCS_HOST:-docs.wafine.$ZONE}"
API_HOST="${API_HOST:-api.wafine.$ZONE}"
WEB_TARGET="${WEB_TARGET:-cname.vercel-dns.com}"
DOCS_TARGET="${DOCS_TARGET:-cname.vercel-dns.com}"
API_TARGET="${API_TARGET:-cname.vercel-dns.com}"
MX_TARGET="${MX_TARGET:-privateemail.com}"
SPF_INCLUDE="${SPF_INCLUDE:-spf.privateemail.com}"
EXTRA_TXT="${EXTRA_TXT:-brevo-code:}"

failed=0
pass() { printf 'PASS %-10s %s\n' "$1" "$2"; }
fail() { printf 'FAIL %-10s %s\n' "$1" "$2"; failed=1; }

# cname_check <check> <host> <expected-substring>: the host must be a CNAME whose target contains
# the expected string. The actual target is always printed so the operator can eyeball it.
cname_check() {
  local check="$1" host="$2" want="$3" cname a
  cname="$(dig +short CNAME "$host" | head -n1)"
  if [ -z "$cname" ]; then
    a="$(dig +short A "$host" | tr '\n' ' ')"
    fail "$check" "$host has no CNAME (A: ${a:-none}); want CNAME to *$want*"
  elif [[ "$cname" == *"$want"* ]]; then
    pass "$check" "$host -> $cname"
  else
    fail "$check" "$host -> $cname; want *$want*"
  fi
}

cname_check web "$WEB_HOST" "$WEB_TARGET"
cname_check docs "$DOCS_HOST" "$DOCS_TARGET"
cname_check api "$API_HOST" "$API_TARGET"

mx="$(dig +short MX "$ZONE" | sort | tr '\n' ' ')"
if [ -z "$mx" ]; then
  fail mx "$ZONE has no MX"
elif grep -qv "$MX_TARGET" <<<"$(dig +short MX "$ZONE")"; then
  fail mx "$ZONE MX changed: $mx; want all *$MX_TARGET*"
else
  pass mx "$ZONE $mx"
fi

txt="$(dig +short TXT "$ZONE")"
spf="$(grep 'v=spf1' <<<"$txt" || true)"
if [ -z "$spf" ]; then
  fail spf "$ZONE has no v=spf1 TXT"
elif [[ "$spf" == *"include:$SPF_INCLUDE"* ]]; then
  pass spf "$ZONE $spf"
else
  fail spf "$ZONE $spf; want include:$SPF_INCLUDE"
fi

if [ -n "$EXTRA_TXT" ]; then
  extra="$(grep "$EXTRA_TXT" <<<"$txt" || true)"
  if [ -n "$extra" ]; then pass txt "$ZONE $extra"; else fail txt "$ZONE TXT $EXTRA_TXT* missing"; fi
fi

if [ "$failed" = 0 ]; then echo "dns-verify: all checks passed"; else echo "dns-verify: FAILED"; fi
exit "$failed"
