#!/bin/bash
# Update domain statuses and cleanup old entries
# Password is read from ~/.pgpass or PGPASSWORD env var
cd /var/www/domain-cache/scripts
psql -U domain_cache -d domain_cache -h localhost -f update-statuses.sql
