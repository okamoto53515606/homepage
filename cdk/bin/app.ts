#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DynamoDbStack } from '../lib/dynamodb-stack';

const app = new cdk.App();

new DynamoDbStack(app, 'HomepageDynamoDbStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});
