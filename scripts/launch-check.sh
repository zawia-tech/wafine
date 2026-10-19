#!/usr/bin/env bash
set -euo pipefail

# launch-check.sh — read-only post-launch checks for WAFINE.
# With --agent, prints the same STEP <name> <ok|failed|skipped> <detail>
# contract as scripts/bootstrap/lib.sh (log_step) so one parser reads both.
# Without --agent, prints human-friendly [status] name detail lines.
# Exits non-zero and prints a final NEXT-ACTION line if any required check fails.
#
# Targets may be given with or without a scheme: --api api.example.com and
# --api https://api.example.com are both accepted (dig gets the bare host, curl
# gets a URL).
#
# Optional DNS checks (docs/15-launch-checklist.md):
#   --mail-domain <domain>        apex that must keep serving MX, SPF and DMARC
#   --dkim-selectors a,b          DKIM selectors that must keep resolving
#                                 (TXT or CNAME at <sel>._domainkey.<mail-domain>)
# Both are read-only: nothing here changes DNS records, only looks them up.

MODE="normal"
TARGET_WEB=""
TARGET_API=""
TARGET_DOCS=""
MAIL_DOMAIN=""
DKIM_SELECTORS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      MODE="agent"
      shift
      ;;
    --target)
      TARGET_WEB="${2:-}"
      shift 2
      ;;
    --api)
      TARGET_API="${2:-}"
      shift 2
      ;;
    --docs)
      TARGET_DOCS="${2:-}"
      shift 2
      ;;
    --mail-domain)
      MAIL_DOMAIN="${2:-}"
      shift 2
      ;;
    --dkim-selectors)
      DKIM_SELECTORS="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

fail_count=0

log_step() {
  local name="$1" status="$2" detail="${3:-}"
  if [[ "$MODE" == "agent" ]]; then
    printf 'STEP %s %s %s\n' "$name" "$status" "$detail"
  else
    printf '[%-7s] %-24s %s\n' "$status" "$name" "$detail"
  fi
}

note() {
  [[ "$MODE" == "agent" ]] || printf '%s\n' "$*"
}

# fail_next <name> <detail>: record a failure and keep going; the final
# NEXT-ACTION is emitted once at the end if any check failed.
fail_next() {
  local name="$1" detail="${2:-}"
  log_step "$name" failed "$detail"
  fail_count=$((fail_count + 1))
}

# host_of <value>: hostname without scheme or path, for dig.
#   https://api.example.com/path -> api.example.com
#   api.example.com              -> api.example.com
host_of() {
  local v="${1#http://}"
  v="${v#https://}"
  printf '%s\n' "${v%%/*}"
}

# url_of <value>: URL with a scheme, for curl. A bare host is treated as https,
# matching how every public endpoint in this stack is served.
url_of() {
  local v="$1"
  case "$v" in
    http://*|https://*) printf '%s\n' "$v" ;;
    *) printf 'https://%s\n' "$v" ;;
  esac
}

# A one-shot HTTP status probe that never doubles the code: curl -w writes
# %{http_code} even on connection failure (000), so do NOT append `|| echo 000`
# inside the same command substitution — that is what produced 000000.
http_code() {
  local url="$1"
  command -v curl >/dev/null 2>&1 || { echo "000"; return 0; }
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$url" 2>/dev/null || true)"
  if [[ -z "$code" ]]; then
    echo "000"
  else
    echo "$code"
  fi
}

check_dig() {
  local host="$1" name="$2" step_name="dns-$2"
  if [[ -z "$host" ]]; then
    log_step "$step_name" skipped "no host specified"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  host="$(host_of "$host")"
  if dig +short "$host" 2>/dev/null | grep -qv '^$'; then
    log_step "$step_name" ok "$host resolves"
  else
    fail_next "$step_name" "$host does not resolve"
  fi
}

check_curl_head() {
  local url="$1" name="$2" step_name="$2"
  if ! command -v curl >/dev/null 2>&1; then
    log_step "$step_name" skipped "curl not found"
    return 0
  fi
  local code
  code="$(http_code "$(url_of "$url")")"
  if [[ "$code" == "200" ]]; then
    log_step "$step_name" ok "$url returns 200"
  elif [[ "$code" == "404" ]]; then
    log_step "$step_name" ok "$url returns 404 (expected if not yet created)"
  else
    fail_next "$step_name" "$url unexpected status $code"
  fi
}

check_curl_body_code() {
  local url="$1" name="$2" step_name="$2"
  if ! command -v curl >/dev/null 2>&1; then
    log_step "$step_name" skipped "curl not found"
    return 0
  fi
  local code
  code="$(http_code "$(url_of "$url")")"
  if [[ "$code" == "200" ]]; then
    log_step "$step_name" ok "$url returns 200"
  else
    fail_next "$step_name" "$url returns $code"
  fi
}

