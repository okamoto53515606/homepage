import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { readFileSync } from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * 監視スタック（アラート通知）
 *
 * why:
 *   2026/10/24〜10/30 の障害では、本番サイトが約5日半 502 を返し続けたのに誰も気づけず、
 *   復旧の初動が「利用者からの報告」になった。原因（ECR のイメージ失効）自体は
 *   cdk/lib/infra-stack.ts 側の構成では防げない「静かに壊れる」類の障害なので、
 *   「壊れたことに気づく仕組み」をインフラとして持つ必要がある。
 *
 * なぜ既存の HomepageDynamoDbStack に相乗りしないか:
 *   相乗りすると、監視の追加・変更のたびに Lambda の Docker イメージ再ビルドと本番
 *   差し替えが走る（＝監視だけを安全に足せない）。加えて CloudWatch の CloudFront
 *   メトリクスは us-east-1 にしか存在せず、Lambda メトリクスは ap-northeast-1 にしか
 *   存在しないため、そもそも単一スタックには収まらない。
 */
export const ALERT_TOPIC_NAME = 'homepage-alerts';

/**
 * エッジ（us-east-1）側の通知トピック名
 *
 * why: CloudFront メトリクスのアラームは「アクション先 SNS も us-east-1」でないと
 *      作成できないため、リージョンごとにトピックを持つ。同じメールアドレスを
 *      両方にサブスクライブすれば、通知の受け取り先は 1 つで済む。
 */
export const EDGE_ALERT_TOPIC_NAME = 'homepage-alerts-edge';

/**
 * アラート通知先メールアドレスを解決する
 *
 * 解決順: CDK context（`-c alarmEmail=...`）→ `.env` の `ALARM_EMAIL` → 空
 *
 * why:
 *   - 既定値は **空**。特定の個人アドレスをコードに埋めると、このリポジトリを他の人が
 *     使ったときに、その人のサイトの障害通知が元の持ち主に飛んでしまう。
 *   - 空でも synth / deploy が失敗してはいけない（他スタックのデプロイを巻き込むため）。
 *     空のときは「購読を作らない」だけで、トピックとアラームは作る。
 *   - `.env` を第2候補にしているのは、setup 画面で保存した値を手動の `cdk deploy` でも
 *     そのまま使うため。context を付け忘れてデプロイした結果、購読が消える事故を防ぐ。
 */
function resolveAlarmEmail(scope: Construct): string {
  // why: context が「明示的に指定されている」場合は空文字もそのまま尊重する。
  //      空 =「通知しない」という意思表示であり、ここで .env にフォールバックすると
  //      「空にしたのに通知が残る」ことになる。
  const raw = scope.node.tryGetContext('alarmEmail') as string | undefined;
  if (typeof raw === 'string') return raw.trim();

  try {
    const envPath = path.resolve(__dirname, '../../.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      if (trimmed.slice(0, eq).trim() !== 'ALARM_EMAIL') continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
  } catch {
    // .env が無い環境（CI / 新規クローン）では「未設定」として扱う
  }

  return '';
}

/**
 * CloudFront ディストリビューション ID を解決する
 *
 * why: L2 の cross-stack 参照（export / Fn::ImportValue）を使うと、参照元スタックの
 *      再デプロイを強制してしまう。監視だけを独立して追加・削除できるよう、値は
 *      context → cdk-outputs.json（`cdk deploy --outputs-file` の生成物）→ 既定値の
 *      順で解決する。ディストリビューションを作り直した場合は
 *      `-c distributionId=EXXXX` で上書きする。
 */
function resolveDistributionId(scope: Construct): string {
  const fromContext = scope.node.tryGetContext('distributionId') as string | undefined;
  if (fromContext) return fromContext;

  try {
    const outputsPath = path.resolve(__dirname, '../../cdk-outputs.json');
    const outputs = JSON.parse(readFileSync(outputsPath, 'utf-8')) as Record<
      string,
      Record<string, string>
    >;
    const id = outputs?.HomepageDynamoDbStack?.AppDistributionId;
    if (id) return id;
  } catch {
    // cdk-outputs.json が無い環境（新規クローン等）では既定値へフォールバックする
  }

  return 'E1CY0MTTUPWTZ0';
}

/**
 * アプリ側（ap-northeast-1）の監視
 *
 * - SNS トピックの作成とメール通知先の登録
 * - Lambda の例外（アプリ自身が壊れている場合）の検知
 */
export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const alarmEmail = resolveAlarmEmail(this);

    const topic = new sns.Topic(this, 'AlertTopic', {
      topicName: ALERT_TOPIC_NAME,
      displayName: 'homepage alerts',
    });
    // why: 宛先が空なら購読を作らない（＝通知しない）。空文字で EmailSubscription を
    //      作ると deploy が失敗するため必ず分岐する。トピックとアラーム自体は作るので、
    //      後から宛先を設定すればそのまま通知が始まる。
    if (alarmEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(alarmEmail));
    } else {
      cdk.Annotations.of(this).addInfo(
        'ALARM_EMAIL が未設定のため、アラートのメール通知は作成しません（アラーム自体は作成されます）',
      );
    }

    const alarmAction = new cw_actions.SnsAction(topic);

    // ---------------------------------------------------------
    // 1. Lambda のエラー
    //
    // why: 例外（未処理の throw / 起動失敗）は CloudFront の 5xx 率にも出るが、
    //      アプリ側の異常かインフラ側の異常かを切り分けるため単独でも見たい。
    //      このサイトは 1日あたり数百アクセスなので、1件でも通知する。
    // ---------------------------------------------------------
    const appLambda = lambda.Function.fromFunctionName(
      this,
      'AppLambda',
      'homepage-app',
    );

    const appLambdaErrors = new cloudwatch.Alarm(this, 'AppLambdaErrorsAlarm', {
      alarmName: 'homepage-app-lambda-errors',
      alarmDescription:
        'homepage-app が例外を返している（アプリ側の異常）。CloudWatch ログ /aws/lambda/homepage-app を確認',
      metric: appLambda.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      // 無トラフィック時はデータが無い（＝正常）ため、欠測は OK 扱いにする
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    appLambdaErrors.addAlarmAction(alarmAction);
  }
}

