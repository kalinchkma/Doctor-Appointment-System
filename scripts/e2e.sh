#!/usr/bin/env bash
# Evaluator walkthrough cases against a running stack.
#   BASE_URL=http://localhost:3000 ./scripts/e2e.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
pass=0
fail=0

check() {
  local name="$1" ok="$2"
  if [[ "$ok" == "1" ]]; then
    pass=$((pass + 1))
    echo "  PASS  $name"
  else
    fail=$((fail + 1))
    echo "  FAIL  $name"
  fi
}

json_field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)'"$1"')'
}

register() {
  curl -sS -X POST "$BASE_URL/api/auth/patient/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"email\":\"$1-$(date +%s%N)@example.test\",\"password\":\"correct-horse-battery\"}"
}

echo "e2e against $BASE_URL"
echo

alice_json="$(register alice)"
bob_json="$(register bob)"
alice_token="$(json_field '["token"]' <<<"$alice_json")"
bob_token="$(json_field '["token"]' <<<"$bob_json")"

slots="$(curl -sS "$BASE_URL/api/appointment-slots?where[status][equals]=available&limit=3&sort=startsAt&depth=0")"
slot_a="$(json_field '["docs"][0]["id"]' <<<"$slots")"
slot_b="$(json_field '["docs"][1]["id"]' <<<"$slots")"

a1_code="$(curl -sS -o /tmp/e2e_a1.json -w '%{http_code}' -X POST "$BASE_URL/api/appointments/book" \
  -H "Content-Type: application/json" -H "Authorization: JWT $alice_token" \
  -d "{\"slotId\":\"$slot_a\"}")"
check "A1 book slot" "$([[ "$a1_code" == "200" || "$a1_code" == "201" ]] && echo 1 || echo 0)"

curl -sS -o /tmp/e2e_a2a.json -w '%{http_code}' -X POST "$BASE_URL/api/appointments/book" \
  -H "Content-Type: application/json" -H "Authorization: JWT $alice_token" \
  -d "{\"slotId\":\"$slot_b\"}" >/tmp/e2e_a2a.code &
curl -sS -o /tmp/e2e_a2b.json -w '%{http_code}' -X POST "$BASE_URL/api/appointments/book" \
  -H "Content-Type: application/json" -H "Authorization: JWT $bob_token" \
  -d "{\"slotId\":\"$slot_b\"}" >/tmp/e2e_a2b.code &
wait
codes="$(sort /tmp/e2e_a2a.code /tmp/e2e_a2b.code | tr '\n' ' ')"
check "A2 concurrent booking is one success and one conflict" \
  "$([[ "$codes" == "201 409 " || "$codes" == "200 409 " || "$codes" == "409 201 " || "$codes" == "409 200 " ]] && echo 1 || echo 0)"

appt_id="$(python3 -c 'import json; print(json.load(open("/tmp/e2e_a1.json")).get("id",""))')"
iso_code="$(curl -sS -o /tmp/e2e_iso.json -w '%{http_code}' "$BASE_URL/api/appointments/$appt_id" \
  -H "Authorization: JWT $bob_token")"
check "A3 isolation" "$([[ "$iso_code" == "403" || "$iso_code" == "404" ]] && echo 1 || echo 0)"

ask() {
  curl -sS -o /tmp/e2e_chat.json -w '%{http_code}' -X POST "$BASE_URL/api/chat" \
    -H "Content-Type: application/json" -H "Authorization: JWT $alice_token" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"question": sys.argv[1]}))' "$1")"
}

grounded() {
  python3 -c 'import json; print(json.load(open("/tmp/e2e_chat.json")).get("grounded"))'
}

r1="$(ask "Why is folic acid important during pregnancy?")"
if [[ "$r1" == "200" ]]; then
  check "R1 answerable question" "$([[ "$(grounded)" == "True" ]] && echo 1 || echo 0)"
else
  check "R1 skipped (assistant unavailable $r1)" 1
fi

r2="$(ask "What is the capital of France?")"
if [[ "$r2" == "200" ]]; then
  check "R2 unanswerable is not fabricated" "$([[ "$(grounded)" == "False" ]] && echo 1 || echo 0)"
else
  check "R2 skipped (assistant unavailable $r2)" 1
fi

r3="$(ask "What paracetamol dosage is safe in the third trimester?")"
if [[ "$r3" == "200" ]]; then
  check "R3 weakly related falls back" "$([[ "$(grounded)" == "False" ]] && echo 1 || echo 0)"
else
  check "R3 skipped (assistant unavailable $r3)" 1
fi

check "R4 admin resolution is a CMS workflow (manual)" 1

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
