#!/bin/bash

# 安全なテキストファイル拡張子一覧（拡張子なしのDockerfileも含む）
EXTENSIONS=(
  "md" "txt" "rst" "adoc"
  "html" "htm" "xml"
  "yml" "yaml" "json" "csv" "tsv"
  "ini" "cfg" "conf" "toml" "properties" "env"
  "py" "js" "jsx" "ts" "tsx" "sh" "bash" "zsh"
  "java" "kt" "c" "cpp" "cc" "h" "hpp"
  "go" "rb" "pl" "php" "lua" "rs" "scala"
  "make" "mk" "Dockerfile" "docker-compose.yml"
  "gitignore" "gitattributes"
  "tf" "tfvars" "terraform" "nomad" "hcl"
  "bazel" "bzl"
)

COUNT=0

echo "🔍 Starting dos2unix (safe mode)..."

for ext in "${EXTENSIONS[@]}"; do
  # Dockerfileなどの拡張子なし対応
  if [[ "$ext" == "Dockerfile" || "$ext" == "Makefile" || "$ext" == "gitignore" || "$ext" == "gitattributes" ]]; then
    FILES=$(find . -type f -name "$ext")
  else
    FILES=$(find . -type f -name "*.${ext}")
  fi

  for file in $FILES; do
    # 空ファイル or 存在確認
    [[ ! -f "$file" ]] && continue

    # 中身がtextであるか確認（バイナリ対策）
    if file "$file" | grep -q "text"; then
      # 改行にCRが含まれているかもチェック（^Mのあるものだけ処理）
      if grep -q $'\r' "$file"; then
        dos2unix "$file" >/dev/null 2>&1
        echo "✔ converted: $file"
        ((COUNT++))
      fi
    fi
  done
done

echo "✅ Done. Total safely converted files: $COUNT"

