#!/bin/bash

# まず空ファイルにリセット
> code.txt

# __pycache__を除き、.pyファイルすべてを昇順で走査して中身をcode.txtに追記
find . -type f -name "*.py" ! -path "*/__pycache__/*" | sort | while read -r file; do
  echo "--- FILE: ${file} ---" >> code.txt
  echo "" >> code.txt
  cat "${file}" >> code.txt
  echo "" >> code.txt
  echo "" >> code.txt
done