/**
 * エッジ（us-east-1）の監視
 *
 * why: CloudFront のメトリクスは us-east-1 にのみ発行されるため、そのアラームも
 *      us-east-1 に作る必要がある。一方 Lambda のメトリクスは ap-northeast-1 にしか
 *      無いので、スタックを分けざるを得ない（1スタック＝1リージョンの制約）。
 *
 * この 5xx 率アラームが今回の障害を検知できる本命:
 *   Lambda が Inactive（イメージ欠損）になると Function URL が 502 を返し続け、
 *   Lambda 自体は一度も起動しないため「Lambda のエラー」では検知できない。
 *   CloudFront の 5xxErrorRate なら「オリジンが死んでいる」ことを直接観測できる。
 */
export class EdgeMonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const distributionId = resolveDistributionId(this);
    const alarmEmail = resolveAlarmEmail(this);

    // why: CloudFront メトリクスのアラームは us-east-1 でしか作成できない。さらに
    //      API レベルで「アクション先 SNS トピックも us-east-1 であること」が強制される
    //      （ap-northeast-1 のトピック ARN を渡すと
    //       "Invalid region ap-northeast-1 specified. Only us-east-1 is supported."
    //       で失敗する）。そのため通知先トピックもこのスタック（us-east-1）の中で作る。
    //       ＝ MonitoringStack（ap-northeast-1）とは相互参照を持たない。
    const topic = new sns.Topic(this, 'EdgeAlertTopic', {
      topicName: EDGE_ALERT_TOPIC_NAME,
      displayName: 'homepage alerts (edge)',
    });
    // why: MonitoringStack と同じ理由で、宛先が空なら購読を作らない
    if (alarmEmail) {
      topic.addSubscription(new subscriptions.EmailSubscription(alarmEmail));
    } else {
      cdk.Annotations.of(this).addInfo(
        'ALARM_EMAIL が未設定のため、エッジ側のアラート通知は作成しません',
      );
    }

    const fiveHundredsRate = new cloudwatch.Alarm(
      this,
      'CloudFront5xxRateAlarm',
      {
        alarmName: 'homepage-cloudfront-5xx-rate',
        alarmDescription:
          'CloudFront の 5xx 率が 5% 以上（オリジン異常）。Lambda のイメージ欠損でもこの形で発生する。docs/operations_v2.md の「障害時の切り分け」参照',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/CloudFront',
          metricName: '5xxErrorRate',
          dimensionsMap: {
            DistributionId: distributionId,
            // CloudFront のメトリクスは「Global」リージョン扱いで発行される
            Region: 'Global',
          },
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
          region: 'us-east-1',
        }),
        // why: 一時的な揺らぎで誤報しないよう 5% / 10分継続で判定する。
        //      画像は別オリジン（S3）なので、Lambda 全滅時でも 100% にはならない。
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    fiveHundredsRate.addAlarmAction(new cw_actions.SnsAction(topic));
  }
}
