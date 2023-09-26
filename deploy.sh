#!/bin/bash

set -euxo pipefail

export FUNCTION_NAME="okta-sample-demo"
export EXTENSION_NAME="cic-jwt-verifier"
export LAYER_NAME=$EXTENSION_NAME-layer

function buildExtension {
    echo "> buildExtension"
    rm -rf out
    mkdir -p out
	
	cd $EXTENSION_NAME
    npm install 
    cd ..
	chmod +x extensions/$EXTENSION_NAME
    chmod +x wrapper.sh
	zip -r out/extension.zip ./extensions
	zip -r out/extension.zip ./$EXTENSION_NAME
	zip -r out/extension.zip wrapper.sh
}

function publishLayerVersion {
    echo "> publishLayerVersion"
	export LAYER_VERSION_ARN=$( \
        aws lambda publish-layer-version \
		--layer-name $LAYER_NAME \
		--zip-file "fileb://out/extension.zip" \
        --output text \
        --query 'LayerVersionArn')
    echo $LAYER_VERSION_ARN
}

function updateFunctionConfiguration {
    echo "> updateFunctionConfiguration"
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --layers $LAYER_VERSION_ARN \
        --environment 'Variables={AWS_LAMBDA_EXEC_WRAPPER=/opt/wrapper.sh}'
}

buildExtension
publishLayerVersion
updateFunctionConfiguration