#!/bin/bash
# Generate TypeScript types from all proto files using ts-proto
# Run from monorepo root: bash packages/proto/generate.sh

set -e

mkdir -p packages/proto/generated

# grpc_tools_node_protoc's protoc.exe is a native binary that spawns the plugin
# via a direct Win32 CreateProcess call -- on Windows it cannot execute the
# POSIX shell-script bin shim (./node_modules/.bin/protoc-gen-ts_proto) since
# that file is not a PE executable ("%1 is not a valid Win32 application").
# Resolve to the .cmd shim (an absolute Windows path) on MSYS/MINGW/Cygwin;
# use the plain POSIX shim everywhere else (Linux/Mac CI, WSL, etc.).
PLUGIN_PATH="./node_modules/.bin/protoc-gen-ts_proto"
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    PLUGIN_PATH="$(cygpath -w "$(pwd)/node_modules/.bin/protoc-gen-ts_proto.cmd" 2>/dev/null || echo "$(pwd)/node_modules/.bin/protoc-gen-ts_proto.cmd")"
    ;;
esac

# ts-proto generates NestJS-compatible gRPC service interfaces.
# grpc_tools_node_protoc (from grpc-tools) is the real protoc front end;
# ts-proto's protoc-gen-ts_proto binary is a protoc *plugin*, not a standalone CLI,
# so it must be invoked via --plugin=protoc-gen-ts_proto=<path>, not run directly.
npx grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto="$PLUGIN_PATH" \
  --ts_proto_out=./packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=esModuleInterop=true \
  --proto_path=./packages/proto \
  ./packages/proto/*.proto

echo "Proto generation complete. Generated files:"
ls ./packages/proto/generated/
