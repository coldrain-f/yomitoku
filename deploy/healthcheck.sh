#!/usr/bin/env sh
set -eu

api_domain=${1:?Usage: healthcheck.sh api.example.com}
curl --fail --silent --show-error "https://$api_domain/api/v1/health"
