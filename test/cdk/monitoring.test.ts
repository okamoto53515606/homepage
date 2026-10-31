/**
 * 監視スタック（アラート）の構造的回帰テスト
 *
 * why:
 *   - アラート通知先は「空」を許容する設計にした。空のときに synth / deploy が
 *     失敗すると、同じ CDK アプリを synth するアプリ用スタック（setup1b）の
 *     デプロイまで巻き込んで止まるため、「空でも壊れない」ことを機械的に固定する。
 *   - 宛先を設定したときは、メール購読がちょうど 1 件だけ作られることも固定する
 *     （重複購読＝同じ通知が二重に届く事故を防ぐ）。
 *   - CloudFront の CloudWatch アラームは us-east-1 固定で、通知先 SNS も
 *     同一リージョンでなければ作成できない（API 制約）。スタックを 2 つに
 *     分けた構成が崩れていないかをここで検査する。
 */
import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import {
  MonitoringStack,
  EdgeMonitoringStack,
} from '../../cdk/lib/monitoring-stack';

/**
 * why: alarmEmail に undefined を渡したときは context 自体を渡さない
 *      （= .env フォールバックの経路）。空文字は「明示的に通知しない」指定。
 */
function synthMonitoring(alarmEmail: string | undefined): Template {
  const app = new cdk.App({
    context: alarmEmail === undefined ? {} : { alarmEmail },
  });
  const stack = new MonitoringStack(app, 'TestMonitoring', {
    env: { account: '123456789012', region: 'ap-northeast-1' },
  });
  return Template.fromStack(stack);
}

function synthEdge(
  alarmEmail: string | undefined,
  distributionId = 'E1234567890ABC',
): Template {
  const app = new cdk.App({
    context: {
      distributionId,
      ...(alarmEmail === undefined ? {} : { alarmEmail }),
    },
  });
  const stack = new EdgeMonitoringStack(app, 'TestEdgeMonitoring', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('MonitoringStack（ap-northeast-1 / Lambda 例外）', () => {
  it('宛先が設定されていればメール購読をちょうど 1 件作る', () => {
    const template = synthMonitoring('alert@example.com');

    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.resourceCountIs('AWS::SNS::Subscription', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alert@example.com',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'homepage-app-lambda-errors',
      MetricName: 'Errors',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
    });
  });

  it('宛先が空でも synth でき、購読は作らない（アラームは残す）', () => {
    const template = synthMonitoring('');

    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.resourceCountIs('AWS::SNS::Subscription', 0);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  });

  it('前後の空白はトリムして購読する', () => {
    const template = synthMonitoring('  alert@example.com  ');

    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alert@example.com',
    });
  });
});

describe('EdgeMonitoringStack（us-east-1 / CloudFront 5xx）', () => {
  it('5xx 率アラームとメール購読を作る', () => {
    const template = synthEdge('alert@example.com');

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'homepage-cloudfront-5xx-rate',
      Namespace: 'AWS/CloudFront',
      MetricName: '5xxErrorRate',
      Threshold: 5,
      EvaluationPeriods: 2,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    });
    template.resourceCountIs('AWS::SNS::Subscription', 1);
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alert@example.com',
    });
  });

  it('宛先が空でも synth でき、購読は作らない（アラームは残す）', () => {
    const template = synthEdge('');

    template.resourceCountIs('AWS::SNS::Topic', 1);
    template.resourceCountIs('AWS::SNS::Subscription', 0);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  });
});