# check_api_tls <target>: the API host must present a certificate that matches
# its exact name. curl exit codes distinguish "certificate is wrong" from "the
# host is not up yet"; both are failures, but the detail tells the operator
# which one to fix (docs/15: create the custom hostname vs start the stack).
check_api_tls() {
  local target="$1" step_name="api-tls"
  if [[ -z "$target" ]]; then
    log_step "$step_name" skipped "no target specified"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    log_step "$step_name" skipped "curl not found"
    return 0
  fi
  local host code
  host="$(host_of "$target")"
  code=0
  curl -s -o /dev/null --max-time 15 "https://$host/health" 2>/dev/null || code=$?
  case "$code" in
    0)
      log_step "$step_name" ok "$host presents a valid TLS certificate"
      ;;
    60|51|53|54|58|77|83|90|91)
      fail_next "$step_name" "$host certificate rejected by curl (exit $code); check the custom hostname / Caddy TLS"
      ;;
    7|28)
      fail_next "$step_name" "$host unreachable (curl exit $code); is the tunnel (or caddy profile) up?"
      ;;
    *)
      fail_next "$step_name" "$host TLS probe failed (curl exit $code)"
      ;;
  esac
}

# check_api_cname <target>: the custom hostname must be a CNAME (proxied at the
# edge), not a bare A/AAAA record.
check_api_cname() {
  local target="$1" step_name="api-cname"
  if [[ -z "$target" ]]; then
    log_step "$step_name" skipped "no target specified"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  local host cname
  host="$(host_of "$target")"
  cname="$(dig +short CNAME "$host" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$cname" ]]; then
    log_step "$step_name" ok "$host -> $cname"
  elif [[ -n "$(dig +short A "$host" 2>/dev/null || true)" || -n "$(dig +short AAAA "$host" 2>/dev/null || true)" ]]; then
    fail_next "$step_name" "$host resolves to A/AAAA only; expected a proxied CNAME"
  else
    fail_next "$step_name" "$host has no CNAME (create it at the DNS holder)"
  fi
}

check_mail_mx() {
  local step_name="mail-mx"
  if [[ -z "$MAIL_DOMAIN" ]]; then
    log_step "$step_name" skipped "no --mail-domain specified"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  if [[ -n "$(dig +short MX "$MAIL_DOMAIN" 2>/dev/null || true)" ]]; then
    log_step "$step_name" ok "$MAIL_DOMAIN has MX"
  else
    fail_next "$step_name" "$MAIL_DOMAIN has no MX (delivery would break)"
  fi
}

check_mail_spf() {
  local step_name="mail-spf"
  if [[ -z "$MAIL_DOMAIN" ]]; then
    log_step "$step_name" skipped "no --mail-domain specified"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  if dig +short TXT "$MAIL_DOMAIN" 2>/dev/null | grep -q 'v=spf1'; then
    log_step "$step_name" ok "$MAIL_DOMAIN has v=spf1"
  else
    fail_next "$step_name" "$MAIL_DOMAIN has no v=spf1 TXT record"
  fi
}

check_mail_dmarc() {
  local step_name="mail-dmarc"
  if [[ -z "$MAIL_DOMAIN" ]]; then
    log_step "$step_name" skipped "no --mail-domain specified"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  if dig +short TXT "_dmarc.$MAIL_DOMAIN" 2>/dev/null | grep -q 'v=DMARC1'; then
    log_step "$step_name" ok "_dmarc.$MAIL_DOMAIN has v=DMARC1"
  else
    fail_next "$step_name" "_dmarc.$MAIL_DOMAIN has no v=DMARC1 TXT record"
  fi
}

check_mail_dkims() {
  local step_name="mail-dkim"
  if [[ -z "$DKIM_SELECTORS" ]]; then
    log_step "$step_name" skipped "no --dkim-selectors specified"
    return 0
  fi
  if [[ -z "$MAIL_DOMAIN" ]]; then
    log_step "$step_name" skipped "--dkim-selectors needs --mail-domain"
    return 0
  fi
  if ! command -v dig >/dev/null 2>&1; then
    log_step "$step_name" skipped "dig not found"
    return 0
  fi
  local IFS=',' selector qname missing=()
  for selector in $DKIM_SELECTORS; do
    selector="${selector// /}"
    [[ -n "$selector" ]] || continue
    qname="${selector}._domainkey.${MAIL_DOMAIN}"
    if [[ -z "$( (dig +short TXT "$qname"; dig +short CNAME "$qname") 2>/dev/null | grep -v '^$' || true)" ]]; then
      missing+=("$qname")
    fi
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    log_step "$step_name" ok "selectors [$DKIM_SELECTORS] resolve under $MAIL_DOMAIN"
  else
    fail_next "$step_name" "missing records: ${missing[*]}"
  fi
}

