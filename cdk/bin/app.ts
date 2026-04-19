#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DynamoDbStack } from '../lib/dynamodb-stack';
import { CognitoStack } from '../lib/cognito-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-1',
};

new DynamoDbStack(app, 'HomepageDynamoDbStack', { env });

new CognitoStack(app, 'HomepageCognitoStack', { env });
