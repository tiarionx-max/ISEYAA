#!/bin/bash
# Generate TypeScript types from all proto files using ts-proto
# Run from monorepo root: bash packages/proto/generate.sh

set -e

mkdir -p packages/proto/generated

# ts-proto generates NestJS-compatible gRPC service interfaces
npx ts-proto \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=esModuleInterop=true \
  ./packages/proto/*.proto

echo "Proto generation complete. Generated files:"
ls ./packages/proto/generated/
