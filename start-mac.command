#!/bin/bash
cd "$(dirname "$0")" || exit 1
open http://localhost:8000
python3 -m http.server 8000
