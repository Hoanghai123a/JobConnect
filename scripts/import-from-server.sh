#!/bin/bash
# Script import dữ liệu trên server
# Sử dụng: ./scripts/import-from-server.sh

cd /var/www/chamcong-main
IMPORT_DIR=/var/www/chamcong-main/temp node scripts/import-json-to-pocketbase.mjs
