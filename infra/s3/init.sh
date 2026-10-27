#!/bin/sh
# Idempotent: creates the avatars bucket. Confirmed avatars (avatars/*) are publicly readable, the
# listing and pending uploads (uploads/*) are not. Browsers on WEB_ORIGIN may upload with a
# presigned POST (CORS), and uploads nobody confirmed expire after a day.
set -eu

BUCKET=avatars
WEB_ORIGIN=${WEB_ORIGIN:-http://localhost:3000}

aws configure set default.s3.addressing_style path

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
	echo "bucket $BUCKET already exists"
else
	aws s3api create-bucket --bucket "$BUCKET"
	echo "bucket $BUCKET created"
fi

aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///init/avatars-policy.json
echo "public-read policy applied to $BUCKET/avatars/*"

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "{
	\"CORSRules\": [{
		\"AllowedOrigins\": [\"$WEB_ORIGIN\"],
		\"AllowedMethods\": [\"POST\"],
		\"AllowedHeaders\": [\"*\"],
		\"MaxAgeSeconds\": 3600
	}]
}"
echo "uploads from $WEB_ORIGIN allowed (CORS)"

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
	--lifecycle-configuration file:///init/avatars-lifecycle.json
echo "unconfirmed uploads expire after a day"
