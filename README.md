# Okta Customer Identity Cloud JWT Validation Extension

## Description: This extension was built from the Runtime API Proxy pattern referenced from [here](https://github.com/aal80/aws-lambda-extensions/tree/main/nodejs-example-lambda-runtime-api-proxy-extension).


Okta Customer Identity Cloud already provides an authorizer for Amazon API Gateway. Lambda Runtime API proxy allows to secure additional AWS Lambda function access patterns, such as Function URLs. With Lambda Runtime API proxy pattern, it is possible to validate incoming JWTs, apply configurable access policies, and enrich inbound events with authorization data - all that with zero changes to function code