check_vercel_env() {
  if ! command -v vercel >/dev/null 2>&1; then
    log_step vercel-env skipped "vercel CLI not found"
    return 0
  fi
  if ! vercel env ls production >/dev/null 2>&1; then
    log_step vercel-env skipped "not logged in or cannot access"
    return 0
  fi
  if vercel env ls production 2>/dev/null | grep -q "SITE_URL" && \
     vercel env ls production 2>/dev/null | grep -q "NEXT_PUBLIC_API_URL" && \
     vercel env ls production 2>/dev/null | grep -q "NEXT_PUBLIC_DOCS_URL" && \
     vercel env ls production 2>/dev/null | grep -q "CONTACT_EMAIL" && \
     vercel env ls production 2>/dev/null | grep -q "NEXT_PUBLIC_CONTACT_EMAIL" && \
     vercel env ls production 2>/dev/null | grep -q "BFF_URL"; then
    log_step vercel-env ok "SITE_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_DOCS_URL, CONTACT_EMAIL, NEXT_PUBLIC_CONTACT_EMAIL, BFF_URL present"
  else
    fail_next vercel-env "expected all six env vars missing"
  fi
}

check_gh_secrets() {
  if ! command -v gh >/dev/null 2>&1; then
    log_step gh-secrets skipped "gh CLI not found"
    return 0
  fi
  if ! gh secret list >/dev/null 2>&1; then
    log_step gh-secrets skipped "cannot access repo secrets"
    return 0
  fi
  if gh secret list 2>/dev/null | grep -q "E2E_EMAIL" && \
     gh secret list 2>/dev/null | grep -q "E2E_PASSWORD" && \
     gh secret list 2>/dev/null | grep -q "E2E_WA_NUMBER"; then
    log_step gh-secrets ok "E2E_EMAIL, E2E_PASSWORD, E2E_WA_NUMBER present"
  else
    fail_next gh-secrets "expected E2E_EMAIL, E2E_PASSWORD, E2E_WA_NUMBER"
  fi
}

check_gh_vars() {
  if ! command -v gh >/dev/null 2>&1; then
    log_step gh-vars skipped "gh CLI not found"
    return 0
  fi
  if ! gh variable list >/dev/null 2>&1; then
    log_step gh-vars skipped "cannot access repo variables"
    return 0
  fi
  if gh variable list 2>/dev/null | grep -q "E2E_MCP_URL"; then
    log_step gh-vars ok "E2E_MCP_URL present"
  else
    fail_next gh-vars "expected E2E_MCP_URL"
  fi
}

check_supabase_migration() {
  if ! command -v supabase >/dev/null 2>&1; then
    log_step supabase-migration skipped "supabase CLI not found"
    return 0
  fi
  if ! supabase migration list --linked >/dev/null 2>&1; then
    log_step supabase-migration skipped "not linked or cannot access"
    return 0
  fi
  if supabase migration list --linked 2>/dev/null | grep -q "20261017120000_waitlist"; then
    log_step supabase-migration ok "20261017120000_waitlist present"
  else
    fail_next supabase-migration "expected 20261017120000_waitlist"
  fi
}

note "launch-check starting (mode=${MODE})"
check_dig "$TARGET_WEB" web
check_dig "$TARGET_API" api
check_dig "$TARGET_DOCS" docs

if [[ -n "$TARGET_WEB" ]]; then
  check_curl_head "${TARGET_WEB%/}/" web-root
  check_curl_head "${TARGET_WEB%/}/opengraph-image" web-opengraph
  check_curl_head "${TARGET_WEB%/}/robots.txt" web-robots
  check_curl_head "${TARGET_WEB%/}/humans.txt" web-humans
  check_curl_head "${TARGET_WEB%/}/llms.txt" web-llms
else
  log_step web-http skipped "no target specified"
fi

if [[ -n "$TARGET_API" ]]; then
  check_curl_body_code "${TARGET_API%/}/health" api-health
  check_api_tls "$TARGET_API"
  check_api_cname "$TARGET_API"
else
  log_step api-health skipped "no target specified"
  log_step api-tls skipped "no target specified"
  log_step api-cname skipped "no target specified"
fi

check_mail_mx
check_mail_spf
check_mail_dmarc
check_mail_dkims

check_vercel_env
check_gh_secrets
check_gh_vars
check_supabase_migration

if [[ $fail_count -gt 0 ]]; then
  printf 'NEXT-ACTION: launch-check failed %d required check(s); see STEP lines above.\n' "$fail_count"
  exit 1
fi
exit 0
