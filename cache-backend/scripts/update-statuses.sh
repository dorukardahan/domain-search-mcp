#!/bin/bash
# Update domain statuses and cleanup old entries
cd /var/www/domain-cache/scripts
export PGPASSWORD="DcacheSecure2026"
psql -U domain_cache -d domain_cache -h localhost -f update-statuses.sql
