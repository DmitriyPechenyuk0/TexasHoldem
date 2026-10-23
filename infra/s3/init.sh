#!/bin/sh
# Idempotent: creates the avatars bucket and makes its objects (not the listing) publicly readable.
set -eu

BUCKET=avatars

aws configure set default.s3.addressing_style path

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
	echo "bucket $BUCKET already exists"
else
	aws s3api create-bucket --bucket "$BUCKET"
	echo "bucket $BUCKET created"
fi

aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///init/avatars-policy.json
echo "public-read policy applied to $BUCKET/*"
