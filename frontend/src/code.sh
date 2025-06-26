#!/bin/bash

> code.txt

find . \
  -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) \
  ! -path "*/__pycache__/*" | sort | while read -r file; do
  echo "--- FILE: ${file} ---" >> code.txt
  echo "" >> code.txt
  cat "${file}" >> code.txt
  echo "" >> code.txt
  echo "" >> code.txt
done
