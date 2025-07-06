#!/bin/bash

EXTENSIONS=(
  "md" "txt" "rst" "adoc"
  "html" "htm" "xml" "css"
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

EXCLUDE_DIRS=(
  "node_modules"
  "venv"
  ".git"
  "dist"
  "build"
  ".next"
  ".vscode"
  "coverage"
)

COUNT=0

echo "🔍 Starting dos2unix (safe mode)..."

for ext in "${EXTENSIONS[@]}"; do
  # Build -name filter
  if [[ "$ext" == "Dockerfile" || "$ext" == "Makefile" || "$ext" == "gitignore" || "$ext" == "gitattributes" ]]; then
    NAME_EXPR="-name $ext"
  else
    NAME_EXPR="-name *.$ext"
  fi

  # Build the find expression dynamically
  FIND_CMD="find ."
  for dir in "${EXCLUDE_DIRS[@]}"; do
    FIND_CMD+=" -path \"*/$dir\" -prune -o"
  done
  FIND_CMD+=" $NAME_EXPR -type f -print"

  # Evaluate and execute the constructed find command
  FILES=$(eval $FIND_CMD)

  for file in $FILES; do
    [[ ! -f "$file" ]] && continue

    if file "$file" | grep -q "text"; then
      if grep -q $'\r' "$file"; then
        dos2unix "$file" >/dev/null 2>&1
        echo "✔ converted: $file"
        ((COUNT++))
      fi
    fi
  done
done

echo "✅ Done. Total safely converted files: $COUNT"

